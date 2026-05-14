"""CrewAI task definitions — injected into `run_crew_for_business` (see `agents.orchestrator`)."""

from __future__ import annotations

from crewai import Agent, Task

from tools.copy_doctrine import SOCIAL_POST_GENERATION_TOOL_TEMPLATE


def build_social_generation_task(
    agent: Agent,
    *,
    business_name: str,
    target_audience: str,
    website_url: str,
    business_context_json: str,
) -> Task:
    """Groq/Gemini-backed agent must call `generate_personalised_copy_tool` once with the problem–solution template."""
    ta = target_audience.strip() or "decision-makers implied by the business profile"
    return Task(
        description=(
            f"Generate a problem-solution marketing post for {business_name!r} targeting {ta!r}. "
            f"Analyse the core domain URL ({website_url!r}) to extract appropriate technical or service value terms "
            "only when those terms are justified by the JSON context (do not invent stack, clients, or awards).\n\n"
            "Business context (JSON — source of truth; do not contradict):\n"
            f"{business_context_json}\n\n"
            "Structure the copy with an authoritative headline, a clear problem context, an engineered solution description, "
            "and end strictly with the domain or website URL as a clean action line (plain text).\n"
            "The tone must be professional, reassuring, and completely free from needy or desperate sales pitches.\n\n"
            "Call generate_personalised_copy_tool exactly once with:\n"
            f"- business_context: the JSON block above verbatim\n"
            f"- lead: Brand: {business_name}\n"
            "- template: the exact multiline specification between <<<TEMPLATE>>> and <<<END>>> below\n\n"
            "<<<TEMPLATE>>>\n"
            f"{SOCIAL_POST_GENERATION_TOOL_TEMPLATE}\n"
            "<<<END>>>\n\n"
            "Return only the tool's string output as your final answer (no preamble, no markdown code fences)."
        ),
        expected_output=(
            "A high-converting, uniquely framed social post tailored specifically for Facebook and LinkedIn, "
            "with Target Audience, Strategy, and Content (Headline / The Problem / The Solution) plus domain CTA."
        ),
        agent=agent,
    )
