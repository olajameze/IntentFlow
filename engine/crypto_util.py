"""
Decrypt Stripe secrets encrypted by the Next.js dashboard (AES-256-GCM).
Format: base64(ciphertext) + IV + auth tag stored in DB columns.
"""

from __future__ import annotations

import base64
import hashlib

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from config import stripe_encryption_key


def _key_bytes() -> bytes:
    raw = stripe_encryption_key()
    if not raw:
        return b""
    # Derive 32-byte key from env string
    return hashlib.sha256(raw.encode("utf-8")).digest()


def decrypt_stripe_secret(ciphertext_b64: str | None, iv_b64: str | None, tag_b64: str | None) -> str | None:
    if not ciphertext_b64 or not iv_b64 or not tag_b64:
        return None
    key = _key_bytes()
    if len(key) != 32:
        return None
    ct = base64.b64decode(ciphertext_b64)
    iv = base64.b64decode(iv_b64)
    tag = base64.b64decode(tag_b64)
    aes = AESGCM(key)
    # Python AESGCM expects ciphertext || tag in one blob for decrypt with AESGCM.decrypt(iv, data, aad)
    # Our web app stores tag separately — concatenate for decrypt.
    payload = ct + tag
    try:
        plain = aes.decrypt(iv, payload, None)
        return plain.decode("utf-8")
    except Exception:
        return None


def decrypt_clarity_api_token(ciphertext_b64: str | None, iv_b64: str | None, tag_b64: str | None) -> str | None:
    """Decrypt per-business Clarity token (same AES-GCM vault as Stripe)."""
    return decrypt_stripe_secret(ciphertext_b64, iv_b64, tag_b64)
