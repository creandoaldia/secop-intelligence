// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — LinkedIn Token Encryption
// AES-256-CBC encrypt/decrypt for stored credentials
// ─────────────────────────────────────────────────────────────

import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const KEY = deriveKey();

function deriveKey(): Buffer {
  const secret = process.env.AUTH_SECRET || "dev-secret-change-in-production-32chars";
  return crypto.scryptSync(secret, "secop-linkedin-salt", 32);
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");
  if (parts.length !== 2) throw new Error("Invalid encrypted text format");
  const iv = Buffer.from(parts[0], "hex");
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
