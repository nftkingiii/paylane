import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function makeCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export class ShortLinkStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS short_links (
      code TEXT PRIMARY KEY, target_url TEXT NOT NULL, expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  create(targetUrl: string, expiresAt: string): string {
    const target = new URL(targetUrl);
    if (target.protocol !== "https:") throw new Error("Short-link targets must use HTTPS.");
    const expiry = new Date(expiresAt);
    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) throw new Error("Short links require a future expiry.");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = makeCode();
      try {
        this.db.prepare("INSERT INTO short_links (code,target_url,expires_at) VALUES (?,?,?)").run(code, target.toString(), expiry.toISOString());
        return code;
      } catch (error) {
        if (!(error instanceof Error) || !/UNIQUE/.test(error.message)) throw error;
      }
    }
    throw new Error("Could not allocate a unique payment link.");
  }

  resolve(code: string, now = new Date()): string | undefined {
    if (!/^[2-9A-HJ-NP-Z]{8}$/.test(code)) return undefined;
    const row = this.db.prepare("SELECT target_url, expires_at FROM short_links WHERE code=?").get(code) as { target_url: string; expires_at: string } | undefined;
    if (!row || new Date(row.expires_at).getTime() <= now.getTime()) return undefined;
    return row.target_url;
  }
}
