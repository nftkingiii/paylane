import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ShortLinkStore } from "./shortlinks.ts";

describe("persistent short payment links", () => {
  it("round-trips an unguessable code and expires it", () => {
    const store = new ShortLinkStore(join(mkdtempSync(join(tmpdir(), "paylane-short-")), "links.sqlite"));
    const target = "https://nftkingiii.github.io/paylane/?request=abc";
    const expiry = new Date(Date.now() + 60_000);
    const code = store.create(target, expiry.toISOString());
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    expect(store.resolve(code, new Date(expiry.getTime() - 1))).toBe(target);
    expect(store.resolve(code, new Date(expiry.getTime() + 1))).toBeUndefined();
    expect(store.resolve("../ADMIN")).toBeUndefined();
  });

  it("rejects unsafe targets", () => {
    const store = new ShortLinkStore(join(mkdtempSync(join(tmpdir(), "paylane-short-")), "links.sqlite"));
    expect(() => store.create("http://example.com", new Date(Date.now() + 60_000).toISOString())).toThrow(/HTTPS/);
  });
});
