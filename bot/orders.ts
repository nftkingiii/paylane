import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Network, ServiceKind } from "./vtpass.ts";

export type Order = {
  id: string; chatId: number; kind: ServiceKind; network: Network; phone: string; nairaAmount: number;
  variationCode?: string; planName?: string; usatAmount: string; recipient: string; status: string;
  txHash?: string; payer?: string; vtpassRequestId?: string; vtpassTransactionId?: string;
};

export class OrderStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, chat_id INTEGER NOT NULL, kind TEXT NOT NULL, network TEXT NOT NULL,
      phone TEXT NOT NULL, naira_amount REAL NOT NULL, variation_code TEXT, plan_name TEXT,
      usat_amount TEXT NOT NULL, recipient TEXT NOT NULL, status TEXT NOT NULL,
      tx_hash TEXT UNIQUE, payer TEXT, vtpass_request_id TEXT, vtpass_transaction_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  create(order: Order): void {
    this.db.prepare(`INSERT INTO orders (id,chat_id,kind,network,phone,naira_amount,variation_code,plan_name,usat_amount,recipient,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(order.id, order.chatId, order.kind, order.network, order.phone, order.nairaAmount, order.variationCode ?? null, order.planName ?? null, order.usatAmount, order.recipient, order.status);
  }

  get(id: string): Order | undefined {
    const row = this.db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? { id: String(row.id), chatId: Number(row.chat_id), kind: row.kind as ServiceKind, network: row.network as Network, phone: String(row.phone), nairaAmount: Number(row.naira_amount), variationCode: row.variation_code ? String(row.variation_code) : undefined, planName: row.plan_name ? String(row.plan_name) : undefined, usatAmount: String(row.usat_amount), recipient: String(row.recipient), status: String(row.status), txHash: row.tx_hash ? String(row.tx_hash) : undefined, payer: row.payer ? String(row.payer) : undefined, vtpassRequestId: row.vtpass_request_id ? String(row.vtpass_request_id) : undefined, vtpassTransactionId: row.vtpass_transaction_id ? String(row.vtpass_transaction_id) : undefined } : undefined;
  }

  markPaid(id: string, txHash: string, payer: string): boolean {
    try {
      const result = this.db.prepare("UPDATE orders SET status='paid', tx_hash=?, payer=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='awaiting_payment'").run(txHash, payer, id);
      return result.changes === 1;
    } catch (error) {
      if (error instanceof Error && /UNIQUE/.test(error.message)) throw new Error("That transaction hash has already been used.");
      throw error;
    }
  }

  setVtpassRequest(id: string, requestId: string): void {
    this.db.prepare("UPDATE orders SET vtpass_request_id=?, status='fulfilling', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='paid'").run(requestId, id);
  }

  markDelivered(id: string, transactionId?: string): void {
    this.db.prepare("UPDATE orders SET status='delivered', vtpass_transaction_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(transactionId ?? null, id);
  }

  markFulfillmentFailed(id: string): void {
    this.db.prepare("UPDATE orders SET status='fulfillment_failed', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='fulfilling'").run(id);
  }
}
