"""Typed agent factories — business profile → specialist roster."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Literal

BusinessType = Literal["local_service", "b2b_saas", "agency", "ecommerce", "generic"]


@dataclass(frozen=True)
class AgentProfile:
    key: str
    name: str
    goal: str
    backstory: str


def agents_for_type(btype: str) -> list[AgentProfile]:
    base_monitor = [
        AgentProfile(
            "TrafficMonitor",
            "TrafficMonitor",
            "Report privacy-first analytics from Umami and optional Similarweb benchmarks.",
            "You specialise in Umami analytics, growth funnels, and ethical competitor traffic estimates.",
        ),
        AgentProfile(
            "RevenueTracker",
            "RevenueTracker",
            "Pull Stripe balances, ledger CSV merges, and persist structured revenue snapshots.",
            "You specialise in Stripe ledgers, fee-aware net revenue, and operational revenue hygiene.",
        ),
        AgentProfile(
            "DashboardAggregator",
            "DashboardAggregator",
            "Summarise cross-business KPIs for founders.",
            "You turn operational metrics into executive-ready narratives.",
        ),
    ]

    local = [
        AgentProfile(
            "LocalResearcher",
            "LocalResearcher",
            "Surface high-intent local demand, GBP opportunities, and neighbourhood channels.",
            "You are a local SEO and lead-gen expert for owner-operated trades.",
        ),
        AgentProfile(
            "SocialPostingAgent",
            "SocialPostingAgent",
            "Queue Facebook/LinkedIn posts (text-first) for human approval.",
            "You write punchy community posts with emergency and trust cues when needed.",
        ),
        AgentProfile(
            "SEOMonitor",
            "SEOMonitor",
            "Offer technical SEO and CWV improvement suggestions (no TikTok/video).",
            "You map SERP intent to practical landing page upgrades.",
        ),
    ]

    saas = [
        AgentProfile(
            "SaaSOutreach",
            "SaaSOutreach",
            "Shape B2B sequences with evidence-led personalisation.",
            "You combine pipeline discipline with compliance-aware messaging.",
        ),
        AgentProfile(
            "AuthorityBuilder",
            "AuthorityBuilder",
            "Draft LinkedIn authority posts, comparison guides, and educational carousels.",
            "You are a B2B SaaS narrative designer focused on trust and proof.",
        ),
        AgentProfile(
            "SEOMonitor",
            "SEOMonitor",
            "Translate product value into intent clusters and on-page recommendations.",
            "You optimise for solution-aware buyers comparing vendors.",
        ),
    ]

    agency = [
        AgentProfile(
            "AuthorityBuilder",
            "AuthorityBuilder",
            "Produce case-study outlines, proof stacks, and thought leadership posts.",
            "You champion outcome-led storytelling for engineering buyers.",
        ),
        AgentProfile(
            "CaseStudyGenerator",
            "CaseStudyGenerator",
            "Structure before/after narratives with metrics and quotes (text + graphics only).",
            "You transform delivery notes into publishable case studies.",
        ),
        AgentProfile(
            "Networker",
            "Networker",
            "Suggest high-trust partnerships, community placements, and founder intros.",
            "You map ecosystems for agency growth without spam.",
        ),
    ]

    generic = [
        AgentProfile(
            "SocialListener",
            "SocialListener",
            "Listen for brand mentions and summarise opportunities.",
            "You monitor sentiment and surface reply drafts.",
        ),
        AgentProfile(
            "ContentGenerator",
            "ContentGenerator",
            "Draft channel-native text content within brand guardrails.",
            "You avoid video formats and focus on copy-led assets.",
        ),
    ]

    mapping: dict[str, list[AgentProfile]] = {
        "local_service": local + base_monitor,
        "b2b_saas": saas + base_monitor,
        "agency": agency + base_monitor,
        "ecommerce": generic + base_monitor,
        "generic": generic + base_monitor,
    }
    return mapping.get(btype, mapping["generic"])


def summarize_profiles(profiles: Iterable[AgentProfile]) -> str:
    lines = []
    for p in profiles:
        lines.append(f"- {p.name}: {p.goal}")
    return "\n".join(lines)
