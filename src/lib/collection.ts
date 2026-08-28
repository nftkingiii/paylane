import { z } from "zod";

export const collectionKinds = ["event", "merchant", "circle"] as const;
export type CollectionKind = (typeof collectionKinds)[number];

export const collectionKindLabels: Record<CollectionKind, string> = {
  event: "Event collection",
  merchant: "Merchant request",
  circle: "Contribution circle",
};

const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const amountPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;

export const collectionRequestSchema = z.object({
  version: z.literal(1),
  kind: z.enum(collectionKinds),
  title: z.string().trim().min(3).max(80),
  organizer: z.string().trim().min(2).max(50),
  recipient: z.string().regex(addressPattern),
  amount: z.string().regex(amountPattern).refine((value) => Number(value) > 0 && Number(value) <= 100_000),
  token: z.literal("USAT"),
  deadline: z.string().datetime(),
  note: z.string().trim().max(240),
  createdAt: z.string().datetime(),
});

export type CollectionRequest = z.infer<typeof collectionRequestSchema>;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeCollectionRequest(request: CollectionRequest): string {
  const parsed = collectionRequestSchema.parse(request);
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(parsed)));
}

export function decodeCollectionRequest(encoded: string): CollectionRequest {
  if (encoded.length > 2_500) throw new Error("Request link is too large.");
  const json = new TextDecoder().decode(base64UrlToBytes(encoded));
  return collectionRequestSchema.parse(JSON.parse(json) as unknown);
}

export async function collectionRequestId(request: CollectionRequest): Promise<string> {
  const canonical = JSON.stringify(collectionRequestSchema.parse(request));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest).slice(0, 6), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isExpired(request: CollectionRequest, now = new Date()): boolean {
  return new Date(request.deadline).getTime() <= now.getTime();
}

export function createShareUrl(request: CollectionRequest, location: Pick<Location, "origin" | "pathname">): string {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set("request", encodeCollectionRequest(request));
  return url.toString();
}
