#!/usr/bin/env node
/**
 * Vault per-brand Stripe secret keys from web/.env.local into Supabase businesses.
 *
 * Set any of (restricted keys recommended):
 *   STRIPE_SECRET_KEY_WEATHERS=rk_live_...
 *   STRIPE_SECRET_KEY_PESTTRACE=rk_live_...
 *   STRIPE_SECRET_KEY_JGDEVS=rk_live_...
 *
 * Usage (from web/): node scripts/vault-stripe-keys.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createCipheriv, createHash, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const BRANDS = [
  { env: "STRIPE_SECRET_KEY_WEATHERS", id: "11111111-1111-1111-1111-111111111111", name: "Weathers Pest Solutions" },
  { env: "STRIPE_SECRET_KEY_PESTTRACE", id: "22222222-2222-2222-2222-222222222222", name: "PestTrace" },
  { env: "STRIPE_SECRET_KEY_JGDEVS", id: "33333333-3333-3333-3333-333333333333", name: "JGDevs" },
];

function loadEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("Missing web/.env.local");
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

function encryptSecret(plain, masterSecret) {
  const key = createHash("sha256").update(masterSecret, "utf8").digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    stripe_secret_ciphertext: encrypted.toString("base64"),
    stripe_secret_iv: iv.toString("base64"),
    stripe_secret_tag: tag.toString("base64"),
  };
}

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const master = process.env.STRIPE_SECRET_ENCRYPTION_KEY;

  if (!url || !serviceKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  if (!master) {
    console.error("Set STRIPE_SECRET_ENCRYPTION_KEY in .env.local");
    process.exit(1);
  }

  const sb = createClient(url, serviceKey);
  let vaulted = 0;
  let skipped = 0;

  for (const brand of BRANDS) {
    const raw = process.env[brand.env]?.trim();
    if (!raw) {
      console.log(`Skip ${brand.name}: ${brand.env} not set`);
      skipped += 1;
      continue;
    }
    const enc = encryptSecret(raw, master);
    const { error } = await sb
      .from("businesses")
      .update({ ...enc, updated_at: new Date().toISOString() })
      .eq("id", brand.id);

    if (error) {
      console.error(`Failed ${brand.name}:`, error.message);
      process.exit(1);
    }
    console.log(`Vaulted Stripe key for ${brand.name}`);
    vaulted += 1;
  }

  if (vaulted === 0) {
    console.log("\nNo keys vaulted. Add to web/.env.local:");
    for (const b of BRANDS) console.log(`  ${b.env}=rk_live_...`);
    process.exit(1);
  }

  console.log(`\nDone: ${vaulted} vaulted, ${skipped} skipped. Run: npm run engine:revenue`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
