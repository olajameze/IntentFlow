"""Outreach campaign registry — per-brand prompts, scraper queries, and sender identity.

Each campaign is a fully self-contained config: who is sending, who they are targeting,
how to find the targets, and what to write to them.

Campaigns
─────────
  pesttrace
    Targets pest control businesses across UK/US/CA/AU to sell PestTrace compliance SaaS.
    Sender: PestTrace Team. Tone: peer-to-peer compliance advice.

  weathers
    Targets UK commercial premises that NEED pest control (restaurants, hotels, care homes,
    food sites, letting agents) primarily in the West Midlands service area.
    Sender: Weathers Pest Solutions. Tone: trusted local technician, services + pricing
    pulled from https://weatherspestsolutions.co.uk/.

Add a new campaign by appending an entry to ``CAMPAIGNS`` — no other engine code changes
are needed; both the scraper and the email generator dispatch on campaign id.
"""

from __future__ import annotations

import textwrap
from dataclasses import dataclass, field

# A query bound to a city for one country segment of the scraper.
SearchQuery = tuple[str, str]   # (query string, city/region label)


@dataclass(frozen=True)
class CampaignConfig:
    """All parameters needed to scrape + draft + sign emails for one outreach brand."""

    id: str
    label: str                                        # human-readable name (UI + logs)
    sender_signature: str                             # plain-text sign-off (LLM is told to use this verbatim)
    website: str                                      # appended to signature and emails
    default_from_name_env: str                        # env key holding the from-name (override)
    default_from_email_env: str                       # env key holding the from-email (override)
    smtp_host_env: str                                # env key holding SMTP host (optional override)
    smtp_user_env: str                                # env key holding SMTP user
    smtp_password_env: str                            # env key holding SMTP password
    smtp_port_env: str                                # env key holding SMTP port
    countries: tuple[str, ...]                        # 2-letter ISO country codes to scrape
    queries: dict[str, list[SearchQuery]]             # per-country search queries → URL discovery
    subject_prompt: str                               # LLM template, .format(name=..., website=..., country=..., sector_angle=...)
    body_prompt: str                                  # LLM template, same fields
    fallback_subject: str                             # used when LLM returns empty / starts with "[Draft"
    fallback_body_template: str                       # textwrap.dedent-style, .format(name=..., website=...)
    opt_out_footer: str                               # plain-text footer appended to HTML email
    cta_label: str                                    # text on the primary CTA button
    cta_url_template: str                             # CTA destination, .format(prospect_id=...) — supports UTM tracking
    accent_color: str                                 # hex colour used for the CTA button + headline rule
    trust_badges: tuple[str, ...]                     # plain-text trust badges shown above the CTA
    sector_angles: dict[str, str] = field(default_factory=dict)
    """Per-sector copy hints injected into the LLM prompt for sharper personalisation."""
    follow_up_prompts: tuple[str, ...] = field(default_factory=tuple)
    """Optional per-touch prompts for follow-ups 1 and 2. Empty tuple → no follow-up sequence."""
    skip_url_keywords: tuple[str, ...] = field(default_factory=tuple)
    """Extra keywords that disqualify a candidate URL (in addition to global aggregator/social filters)."""


# ── PestTrace (existing campaign) ────────────────────────────────────────────

_PESTTRACE_SUBJECT_PROMPT = """You are writing TWO cold B2B email subject line variants for PestTrace.com (for A/B testing).

PestTrace is a digital compliance and job-tracking platform built specifically for UK pest control businesses.

The recipient is a pest control business owner or manager at: {name} ({website})
Sector angle to incorporate: {sector_angle}

Return EXACTLY two lines:
Line 1 — variant A (a question style): focuses on ONE specific compliance or audit-readiness problem they may have now.
Line 2 — variant B (a statement style): names a concrete operational risk without a question mark.

Rules for BOTH:
- Max 60 characters each.
- Do NOT mention PestTrace in the subject — feel like a relevant industry question/observation.
- No clickbait. No exclamation marks. No emojis.
- UK English.
- Keep aligned to real pain points: paper logs failing audits, missing treatment documentation, qualification expiry risk, BRCGS/SALSA/Red Tractor/BS EN 16636 pressure, rodenticide stewardship evidence.

Examples:
  Are your pest control records audit-ready?
  Field documentation gaps are a growing compliance risk

Return ONLY two lines — no labels, no quotes, no explanation."""


_PESTTRACE_BODY_PROMPT = """You are writing a cold B2B email on behalf of PestTrace.com.

PestTrace is a compliance and job-tracking platform built specifically for UK pest control businesses.
It replaces paper/spreadsheet records with digital evidence trails that are audit-ready.

Recipient business: {name}
Website: {website}
Country: {country}
Sector angle to incorporate: {sector_angle}

Write a professional B2B outreach email. Rules:
- Tone: calm authority. Never needy, never begging. Read like advice from a peer, not a sales pitch.
- Mandatory structure: short opener (1 sentence) -> specific compliance/paperwork problem (2-3 sentences) -> how PestTrace solves that exact issue (2-3 sentences) -> soft CTA (visit pesttrace.com or reply)
- Problem must be concrete and credible. Use one angle such as:
  - audit pressure under BRCGS/SALSA/Red Tractor/BS EN 16636,
  - BPCA assessment documentation risk (including potential £5,000 fines),
  - rodenticide stewardship record-keeping pressure,
  - qualification/certificate expiry being missed,
  - office backlog from transcribing field paperwork,
  - lost/damaged paper logs,
  - 2027 machine-readable electronic record expectations for PPP workflows.
- Solution section should frame PestTrace capabilities as practical outcomes: digital logbook, photos/e-signatures/follow-ups, audit-ready reports, expiry tracking, dashboard visibility, and UK pest-control-specific workflows.
- Do NOT mention pricing, discounts, or urgency pressure.
- Do NOT use phrases like "I hope this email finds you well", "just reaching out", or "I wanted to touch base".
- Max 180 words total body text.
- UK English unless the business is in the US, Canada, or Australia.
- End with a professional sign-off: "Best regards,\\nThe PestTrace Team\\nhttps://pesttrace.com"
- Replace [Your Name] with just "The PestTrace Team" — do not invent a person's name.

Return ONLY the email body text — no subject line, no meta-commentary."""


_PESTTRACE_FALLBACK_BODY = """\
Pest control businesses are under growing pressure to produce clean, verifiable treatment records during audits and customer compliance checks.

Paper logs and spreadsheets often leave documentation gaps, especially when field notes must be retyped later by office staff.

PestTrace gives teams like {name} a digital logbook for treatments, photos, signatures, follow-ups, and qualification tracking, so records stay audit-ready.

If compliance confidence is a priority this quarter, it's worth seeing how pesttrace.com works.

Best regards,
The PestTrace Team
https://pesttrace.com"""


_PESTTRACE_QUERIES: dict[str, list[SearchQuery]] = {
    "UK": [
        ("pest control London site:.co.uk",         "London"),
        ("pest control Manchester site:.co.uk",     "Manchester"),
        ("pest control Birmingham site:.co.uk",     "Birmingham"),
        ("pest control Bristol site:.co.uk",        "Bristol"),
        ("pest control Leeds site:.co.uk",          "Leeds"),
        ("pest control Sheffield site:.co.uk",      "Sheffield"),
        ("pest control Glasgow site:.co.uk",        "Glasgow"),
        ("pest control Edinburgh site:.co.uk",      "Edinburgh"),
        ("pest control Liverpool site:.co.uk",      "Liverpool"),
        ("pest control Nottingham site:.co.uk",     "Nottingham"),
        ("pest control Leicester site:.co.uk",      "Leicester"),
        ("pest control Southampton site:.co.uk",    "Southampton"),
    ],
    "US": [
        ("local pest control company New York contact email",     "New York"),
        ("local pest control company Los Angeles contact email",  "Los Angeles"),
        ("local pest control company Chicago contact email",      "Chicago"),
        ("local pest control company Houston contact email",      "Houston"),
        ("local pest control company Phoenix contact email",      "Phoenix"),
        ("local pest control company Philadelphia contact email", "Philadelphia"),
        ("local pest control company San Antonio contact",        "San Antonio"),
        ("local pest control company Dallas contact email",       "Dallas"),
    ],
    "CA": [
        ("pest control company Toronto site:.ca",   "Toronto"),
        ("pest control company Vancouver site:.ca", "Vancouver"),
        ("pest control company Calgary site:.ca",   "Calgary"),
        ("pest control company Ottawa site:.ca",    "Ottawa"),
        ("pest control company Montreal site:.ca",  "Montreal"),
        ("pest control company Edmonton site:.ca",  "Edmonton"),
    ],
    "AU": [
        ("pest control company Sydney site:.com.au",    "Sydney"),
        ("pest control company Melbourne site:.com.au", "Melbourne"),
        ("pest control company Brisbane site:.com.au",  "Brisbane"),
        ("pest control company Perth site:.com.au",     "Perth"),
        ("pest control company Adelaide site:.com.au",  "Adelaide"),
        ("pest control company Canberra site:.com.au",  "Canberra"),
    ],
}


_PESTTRACE_FOLLOWUP_PROMPTS = (
    # Touch 2 (Day 3)
    """You are writing a SHORT follow-up email (max 90 words) from PestTrace.com to a UK pest control business that didn't reply to your first email three days ago.

Recipient: {name} ({website})
Sector angle: {sector_angle}

Rules:
- Reference (gently) that you wrote a few days ago — no apology, no guilt-tripping.
- Open with a different angle from the first email — pick ONE: lost paperwork story, an upcoming audit risk, qualification expiry, or 2027 electronic record expectations.
- Frame PestTrace as the obvious fix in one sentence.
- End with a single CTA: "Worth a 10-minute look at pesttrace.com?"
- Sign off: "Best regards,\\nThe PestTrace Team\\nhttps://pesttrace.com"
- UK English. No clickbait. No emojis. No quotes around the email.""",
    # Touch 3 (Day 7) — break-up email
    """You are writing a final, brief 'breakup' follow-up email (max 60 words) from PestTrace.com.

Recipient: {name} ({website})

Rules:
- Acknowledge silence is fine — say you'll stop emailing after this.
- Reaffirm in one sentence what PestTrace would do for them.
- Single CTA: "If you ever want to come back to this, the door's open at pesttrace.com."
- Sign off: "Best regards,\\nThe PestTrace Team"
- UK English. No emojis. Return only the email body.""",
)


PESTTRACE = CampaignConfig(
    id="pesttrace",
    label="PestTrace (compliance SaaS → pest control firms)",
    sender_signature="The PestTrace Team",
    website="https://pesttrace.com",
    default_from_name_env="OUTREACH_FROM_NAME",
    default_from_email_env="OUTREACH_FROM_EMAIL",
    smtp_host_env="SMTP_HOST",
    smtp_user_env="SMTP_USER",
    smtp_password_env="SMTP_PASSWORD",
    smtp_port_env="SMTP_PORT",
    countries=("UK", "US", "CA", "AU"),
    queries=_PESTTRACE_QUERIES,
    subject_prompt=_PESTTRACE_SUBJECT_PROMPT,
    body_prompt=_PESTTRACE_BODY_PROMPT,
    fallback_subject="Are your pest control records audit-ready?",
    fallback_body_template=_PESTTRACE_FALLBACK_BODY,
    opt_out_footer=(
        "You received this email because your pest control business was found in a public directory. "
        "To opt out, reply with <strong>STOP</strong> and we will never contact you again."
    ),
    cta_label="See how PestTrace works",
    # UTM tracking + per-prospect attribution so Umami can attribute landing visits to outreach
    cta_url_template="https://pesttrace.com/?utm_source=outreach&utm_medium=email&utm_campaign=pesttrace&p={prospect_id}",
    accent_color="#0F766E",  # teal — distinct from Weathers green
    trust_badges=("UK-built", "Audit-ready records", "BPCA-aligned workflows"),
    sector_angles={
        "pest_control_firm": "audit pressure, missing field documentation, and qualification expiry that's silently building risk",
        "generic":           "audit pressure, missing field documentation, and qualification expiry that's silently building risk",
    },
    follow_up_prompts=_PESTTRACE_FOLLOWUP_PROMPTS,
)


# ── Weathers Pest Solutions (new campaign) ──────────────────────────────────
#
# Strategy: target UK commercial premises that legally or practically require routine pest
# control. Service area is the West Midlands (Birmingham, Wolverhampton, Coventry, Walsall,
# Dudley, Sandwell/West Bromwich, Solihull, Stoke-on-Trent, Stafford, Worcester).
#
# Sectors picked because they map directly to Weathers' service catalogue
# (https://weatherspestsolutions.co.uk/):
#   • Restaurants / cafes / takeaways  → cockroach treatment, flea control, rodent control,
#     food hygiene compliance pressure
#   • Hotels / B&Bs / guesthouses     → bed bug treatment (Weathers' premium service),
#     heat treatment
#   • Care homes / nursing homes      → rodent control, CQC inspection pressure
#   • Schools / nurseries             → BS EN 16636 contractual requirement
#   • Letting agents / property mgrs  → recurring external bait-box subscription (£50/mo)
#   • Gyms / leisure                  → cockroach / flea control
#   • Pet groomers / boarding kennels → flea control specifically
#   • Bakeries / food production      → rodent + cockroach + audit pressure

_WEATHERS_SUBJECT_PROMPT = """You are writing TWO cold B2B email subject line variants for Weathers Pest Solutions (a BPCA-certified West Midlands pest control company) — for A/B testing.

The recipient is a commercial premises decision-maker at: {name} ({website})
Their location: {country}, West Midlands area.
Sector angle to incorporate: {sector_angle}

Return EXACTLY two lines:
Line 1 — variant A (a question style): names ONE sector-specific pest-control concern as a question.
Line 2 — variant B (a value style): leads with a benefit or service Weathers offers, no question mark.

Rules for BOTH:
- Max 60 characters each.
- Do NOT mention Weathers in the subject — feel like a useful concern, not an advert.
- No clickbait. No exclamation marks. No emojis.
- UK English.

Examples:
  Discreet bed bug treatment for hotel rooms
  Protecting your food hygiene rating this winter
  Rodent risk in your West Midlands properties?
  24/7 pest cover from £275/month

Return ONLY two lines — no labels, no quotes, no explanation."""


_WEATHERS_BODY_PROMPT = """You are writing a cold B2B email on behalf of Weathers Pest Solutions (https://weatherspestsolutions.co.uk).

Weathers Pest Solutions is a BPCA-certified, 5-star-rated, 24/7 emergency pest control company serving the West Midlands.

Recipient business: {name}
Website: {website}
Country: {country}
Sector angle to incorporate (use this as the opening hook): {sector_angle}

Weathers' services and pricing (use ONLY these — do NOT invent extra services):
  • Flea Control — from £210 (1–2 rooms; +£20 per additional room)
  • Bed Bug Treatment — from £300 (covers 3 rooms; +£20 per extra room; full heat treatment from £3000)
  • Cockroach Treatment — from £230 (1–2 rooms; +£20 per additional room)
  • Rat/Mouse Removal — from £250 (2 visits; +£30 for loft inclusion)
  • Wasp Control — from £175 (1 nest; +£50 per additional nest)
  • Business Packages — from £275/month (Bronze / Silver / Gold yearly subscription, cancel anytime)
  • External Bait-boxes — £50/month for continuous monitoring of business premises
  • 100% Satisfaction Guarantee, 24/7 emergency line: 07462253896
  • £50 deposit required to book

Write a short, conversion-focused, warm B2B email. Rules:
- Tone: trusted local technician. Calm, knowledgeable, NOT pushy. Speak to the recipient as a peer.
- LENGTH: max 140 words of body text — short emails outperform long ones in cold outreach.
- Mandatory structure (one paragraph each):
  1) Hook (1 sentence) — open with the sector_angle above, NOT a greeting like "I hope this email finds you well".
  2) Two concrete services with pricing relevant to that sector (2 sentences) — pick from Weathers' list above. Always use £ amounts.
  3) Trust signals in ONE sentence — combine BPCA-certified + 5-star + 24/7 emergency line.
  4) Single soft CTA — say plainly what to do next: "Tap the green button below to see all services and book a slot, or call 07462253896 — £50 deposit secures the booking and comes off the final invoice."
- Do NOT add a 5th paragraph. The CTA button is rendered after your text by the system — do NOT paste a URL yourself.
- Do NOT mention discount codes or urgency pressure.
- Do NOT invent pricing. Use ONLY the numbers above.
- Do NOT use phrases like "I hope this email finds you well", "just reaching out", "circling back", or "I wanted to touch base".
- UK English.
- Sign off EXACTLY:
  "Best regards,\\nThe Weathers Pest Solutions Team\\n07462253896"
- Do NOT invent a personal name. Do NOT paste the website URL in the sign-off — the CTA button handles that.

Return ONLY the email body text — no subject line, no meta-commentary."""


_WEATHERS_FALLBACK_BODY = """\
Running a busy commercial site in the West Midlands often means pests are a "when", not an "if" — and a single mouse sighting can put a food hygiene rating, a CQC visit, or a tenant relationship at risk.

Weathers Pest Solutions is a BPCA-certified, 5-star-rated team covering Birmingham, Wolverhampton, Coventry, Walsall, Dudley, Sandwell, Solihull, Stoke-on-Trent, and Worcester. We offer rapid same-day response for businesses like {name}, with transparent pricing — Rat/Mouse Removal from £250, Cockroach Treatment from £230, Bed Bug Treatment from £300, and full Heat Treatment from £3000 when needed.

For ongoing cover, our Business Packages start at £275/month (Bronze/Silver/Gold), and continuous External Bait-box monitoring is £50/month per site — useful if you manage multiple properties.

We're available 24/7 for emergencies on 07462253896, and every booking carries a 100% Satisfaction Guarantee. A £50 deposit secures any treatment slot and comes off the final invoice.

If you'd like a no-obligation quote, reply to this email or visit weatherspestsolutions.co.uk.

Best regards,
The Weathers Pest Solutions Team
07462253896
https://weatherspestsolutions.co.uk"""


# West Midlands focus — DuckDuckGo queries by sector + town.
# `site:.co.uk` restricts to UK domains; we further filter aggregator URLs in the scraper.
_WEATHERS_QUERIES: dict[str, list[SearchQuery]] = {
    "UK": [
        # Hotels (bed bug target)
        ("hotel Birmingham site:.co.uk",            "Birmingham"),
        ("hotel Wolverhampton site:.co.uk",         "Wolverhampton"),
        ("hotel Coventry site:.co.uk",              "Coventry"),
        ("guest house Birmingham site:.co.uk",      "Birmingham"),
        ("bed and breakfast Walsall site:.co.uk",   "Walsall"),
        # Restaurants & food (cockroach + rodent target)
        ("independent restaurant Birmingham site:.co.uk",   "Birmingham"),
        ("restaurant Coventry contact site:.co.uk",         "Coventry"),
        ("restaurant Wolverhampton site:.co.uk",            "Wolverhampton"),
        ("cafe Solihull site:.co.uk",                       "Solihull"),
        ("takeaway Dudley site:.co.uk",                     "Dudley"),
        ("bakery Birmingham site:.co.uk",                   "Birmingham"),
        # Care / nursing homes (rodent + CQC)
        ("care home Birmingham site:.co.uk",        "Birmingham"),
        ("nursing home Coventry site:.co.uk",       "Coventry"),
        ("care home Wolverhampton site:.co.uk",     "Wolverhampton"),
        ("residential home Walsall site:.co.uk",    "Walsall"),
        # Schools / nurseries
        ("nursery Birmingham site:.co.uk",          "Birmingham"),
        ("nursery Solihull site:.co.uk",            "Solihull"),
        # Letting agents / property mgmt (recurring monthly contracts)
        ("letting agent Birmingham site:.co.uk",            "Birmingham"),
        ("property management Coventry site:.co.uk",        "Coventry"),
        ("estate agent Wolverhampton site:.co.uk",          "Wolverhampton"),
        # Pubs / clubs
        ("pub Stoke-on-Trent site:.co.uk",          "Stoke-on-Trent"),
        ("pub Walsall site:.co.uk",                 "Walsall"),
        # Gyms / leisure
        ("gym Birmingham site:.co.uk",              "Birmingham"),
        # Pet groomers / kennels (flea target)
        ("dog grooming Birmingham site:.co.uk",     "Birmingham"),
        ("boarding kennels West Midlands site:.co.uk",  "West Midlands"),
    ],
}


_WEATHERS_SKIP_KEYWORDS: tuple[str, ...] = (
    # Generic/national chains — Weathers competes with them in their own back yard
    "pest", "exterminator", "rentokil", "ehlhsltd",
    # Generic aggregators not in the global skiplist
    "tripadvisor", "booking.com", "expedia", "trivago", "agoda", "hotels.com",
    "opentable", "deliveroo", "ubereats", "justeat", "just-eat",
    "rightmove", "zoopla", "onthemarket", "openrent",
    "carehome.co.uk", "carehome.com", "nhs.uk", "cqc.org",
)


_WEATHERS_SECTOR_ANGLES: dict[str, str] = {
    "restaurant":      "cockroach sightings + food hygiene rating risk during EHO inspections",
    "hotel":           "discreet bed bug treatment for guest rooms with heat treatment available",
    "care_home":       "rodent control with documented evidence ready for CQC inspections",
    "school":          "routine pest cover under BS EN 16636 for nurseries and schools",
    "letting_agent":   "recurring tenant call-out savings via £50/month external bait-box monitoring across multiple properties",
    "pub":             "cockroach and rodent issues behind kitchens, plus evening emergency call-outs",
    "gym":             "cockroach and flea risk in changing rooms and locker areas",
    "pet_groomer":     "flea control specifically for grooming salons and boarding kennels",
    "bakery":          "rodent + cockroach prevention plus audit-ready documentation",
    "food_production": "rodent + cockroach prevention plus documented control for food-safety audits",
    "generic":         "general commercial pest cover under the £275/month Business Package — Bronze, Silver or Gold",
}


_WEATHERS_FOLLOWUP_PROMPTS = (
    # Touch 2 (Day 3) — same value, fresh angle
    """You are writing a SHORT follow-up (max 90 words) from Weathers Pest Solutions to a UK West Midlands business that didn't reply to your first email three days ago.

Recipient: {name} ({website})
Sector angle: {sector_angle}

Rules:
- Mention you wrote earlier in ONE clause — no apology.
- Lead with a different concrete benefit than your first email — pick ONE from:
  • 100% Satisfaction Guarantee on every booking
  • 24/7 emergency line 07462253896 (most rivals are 9–5)
  • £50 deposit goes straight off the invoice — no hidden fees
  • For multi-site operators: £50/month External Bait-boxes per location
- End with single soft CTA: "Have a look at the services and book a slot when it suits — the button below opens the booking page."
- Do NOT paste URLs — the CTA button is rendered after your text.
- Sign off: "Best regards,\\nThe Weathers Pest Solutions Team\\n07462253896"
- UK English. No emojis. Max 90 words.""",
    # Touch 3 (Day 7) — break-up
    """You are writing the FINAL follow-up (max 60 words) from Weathers Pest Solutions.

Recipient: {name} ({website})

Rules:
- Acknowledge you'll stop emailing after this — politely.
- Remind them ONE benefit (BPCA-certified, West Midlands, 24/7 emergency, £50 deposit).
- Soft CTA: "If pests crop up later, the booking link below stays open."
- Sign off: "Best regards,\\nThe Weathers Pest Solutions Team\\n07462253896"
- UK English. No emojis.""",
)


WEATHERS = CampaignConfig(
    id="weathers",
    label="Weathers Pest Solutions (services → UK West Midlands businesses)",
    sender_signature="The Weathers Pest Solutions Team",
    website="https://weatherspestsolutions.co.uk",
    default_from_name_env="WEATHERS_OUTREACH_FROM_NAME",
    default_from_email_env="WEATHERS_OUTREACH_FROM_EMAIL",
    smtp_host_env="WEATHERS_SMTP_HOST",
    smtp_user_env="WEATHERS_SMTP_USER",
    smtp_password_env="WEATHERS_SMTP_PASSWORD",
    smtp_port_env="WEATHERS_SMTP_PORT",
    countries=("UK",),
    queries=_WEATHERS_QUERIES,
    subject_prompt=_WEATHERS_SUBJECT_PROMPT,
    body_prompt=_WEATHERS_BODY_PROMPT,
    fallback_subject="Quick pest control cover for your West Midlands site?",
    fallback_body_template=_WEATHERS_FALLBACK_BODY,
    opt_out_footer=(
        "You received this email because your business was found in a public West Midlands business directory "
        "and matched a sector that commonly requires routine pest control. "
        "To opt out, reply with <strong>STOP</strong> and we will never contact you again."
    ),
    cta_label="Book a pest control slot",
    # UTM-tagged so Umami attributes the visit; ?p= preserves prospect id for click tracking
    cta_url_template="https://weatherspestsolutions.co.uk/book?utm_source=outreach&utm_medium=email&utm_campaign=weathers&p={prospect_id}",
    accent_color="#2F855A",  # Weathers forest green (matches site)
    trust_badges=("BPCA Certified", "5-Star Rated", "24/7 Emergency", "£50 deposit off invoice"),
    sector_angles=_WEATHERS_SECTOR_ANGLES,
    follow_up_prompts=_WEATHERS_FOLLOWUP_PROMPTS,
    skip_url_keywords=_WEATHERS_SKIP_KEYWORDS,
)


# ── Registry ────────────────────────────────────────────────────────────────

CAMPAIGNS: dict[str, CampaignConfig] = {
    PESTTRACE.id: PESTTRACE,
    WEATHERS.id: WEATHERS,
}

DEFAULT_CAMPAIGN_ID = PESTTRACE.id


def get_campaign(campaign_id: str | None) -> CampaignConfig:
    """Look up a campaign by id, falling back to the default."""
    key = (campaign_id or DEFAULT_CAMPAIGN_ID).strip().lower()
    if key not in CAMPAIGNS:
        raise ValueError(
            f"Unknown outreach campaign '{campaign_id}'. Known campaigns: {sorted(CAMPAIGNS)}"
        )
    return CAMPAIGNS[key]


def render_fallback_body(campaign: CampaignConfig, name: str) -> str:
    """Render the campaign fallback body with the recipient name."""
    return textwrap.dedent(campaign.fallback_body_template).format(name=name).strip()


def sector_angle(campaign: CampaignConfig, sector: str | None) -> str:
    """Return the sector-specific copy hint for this campaign, falling back to ``generic``.

    Klaviyo step 5: define your audiences so you can personalise — this is what gets
    injected into the LLM prompt as ``{sector_angle}``.
    """
    key = (sector or "generic").strip().lower() or "generic"
    return campaign.sector_angles.get(key) or campaign.sector_angles.get("generic") or "general commercial pest control concern"
