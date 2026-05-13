"""CrewAI wiring — dynamic agents per active business (secrets stay server-side)."""

from __future__ import annotations

import json
import os
import sys
import time
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
from config import google_api_key, groq_api_key, llm_skip_google
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


def _llm() -> LLM:
    """Prefer Gemini via CrewAI; use a model ID that exists on the current Gemini API."""
    if llm_skip_google():
        if groq_api_key():
            return _groq_llm()
        raise RuntimeError(
            "ENGINE_USE_GROQ_ONLY or ENGINE_FORCE_GROQ is set but GROQ_API_KEY is missing — add it to .env."
        )
    if google_api_key():
        model = os.getenv("CREWAI_GEMINI_MODEL", "gemini/gemini-2.0-flash").strip() or "gemini/gemini-2.0-flash"
        return LLM(model=model, temperature=0.35)
    if groq_api_key():
        return LLM(model="groq/llama-3.1-8b-instant", temperature=0.35)
    raise RuntimeError(
        "Configure GOOGLE_API_KEY or GROQ_API_KEY for CrewAI "
        "(set ENGINE_USE_GROQ_ONLY=1 + GROQ_API_KEY when Gemini quota is 0)."
    )


def _groq_llm() -> LLM:
    return LLM(model="groq/llama-3.1-8b-instant", temperature=0.35)


def _is_gemini_quota_or_rate_error(exc: BaseException) -> bool:
    name = type(exc).__name__.lower()
    if "resourceexhausted" in name or "ratelimit" in name:
        return True
    err = f"{exc!s} {exc!r}".lower()
    return any(
        s in err
        for s in (
            "429",
            "resource exhausted",
            "resource_exhausted",
            "resourceexhausted",
            "quota",
            "rate limit",
            "rate_limit",
            "exceeded your current quota",
            "limit: 0",
            "gemini api error: 429",
        )
    )


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
    _wid_lower = (wid or "").lower()
    _junk = ("paste", "placeholder", "another-id", "your-umami")
    if wid and any(j in _wid_lower for j in _junk):
        umami_summary = (
            "Umami: skipped (junk/placeholder umami_website_id — run Supabase migrations "
            "or update businesses.umami_website_id)."
        )
    elif wid:
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


def enqueue_three_pending_posts_direct(row: dict[str, Any]) -> None:
    """Insert three drafts into pending_posts without Crew tools (Groq tool calls are unreliable)."""
    bid = row.get("id")
    if not bid:
        return
    ctx = _ctx(row)
    brand = row.get("name") or "Brand"
    specs: list[tuple[str, str]] = [
        (
            "linkedin",
            "LinkedIn authority post: strong hook, one sharp insight for the audience, soft CTA. Under 2200 characters.",
        ),
        (
            "facebook",
            "Facebook Page post: warm, trustworthy, community tone; actionable tip or reassurance; UK English.",
        ),
        (
            "linkedin",
            "LinkedIn post: proof-led angle (metrics or outcome framing), credible and professional; no hashtags spam.",
        ),
    ]
    sb = get_supabase()
    for platform, template in specs:
        body = ""
        try:
            body = generate_personalised_copy(ctx, lead=f"Brand: {brand}", template=template)
        except Exception as exc:  # noqa: BLE001
            print(f"enqueue_three_pending_posts_direct ({platform}) LLM error: {exc}")
            body = (
                f"[Draft — LLM error] Placeholder {platform} post for {brand}. "
                f"Fix Gemini quota / GEMINI_TEXT_MODEL or set GROQ_API_KEY or ENGINE_FORCE_GROQ=1. ({type(exc).__name__})"
            )
        if not body.strip() or "Configure GOOGLE_API_KEY" in body:
            body = f"[Draft — add LLM keys] Short {platform} update for {brand}."
        try:
            sb.table("pending_posts").insert(
                {
                    "business_id": bid,
                    "platform": platform,
                    "content": body[:12000],
                    "status": "pending",
                }
            ).execute()
        except Exception as exc:  # noqa: BLE001
            print(f"enqueue_three_pending_posts_direct ({platform}) insert failed: {exc}")


def run_crew_for_business(row: dict[str, Any]) -> str:
    profiles = agents_for_type(row.get("type") or "generic")

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=7)
    window_start, window_end = start.isoformat(), end.isoformat()
    ctx = _ctx(row)
    snap = _persist_snapshots_for_window(row, start, end)
    domain = _domain_from_url(row.get("website_url"))

    llm = _llm()
    copy_tools = [generate_personalised_copy_tool]

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
                    "Draft three compliant marketing ideas (text-first, no TikTok/video): bullets with "
                    "channel suggestion + KPI to watch per idea. You may use generate_personalised_copy_tool "
                    "for polish; approvals queue is filled separately by the engine."
                ),
                agent=specialist,
                expected_output="Three Ideas bullets + channel + KPI to watch.",
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
    result = ""
    try:
        try:
            result = str(crew.kickoff())
        except Exception as first_exc:  # noqa: BLE001
            if groq_api_key() and _is_gemini_quota_or_rate_error(first_exc):
                print(
                    "Crew: Gemini quota/rate limited — retrying once with Groq. "
                    "Tip: set ENGINE_USE_GROQ_ONLY=1 (and GROQ_API_KEY) to skip Gemini entirely."
                )
                groq_llm = _groq_llm()
                # CrewAI keeps agent.agent_executor after a failed kickoff; it never refreshes
                # executor.llm when we mutate agent.llm — clear so Groq is used on retry.
                for ag in agents:
                    ag.llm = groq_llm
                    ag.function_calling_llm = groq_llm
                    ag.agent_executor = None
                crew = Crew(
                    agents=agents,
                    tasks=tasks,
                    process=Process.sequential,
                    verbose=True,
                    chat_llm=groq_llm,
                )
                result = str(crew.kickoff())
            else:
                raise
    finally:
        try:
            enqueue_three_pending_posts_direct(row)
        except Exception as exc:  # noqa: BLE001
            print(f"pending_posts direct enqueue failed: {exc}")
    return result


def run_all() -> None:
    raw = os.getenv("ENGINE_SLEEP_BETWEEN_BUSINESSES_SEC", "0").strip()
    try:
        inter_sleep = max(0.0, float(raw))
    except ValueError:
        inter_sleep = 0.0

    businesses = load_active_businesses()
    for idx, row in enumerate(businesses):
        if idx > 0 and inter_sleep > 0:
            print(f"Sleeping {inter_sleep}s before next business (ENGINE_SLEEP_BETWEEN_BUSINESSES_SEC)...")
            time.sleep(inter_sleep)
        print(f"=== Running engine for {row.get('name')} ===")
        try:
            print(run_crew_for_business(row))
        except Exception as exc:  # noqa: BLE001
            print(f"Failed for {row.get('name')}: {exc}")
