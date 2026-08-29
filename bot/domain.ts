import { getAddress } from "viem";
import {
  collectionRequestSchema,
  createShareUrl,
  type CollectionKind,
  type CollectionRequest,
} from "../src/lib/collection.ts";

export type Draft = Partial<Omit<CollectionRequest, "version" | "token" | "createdAt">>;

export function cleanText(value: string, max: number): string {
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > max) throw new Error(`Send between 1 and ${max} characters.`);
  return cleaned;
}

export function normalizeRecipient(value: string): string {
  try {
    return getAddress(value.trim());
  } catch {
    throw new Error("Send a valid 0x EVM wallet address.");
  }
}

export function normalizeAmount(value: string): string {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(normalized)) {
    throw new Error("Send a USA₮ amount with no more than 6 decimals, for example 1.50.");
  }
  const amount = Number(normalized);
  if (amount <= 0 || amount > 100_000) throw new Error("Amount must be above 0 and at most 100,000 USA₮.");
  return normalized;
}

export function deadlineFromDays(days: 1 | 7 | 30, now = new Date()): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

export function buildRequest(draft: Draft, now = new Date()): CollectionRequest {
  return collectionRequestSchema.parse({
    version: 1,
    kind: draft.kind,
    title: draft.title,
    organizer: draft.organizer,
    recipient: draft.recipient,
    amount: draft.amount,
    token: "USAT",
    deadline: draft.deadline,
    note: draft.note ?? "",
    createdAt: now.toISOString(),
  });
}

export function buildPaylaneUrl(request: CollectionRequest, appUrl: string): string {
  const base = new URL(appUrl);
  if (base.protocol !== "https:") throw new Error("PAYLANE_APP_URL must use HTTPS.");
  return createShareUrl(request, { origin: base.origin, pathname: base.pathname });
}

export function isCollectionKind(value: string): value is CollectionKind {
  return value === "event" || value === "merchant" || value === "circle";
}
