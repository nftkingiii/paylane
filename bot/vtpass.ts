import { randomBytes } from "node:crypto";

export type Network = "mtn" | "airtel" | "glo" | "9mobile";
export type ServiceKind = "airtime" | "data";
export type DataPlan = { code: string; name: string; amount: number };
export type PurchaseResult = {
  requestId: string;
  code: string;
  status: string;
  description: string;
  transactionId?: string;
};

const AIRTIME_IDS: Record<Network, string> = { mtn: "mtn", airtel: "airtel", glo: "glo", "9mobile": "etisalat" };
const DATA_IDS: Record<Network, string> = { mtn: "mtn-data", airtel: "airtel-data", glo: "glo-data", "9mobile": "9mobile-sme-data" };

export function normalizeNigerianPhone(value: string): string {
  const compact = value.replace(/[\s()-]/g, "");
  const local = compact.startsWith("+234") ? `0${compact.slice(4)}` : compact.startsWith("234") ? `0${compact.slice(3)}` : compact;
  if (!/^0[789][01]\d{8}$/.test(local) && !/^[2345]0\d{10}$/.test(local)) {
    throw new Error("Send an 11-digit Nigerian phone number, for example 08011111111.");
  }
  return local;
}

export function normalizeAirtimeAmount(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new Error("Send a valid naira amount, for example 500.");
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 50 || amount > 50_000) throw new Error("Airtime amount must be between N50 and N50,000.");
  return amount;
}

export function serviceId(kind: ServiceKind, network: Network): string {
  return kind === "airtime" ? AIRTIME_IDS[network] : DATA_IDS[network];
}

export function makeRequestId(now = new Date()): string {
  const lagos = new Date(now.getTime() + 60 * 60_000);
  const first = lagos.toISOString().replace(/[-:T]/g, "").slice(0, 12);
  return `${first}${randomBytes(6).toString("hex")}`;
}

type Config = { baseUrl: string; apiKey: string; publicKey: string; secretKey: string };

export function vtpassConfigFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  const config = {
    baseUrl: env.VTPASS_BASE_URL?.replace(/\/$/, "") ?? "",
    apiKey: env.VTPASS_API_KEY?.trim() ?? "",
    publicKey: env.VTPASS_PUBLIC_KEY?.trim() ?? "",
    secretKey: env.VTPASS_SECRET_KEY?.trim() ?? "",
  };
  if (!config.baseUrl || !config.apiKey || !config.publicKey || !config.secretKey) throw new Error("VTpass configuration is incomplete.");
  const sandbox = config.baseUrl === "https://sandbox.vtpass.com/api";
  const approvedLive = config.baseUrl === "https://vtpass.com/api" && env.PAYLANE_LIVE_BUY_ENABLED === "true";
  if (!sandbox && !approvedLive) throw new Error("VTpass live mode requires PAYLANE_LIVE_BUY_ENABLED=true and the exact live API URL.");
  return config;
}

async function requestJson(url: string, init: RequestInit, timeoutMs = 20_000): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error("VTpass did not return a valid response.");
  return payload;
}

export async function getDataPlans(config: Config, network: Network): Promise<DataPlan[]> {
  const url = new URL(`${config.baseUrl}/service-variations`);
  url.searchParams.set("serviceID", serviceId("data", network));
  const payload = await requestJson(url.toString(), { headers: { "api-key": config.apiKey, "public-key": config.publicKey } }) as {
    content?: { variations?: Array<{ variation_code?: unknown; name?: unknown; variation_amount?: unknown }> };
  };
  const plans = (payload.content?.variations ?? []).flatMap((plan) => {
    const amount = Number(plan.variation_amount);
    return typeof plan.variation_code === "string" && typeof plan.name === "string" && Number.isFinite(amount) && amount > 0
      ? [{ code: plan.variation_code, name: plan.name, amount }]
      : [];
  });
  if (!plans.length) throw new Error("VTpass returned no data plans for that network.");
  return plans.slice(0, 10);
}

export async function purchase(config: Config, input: {
  kind: ServiceKind; network: Network; phone: string; amount: number; variationCode?: string; requestId?: string;
}): Promise<PurchaseResult> {
  const requestId = input.requestId ?? makeRequestId();
  const body: Record<string, string | number> = {
    request_id: requestId,
    serviceID: serviceId(input.kind, input.network),
    amount: input.amount,
    phone: input.phone,
  };
  if (input.kind === "data") {
    if (!input.variationCode) throw new Error("A data plan is required.");
    body.billersCode = input.phone;
    body.variation_code = input.variationCode;
  }
  const payload = await requestJson(`${config.baseUrl}/pay`, {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": config.apiKey, "secret-key": config.secretKey },
    body: JSON.stringify(body),
  }, 35_000) as {
    code?: unknown; response_description?: unknown; requestId?: unknown;
    content?: { transactions?: { status?: unknown; transactionId?: unknown } };
  };
  const code = String(payload.code ?? "unknown");
  const status = String(payload.content?.transactions?.status ?? (code === "000" ? "unknown" : "failed"));
  return {
    requestId: String(payload.requestId ?? requestId), code, status,
    description: String(payload.response_description ?? "No description returned"),
    transactionId: payload.content?.transactions?.transactionId ? String(payload.content.transactions.transactionId) : undefined,
  };
}
