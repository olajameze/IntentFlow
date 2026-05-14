"""CrewAI wiring — dynamic agents per active business (secrets stay server-side)."""

from __future__ import annotations

import json
import os
import re
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
from agents.tasks import build_social_generation_task
from config import google_api_key, groq_api_key, llm_skip_google
from crypto_util import decrypt_stripe_secret
from supabase_client import get_supabase
from tools.copy_doctrine import PESTTRACE_B2B_FOCUS
from tools.llm import generate_personalised_copy, gemini_error_should_use_groq, groq_only_after_gemini_auth_failure
from tools.persistence import save_revenue_snapshot, save_traffic_snapshot
from tools.similarweb import scrape_similarweb_traffic
from tools.stripe_revenue import fetch_stripe_revenue
from tools.umami import fetch_umami_stats


def _extra_copy_doctrine_for_row(row: dict[str, Any]) -> str | None:
    """PestTrace B2B SaaS: compliance-led operator positioning (see requirements.md)."""
    name = (row.get("name") or "").lower()
    web = (row.get("website_url") or "").lower()
    if (row.get("type") or "").strip() == "b2b_saas" and ("pesttrace" in name or "pesttrace" in web):
        return PESTTRACE_B2B_FOCUS
    return None


def _ctx(row: dict[str, Any]) -> str:
    payload: dict[str, Any] = {
        "name": row.get("name"),
        "type": row.get("type"),
        "audience": row.get("target_audience"),
        "industry": row.get("industry"),
        "goals": row.get("goals"),
        "website": row.get("website_url"),
        "umami_website_id": row.get("umami_website_id"),
    }
    extra = _extra_copy_doctrine_for_row(row)
    if extra:
        payload["positioning_addendum"] = extra
    return json.dumps(payload, ensure_ascii=False)


@tool("Scrape Similarweb public summary (advisory)")
def scrape_similarweb_traffic_tool(domain: str) -> str:
    """Scrape Similarweb public traffic summary for a domain; returns JSON."""
    data = scrape_similarweb_traffic(domain)
    return json.dumps(data, ensure_ascii=False)


@tool("Generate personalised copy")
def generate_personalised_copy_tool(business_context: str, lead: str, template: str) -> str:
    """Generate personalised marketing copy from business context, lead, and template."""
    return generate_personalised_copy(business_context, lead, template)


def _llm() -> LLM:
    """Prefer Gemini via CrewAI when configured; otherwise Groq."""
    if llm_skip_google() or groq_only_after_gemini_auth_failure():
        if groq_api_key():
            return _groq_llm()
        raise RuntimeError(
            "GROQ_API_KEY is missing while Groq-only mode is required "
            "(no GOOGLE_API_KEY and no Groq key, or ENGINE_USE_GROQ_ONLY / ENGINE_FORCE_GROQ without GROQ_API_KEY)."
        )
    if google_api_key():
        model = os.getenv("CREWAI_GEMINI_MODEL", "gemini/gemini-2.0-flash").strip() or "gemini/gemini-2.0-flash"
        return LLM(model=model, temperature=0.35)
    if groq_api_key():
        return LLM(model="groq/llama-3.1-8b-instant", temperature=0.35)
    raise RuntimeError(
        "Set GROQ_API_KEY for CrewAI (GOOGLE_API_KEY is unset — Groq-only). "
        "If you use Gemini instead, set GOOGLE_API_KEY."
    )


def _groq_llm() -> LLM:
    return LLM(model="groq/llama-3.1-8b-instant", temperature=0.35)


def _crew_tool_calls_enabled() -> bool:
    """Gemini tolerates Crew tool payloads; Groq/LiteLLM validates JSON strictly (tool_use_failed). Tools only on Gemini."""
    if groq_only_after_gemini_auth_failure():
        return False
    if llm_skip_google():
        return False
    if not google_api_key():
        return False
    return True


def _is_groq_token_rate_limit(exc: BaseException) -> bool:
    err = str(exc).lower()
    return (
        "rate_limit_exceeded" in err
        or "rate limit reached" in err
        or "tokens per minute" in err
        or ("tpm" in err and "limit" in err)
    )


def _groq_rate_limit_wait_seconds(exc: BaseException) -> float:
    """Groq error bodies often include 'Please try again in 12.56s'."""
    m = re.search(r"try again in ([0-9.]+)\s*s", str(exc), re.I)
    if m:
        return min(90.0, float(m.group(1)) + 1.5)
    raw = os.getenv("ENGINE_GROQ_RATE_LIMIT_PAUSE_SEC", "15").strip()
    try:
        return max(5.0, float(raw))
    except ValueError:
        return 15.0


def _crew_kickoff_with_groq_rate_limit_retries(crew: Crew, *, label: str) -> str:
    """Groq free/on-demand tiers hit TPM caps across sequential Crew tasks; backoff and retry."""
    raw = os.getenv("ENGINE_CREW_KICKOFF_RETRIES", "8").strip()
    try:
        max_attempts = max(1, int(raw))
    except ValueError:
        max_attempts = 8
    last_exc: BaseException | None = None
    for attempt in range(max_attempts):
        try:
            return str(crew.kickoff())
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if _is_groq_token_rate_limit(exc):
                wait = _groq_rate_limit_wait_seconds(exc)
                print(
                    f"Crew ({label}): Groq token rate limit — sleeping {wait:.1f}s "
                    f"(attempt {attempt + 1}/{max_attempts})."
                )
                time.sleep(wait)
                continue
            raise
    if last_exc:
        raise last_exc
    raise RuntimeError(f"Crew ({label}): exhausted kickoff retries")


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


def _social_copy_agent(agent_by_role: dict[str, Agent]) -> Agent | None:
    """First rostered agent that can call `generate_personalised_copy_tool` for social-style output."""
    for key in (
        "SocialPostingAgent",
        "AuthorityBuilder",
        "SaaSOutreach",
        "ContentGenerator",
        "LocalResearcher",
        "CaseStudyGenerator",
        "Networker",
    ):
        hit = agent_by_role.get(key)
        if hit:
            return hit
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
            "LinkedIn: authoritative operator voice. Strictly follow the mandatory Target Audience → Strategy → "
            "Content (Headline, The Problem, The Solution, then closing line with domain/URL from JSON). "
            "Under 2200 characters. No hashtag spam.",
        ),
        (
            "facebook",
            "Facebook Page: warm, trustworthy, community-operator tone. Same mandatory section labels and order as "
            "global doctrine (problem–solution, domain CTA). UK English.",
        ),
        (
            "linkedin",
            "LinkedIn: second angle — proof- or compliance-led framing that still fits the JSON industry/type. "
            "Same mandatory structure; credible and professional; under 2200 characters.",
        ),
    ]
    sb = get_supabase()
    extra = _extra_copy_doctrine_for_row(row)
    # Collapse instructional LLM-missing bodies from `generate_personalised_copy` into a short queue placeholder.
    _llm_key_hint_markers = (
        "Configure GOOGLE_API_KEY",
        "Set GROQ_API_KEY",
        "Configure GROQ_API_KEY",
        "[Draft — configure LLM fallback]",
        "[Draft — LLM fallback failed]",
        "[Draft — LLM error] Gemini failed",
    )
    for platform, template in specs:
        body = ""
        try:
            body = generate_personalised_copy(ctx, lead=f"Brand: {brand}", template=template, extra_doctrine=extra)
        except Exception as exc:  # noqa: BLE001
            print(f"enqueue_three_pending_posts_direct ({platform}) LLM error: {exc}")
            body = (
                f"[Draft — LLM error] Placeholder {platform} post for {brand}. "
                f"Fix Gemini quota / GEMINI_TEXT_MODEL or set GROQ_API_KEY "
                f"with ENGINE_USE_GROQ_ONLY=1 / ENGINE_FORCE_GROQ=1. ({type(exc).__name__})"
            )
        if not body.strip() or any(marker in body for marker in _llm_key_hint_markers):
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
    tools_ok = _crew_tool_calls_enabled()
    copy_tools = [generate_personalised_copy_tool] if tools_ok else []
    traffic_tools = [scrape_similarweb_traffic_tool] if tools_ok else []

    tools_map = {
        "TrafficMonitor": traffic_tools,
        # No tools on RevenueTracker: Groq tool_use often fails on JSON-heavy args (see tool_use_failed). Revenue is
        # already snapshotted in-process before Crew runs; CSV merges belong in offline/batch jobs, not this LLM step.
        "RevenueTracker": [],
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
                    + (
                        "Optionally call scrape_similarweb_traffic_tool(domain) once for a public benchmark. "
                        if tools_ok
                        else "Do **not** call any tools. You may reference public traffic patterns only from general "
                        "knowledge — do not invent metrics. "
                    )
                    + "Give a concise traffic narrative. Do not attempt Umami or database persistence tools."
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
                    "Interpret these results in plain language and recommend hygiene (e.g. connect Stripe in Settings, "
                    "watch fee drift). Do **not** call any tools — narrative only."
                ),
                agent=revenue,
                expected_output="Revenue interpretation and next actions.",
            )
        )
    if specialist and specialist is not traffic:
        spec_lines = [
            f"Business context: {ctx}\n",
            "Draft three compliant marketing ideas (text-first, no TikTok/video): bullets with "
            "channel suggestion + KPI to watch per idea. ",
        ]
        if tools_ok:
            spec_lines.append(
                "You may use generate_personalised_copy_tool for polish; each idea should still align with "
                "problem→solution positioning. "
            )
        else:
            spec_lines.append(
                "Write in your own words (no tools). Each idea should align with problem→solution positioning. "
            )
        spec_lines.append(
            "The approvals queue is filled separately by the engine using the same doctrine."
        )
        tasks.append(
            Task(
                description="".join(spec_lines),
                agent=specialist,
                expected_output="Three Ideas bullets + channel + KPI to watch.",
            )
        )
    social_agent = _social_copy_agent(agent_by_role)
    if social_agent:
        tasks.append(
            build_social_generation_task(
                social_agent,
                business_name=str(row.get("name") or "Brand"),
                target_audience=str(row.get("target_audience") or ""),
                website_url=str(row.get("website_url") or ""),
                business_context_json=ctx,
                use_copy_tool=tools_ok,
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
                    "Deliver a brief executive summary (max ~200 words) and 5 numbered next steps (no tool calls required)."
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
            result = _crew_kickoff_with_groq_rate_limit_retries(crew, label="primary")
        except Exception as first_exc:  # noqa: BLE001
            if gemini_error_should_use_groq(first_exc):
                print(
                    "Crew: Gemini failed (quota, auth, or rate limit) — retrying once with Groq. "
                    "Tip: set ENGINE_USE_GROQ_ONLY=1 (and GROQ_API_KEY) to skip Gemini entirely."
                )
                groq_llm = _groq_llm()
                # CrewAI keeps agent.agent_executor after a failed kickoff; it never refreshes
                # executor.llm when we mutate agent.llm — clear so Groq is used on retry.
                for ag in agents:
                    ag.llm = groq_llm
                    ag.function_calling_llm = groq_llm
                    ag.agent_executor = None
                    ag.tools = []
                crew = Crew(
                    agents=agents,
                    tasks=tasks,
                    process=Process.sequential,
                    verbose=True,
                    chat_llm=groq_llm,
                )
                result = _crew_kickoff_with_groq_rate_limit_retries(crew, label="groq-retry")
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
