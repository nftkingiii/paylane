import { describe, expect, it } from "vitest";
import { makeRequestId, normalizeAirtimeAmount, normalizeNigerianPhone, serviceId, vtpassConfigFromEnv } from "./vtpass.ts";

describe("VTpass purchase boundary", () => {
  it("normalizes Nigerian numbers and validates airtime amounts", () => {
    expect(normalizeNigerianPhone("+234 801 111 1111")).toBe("08011111111");
    expect(normalizeAirtimeAmount("500")).toBe(500);
    expect(() => normalizeAirtimeAmount("10")).toThrow(/between N50/);
  });

  it("maps provider service IDs and creates a Lagos-time request ID", () => {
    expect(serviceId("airtime", "9mobile")).toBe("etisalat");
    expect(serviceId("data", "mtn")).toBe("mtn-data");
    expect(makeRequestId(new Date("2026-08-29T08:31:00.000Z"))).toMatch(/^202608290931[a-f0-9]{12}$/);
  });

  it("fails closed when live mode is configured", () => {
    expect(() => vtpassConfigFromEnv({ VTPASS_BASE_URL: "https://vtpass.com/api", VTPASS_API_KEY: "a", VTPASS_PUBLIC_KEY: "PK_a", VTPASS_SECRET_KEY: "SK_a" })).toThrow(/locked to the VTpass sandbox/);
  });
});
