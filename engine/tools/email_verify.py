"""Lightweight email verification — format + MX lookup."""

from __future__ import annotations

import re

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


def is_valid_email_format(email: str) -> bool:
    e = email.strip().lower()
    if not e or len(e) > 254:
        return False
    if not _EMAIL_RE.match(e):
        return False
    local, _, domain = e.partition("@")
    return bool(local and domain and "." in domain)


def has_mx_records(domain: str) -> bool:
    try:
        import dns.resolver  # type: ignore[import-untyped]

        answers = dns.resolver.resolve(domain, "MX")
        return len(list(answers)) > 0
    except Exception:
        try:
            import socket

            socket.getaddrinfo(domain, None)
            return True
        except OSError:
            return False


def verify_outreach_email(email: str) -> tuple[bool, str | None]:
    trimmed = email.strip().lower()
    if not is_valid_email_format(trimmed):
        return False, "Invalid email format"
    domain = trimmed.split("@", 1)[1]
    if not has_mx_records(domain):
        return False, "No MX records for domain"
    return True, None
