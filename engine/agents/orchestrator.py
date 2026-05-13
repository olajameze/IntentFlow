"""CrewAI wiring — dynamic agents per active business (secrets stay server-side)."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from crewai import Agent, Crew, Process, Task
from crewai import LLM
from crewai.tools import tool

from agents.factory import agents_for_type
from config import google_api_key, groq_api_key
from crypto_util import decrypt_stripe_secret
from supabase_client import get_supabase
from tools.csv_merge import merge_csv_uploads
from tools.llm import generate_personalised_copy
from tools.persistence import save_revenue_snapshot, save_traffic_snapshot
from tools.similarweb import scrape_similarweb_traffic
from tools.stripe_revenue import fetch_stripe_revenue
from tools.umami import fetch_umami_stats


def _ctx(row: dict[str, Any]) -> str:
    return json.dumps(
        {
            "name": row.get("name"),
            "type": row.get("type"),
            "audience": row.get("target_audience"),
            "industry": row.get("industry"),
            "goals": row.get("goals"),
            "website": row.get("website_url"),
            "umami_website_id": row.get("umami_website_id"),
        },
        ensure_ascii=False,
    )


@tool("Scrape Similarweb public summary (advisory)")
def scrape_similarweb_traffic_tool(domain: str) -> str:
    """Scrape Similarweb public traffic summary for a domain; returns JSON."""
    data = scrape_similarweb_traffic(domain)
    return json.dumps(data, ensure_ascii=False)


@tool("Merge CSV processor exports (paths_json maps processor->path)")
def merge_csv_uploads_tool(paths_json: str) -> str:
    """Merge CSV uploads from a JSON map of processor name to file path; returns JSON rows."""
    paths = json.loads(paths_json)
    rows = merge_csv_uploads(paths)
    return json.dumps(rows[:200], ensure_ascii=False)


@tool("Generate personalised copy")
def generate_personalised_copy_tool(business_context: str, lead: str, template: str) -> str:
    """Generate personalised marketing copy from business context, lead, and template."""
    return generate_personalised_copy(business_context, lead, template)


@tool("Queue a marketing post for human approval in the dashboard")
def enqueue_pending_post_tool(business_id: str, platform: str, content: str) -> str:
    """Insert pending_posts row. platform: linkedin | facebook | instagram | twitter"""
    p = (platform or "").strip().lower()
    if p not in {"linkedin", "facebook", "instagram", "twitter", "x"}:
        return json.dumps({"error": f"unsupported platform: {platform}"})
    if p == "x":
        p = "twitter"
    sb = get_supabase()
    sb.table("pending_posts").insert(
        {
            "business_id": business_id,
            "platform": p,
            "content": content,
            "status": "pending",
        }
    ).execute()
    return json.dumps({"queued": True, "platform": p})


def _llm() -> LLM:
    if google_api_key():
        return LLM(model="gemini/gemini-1.5-flash", temperature=0.35)
    if groq_api_key():
        return LLM(model="groq/llama-3.1-8b-instant", temperature=0.35)
    raise RuntimeError("Configure GOOGLE_API_KEY or GROQ_API_KEY for CrewAI")


def load_active_businesses() -> list[dict[str, Any]]:
    sb = get_supabase()
    res = sb.table("businesses").select("*").eq("active", True).execute()
    return list(res.data or [])


def run_traffic_only() -> None:
    """Snapshot job for GitHub Actions / cron."""
    businesses = load_active_businesses()
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=1)
    for b in businesses:
        wid = b.get("umami_website_id")
        if wid:
            try:
                stats = fetch_umami_stats(wid, start, end)
                save_traffic_snapshot(b.get("id"), stats, source="umami", website_id=wid)
            except Exception as exc:  # noqa: BLE001
                print(f"Umami error for {b.get('name')}: {exc}")

        key = decrypt_stripe_secret(
            b.get("stripe_secret_ciphertext"),
            b.get("stripe_secret_iv"),
            b.get("stripe_secret_tag"),
        )
        if key:
            try:
                rev = fetch_stripe_revenue(key, (start, end))
                save_revenue_snapshot(b["id"], rev, snapshot_source="stripe_api")
            except Exception as exc:  # noqa: BLE001
                print(f"Stripe error for {b.get('name')}: {exc}")


def _pick_specialist_agent(agents: list[Agent]) -> Agent | None:
    for a in agents:
        if a.role not in {"TrafficMonitor", "RevenueTracker", "DashboardAggregator"}:
            return a
    return None


def _domain_from_url(url: str | None) -> str:
    if not url:
        return ""
    u = url.strip()
    if not u.startswith(("http://", "https://")):
        u = "https://" + u
    host = urlparse(u).netloc
    return host.replace("www.", "", 1) if host else ""


def _persist_snapshots_for_window(row: dict[str, Any], start: datetime, end: datetime) -> dict[str, str]:
    """Write Umami + Stripe snapshots in-process (avoids LLMs chaining fetch+save tools; fixes Groq tool_use failures)."""
    bid = row.get("id")
    wid = row.get("umami_website_id")
    umami_summary = "Umami: skipped (no umami_website_id)."
    if wid:
        try:
            stats = fetch_umami_stats(wid, start, end)
            save_traffic_snapshot(bid, stats, source="umami", website_id=wid)
            umami_summary = f"Umami: snapshot saved for website_id={wid}."
        except Exception as exc:  # noqa: BLE001
            umami_summary = f"Umami: error ({exc})"

    rev_summary = "Stripe: skipped (no encrypted secret on file)."
    key = decrypt_stripe_secret(
        row.get("stripe_secret_ciphertext"),
        row.get("stripe_secret_iv"),
        row.get("stripe_secret_tag"),
    )
    if key:
        try:
            rev = fetch_stripe_revenue(key, (start, end))
            save_revenue_snapshot(bid, rev, snapshot_source="stripe_api")
            rev_summary = (
                "Stripe: snapshot saved — "
                f"net={rev.get('total_net') or rev.get('net_revenue')}, "
                f"gross={rev.get('total_gross') or rev.get('total_revenue')}, "
                f"transactions={rev.get('transactions') or rev.get('transaction_count')}"
            )
        except Exception as exc:  # noqa: BLE001
            rev_summary = f"Stripe: error ({exc})"

    return {"umami": umami_summary, "revenue": rev_summary}


def run_crew_for_business(row: dict[str, Any]) -> str:
    profiles = agents_for_type(row.get("type") or "generic")

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=7)
    window_start, window_end = start.isoformat(), end.isoformat()
    business_id = row.get("id")
    ctx = _ctx(row)
    snap = _persist_snapshots_for_window(row, start, end)
    domain = _domain_from_url(row.get("website_url"))

    llm = _llm()
    copy_tools = [generate_personalised_copy_tool, enqueue_pending_post_tool]

    tools_map = {
        "TrafficMonitor": [scrape_similarweb_traffic_tool],
        "RevenueTracker": [merge_csv_uploads_tool],
        "LocalResearcher": copy_tools,
        "SaaSOutreach": copy_tools,
        "AuthorityBuilder": copy_tools,
        "SocialPostingAgent": copy_tools,
        "CaseStudyGenerator": copy_tools,
        "Networker": copy_tools,
        "SocialListener": copy_tools,
        "ContentGenerator": copy_tools,
        "SEOMonitor": copy_tools,
        "DashboardAggregator": [],
    }

    agents: list[Agent] = []
    agent_by_role: dict[str, Agent] = {}
    for profile in profiles:
        agent = Agent(
            role=profile.name,
            goal=profile.goal,
            backstory=profile.backstory,
            tools=tools_map.get(profile.key, []),
            llm=llm,
            verbose=True,
            allow_delegation=False,
        )
        agents.append(agent)
        agent_by_role[profile.name] = agent

    traffic = agent_by_role.get("TrafficMonitor")
    revenue = agent_by_role.get("RevenueTracker")
    specialist = _pick_specialist_agent(agents) or traffic
    dash = agent_by_role.get("DashboardAggregator")

    tasks: list[Task] = []
    if traffic:
        tasks.append(
            Task(
                description=(
                    f"Business context: {ctx}\n"
                    f"Time window: {window_start} to {window_end}.\n"
                    f"**Umami (already persisted server-side):** {snap['umami']}\n"
                    f"Website domain for Similarweb (if you use it): {domain or 'unknown'}.\n"
                    "Optionally call scrape_similarweb_traffic_tool(domain) once for a public benchmark. "
                    "Give a concise traffic narrative. Do not attempt Umami or database persistence tools."
                ),
                agent=traffic,
                expected_output="Brief traffic summary; note if Similarweb was used.",
            )
        )
    if revenue:
        tasks.append(
            Task(
                description=(
                    f"Business context: {ctx}\n"
                    f"**Revenue (already persisted server-side):** {snap['revenue']}\n"
                    "Interpret results and recommend hygiene. Use merge_csv_uploads_tool only if "
                    "merging uploaded CSV revenue is explicitly relevant; otherwise skip."
                ),
                agent=revenue,
                expected_output="Revenue interpretation and next actions.",
            )
        )
    if specialist and specialist is not traffic:
        tasks.append(
            Task(
                description=(
                    f"Business context: {ctx}\n"
                    f"business_id for tools (exact UUID): {business_id}\n"
                    "Produce three compliant, publish-ready posts (text only; no TikTok/video).\n"
                    "You MUST call enqueue_pending_post_tool exactly three times — one per post. "
                    "Arguments: business_id (above), platform (linkedin, facebook, or instagram), "
                    "content (full post body). Vary angles. You may use generate_personalised_copy_tool "
                    "to refine lines before enqueueing."
                ),
                agent=specialist,
                expected_output="Confirm three successful enqueue_pending_post_tool calls.",
            )
        )
    if dash:
        tasks.append(
            Task(
                description=(
                    f"Business context: {ctx}\n"
                    f"Pre-computed window {window_start}..{window_end}:\n"
                    f"- {snap['umami']}\n"
                    f"- {snap['revenue']}\n"
                    "Deliver an executive summary and numbered next steps (no tool calls required)."
                ),
                agent=dash,
                expected_output="Executive summary with numbered actions.",
            )
        )

    if not tasks:
        return "No agents configured."

    crew = Crew(agents=agents, tasks=tasks, process=Process.sequential, verbose=True)
    return str(crew.kickoff())


def run_all() -> None:
    for row in load_active_businesses():
        print(f"=== Running engine for {row.get('name')} ===")
        try:
            print(run_crew_for_business(row))
        except Exception as exc:  # noqa: BLE001
            print(f"Failed for {row.get('name')}: {exc}")
