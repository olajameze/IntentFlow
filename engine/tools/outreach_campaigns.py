"""Outreach campaign registry — per-brand prompts, scraper queries, and sender identity.

Each campaign is a fully self-contained config: who is sending, who they are targeting,
how to find the targets, and what to write to them.

Campaigns
─────────
  pesttrace
    Targets pest control businesses across Europe, India, UK, and Americas to sell PestTrace compliance SaaS.
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

PestTrace is a digital compliance and job-tracking platform for pest control operators worldwide.

The recipient is a pest control business owner or manager at: {name} ({website})
Recipient country code: {country}
Sector angle to incorporate: {sector_angle}

Return EXACTLY two lines:
Line 1 — variant A (a question style): focuses on ONE specific compliance or audit-readiness problem they may have now.
Line 2 — variant B (a statement style): names a concrete operational risk without a question mark.

Rules for BOTH:
- Max 60 characters each.
- Do NOT mention PestTrace in the subject — feel like a relevant industry question/observation.
- Do NOT mention UK unless country is UK.
- No clickbait. No exclamation marks. No emojis.
- Keep aligned to real pain points: paper logs failing audits, missing treatment documentation, qualification expiry risk, audit/food-safety programme pressure (BRCGS/SALSA/Red Tractor/BS EN 16636 for UK; EU biocide/PPP records for EU; FSSAI/state audits for IN), rodenticide stewardship evidence.

Examples:
  Are your pest control records audit-ready?
  Field documentation gaps are a growing compliance risk

Return ONLY two lines — no labels, no quotes, no explanation."""


_PESTTRACE_BODY_PROMPT = """You are writing a cold B2B email on behalf of PestTrace.com.

PestTrace is a compliance and job-tracking platform for pest control operators globally.
It replaces paper/spreadsheet records with digital evidence trails that are audit-ready.

Recipient business: {name}
Website: {website}
Recipient country code: {country}
Location: {location}
Industry: {industry}
Services: {services}
Sector angle to incorporate: {sector_angle}
Relevant weakness to reference naturally: {weakness}
Business opportunity to mention: {opportunity}

Write a professional B2B outreach email. Rules:
- Tone: calm authority. Never needy, never begging. Read like advice from a peer, not a sales pitch.
- Do NOT mention the United Kingdom or "UK" unless country is UK.
- Mandatory structure: short opener (1 sentence) -> specific compliance/paperwork problem (2-3 sentences) -> how PestTrace solves that exact issue (2-3 sentences) -> soft CTA (visit pesttrace.com or reply)
- Problem must be concrete and credible for the recipient's market. Use one angle such as:
  - audit pressure under BRCGS/SALSA/Red Tractor/BS EN 16636 (UK/IE only),
  - EU biocide/PPP and machine-readable electronic record expectations (DE/FR/ES/IT/NL),
  - FSSAI or customer audit documentation gaps (IN),
  - BPCA-style assessment documentation risk (UK),
  - rodenticide stewardship record-keeping pressure,
  - qualification/certificate expiry being missed,
  - office backlog from transcribing field paperwork,
  - lost/damaged paper logs.
- Solution section: digital logbook, photos/e-signatures/follow-ups, audit-ready reports, expiry tracking, dashboard visibility — workflows built for pest control teams, not generic field service.
- Do NOT mention pricing, discounts, or urgency pressure.
- Do NOT use phrases like "I hope this email finds you well", "just reaching out", or "I wanted to touch base".
- Max 180 words total body text.
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


_PESTTRACE_SNAPSHOT_SUBJECT_PROMPT = """You are writing TWO cold B2B email subject line variants for PestTrace.com.

The recipient has a personalized audit-readiness snapshot ready to view.
Business: {name} ({website})
Country: {country}

Return EXACTLY two lines:
Line 1 — variant A (question): "Audit readiness snapshot for {name}?" style — max 60 chars.
Line 2 — variant B (statement): "{name} — compliance gaps worth a look" style — max 60 chars.

Rules:
- Do NOT mention PestTrace in the subject.
- Do NOT mention UK unless country is UK.
- No exclamation marks. No emojis.

Return ONLY two lines — no labels, no quotes."""


_PESTTRACE_SNAPSHOT_BODY_PROMPT = """You are writing a cold B2B email on behalf of PestTrace.com.

We prepared a short audit-readiness snapshot for the recipient — no signup needed to view it.

Recipient: {name}
Website: {website}
Country: {country}
Location: {location}
Sector angle: {sector_angle}
Weakness to reference: {weakness}

Write the email body. Rules:
- Tone: calm authority, peer advice — not salesy.
- Do NOT mention UK unless country is UK.
- Structure:
  1. One sentence: we put together a snapshot for {name} based on their website and market.
  2. Two sentences: what it covers (documentation visibility, qualification tracking, market framework expectations).
  3. One sentence: if gaps look familiar, PestTrace helps with digital treatment logs and audit-ready records.
  4. Sign-off: Best regards,\\nThe PestTrace Team
- Max 140 words.
- Do NOT include URLs in the body — the snapshot and trial buttons are added separately.
- Return ONLY the email body text."""


_PESTTRACE_SNAPSHOT_FALLBACK_BODY = """\
We put together a short audit-readiness snapshot for {name} based on your website and market — no signup needed to view it.

It covers documentation visibility, qualification tracking, and framework expectations for pest control operators in your region.

If the gaps look familiar, PestTrace gives teams a digital logbook for treatments, photos, signatures, and audit-ready reports.

Best regards,
The PestTrace Team"""

PESTTRACE_SNAPSHOT_SUBJECT_PROMPT = _PESTTRACE_SNAPSHOT_SUBJECT_PROMPT
PESTTRACE_SNAPSHOT_BODY_PROMPT = _PESTTRACE_SNAPSHOT_BODY_PROMPT
PESTTRACE_SNAPSHOT_FALLBACK_BODY = _PESTTRACE_SNAPSHOT_FALLBACK_BODY
PESTTRACE_SNAPSHOT_FALLBACK_SUBJECT_A = "Audit readiness snapshot for {name}?"
PESTTRACE_SNAPSHOT_FALLBACK_SUBJECT_B = "{name} — compliance gaps worth a look"


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
    "DE": [
        ("Schädlingsbekämpfung Unternehmen Berlin",     "Berlin"),
        ("Kammerjäger München Firma",                   "Munich"),
        ("Schädlingsbekämpfung Hamburg Unternehmen",    "Hamburg"),
        ("Kammerjäger Köln",                            "Cologne"),
        ("Schädlingsbekämpfung Frankfurt",              "Frankfurt"),
    ],
    "FR": [
        ("entreprise dératisation Paris",               "Paris"),
        ("entreprise désinsectisation Lyon",            "Lyon"),
        ("lutte antiparasitaire Marseille entreprise",    "Marseille"),
        ("dératisation Toulouse professionnel",           "Toulouse"),
    ],
    "ES": [
        ("empresa control de plagas Madrid",              "Madrid"),
        ("empresa control de plagas Barcelona",           "Barcelona"),
        ("empresa control de plagas Valencia",            "Valencia"),
        ("empresa fumigación Sevilla",                    "Seville"),
    ],
    "IT": [
        ("azienda disinfestazione Milano",                "Milan"),
        ("azienda disinfestazione Roma",                  "Rome"),
        ("azienda disinfestazione Torino",                "Turin"),
        ("disinfestazione Napoli azienda",                "Naples"),
    ],
    "NL": [
        ("ongediertebestrijding bedrijf Amsterdam",       "Amsterdam"),
        ("ongediertebestrijding bedrijf Rotterdam",       "Rotterdam"),
        ("ongediertebestrijding bedrijf Utrecht",         "Utrecht"),
    ],
    "IE": [
        ("pest control company Dublin site:.ie",          "Dublin"),
        ("pest control company Cork site:.ie",          "Cork"),
        ("pest control company Galway site:.ie",          "Galway"),
    ],
    "IN": [
        ("pest control company Mumbai contact email",     "Mumbai"),
        ("pest control company Delhi NCR pest control",   "Delhi"),
        ("pest control company Bangalore",                "Bangalore"),
        ("pest control company Hyderabad",                "Hyderabad"),
        ("pest control company Chennai",                  "Chennai"),
        ("pest control company Pune pest control",         "Pune"),
        ("pest control company Kolkata",                  "Kolkata"),
    ],
}


_PESTTRACE_FOLLOWUP_PROMPTS = (
    # Touch 1 (Day 3) — value follow-up
    """You are writing a SHORT follow-up email (max 90 words) from PestTrace.com to a pest control business that didn't reply to your first email three days ago.

Recipient: {name} ({website})
Recipient country code: {country}
Location: {location}
Industry: {industry}
Services: {services}
Sector angle: {sector_angle}
Weakness to reference: {weakness}
Opportunity: {opportunity}

Rules:
- Do NOT mention UK unless country is UK.
- Reference (gently) that you wrote a few days ago — no apology, no guilt-tripping.
- Open with a different angle from the first email — pick ONE: lost paperwork story, an upcoming audit risk, qualification expiry, or electronic record expectations for their market.
- Frame PestTrace as the obvious fix in one sentence.
- End with a single CTA: "Worth a 10-minute look at pesttrace.com?"
- Sign off: "Best regards,\\nThe PestTrace Team\\nhttps://pesttrace.com"
- No clickbait. No emojis. No quotes around the email.""",
    # Touch 2 (Day 7) — case study angle
    """You are writing a case-study style follow-up (max 90 words) from PestTrace.com.

Recipient: {name} ({website})
Location: {location}
Industry: {industry}
Services: {services}
Sector angle: {sector_angle}

Rules:
- Do NOT mention UK unless country is UK.
- Share a brief, credible outcome story (no invented client names): a pest control team cut audit prep time using digital treatment logs.
- Tie the story to their sector ({industry}) and services ({services}).
- One soft CTA to pesttrace.com.
- Sign off: "Best regards,\\nThe PestTrace Team"
- No emojis. Max 90 words.""",
    # Touch 3 (Day 14) — final follow-up
    """You are writing a final, brief 'breakup' follow-up email (max 60 words) from PestTrace.com.

Recipient: {name} ({website})
Recipient country code: {country}
Industry: {industry}

Rules:
- Do NOT mention UK unless country is UK.
- Acknowledge silence is fine — say you'll stop emailing after this.
- Reaffirm in one sentence what PestTrace would do for them.
- Single CTA: "If you ever want to come back to this, the door's open at pesttrace.com."
- Sign off: "Best regards,\\nThe PestTrace Team"
- No emojis. Return only the email body.""",
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
    countries=("DE", "FR", "ES", "IT", "NL", "IN", "IE", "UK", "US", "CA", "AU"),
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
    trust_badges=("Audit-ready records", "EU & global compliance", "7-day free trial"),
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
Location: {location}
Industry: {industry}
Their services: {services}
Sector angle to incorporate (use this as the opening hook): {sector_angle}
Relevant weakness: {weakness}
Opportunity: {opportunity}

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
    # Touch 1 (Day 3) — value follow-up
    """You are writing a SHORT follow-up (max 90 words) from Weathers Pest Solutions to a UK West Midlands business that didn't reply to your first email three days ago.

Recipient: {name} ({website})
Location: {location}
Industry: {industry}
Services: {services}
Sector angle: {sector_angle}
Weakness: {weakness}
Opportunity: {opportunity}

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
    # Touch 2 (Day 7) — case study
    """You are writing a case-study style follow-up (max 90 words) from Weathers Pest Solutions.

Recipient: {name} ({website})
Location: {location}
Industry: {industry}
Services: {services}

Rules:
- Brief credible outcome: a West Midlands {industry} site resolved a recurring pest issue with documented treatment and guarantee.
- Reference their services context ({services}) without inventing client names.
- One benefit: BPCA-certified, 24/7 emergency, £50 deposit off invoice.
- Soft CTA to book via the button below (do not paste URLs).
- Sign off: "Best regards,\\nThe Weathers Pest Solutions Team\\n07462253896"
- UK English. Max 90 words.""",
    # Touch 3 (Day 14) — final follow-up
    """You are writing the FINAL follow-up (max 60 words) from Weathers Pest Solutions.

Recipient: {name} ({website})
Industry: {industry}

Rules:
- Acknowledge you'll stop emailing after this — politely.
- Remind them ONE benefit (BPCA-certified, West Midlands, 24/7 emergency, £50 deposit).
- Soft CTA: "If pests crop up later, the booking link below stays open."
- Sign off: "Best regards,\\nThe Weathers Pest Solutions Team\\n07462253896"
- UK English. No emojis.""",
)


_WEATHERS_SNAPSHOT_SUBJECT_PROMPT = """You are writing TWO cold B2B email subject line variants for Weathers Pest Solutions.

The recipient has a seasonal pest risk brief ready to view.
Business: {name} ({website})
Location: {location}

Return EXACTLY two lines:
Line 1 — variant A (question): seasonal pest risk brief for {name}? — max 60 chars.
Line 2 — variant B (statement): "{name} — seasonal pest risks worth a look" style — max 60 chars.

Rules:
- Do NOT mention Weathers in the subject.
- UK English. No exclamation marks. No emojis.

Return ONLY two lines — no labels, no quotes."""


_WEATHERS_SNAPSHOT_BODY_PROMPT = """You are writing a cold B2B email on behalf of Weathers Pest Solutions (West Midlands pest control).

We prepared a short seasonal pest risk brief for the recipient — no signup needed to view it.

Recipient: {name}
Website: {website}
Location: {location}
Industry: {industry}
Sector angle: {sector_angle}

Write the email body. Rules:
- Tone: practical and discreet — premises managers appreciate calm, factual advice.
- UK English only.
- Structure:
  1. One sentence: we put together a seasonal risk brief for {name} based on their sector and premises type.
  2. Two sentences: what it covers (rodent/insect pressure this season, audit or inspection context, prevention steps).
  3. One sentence: if the risks look familiar, Weathers offers BPCA-certified treatments and 24/7 emergency cover in the West Midlands.
  4. Sign-off: Best regards,\\nThe Weathers Pest Solutions Team
- Max 140 words.
- Do NOT include URLs in the body — the brief and booking buttons are added separately.
- Return ONLY the email body text."""


_WEATHERS_SNAPSHOT_FALLBACK_BODY = """\
We put together a short seasonal pest risk brief for {name} based on your sector and premises type — no signup needed to view it.

It covers rodent and insect pressure for this time of year, inspection context, and practical prevention steps for West Midlands commercial sites.

If the risks look familiar, Weathers Pest Solutions offers BPCA-certified treatments, documented visits, and 24/7 emergency cover.

Best regards,
The Weathers Pest Solutions Team"""

WEATHERS_SNAPSHOT_SUBJECT_PROMPT = _WEATHERS_SNAPSHOT_SUBJECT_PROMPT
WEATHERS_SNAPSHOT_BODY_PROMPT = _WEATHERS_SNAPSHOT_BODY_PROMPT
WEATHERS_SNAPSHOT_FALLBACK_BODY = _WEATHERS_SNAPSHOT_FALLBACK_BODY
WEATHERS_SNAPSHOT_FALLBACK_SUBJECT_A = "Seasonal pest risk brief for {name}?"
WEATHERS_SNAPSHOT_FALLBACK_SUBJECT_B = "{name} — pest risks worth a look"


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


# ── JGDevs (web agency → UK small businesses) ───────────────────────────────
#
# Targets sole traders and small businesses that need a clearer online presence:
# professional websites, local SEO, and simple booking/enquiry flows.

_JGDEVS_SUBJECT_PROMPT = """You are writing TWO cold B2B email subject line variants for JGDevs (https://jgdev.co.uk) — a web agency for European small businesses.

The recipient is a small business owner or manager at: {name} ({website})
Location: {location}, {country}
Sector angle: {sector_angle}

Return EXACTLY two lines:
Line 1 — variant A (question style): one clear online-presence or enquiry problem as a question.
Line 2 — variant B (statement style): a plain statement about lost enquiries, visibility, or bookings — no question mark.

Rules for BOTH:
- Max 60 characters each.
- Do NOT mention JGDevs in the subject.
- Clear international English. No exclamation marks. No emojis.
- Do NOT mention UK unless country is UK or IE.
- Focus on: being invisible on Google, website not mobile-friendly, no online booking, missed enquiries.

Examples:
  Are customers finding you on Google?
  Your site may be costing you enquiries
  Still taking every booking by phone?

Return ONLY two lines — no labels, no quotes."""


_JGDEVS_BODY_PROMPT = """You are writing a cold B2B email on behalf of JGDevs (https://jgdev.co.uk).

JGDevs helps European small businesses with:
- Professional websites that explain what you do in plain language
- Local SEO so you show up when people search in your area
- Online booking and enquiry forms so customers can reach you 24/7
- Fast, mobile-friendly pages (most customers browse on a phone)

Recipient: {name}
Website: {website}
Country: {country}
Location: {location}
Industry: {industry}
Services: {services}
Sector angle: {sector_angle}
Weakness to reference naturally: {weakness}
Opportunity: {opportunity}

Write a professional, easy-to-understand email. Rules:
- Tone: helpful and practical — like advice from someone who builds websites for trades and local shops. Never pushy or jargon-heavy.
- Clear international English. Do NOT mention UK unless country is UK or IE.
- Mandatory structure (short paragraphs):
  1) One-sentence hook using the sector angle — a problem they likely recognise (hard to find online, site looks dated, no way to book outside office hours).
  2) Two sentences on what that costs them (competitors get the click, phone tag, enquiries lost after hours).
  3) Two sentences on how JGDevs helps — website + SEO + booking/enquiry setup in plain terms (no tech stack lists).
  4) Soft CTA: invite them to tap the button below to see examples and start a conversation — do NOT paste URLs in the body.
- Max 160 words.
- Do NOT invent client names, awards, or exact prices.
- Do NOT use "I hope this finds you well", "just reaching out", or "touch base".
- Sign off EXACTLY:
  "Best regards,\\nThe JGDevs Team"
- Return ONLY the email body — no subject, no meta-commentary."""


_JGDEVS_FALLBACK_BODY = """\
Many small businesses like {name} still lose enquiries because their website is hard to find on Google, awkward on mobile, or has no simple way to book or request a quote online.

When customers compare options, they usually pick the business that looks clear, trustworthy, and easy to contact — often in the first minute on their phone.

JGDevs builds professional websites for European small businesses with local SEO and booking or enquiry flows built in, so you can capture leads even when you are on a job.

If improving your online presence is on your list this quarter, the link below shows how we work and what a better site could do for you.

Best regards,
The JGDevs Team"""


_JGDEVS_QUERIES: dict[str, list[SearchQuery]] = {
    "UK": [
        ("plumber Birmingham site:.co.uk", "Birmingham"),
        ("electrician Manchester site:.co.uk", "Manchester"),
        ("roofer Leeds site:.co.uk", "Leeds"),
        ("builder Bristol site:.co.uk", "Bristol"),
        ("locksmith Liverpool site:.co.uk", "Liverpool"),
        ("hair salon Sheffield site:.co.uk", "Sheffield"),
        ("barber Nottingham site:.co.uk", "Nottingham"),
        ("beauty salon Cardiff site:.co.uk", "Cardiff"),
        ("accountant small business Birmingham site:.co.uk", "Birmingham"),
        ("dental practice Manchester site:.co.uk", "Manchester"),
        ("personal trainer gym Leeds site:.co.uk", "Leeds"),
        ("florist Bristol site:.co.uk", "Bristol"),
        ("dog groomer Newcastle site:.co.uk", "Newcastle"),
        ("cafe independent Glasgow site:.co.uk", "Glasgow"),
        ("restaurant Edinburgh site:.co.uk", "Edinburgh"),
        ("solicitor small firm Birmingham site:.co.uk", "Birmingham"),
        ("cleaning company Manchester site:.co.uk", "Manchester"),
        ("landscaper Leeds site:.co.uk", "Leeds"),
    ],
    "IE": [
        ("plumber Dublin site:.ie", "Dublin"),
        ("electrician Cork site:.ie", "Cork"),
        ("hair salon Galway site:.ie", "Galway"),
        ("accountant Dublin site:.ie", "Dublin"),
        ("restaurant Limerick site:.ie", "Limerick"),
        ("barber Belfast site:.co.uk", "Belfast"),
    ],
    "DE": [
        ("klempner Berlin site:.de", "Berlin"),
        ("elektriker München site:.de", "Munich"),
        ("friseur Hamburg site:.de", "Hamburg"),
        ("bäckerei Köln site:.de", "Cologne"),
        ("restaurant Frankfurt site:.de", "Frankfurt"),
        ("steuerberater Stuttgart site:.de", "Stuttgart"),
        ("zahnarzt Düsseldorf site:.de", "Düsseldorf"),
    ],
    "FR": [
        ("plombier Paris site:.fr", "Paris"),
        ("coiffeur Lyon site:.fr", "Lyon"),
        ("restaurant Marseille site:.fr", "Marseille"),
        ("boulangerie Bordeaux site:.fr", "Bordeaux"),
        ("comptable Toulouse site:.fr", "Toulouse"),
        ("salon de beauté Nice site:.fr", "Nice"),
    ],
    "ES": [
        ("fontanero Madrid site:.es", "Madrid"),
        ("electricista Barcelona site:.es", "Barcelona"),
        ("peluquería Valencia site:.es", "Valencia"),
        ("restaurante Sevilla site:.es", "Seville"),
        ("panadería Málaga site:.es", "Málaga"),
    ],
    "IT": [
        ("idraulico Roma site:.it", "Rome"),
        ("elettricista Milano site:.it", "Milan"),
        ("parrucchiere Torino site:.it", "Turin"),
        ("ristorante Napoli site:.it", "Naples"),
        ("pasticceria Bologna site:.it", "Bologna"),
    ],
    "NL": [
        ("loodgieter Amsterdam site:.nl", "Amsterdam"),
        ("kapper Rotterdam site:.nl", "Rotterdam"),
        ("restaurant Utrecht site:.nl", "Utrecht"),
        ("bakkerij Den Haag site:.nl", "The Hague"),
        ("accountant Eindhoven site:.nl", "Eindhoven"),
    ],
    "BE": [
        ("plombier Bruxelles site:.be", "Brussels"),
        ("coiffeur Antwerpen site:.be", "Antwerp"),
        ("restaurant Gent site:.be", "Ghent"),
        ("boulangerie Liège site:.be", "Liège"),
    ],
    "AT": [
        ("installateur Wien site:.at", "Vienna"),
        ("friseur Graz site:.at", "Graz"),
        ("restaurant Salzburg site:.at", "Salzburg"),
    ],
    "PT": [
        ("canalizador Lisboa site:.pt", "Lisbon"),
        ("cabeleireiro Porto site:.pt", "Porto"),
        ("restaurante Braga site:.pt", "Braga"),
    ],
    "PL": [
        ("hydraulik Warszawa site:.pl", "Warsaw"),
        ("fryzjer Kraków site:.pl", "Krakow"),
        ("restauracja Wrocław site:.pl", "Wroclaw"),
        ("piekarz Gdańsk site:.pl", "Gdansk"),
    ],
    "SE": [
        ("rörmokare Stockholm site:.se", "Stockholm"),
        ("frisör Göteborg site:.se", "Gothenburg"),
        ("restaurang Malmö site:.se", "Malmö"),
    ],
    "DK": [
        ("blikkenslager København site:.dk", "Copenhagen"),
        ("frisør Aarhus site:.dk", "Aarhus"),
        ("restaurant Odense site:.dk", "Odense"),
    ],
}


_JGDEVS_SKIP_KEYWORDS: tuple[str, ...] = (
    "web-design", "webdesign", "digital-agency", "marketing-agency",
    "seo-agency", "wix.com", "squarespace.com", "wordpress.com",
    "freelancer.com", "fiverr", "upwork",
)


_JGDEVS_SECTOR_ANGLES: dict[str, str] = {
    "tradesperson": "local customers searching for a tradesperson but choosing a competitor with a clearer website and online contact form",
    "salon": "missed bookings because clients cannot book or check services easily on their phone",
    "local_shop": "high street footfall lost to competitors who rank higher on Google and show opening hours clearly online",
    "professional": "credibility gap — prospects expect a polished, trustworthy site before they call",
    "restaurant": "empty tables when people check the menu online and go elsewhere because the site is slow or confusing on mobile",
    "gym": "members comparing gyms online and picking the one with clear pricing and easy signup",
    "pet_groomer": "appointment calls stacking up with no online booking for busy pet owners",
    "pub": "event and table enquiries going to venues that are easier to find and contact online",
    "bakery": "wholesale and walk-in customers choosing suppliers with clearer online menus and contact paths",
    "generic": "enquiries lost because the business is hard to find, hard to trust, or impossible to contact outside office hours",
}


_JGDEVS_FOLLOWUP_PROMPTS = (
    """You are writing a SHORT follow-up (max 90 words) from JGDevs to a small business that did not reply three days ago.

Recipient: {name} ({website})
Location: {location}
Industry: {industry}
Sector angle: {sector_angle}

Rules:
- Mention you wrote earlier in one clause — no apology.
- One new angle: mobile-friendly site, local Google visibility, or online booking/enquiries.
- Plain English — no jargon.
- Soft CTA: button below to see how JGDevs helps small businesses like theirs.
- Sign off: "Best regards,\\nThe JGDevs Team"
- Max 90 words.""",
    """You are writing a follow-up (max 90 words) from JGDevs with a practical tip.

Recipient: {name} ({website})
Industry: {industry}

Rules:
- Share one credible, general insight: most customers research online before calling a local business.
- Tie it to their sector without inventing client names.
- Mention JGDevs builds sites with SEO and booking/enquiry flows.
- Soft CTA via button below.
- Sign off: "Best regards,\\nThe JGDevs Team"
- Max 90 words.""",
    """You are writing the FINAL follow-up (max 60 words) from JGDevs.

Recipient: {name} ({website})

Rules:
- Say you'll stop emailing after this — politely.
- One sentence: JGDevs helps small businesses with websites, SEO, and online booking.
- Soft CTA: door stays open at jgdev.co.uk via the button below.
- Sign off: "Best regards,\\nThe JGDevs Team"
- No emojis.""",
)


_JGDEVS_SNAPSHOT_SUBJECT_PROMPT = """You are writing TWO cold B2B email subject line variants for JGDevs.

The recipient has a site score snapshot ready to view.
Business: {name} ({website})
Country: {country}

Return EXACTLY two lines:
Line 1 — variant A (question): site score snapshot for {name}? — max 60 chars.
Line 2 — variant B (statement): "{name} — online gaps worth a look" style — max 60 chars.

Rules:
- Do NOT mention JGDevs in the subject.
- Do NOT mention UK unless country is UK or IE.
- No exclamation marks. No emojis.

Return ONLY two lines — no labels, no quotes."""


_JGDEVS_SNAPSHOT_BODY_PROMPT = """You are writing a cold B2B email on behalf of JGDevs (https://jgdev.co.uk).

We prepared a short site score snapshot for the recipient — no signup needed to view it.

Recipient: {name}
Website: {website}
Country: {country}
Location: {location}
Sector angle: {sector_angle}
Weakness to reference: {weakness}

Write the email body. Rules:
- Tone: helpful and practical — not salesy.
- Do NOT mention UK unless country is UK or IE.
- Structure:
  1. One sentence: we put together a site score snapshot for {name} based on their website.
  2. Two sentences: what it covers (local SEO visibility, mobile experience, booking/enquiry flow, trust signals).
  3. One sentence: if the gaps look familiar, JGDevs builds mobile-friendly sites with local SEO and enquiry flows.
  4. Sign-off: Best regards,\\nThe JGDevs Team
- Max 140 words.
- Do NOT include URLs in the body — the snapshot and examples buttons are added separately.
- Return ONLY the email body text."""


_JGDEVS_SNAPSHOT_FALLBACK_BODY = """\
We put together a short site score snapshot for {name} based on your website — no signup needed to view it.

It covers local SEO visibility, mobile experience, booking and enquiry flows, and trust signals that affect how customers choose a business online.

If the gaps look familiar, JGDevs builds professional websites for European small businesses with local SEO and enquiry flows built in.

Best regards,
The JGDevs Team"""

JGDEVS_SNAPSHOT_SUBJECT_PROMPT = _JGDEVS_SNAPSHOT_SUBJECT_PROMPT
JGDEVS_SNAPSHOT_BODY_PROMPT = _JGDEVS_SNAPSHOT_BODY_PROMPT
JGDEVS_SNAPSHOT_FALLBACK_BODY = _JGDEVS_SNAPSHOT_FALLBACK_BODY
JGDEVS_SNAPSHOT_FALLBACK_SUBJECT_A = "Site score snapshot for {name}?"
JGDEVS_SNAPSHOT_FALLBACK_SUBJECT_B = "{name} — online gaps worth a look"


JGDEVS = CampaignConfig(
    id="jgdevs",
    label="JGDevs (websites & SEO → UK & European small businesses)",
    sender_signature="The JGDevs Team",
    website="https://jgdev.co.uk",
    default_from_name_env="JGDEVS_OUTREACH_FROM_NAME",
    default_from_email_env="JGDEVS_OUTREACH_FROM_EMAIL",
    smtp_host_env="JGDEVS_SMTP_HOST",
    smtp_user_env="JGDEVS_SMTP_USER",
    smtp_password_env="JGDEVS_SMTP_PASSWORD",
    smtp_port_env="JGDEVS_SMTP_PORT",
    countries=("UK", "IE", "DE", "FR", "ES", "IT", "NL", "BE", "AT", "PT", "PL", "SE", "DK"),
    queries=_JGDEVS_QUERIES,
    subject_prompt=_JGDEVS_SUBJECT_PROMPT,
    body_prompt=_JGDEVS_BODY_PROMPT,
    fallback_subject="Are customers finding you online?",
    fallback_body_template=_JGDEVS_FALLBACK_BODY,
    opt_out_footer=(
        "You received this email because your business was found in a public directory. "
        "To opt out, reply with <strong>STOP</strong> and we will never contact you again."
    ),
    cta_label="See how we can help",
    cta_url_template="https://jgdev.co.uk/?utm_source=outreach&utm_medium=email&utm_campaign=jgdevs&p={prospect_id}",
    accent_color="#2563EB",
    trust_badges=("UK & EU small business sites", "Websites that convert", "SEO & booking systems"),
    sector_angles=_JGDEVS_SECTOR_ANGLES,
    follow_up_prompts=_JGDEVS_FOLLOWUP_PROMPTS,
    skip_url_keywords=_JGDEVS_SKIP_KEYWORDS,
)


# ── Breazy Productions ───────────────────────────────────────────────────────
# UK cinematic videography → wedding venues, events, cafes, musicians, brands.
# Website: https://jordans-e-website.vercel.app

_BREAZY_SUBJECT_PROMPT = """You are writing TWO cold B2B email subject line variants for Breazy Productions — UK cinematic videography (weddings, commercial, music videos).

The recipient is a business owner or manager at: {name} ({website})
Location: {location}, {country}
Sector angle: {sector_angle}

Return EXACTLY two lines:
Line 1 — variant A (question style): one clear video/marketing visibility problem as a question.
Line 2 — variant B (statement style): a plain statement about missed bookings, weak brand film, or couples not feeling the venue online — no question mark.

Rules for BOTH:
- Max 60 characters each.
- Do NOT mention Breazy Productions in the subject.
- UK English. No exclamation marks. No emojis.
- Focus on: no recent promo film, phone footage vs cinematic quality, couples choosing venues they can visualise online, artists needing a music video.

Examples:
  Does your venue show well on film?
  A stronger brand film could fill more dates
  Still relying on phone clips for social?

Return ONLY two lines — no labels, no quotes."""


_BREAZY_BODY_PROMPT = """You are writing a cold B2B email on behalf of Breazy Productions (https://jordans-e-website.vercel.app).

Breazy Productions is a UK cinematic videography studio offering:
- Wedding videography — emotional, cinematic coverage of the day
- Commercial and promotional films — brand storytelling for cafes, shops, and local businesses
- Documentaries — compelling real stories told beautifully
- Music videos — creative production for artists and bands

Recipient: {name}
Website: {website}
Country: {country}
Location: {location}
Industry: {industry}
Services: {services}
Sector angle: {sector_angle}
Weakness to reference naturally: {weakness}
Opportunity: {opportunity}

Write a professional, warm email. Rules:
- Tone: cinematic and approachable — like a filmmaker who understands business goals, not a hard sell.
- UK English only (this campaign targets UK businesses).
- Mandatory structure (short paragraphs):
  1) One-sentence hook using the sector angle — a problem they likely recognise (venue hard to visualise online, no recent promo film, social clips do not match the brand).
  2) Two sentences on what that costs them (couples or customers choose competitors with stronger video, missed bookings, brand feels less premium).
  3) Two sentences on how Breazy helps — wedding, commercial, event, or music video work in plain terms; you may reference portfolio style (Caféphilia promo, event coverage, FK3 Stallion promo) as examples of cinematic work — do not invent client testimonials.
  4) Soft CTA: invite them to tap the button below to view work and book a consultation — do NOT paste URLs in the body.
- Max 160 words.
- Do NOT invent prices, awards, or client names beyond the portfolio examples above.
- Do NOT use "I hope this finds you well", "just reaching out", or "touch base".
- Sign off EXACTLY:
  "Best regards,\\nThe Breazy Productions Team"
- Return ONLY the email body — no subject, no meta-commentary."""


_BREAZY_FALLBACK_BODY = """\
Many businesses like {name} still lose enquiries because their story is hard to feel online — phone clips and dated footage rarely match the quality of the experience you deliver in person.

When couples, customers, or fans compare options, they often choose whoever looks most cinematic and trustworthy in the first minute of video.

Breazy Productions creates wedding films, commercial promos, documentaries, and music videos with a cinematic approach — the kind of work shown in our Caféphilia and event portfolio.

If professional video is on your list this quarter, the link below shows our work and lets you book a no-obligation consultation.

Best regards,
The Breazy Productions Team"""


_BREAZY_QUERIES: dict[str, list[SearchQuery]] = {
    "UK": [
        ("wedding venue Birmingham site:.co.uk", "Birmingham"),
        ("wedding planner Manchester site:.co.uk", "Manchester"),
        ("independent cafe London site:.co.uk", "London"),
        ("cocktail bar Bristol site:.co.uk", "Bristol"),
        ("music artist band Leeds site:.co.uk", "Leeds"),
        ("event planner Edinburgh site:.co.uk", "Edinburgh"),
        ("boutique shop Glasgow site:.co.uk", "Glasgow"),
        ("independent brewery Nottingham site:.co.uk", "Nottingham"),
        ("wedding venue Cardiff site:.co.uk", "Cardiff"),
        ("restaurant Liverpool site:.co.uk", "Liverpool"),
        ("recording artist Sheffield site:.co.uk", "Sheffield"),
        ("hotel wedding venue Brighton site:.co.uk", "Brighton"),
        ("independent roastery Cambridge site:.co.uk", "Cambridge"),
        ("beauty salon Newcastle site:.co.uk", "Newcastle"),
        ("event company Leicester site:.co.uk", "Leicester"),
    ],
}


_BREAZY_SKIP_KEYWORDS: tuple[str, ...] = (
    "videography", "video-production", "film-production", "wedding-videographer",
    "production-company", "filmmaker", "video-agency", "media-production",
)


_BREAZY_SECTOR_ANGLES: dict[str, str] = {
    "restaurant": "promotional films that capture atmosphere and artisan quality — like cinematic café brand storytelling",
    "pub": "event and venue films that show the atmosphere couples and groups want before they book",
    "bakery": "short brand films that make wholesale and walk-in customers feel the craft behind the product",
    "hotel": "wedding and event showcase films that help couples visualise getting married at your venue",
    "salon": "cinematic brand films for social and website that build trust before the first appointment",
    "local_shop": "commercial promo video that explains your brand in seconds instead of static posts",
    "professional": "polished video credibility before prospects call — beyond phone footage or stock clips",
    "generic": "milestone events and brand visibility — cinematic coverage instead of phone footage",
}


_BREAZY_FOLLOWUP_PROMPTS = (
    """You are writing a SHORT follow-up (max 90 words) from Breazy Productions to a UK business that did not reply three days ago.

Recipient: {name} ({website})
Location: {location}
Industry: {industry}
Sector angle: {sector_angle}

Rules:
- Mention you wrote earlier in one clause — no apology.
- One new angle: wedding film, commercial promo, event coverage, or music video — tied to their sector.
- UK English — warm and cinematic, not pushy.
- Soft CTA: button below to view portfolio and book a consultation.
- Sign off: "Best regards,\\nThe Breazy Productions Team"
- Max 90 words.""",
    """You are writing a follow-up (max 90 words) from Breazy Productions with a practical insight.

Recipient: {name} ({website})
Industry: {industry}

Rules:
- Share one credible insight: most customers and couples research visually before they enquire — strong video wins that moment.
- Tie it to their sector without inventing client names.
- Mention Breazy creates wedding, commercial, documentary, and music video work.
- Soft CTA via button below.
- Sign off: "Best regards,\\nThe Breazy Productions Team"
- Max 90 words.""",
    """You are writing the FINAL follow-up (max 60 words) from Breazy Productions.

Recipient: {name} ({website})

Rules:
- Say you'll stop emailing after this — politely.
- One sentence: Breazy Productions creates cinematic wedding, commercial, and music video work in the UK.
- Soft CTA: portfolio and booking stay open via the button below.
- Sign off: "Best regards,\\nThe Breazy Productions Team"
- No emojis.""",
)


BREAZY = CampaignConfig(
    id="breazy",
    label="Breazy Productions (cinematic videography → UK venues, brands, artists)",
    sender_signature="The Breazy Productions Team",
    website="https://jordans-e-website.vercel.app",
    default_from_name_env="BREAZY_OUTREACH_FROM_NAME",
    default_from_email_env="BREAZY_OUTREACH_FROM_EMAIL",
    smtp_host_env="BREAZY_SMTP_HOST",
    smtp_user_env="BREAZY_SMTP_USER",
    smtp_password_env="BREAZY_SMTP_PASSWORD",
    smtp_port_env="BREAZY_SMTP_PORT",
    countries=("UK",),
    queries=_BREAZY_QUERIES,
    subject_prompt=_BREAZY_SUBJECT_PROMPT,
    body_prompt=_BREAZY_BODY_PROMPT,
    fallback_subject="Does your brand show well on film?",
    fallback_body_template=_BREAZY_FALLBACK_BODY,
    opt_out_footer=(
        "You received this email because your business was found in a public directory. "
        "To opt out, reply with <strong>STOP</strong> and we will never contact you again."
    ),
    cta_label="Book a videography consultation",
    cta_url_template="https://jordans-e-website.vercel.app/book?utm_source=outreach&utm_medium=email&utm_campaign=breazy&p={prospect_id}",
    accent_color="#C9A227",
    trust_badges=("Cinematic storytelling", "Wedding & commercial", "UK videography", "Featured portfolio work"),
    sector_angles=_BREAZY_SECTOR_ANGLES,
    follow_up_prompts=_BREAZY_FOLLOWUP_PROMPTS,
    skip_url_keywords=_BREAZY_SKIP_KEYWORDS,
)


# ── Registry ────────────────────────────────────────────────────────────────

CAMPAIGNS: dict[str, CampaignConfig] = {
    PESTTRACE.id: PESTTRACE,
    WEATHERS.id: WEATHERS,
    JGDEVS.id: JGDEVS,
    BREAZY.id: BREAZY,
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
