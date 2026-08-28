import { describe, expect, it } from "vitest";
import { getAddress, parseUnits } from "viem";
import { ATTRIBUTION_TAG, buildTaggedTransferData, hasPaylaneAttribution } from "./celo";

describe("tagged USA₮ transfers", () => {
  it("appends the assigned hackathon attribution tag", () => {
    const data = buildTaggedTransferData(
      getAddress("0x1111111111111111111111111111111111111111"),
      parseUnits("1.25", 6),
    );
    expect(hasPaylaneAttribution(data)).toBe(true);
    const tagHex = Array.from(new TextEncoder().encode(ATTRIBUTION_TAG), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    expect(data).toContain(tagHex);
  });
});
