"""Shared marketing voice for pending-post drafts — used by `generate_personalised_copy`."""

from __future__ import annotations

# Ethical B2B framing: “laws of power” read as positioning discipline, not manipulation or deceit.
GLOBAL_COPY_DOCTRINE = """
Global voice (all brands):
- Be unique to this business: use only facts implied by the JSON context (name, audience, industry, goals, website). Do not invent awards, clients, or metrics.
- Problem → insight → solution. Confident operator tone: never needy, pleading, desperate, or guilt-tripping.
- Ethical influence (positioning discipline): lead with authority and proof; show mastery through clarity; let outcomes speak; never argue down competitors by name; no false scarcity or fear-mongering.
- UK English. No video/TikTok. Compliant with professional networks (no medical/legal guarantees unless context supports it).
""".strip()

PESTTRACE_B2B_FOCUS = """
PestTrace-specific (only when this block is included):
- Sole focus: compliance, audit readiness, and operational risk inside pest-control businesses (operators, compliance managers, field documentation).
- Tie every point to how PestTrace fits that world (software/process), without sounding salesy: educate first, product second.
- Tone: calm authority — the reader should feel smarter after reading, not pressured.
""".strip()
