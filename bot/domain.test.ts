import { describe, expect, it } from "vitest";
import { buildPaylaneUrl, buildRequest, cleanText, deadlineFromDays, normalizeAmount, normalizeRecipient } from "./domain.ts";

describe("Telegram collection boundary", () => {
  it("normalizes validated collection input into a Paylane link", () => {
    const now = new Date("2026-08-29T00:00:00.000Z");
    const request = buildRequest({
      kind: "event",
      title: "Celo workshop",
      organizer: "Celo Nigeria",
      recipient: normalizeRecipient("0x8aAB2E27bd9Ce18Ca44722CCE48ADCc10df0C4c4"),
      amount: normalizeAmount("1.50"),
      deadline: deadlineFromDays(7, now),
      note: "One admission",
    }, now);
    const url = buildPaylaneUrl(request, "https://nftkingiii.github.io/paylane/");
    expect(url).toMatch(/^https:\/\/nftkingiii\.github\.io\/paylane\/\?request=/);
  });

  it("rejects unsafe or malformed boundary values", () => {
    expect(() => normalizeRecipient("not-a-wallet")).toThrow(/valid 0x/);
    expect(() => normalizeAmount("-1")).toThrow(/6 decimals/);
    expect(() => cleanText("\u0000\n", 20)).toThrow(/between 1 and 20/);
  });
});
