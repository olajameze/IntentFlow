import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

function keyBytes(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  tag: string;
};

export function encryptSecret(plain: string, masterSecret: string): EncryptedPayload {
  const key = keyBytes(masterSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptSecret(payload: EncryptedPayload, masterSecret: string): string {
  const key = keyBytes(masterSecret);
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
