"""Shared marketing voice for pending-post drafts — used by `generate_personalised_copy`."""

from __future__ import annotations

# High-conversion problem–solution skeleton (see requirements / exemplar brands in product docs).
# Structure mirrors professional posts: headline → problem → solution → domain CTA — not transactional begging.
PROBLEM_SOLUTION_OUTPUT_SCHEMA = """
Mandatory output structure (follow exactly; UK English; unique to this business JSON only):

Target Audience: <one line: who must act, inferred from audience + industry + goals in the JSON>

Strategy: <one line: shift from a transactional pitch to operational risk protection, asset/regulatory value, or workflow leverage — appropriate to the sector>

Content:
Headline: <short authoritative headline (may end with a full stop)>
The Problem: <2–4 sentences: concrete pain — delays, hidden cost, compliance/reputation/throughput risk, or failed customer journeys — grounded in the JSON; no invented case studies>
The Solution: <2–4 sentences: how this business removes root cause; technical or service terms only when justified by name/type/website/domain; calm authority, not hype>
<one closing imperative line that ends with the canonical site for action — use the website or domain from JSON, e.g. “… at example.co.uk” or “… at Brand.com” — plain text URL/domain only, no markdown link syntax unless the channel expects it>

Formatting rules:
- Use the labels "Target Audience:", "Strategy:", "Content:", "Headline:", "The Problem:", "The Solution:" exactly as shown (then body text on the same line or following lines).
- Do not add extra numbered lists. No emoji unless the brand context clearly supports it. No hashtag spam.
- If JSON contains "positioning_addendum", treat it as mandatory extra positioning for Strategy and The Solution (do not contradict other JSON facts).
""".strip()

# Passed as the Crew tool `template` argument so the agent calls `generate_personalised_copy_tool` with identical instructions.
SOCIAL_POST_GENERATION_TOOL_TEMPLATE = (
    PROBLEM_SOLUTION_OUTPUT_SCHEMA
    + "\n\nProduce one complete post body suitable for Facebook or LinkedIn (same structure; adjust tone slightly warmer on Facebook if needed, without dropping labels)."
).strip()

# Ethical B2B framing: “laws of power” read as positioning discipline, not manipulation or deceit.
GLOBAL_COPY_DOCTRINE = """
Global voice (all brands):
- Be unique to this business: use only facts implied by the JSON context (name, audience, industry, goals, website). Do not invent awards, clients, or metrics.
- Problem → insight → solution. Confident operator tone: never needy, pleading, desperate, or guilt-tripping.
- Ethical influence (positioning discipline): lead with authority and proof; show mastery through clarity; let outcomes speak; never argue down competitors by name; no false scarcity or fear-mongering.
- UK English. No video/TikTok. Compliant with professional networks (no medical/legal guarantees unless context supports it).

High-conversion problem–solution discipline (every pending post and every social-generation tool call):
- Obey the mandatory section order and labels in the task template (Target Audience → Strategy → Content with Headline / The Problem / The Solution → closing line with domain).
- Style reference (structure only — do not copy phrases): (1) web/engineering brands: hidden operating cost of slow or broken digital experiences → custom engineered product and CTA on domain; (2) regulated local services: invisibility of good prevention vs reactive failure → systematic protection and compliance framing → CTA on domain; (3) B2B SaaS for operators: field time lost to paperwork vs orchestrated digital trails → margins and audit clarity → CTA on domain.
""".strip() + "\n\n" + PROBLEM_SOLUTION_OUTPUT_SCHEMA

PESTTRACE_B2B_FOCUS = """
PestTrace-specific (only when this block is included):
- Sole focus: compliance, audit readiness, and operational risk inside pest-control businesses (operators, compliance managers, field documentation).
- Tie every point to how PestTrace fits that world (software/process), without sounding salesy: educate first, product second.
- Tone: calm authority — the reader should feel smarter after reading, not pressured.
""".strip()
