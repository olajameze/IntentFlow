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
The Problem: <2–4 sentences: a specific, time-relevant pain point that audience is actively facing now; concrete consequences; no invented case studies>
The Solution: <2–4 sentences: position this business as the clear fix to that exact problem; practical next step; calm authority, not hype>
<one closing imperative line that ends with the canonical site for action — use the website or domain from JSON, e.g. “… at example.co.uk” or “… at Brand.com” — plain text URL/domain only, no markdown link syntax unless the channel expects it>

Formatting rules:
- Use the labels "Target Audience:", "Strategy:", "Content:", "Headline:", "The Problem:", "The Solution:" exactly as shown (then body text on the same line or following lines).
- Every post must follow PROBLEM -> SOLUTION logic; never output generic promotional copy that is not tied to a specific pain point.
- Do not add extra numbered lists. No emoji unless the brand context clearly supports it. No hashtag spam.
- Strictly no TikTok or video concepts. Output must fit text-only, image, carousel, or article style suitable for LinkedIn/Facebook.
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
- Problem -> solution discipline is mandatory on every post: identify one concrete pain first, then position the business as the clear fix.
- Never write generic awareness copy or empty brand hype; each post must be anchored to a real audience problem with consequences.
- Confident operator tone: never needy, pleading, desperate, or guilt-tripping.
- Ethical influence (positioning discipline): lead with authority and proof; show mastery through clarity; let outcomes speak; never argue down competitors by name; no false scarcity or fear-mongering.
- UK English. Strictly no TikTok/video content directions. Keep output suitable for text-only, image, carousel, or article formats on LinkedIn/Facebook.
- Compliant with professional networks (no medical/legal guarantees unless context supports it).

High-conversion problem–solution discipline (every pending post and every social-generation tool call):
- Obey the mandatory section order and labels in the task template (Target Audience → Strategy → Content with Headline / The Problem / The Solution → closing line with domain).
- Style reference (structure only — do not copy phrases): (1) web/engineering brands: hidden operating cost of slow or broken digital experiences → custom engineered product and CTA on domain; (2) regulated local services: invisibility of good prevention vs reactive failure → systematic protection and compliance framing → CTA on domain; (3) B2B SaaS for operators: field time lost to paperwork vs orchestrated digital trails → margins and audit clarity → CTA on domain.
""".strip() + "\n\n" + PROBLEM_SOLUTION_OUTPUT_SCHEMA

WEATHERS_SEASONAL_FOCUS = """
Weathers Pest Solutions-specific (only when this block is included):
- Business identity and solution framing: 24/7 pest control, BPCA certified, fast and discreet, West Midlands focus, 5-star rated, 100% satisfaction guarantee.
- Core services available to reference when relevant: bed bug treatment (from £300), wasp nest removal, rodent control, ant treatments, cockroach extermination, flea treatments, cluster fly control, moth treatments, bird management, residential and commercial coverage, business subscriptions from £275/month (Bronze, Silver, Gold).
- Mandatory post logic: problem first (specific seasonal pest issue) -> Weathers as the immediate local solution.
- Tone: urgent but reassuring, professional, practical for homeowners and businesses in the West Midlands.
- Seasonal pest calendar (must use current month/season context when writing):
  - January-February: rodents moving indoors for warmth, cockroaches in heated areas, cluster flies/ladybirds overwintering indoors.
  - March-April: ants emerging, wasp/bee queens scouting lofts/eaves, fleas becoming active, clothes/pantry moths.
  - May-June: ants peak, wasp nests rapidly growing, mosquitoes breeding in standing water, flies and textile pests increasing.
  - July-August: aggressive late-season wasps, flies/fruit flies, spiders more visible indoors.
  - September-October: rodents migrating indoors, cluster flies/ladybirds seeking shelter, spiders highly noticeable.
  - November-December: indoor rodent infestations, stored product insects active in pantries.
- Bed bug angle can be used year-round when relevant: waking up with bites, fast spread, one female can lay 200-500 eggs, DIY often fails, professional heat/chemical treatment required.
- CTA requirement: include either call 07462253896 or visit weatherspestsolutions.co.uk (or both).
""".strip()

JGDEVS_MARKETING_FOCUS = """
JGDevs-specific (only when this block is included):
- Audience and framing: UK small business owners, sole traders, and individuals without an effective website; many feel overwhelmed by tech decisions.
- Mandatory post logic: identify a business growth problem caused by no website, poor website, or non-mobile-friendly website -> JGDevs builds websites that generate customers.
- Tone: empowering, eye-opening, solution-focused, simple and practical (avoid jargon-heavy technical overload).
- Core message: websites should generate leads/sales/bookings, not sit as passive brochures.
- Use relevant UK statistics naturally where appropriate (do not dump all stats in one post):
  - 32% of UK businesses have no website.
  - 35% of sole traders and 26% of micro businesses have no website.
  - London businesses lose an estimated £3.7 billion annually to competitors with stronger digital presence.
  - UK SMEs using outdated manual processes miss an estimated £6.15 billion in sales.
  - 81% of consumers research online before purchase.
  - Around one-third of UK small businesses still lack a mobile-friendly website.
- Theme coverage over time should include: invisibility without a website, poor first impressions, mobile experience losses, lead generation while owner sleeps, competitor capture when searched on Google.
- CTA requirement: direct readers to jgdev.co.uk.
""".strip()

PESTTRACE_B2B_FOCUS = """
PestTrace-specific (only when this block is included):
- Sole focus: compliance, audit readiness, and operational control for UK pest-control businesses.
- Mandatory post logic: specific compliance/paperwork/audit pain point first -> PestTrace as the practical digital solution.
- Positioning: built specifically for UK pest control, not generic field service software.
- Feature anchors you may reference when relevant: digital logbook (treatments/photos/e-signatures/follow-ups/site notes), qualification expiry tracking, audit-ready reports, operational dashboard, customer analytics, CRRU-minded workflows.
- Commercial anchors when suitable: Pro £248/mo, Business £496/mo, Enterprise £992/mo, plus a 7-day free trial.
- Compliance pain points to rotate through:
  - Paper logs/spreadsheets are weak for modern audits (BRCGS, SALSA, Red Tractor, BS EN 16636).
  - Poor documentation can trigger non-conformances and contract risk.
  - BPCA assessment failures can lead to fines up to £5,000.
  - Rodenticide stewardship requires consistent verifiable records.
  - DAERA direction: from 1 January 2027, PPP records must be electronic and machine-readable.
  - Field paperwork creates office transcription backlog and missed records.
  - Qualification/certification expiry dates get missed.
  - Lost/damaged paper evidence can destroy compliance history.
- Tone: authoritative but accessible. Reader should feel clearer and more in control, never pressured.
- CTA requirement: mention pesttrace.com and the 7-day free trial.
""".strip()
