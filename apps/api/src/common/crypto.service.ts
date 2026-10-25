import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

const ACCESS_TOKEN_TTL_SEC = 15 * 60;

/**
 * Application-layer cryptography. Keys come from the environment (secrets manager in production).
 * Encrypted values are versioned ("v1:") so keys can be rotated with a re-encryption job.
 */
@Injectable()
export class CryptoService {
  private readonly dataKey = Buffer.from(env.DATA_ENCRYPTION_KEY, "base64");

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.dataKey, iv);
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
  }

  decrypt(payload: string): string {
    const [v, iv, tag, ct] = payload.split(":");
    if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unsupported ciphertext");
    const d = createDecipheriv("aes-256-gcm", this.dataKey, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
  }

  encryptBuffer(data: Buffer): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.dataKey, iv);
    const ct = Buffer.concat([cipher.update(data), cipher.final()]);
    // layout: "WX1" | iv(12) | tag(16) | ciphertext
    return Buffer.concat([Buffer.from("WX1"), iv, cipher.getAuthTag(), ct]);
  }

  decryptBuffer(blob: Buffer): Buffer {
    if (blob.subarray(0, 3).toString() !== "WX1") throw new Error("Unsupported blob");
    const iv = blob.subarray(3, 15);
    const tag = blob.subarray(15, 31);
    const d = createDecipheriv("aes-256-gcm", this.dataKey, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(blob.subarray(31)), d.final()]);
  }

  /** Keyed lookup hash (national ID, bank account) — deterministic, not reversible without the key. */
  lookupHash(value: string): string {
    return createHmac("sha256", env.LOOKUP_HMAC_KEY).update(value).digest("base64url");
  }

  sha256(value: string | Buffer): string {
    return createHash("sha256").update(value).digest("hex");
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString("base64url");
  }

  numericCode(digits = 6): string {
    return String(randomInt(0, 10 ** digits)).padStart(digits, "0");
  }

  /** Human-friendly reference without ambiguous characters (no 0/O/1/I), e.g. "WX7K3PQ9". */
  reference(prefix: string, length = 6): string {
    const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    let s = "";
    for (let i = 0; i < length; i++) s += alphabet[randomInt(0, alphabet.length)];
    return `${prefix}${s}`;
  }

  safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }

  // ── access tokens: v1.<sid>.<uid>.<exp>.<sig> (HMAC-SHA256) ─────────────────
  signAccessToken(sessionId: string, userId: string, ttlSec = ACCESS_TOKEN_TTL_SEC): { token: string; expiresAt: Date } {
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    const body = `v1.${sessionId}.${userId}.${exp}`;
    const sig = createHmac("sha256", env.TOKEN_SIGNING_KEY).update(body).digest("base64url");
    return { token: `${body}.${sig}`, expiresAt: new Date(exp * 1000) };
  }

  verifyAccessToken(token: string): { sessionId: string; userId: string } | null {
    const parts = token.split(".");
    if (parts.length !== 5 || parts[0] !== "v1") return null;
    const [, sid, uid, expStr, sig] = parts as [string, string, string, string, string];
    const expected = createHmac("sha256", env.TOKEN_SIGNING_KEY).update(`v1.${sid}.${uid}.${expStr}`).digest("base64url");
    if (!this.safeEqual(sig, expected)) return null;
    if (Number(expStr) * 1000 < Date.now()) return null;
    return { sessionId: sid, userId: uid };
  }
}
