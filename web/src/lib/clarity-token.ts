import { decryptSecret } from "@/lib/crypto";

type ClarityTokenColumns = {
  clarity_api_token_ciphertext?: string | null;
  clarity_api_token_iv?: string | null;
  clarity_api_token_tag?: string | null;
};

/** Per-business vaulted token, else optional global CLARITY_API_TOKEN fallback. */
export function clarityApiTokenForBusiness(biz: ClarityTokenColumns): string | null {
  const master = process.env.STRIPE_SECRET_ENCRYPTION_KEY?.trim();
  const ct = biz.clarity_api_token_ciphertext;
  const iv = biz.clarity_api_token_iv;
  const tag = biz.clarity_api_token_tag;
  if (master && ct && iv && tag) {
    try {
      const plain = decryptSecret({ ciphertext: ct, iv, tag }, master).trim();
      if (plain) return plain;
    } catch {
      return null;
    }
  }
  const fallback = (process.env.CLARITY_API_TOKEN || "").trim();
  return fallback || null;
}

export function businessHasClarityToken(biz: ClarityTokenColumns): boolean {
  return Boolean(
    biz.clarity_api_token_ciphertext && biz.clarity_api_token_iv && biz.clarity_api_token_tag,
  );
}
