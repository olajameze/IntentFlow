"""CrewAI wiring — dynamic agents per active business (secrets stay server-side)."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

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
from tools.umami import fetch_umami_metrics, fetch_umami_pageviews, fetch_umami_stats


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


@tool("Fetch Umami stats for a website id")
def fetch_umami_stats_tool(website_id: str, start_iso: str, end_iso: str) -> str:
    start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    end = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
    data = fetch_umami_stats(website_id, start, end)
    return json.dumps(data, ensure_ascii=False)


@tool("Fetch Umami pageviews time series")
def fetch_umami_pageviews_tool(website_id: str, start_iso: str, end_iso: str) -> str:
    start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    end = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
    data = fetch_umami_pageviews(website_id, start, end)
    return json.dumps(data, ensure_ascii=False)


@tool("Fetch Umami metrics breakdown")
def fetch_umami_metrics_tool(website_id: str, start_iso: str, end_iso: str) -> str:
    start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    end = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
    data = fetch_umami_metrics(website_id, start, end)
    return json.dumps(data, ensure_ascii=False)


@tool("Persist an Umami payload via business id")
def save_traffic_snapshot_tool(business_id: str, website_id: str, json_payload: str, source: str = "umami") -> str:
    save_traffic_snapshot(business_id, json.loads(json_payload), source=source, website_id=website_id)
    return "saved"


@tool("Scrape Similarweb public summary (advisory)")
def scrape_similarweb_traffic_tool(domain: str) -> str:
    data = scrape_similarweb_traffic(domain)
    return json.dumps(data, ensure_ascii=False)


@tool("Fetch Stripe revenue using stored business secret (no key in prompt)")
def fetch_stripe_revenue_for_business_tool(business_id: str, start_iso: str, end_iso: str) -> str:
    sb = get_supabase()
    rows = sb.table("businesses").select("*").eq("id", business_id).limit(1).execute()
    data = (rows.data or [None])[0]
    if not data:
        return json.dumps({"error": "business not found"})
    key = decrypt_stripe_secret(
        data.get("stripe_secret_ciphertext"),
        data.get("stripe_secret_iv"),
        data.get("stripe_secret_tag"),
    )
    if not key:
        return json.dumps({"error": "stripe key not configured"})
    start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    end = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
    payload = fetch_stripe_revenue(key, (start, end))
    return json.dumps(payload, ensure_ascii=False)


@tool("Persist Stripe-derived snapshot for business id")
def save_revenue_snapshot_tool(business_id: str, json_payload: str) -> str:
    save_revenue_snapshot(business_id, json.loads(json_payload), snapshot_source="stripe_api")
    return "saved"


@tool("Merge CSV processor exports (paths_json maps processor->path)")
def merge_csv_uploads_tool(paths_json: str) -> str:
    paths = json.loads(paths_json)
    rows = merge_csv_uploads(paths)
    return json.dumps(rows[:200], ensure_ascii=False)


@tool("Generate personalised copy")
def generate_personalised_copy_tool(business_context: str, lead: str, template: str) -> str:
    return generate_personalised_copy(business_context, lead, template)


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


def run_crew_for_business(row: dict[str, Any]) -> str:
    llm = _llm()
    profiles = agents_for_type(row.get("type") or "generic")

    tools_map = {
        "TrafficMonitor": [
            fetch_umami_stats_tool,
            fetch_umami_pageviews_tool,
            fetch_umami_metrics_tool,
            save_traffic_snapshot_tool,
            scrape_similarweb_traffic_tool,
        ],
        "RevenueTracker": [
            fetch_stripe_revenue_for_business_tool,
            save_revenue_snapshot_tool,
            merge_csv_uploads_tool,
        ],
        "LocalResearcher": [generate_personalised_copy_tool],
        "SaaSOutreach": [generate_personalised_copy_tool],
        "AuthorityBuilder": [generate_personalised_copy_tool],
        "SocialPostingAgent": [generate_personalised_copy_tool],
        "CaseStudyGenerator": [generate_personalised_copy_tool],
        "Networker": [generate_personalised_copy_tool],
        "SocialListener": [generate_personalised_copy_tool],
        "ContentGenerator": [generate_personalised_copy_tool],
        "SEOMonitor": [generate_personalised_copy_tool],
        "DashboardAggregator": [
            fetch_umami_stats_tool,
            fetch_stripe_revenue_for_business_tool,
        ],
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

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=7)
    window_start, window_end = start.isoformat(), end.isoformat()
    business_id = row.get("id")
    ctx = _ctx(row)

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
                    f"Pull Umami analytics for website id {row.get('umami_website_id')} "
                    f"between {window_start} and {window_end}. Persist snapshot for business_id {business_id}."
                ),
                agent=traffic,
                expected_output="Metric summary with saves confirmed.",
            )
        )
    if revenue:
        tasks.append(
            Task(
                description=(
                    f"Business context: {ctx}\n"
                    f"Attempt Stripe snapshot via tools for business_id {business_id} same window. "
                    "If tool reports missing key, outline manual revenue hygiene instead."
                ),
                agent=revenue,
                expected_output="Revenue snapshot status with figures or blockers.",
            )
        )
    if specialist and specialist is not traffic:
        tasks.append(
            Task(
                description=(
                    f"Business context: {ctx}\n"
                    "Draft three compliant marketing ideas (text-first, no video/TikTok)."
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
                    "Synthesize weekly executive summary + next steps using tools only if needed."
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
