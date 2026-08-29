import { buildPaylaneUrl, buildRequest, cleanText, deadlineFromDays, isCollectionKind, normalizeAmount, normalizeRecipient, type Draft } from "./domain.ts";
import { getDataPlans, normalizeAirtimeAmount, normalizeNigerianPhone, purchase, vtpassConfigFromEnv, type DataPlan, type Network, type ServiceKind } from "./vtpass.ts";

type Step = "kind" | "title" | "organizer" | "recipient" | "amount" | "deadline" | "note";
type Session = { step: Step; draft: Draft; touchedAt: number };
type BuyStep = "service" | "network" | "phone" | "amount" | "plan" | "confirm" | "processing";
type BuyDraft = { kind?: ServiceKind; network?: Network; phone?: string; amount?: number; variationCode?: string; planName?: string; plans?: DataPlan[] };
type BuySession = { step: BuyStep; draft: BuyDraft; touchedAt: number };
type TelegramUser = { id: number; username?: string };
type Chat = { id: number; type: string };
type Message = { message_id: number; text?: string; chat: Chat; from?: TelegramUser };
type CallbackQuery = { id: string; data?: string; from: TelegramUser; message?: Message };
type Update = { update_id: number; message?: Message; callback_query?: CallbackQuery };
type BotIdentity = { id: number; is_bot: boolean; username?: string };
type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const expectedUsername = process.env.TELEGRAM_BOT_USERNAME?.trim() || "PaylaneCeloBot";
const appUrl = process.env.PAYLANE_APP_URL?.trim() || "https://nftkingiii.github.io/paylane/";
if (!token || !/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(token)) {
  throw new Error("TELEGRAM_BOT_TOKEN is missing or malformed.");
}

const apiBase = `https://api.telegram.org/bot${token}`;
const sessions = new Map<number, Session>();
const buySessions = new Map<number, BuySession>();
const rateBuckets = new Map<number, { startedAt: number; count: number }>();
const SESSION_TTL_MS = 30 * 60_000;
const MAX_SESSIONS = 1_000;

async function api<T>(method: string, body: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<T> {
  const response = await fetch(`${apiBase}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json() as { ok: boolean; result?: T; description?: string };
  if (!response.ok || !payload.ok || payload.result === undefined) throw new Error(`Telegram ${method} failed.`);
  return payload.result;
}

async function send(chatId: number, text: string, replyMarkup?: InlineKeyboard): Promise<void> {
  await api("sendMessage", { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}

function keyboard(rows: Array<Array<[string, string]>>): InlineKeyboard {
  return { inline_keyboard: rows.map((row) => row.map(([text, callback_data]) => ({ text, callback_data }))) };
}

function allow(chatId: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(chatId);
  if (!bucket || now - bucket.startedAt >= 60_000) {
    rateBuckets.set(chatId, { startedAt: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= 20;
}

function setSession(chatId: number, step: Step, draft: Draft): void {
  if (!sessions.has(chatId) && sessions.size >= MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)[0];
    if (oldest) sessions.delete(oldest[0]);
  }
  sessions.set(chatId, { step, draft, touchedAt: Date.now() });
}

function setBuySession(chatId: number, step: BuyStep, draft: BuyDraft): void {
  buySessions.set(chatId, { step, draft, touchedAt: Date.now() });
}

function prune(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [chatId, session] of sessions) if (session.touchedAt < cutoff) sessions.delete(chatId);
  for (const [chatId, session] of buySessions) if (session.touchedAt < cutoff) buySessions.delete(chatId);
}

async function begin(chatId: number): Promise<void> {
  buySessions.delete(chatId);
  setSession(chatId, "kind", {});
  await send(chatId, "What are you collecting for?", keyboard([
    [["Event", "kind:event"], ["Merchant request", "kind:merchant"]],
    [["Contribution circle", "kind:circle"]],
  ]));
}

async function beginBuy(chatId: number): Promise<void> {
  sessions.delete(chatId);
  setBuySession(chatId, "service", {});
  await send(chatId, "Sandbox test: what would you like to buy? No real airtime or data will be delivered.", keyboard([
    [["Airtime", "buykind:airtime"], ["Mobile data", "buykind:data"]],
  ]));
}

function networkKeyboard(): InlineKeyboard {
  return keyboard([
    [["MTN", "network:mtn"], ["Airtel", "network:airtel"]],
    [["Glo", "network:glo"], ["9mobile", "network:9mobile"]],
  ]);
}

function summary(draft: BuyDraft): string {
  const service = draft.kind === "airtime" ? "Airtime" : "Mobile data";
  const item = draft.kind === "airtime" ? `N${draft.amount?.toLocaleString("en-NG")}` : `${draft.planName} (N${draft.amount?.toLocaleString("en-NG")})`;
  return `${service}\nNetwork: ${draft.network?.toUpperCase()}\nPhone: ${draft.phone}\nProduct: ${item}`;
}

async function handleCallback(query: CallbackQuery): Promise<void> {
  const chatId = query.message?.chat.id;
  await api("answerCallbackQuery", { callback_query_id: query.id });
  if (!chatId || !allow(chatId)) return;
  const [action, value] = (query.data ?? "").split(":", 2);
  const buySession = buySessions.get(chatId);
  if (buySession) {
    if (buySession.step === "service" && action === "buykind" && (value === "airtime" || value === "data")) {
      setBuySession(chatId, "network", { kind: value });
      return void await send(chatId, "Choose the mobile network.", networkKeyboard());
    }
    if (buySession.step === "network" && action === "network" && ["mtn", "airtel", "glo", "9mobile"].includes(value)) {
      setBuySession(chatId, "phone", { ...buySession.draft, network: value as Network });
      return void await send(chatId, "Send the recipient phone number. Use 08011111111 for a successful VTpass sandbox simulation.");
    }
    if (buySession.step === "plan" && action === "plan") {
      const plan = buySession.draft.plans?.[Number(value)];
      if (!plan) return void await send(chatId, "That plan is no longer available. Send /buy to restart.");
      const draft = { ...buySession.draft, amount: plan.amount, variationCode: plan.code, planName: plan.name, plans: undefined };
      setBuySession(chatId, "confirm", draft);
      return void await send(chatId, `Review this SANDBOX order:\n\n${summary(draft)}\n\nNo crypto payment has been collected. Confirm only to simulate fulfillment.`, keyboard([[['Confirm sandbox purchase', 'confirm:yes'], ['Cancel', 'confirm:no']]]));
    }
    if (buySession.step === "confirm" && action === "confirm" && value === "no") {
      buySessions.delete(chatId);
      return void await send(chatId, "Sandbox order cancelled. Nothing was purchased.");
    }
    if (buySession.step === "confirm" && action === "confirm" && value === "yes") {
      setBuySession(chatId, "processing", buySession.draft);
      await send(chatId, "Submitting the sandbox order to VTpass...");
      try {
        const draft = buySession.draft;
        if (!draft.kind || !draft.network || !draft.phone || !draft.amount) throw new Error("The order is incomplete.");
        const result = await purchase(vtpassConfigFromEnv(), {
          kind: draft.kind, network: draft.network, phone: draft.phone, amount: draft.amount, variationCode: draft.variationCode,
        });
        buySessions.delete(chatId);
        const receipt = result.transactionId ? `\nVTpass transaction: ${result.transactionId}` : "";
        return void await send(chatId, `Sandbox result: ${result.status}\nCode: ${result.code}\n${result.description}\nRequest: ${result.requestId}${receipt}\n\nThis was a simulation; no real airtime or data was delivered.`);
      } catch {
        buySessions.delete(chatId);
        return void await send(chatId, "VTpass sandbox could not complete the order. Nothing was delivered. Send /buy to try again.");
      }
    }
    return void await send(chatId, "That option is no longer active. Continue with the latest prompt or send /cancel.");
  }
  const session = sessions.get(chatId);
  if (!session) return void await send(chatId, "This draft expired. Send /collect to start again.");
  if (session.step === "kind" && action === "kind" && isCollectionKind(value)) {
    setSession(chatId, "title", { kind: value });
    return void await send(chatId, "Send the collection title (3–80 characters).");
  }
  if (session.step === "deadline" && action === "days" && (value === "1" || value === "7" || value === "30")) {
    setSession(chatId, "note", { ...session.draft, deadline: deadlineFromDays(Number(value) as 1 | 7 | 30) });
    return void await send(chatId, "What does this payment cover? Send up to 240 characters, or /skip.");
  }
  await send(chatId, "That option is no longer active. Continue with the latest prompt or send /cancel.");
}

async function handleMessage(message: Message): Promise<void> {
  const chatId = message.chat.id;
  const text = message.text?.trim();
  if (!text || !allow(chatId)) return;
  if (message.chat.type !== "private") return void await send(chatId, "For payment privacy, open a private chat with @PaylaneCeloBot and send /collect.");
  if (text === "/start" || text.startsWith("/start@")) {
    sessions.delete(chatId);
    buySessions.delete(chatId);
    return void await send(chatId, "Paylane creates locked USA₮ collection links on Celo and tests Nigerian airtime/data fulfillment. I never ask for private keys. Send /collect, /buy, /cancel, or /help.");
  }
  if (text === "/help" || text.startsWith("/help@")) return void await send(chatId, "Use /collect for a locked Celo payment request. Use /buy to simulate an airtime/data order in the VTpass sandbox. Sandbox orders do not collect crypto and do not deliver real services. Drafts expire after 30 minutes.");
  if (text === "/cancel" || text.startsWith("/cancel@")) {
    sessions.delete(chatId);
    buySessions.delete(chatId);
    return void await send(chatId, "Draft discarded. No payment was created.");
  }
  if (text === "/collect" || text.startsWith("/collect@")) return void await begin(chatId);
  if (text === "/buy" || text.startsWith("/buy@")) return void await beginBuy(chatId);

  const buySession = buySessions.get(chatId);
  if (buySession) {
    buySession.touchedAt = Date.now();
    try {
      if (buySession.step === "phone") {
        const draft = { ...buySession.draft, phone: normalizeNigerianPhone(text) };
        if (draft.kind === "airtime") {
          setBuySession(chatId, "amount", draft);
          return void await send(chatId, "Send the airtime amount in naira (N50 to N50,000).");
        }
        if (!draft.network) throw new Error("The network is missing.");
        await send(chatId, "Loading current VTpass sandbox data plans...");
        const plans = await getDataPlans(vtpassConfigFromEnv(), draft.network);
        setBuySession(chatId, "plan", { ...draft, plans });
        return void await send(chatId, "Choose a data plan.", keyboard(plans.map((plan, index) => [[`${plan.name}`, `plan:${index}`]])));
      }
      if (buySession.step === "amount") {
        const draft = { ...buySession.draft, amount: normalizeAirtimeAmount(text) };
        setBuySession(chatId, "confirm", draft);
        return void await send(chatId, `Review this SANDBOX order:\n\n${summary(draft)}\n\nNo crypto payment has been collected. Confirm only to simulate fulfillment.`, keyboard([[['Confirm sandbox purchase', 'confirm:yes'], ['Cancel', 'confirm:no']]]));
      }
      return void await send(chatId, "Use the buttons in the latest prompt, or send /cancel.");
    } catch (error) {
      return void await send(chatId, error instanceof Error ? error.message : "That value is invalid. Try again.");
    }
  }

  const session = sessions.get(chatId);
  if (!session) return void await send(chatId, "Send /collect to create a payment request.");
  session.touchedAt = Date.now();
  try {
    if (session.step === "title") {
      setSession(chatId, "organizer", { ...session.draft, title: cleanText(text, 80) });
      return void await send(chatId, "Send the organizer or merchant name (2–50 characters).");
    }
    if (session.step === "organizer") {
      const organizer = cleanText(text, 50);
      if (organizer.length < 2) throw new Error("Send at least 2 characters.");
      setSession(chatId, "recipient", { ...session.draft, organizer });
      return void await send(chatId, "Send the recipient’s 0x wallet address on Celo.");
    }
    if (session.step === "recipient") {
      setSession(chatId, "amount", { ...session.draft, recipient: normalizeRecipient(text) });
      return void await send(chatId, "Send the amount per payer in USA₮, for example 1.50.");
    }
    if (session.step === "amount") {
      setSession(chatId, "deadline", { ...session.draft, amount: normalizeAmount(text) });
      return void await send(chatId, "When should this request close?", keyboard([[["In 1 day", "days:1"], ["In 7 days", "days:7"], ["In 30 days", "days:30"]]]));
    }
    if (session.step === "note") {
      const note = text === "/skip" ? "" : cleanText(text, 240);
      const request = buildRequest({ ...session.draft, note });
      const url = buildPaylaneUrl(request, appUrl);
      sessions.delete(chatId);
      return void await send(chatId, `Your locked Paylane request is ready:\n\n${url}\n\nShare this link with payers. Payment is not complete until a payer signs and the transaction confirms on Celo.`);
    }
    await send(chatId, "Use the buttons in the latest prompt, or send /cancel.");
  } catch (error) {
    await send(chatId, error instanceof Error ? error.message : "That value is invalid. Try again.");
  }
}

async function run(): Promise<void> {
  const identity = await api<BotIdentity>("getMe");
  if (!identity.is_bot || identity.username?.toLowerCase() !== expectedUsername.toLowerCase()) {
    throw new Error("The token does not belong to the configured Telegram bot username.");
  }
  await api("setMyCommands", { commands: [
    { command: "collect", description: "Create a locked USA₮ request" },
    { command: "buy", description: "Test airtime or data in the sandbox" },
    { command: "cancel", description: "Discard the current draft" },
    { command: "help", description: "How Paylane works" },
  ] });
  console.log(`Paylane bot is listening as @${identity.username}.`);
  let offset = 0;
  while (true) {
    prune();
    try {
      const updates = await api<Update[]>("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] }, 35_000);
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.callback_query) await handleCallback(update.callback_query);
        else if (update.message) await handleMessage(update.message);
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
}

await run();
