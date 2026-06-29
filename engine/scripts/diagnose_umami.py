"""Print Umami Cloud connectivity diagnostics (never prints API keys)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import httpx

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from config import umami_api_key, umami_url  # noqa: E402
from tools.umami import _headers, _resolve_umami_target  # noqa: E402


def probe(base: str, label: str) -> None:
    headers = _headers("cloud_key")
    url = f"{base.rstrip('/')}/websites"
    try:
        r = httpx.get(url, headers=headers, timeout=30)
        print(f"[{label}] GET {url} -> {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            count = len(data) if isinstance(data, list) else "?"
            print(f"  websites returned: {count}")
            if isinstance(data, list) and data:
                sample = data[0]
                if isinstance(sample, dict):
                    print(f"  sample id: {sample.get('id')} name: {sample.get('name')}")
        elif r.status_code >= 400:
            print(f"  body: {r.text[:180]}")
    except Exception as exc:  # noqa: BLE001
        print(f"[{label}] error: {exc}")


def main() -> None:
    key = umami_api_key()
    print("UMAMI_URL:", umami_url())
    print("UMAMI_CLOUD_REGION:", os.getenv("UMAMI_CLOUD_REGION", "(unset)"))
    print("API key present:", bool(key), "length:", len(key or ""))
    if key:
        print("API key prefix:", (key[:8] + "…") if len(key) > 8 else "(short)")

    base, layout, auth = _resolve_umami_target()
    print("Resolved target:", base, layout, auth)

    for label, endpoint in (
        ("configured", base),
        ("default-v1", "https://api.umami.is/v1"),
        ("eu", "https://api.umami.is/v1/eu"),
        ("us", "https://api.umami.is/v1/us"),
    ):
        probe(endpoint, label)


if __name__ == "__main__":
    main()
