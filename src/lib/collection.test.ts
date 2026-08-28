import { describe, expect, it } from "vitest";
import { createShareUrl, decodeCollectionRequest, encodeCollectionRequest, isExpired, type CollectionRequest } from "./collection";

const request: CollectionRequest = {
  version: 1,
  kind: "event",
  title: "Community workshop contribution",
  organizer: "Celo Nigeria",
  recipient: "0x8aAB2E27bd9Ce18Ca44722CCE48ADCc10df0C4c4",
  amount: "1.25",
  token: "USAT",
  deadline: "2026-09-10T12:00:00.000Z",
  note: "Covers venue and refreshments.",
  createdAt: "2026-08-28T12:00:00.000Z",
};

describe("collection links", () => {
  it("round-trips a validated request", () => {
    expect(decodeCollectionRequest(encodeCollectionRequest(request))).toEqual(request);
  });

  it("creates a share URL without leaking fields outside the request parameter", () => {
    const url = new URL(createShareUrl(request, { origin: "https://paylane.example", pathname: "/" }));
    expect(url.origin).toBe("https://paylane.example");
    expect(url.searchParams.size).toBe(1);
    expect(decodeCollectionRequest(url.searchParams.get("request")!)).toEqual(request);
  });

  it("rejects oversized request payloads", () => {
    expect(() => decodeCollectionRequest("a".repeat(2_501))).toThrow("too large");
  });

  it("resolves expiry deterministically", () => {
    expect(isExpired(request, new Date("2026-09-10T12:00:01.000Z"))).toBe(true);
    expect(isExpired(request, new Date("2026-09-10T11:59:59.000Z"))).toBe(false);
  });
});
