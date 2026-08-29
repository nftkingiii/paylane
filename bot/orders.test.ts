import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OrderStore } from "./orders.ts";

describe("persistent purchase orders", () => {
  it("persists state and prevents transaction replay", () => {
    const path = join(mkdtempSync(join(tmpdir(), "paylane-")), "orders.sqlite");
    const store = new OrderStore(path);
    const base = { id: "PL_TEST1", chatId: 7, kind: "airtime" as const, network: "mtn" as const, phone: "08011111111", nairaAmount: 100, usatAmount: "0.10", recipient: "0x8aAB2E27bd9Ce18Ca44722CCE48ADCc10df0C4c4", status: "awaiting_payment" };
    store.create(base);
    expect(store.markPaid(base.id, `0x${"1".repeat(64)}`, `0x${"2".repeat(40)}`)).toBe(true);
    expect(store.get(base.id)?.status).toBe("paid");
    store.create({ ...base, id: "PL_TEST2" });
    expect(() => store.markPaid("PL_TEST2", `0x${"1".repeat(64)}`, `0x${"3".repeat(40)}`)).toThrow(/already been used/);
  });
});
