import { describe, expect, it } from "vitest";
import { concatHex, encodeFunctionData, getAddress, parseAbi, parseUnits } from "viem";
import { toDataSuffix } from "@celo/attribution-tags";
import { inspectTaggedTransfer, PAYLANE_TAG, USAT } from "./payment.ts";

const abi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);
const recipient = getAddress("0x8aAB2E27bd9Ce18Ca44722CCE48ADCc10df0C4c4");
const payer = getAddress("0x1111111111111111111111111111111111111111");

describe("tagged payment verification", () => {
  const data = concatHex([encodeFunctionData({ abi, functionName: "transfer", args: [recipient, parseUnits("1.25", 6)] }), toDataSuffix(PAYLANE_TAG)]);

  it("accepts the exact tagged USA₮ transfer", () => {
    expect(inspectTaggedTransfer({ token: USAT, sender: payer, data }, { recipient, amount: "1.25" })).toMatchObject({ payer, recipient, amount: "1.25" });
  });

  it("rejects altered amount, missing tag, and self-payment", () => {
    expect(() => inspectTaggedTransfer({ token: USAT, sender: payer, data }, { recipient, amount: "1.26" })).toThrow(/amount/);
    const untagged = encodeFunctionData({ abi, functionName: "transfer", args: [recipient, parseUnits("1.25", 6)] });
    expect(() => inspectTaggedTransfer({ token: USAT, sender: payer, data: untagged }, { recipient, amount: "1.25" })).toThrow(/tag/);
    expect(() => inspectTaggedTransfer({ token: USAT, sender: recipient, data }, { recipient, amount: "1.25" })).toThrow(/Self/);
  });
});
