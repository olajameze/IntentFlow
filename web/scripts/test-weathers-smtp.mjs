/**
 * Manual SMTP smoke test for the Weathers (Outlook/Hotmail) credentials.
 *
 * Run with:   node web/scripts/test-weathers-smtp.mjs your@gmail.com
 *
 * Sends a single plain-text test email from WEATHERS_OUTREACH_FROM_EMAIL to the
 * recipient you pass on the command line, using the WEATHERS_SMTP_* credentials.
 * Exits 0 on success, 1 on failure with the SMTP error message — useful before
 * approving real prospects so you don't burn deliverability on a typo.
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load web/.env.local manually because node doesn't auto-pick it up.
try {
  const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (process.env[key]) continue;          // existing process env wins
    const val = rawVal.replace(/^['"]|['"]$/g, "").trim();
    if (val) process.env[key] = val;
  }
} catch (err) {
  console.warn("Could not read web/.env.local:", err.message);
}

const to = process.argv[2];
if (!to) {
  console.error("Usage: node web/scripts/test-weathers-smtp.mjs <recipient@example.com>");
  process.exit(2);
}

const host = process.env.WEATHERS_SMTP_HOST?.trim();
const user = process.env.WEATHERS_SMTP_USER?.trim();
const pass = process.env.WEATHERS_SMTP_PASSWORD?.trim();
const port = parseInt(process.env.WEATHERS_SMTP_PORT?.trim() ?? "587", 10);
const fromName = process.env.WEATHERS_OUTREACH_FROM_NAME?.trim() || "Weathers Pest Solutions";
const fromEmail = process.env.WEATHERS_OUTREACH_FROM_EMAIL?.trim() || user;

console.log("SMTP target →", { host, port, user, fromName, fromEmail });
if (!host || !user || !pass) {
  console.error("Missing WEATHERS_SMTP_HOST / WEATHERS_SMTP_USER / WEATHERS_SMTP_PASSWORD in web/.env.local");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass },
});

try {
  await transporter.verify();
  console.log("✓ SMTP credentials accepted by", host);
  const info = await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject: "Weathers SMTP smoke test",
    text:
      "If you can read this in your inbox, Weathers Pest Solutions SMTP is wired up correctly. " +
      "You can now approve a real outreach prospect on /outreach and send it.",
  });
  console.log("✓ Test email sent — message id:", info.messageId);
  process.exit(0);
} catch (err) {
  console.error("✗ SMTP test failed:", err.message);
  if (/535|auth/i.test(err.message)) {
    console.error(
      "\nHint: 535 = bad credentials. Outlook/Hotmail requires an APP PASSWORD with 2FA enabled.",
      "\n      Generate at https://account.live.com/proofs/AppPassword and paste it as WEATHERS_SMTP_PASSWORD.",
    );
  }
  process.exit(1);
}
