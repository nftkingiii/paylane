import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getAddress } from "viem";
import {
  collectionKindLabels,
  collectionRequestId,
  collectionRequestSchema,
  createShareUrl,
  decodeCollectionRequest,
  isExpired,
  type CollectionKind,
  type CollectionRequest,
} from "./lib/collection";
import {
  ATTRIBUTION_TAG,
  CELO_EXPLORER,
  connectWallet,
  sendCollectionPayment,
  type ConnectedWallet,
  type PaymentResult,
} from "./lib/celo";

type Tab = "create" | "request" | "proof";
type PaymentState = "idle" | "connecting" | "review" | "pending" | "confirmed" | "failed" | "rejected";

const initialDeadline = (() => {
  const value = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
})();

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function messageFromError(error: unknown): string {
  if (error instanceof Error) {
    if (/rejected|denied/i.test(error.message)) return "The wallet request was rejected. No payment was sent.";
    return error.message;
  }
  return "The request could not be completed.";
}

function App() {
  const encodedRequest = new URLSearchParams(window.location.search).get("request");
  const decoded = useMemo(() => {
    if (!encodedRequest) return { request: null, error: null };
    try {
      return { request: decodeCollectionRequest(encodedRequest), error: null };
    } catch {
      return { request: null, error: "This collection link is invalid or has been altered." };
    }
  }, [encodedRequest]);
  const [tab, setTab] = useState<Tab>(encodedRequest ? "request" : "create");

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Paylane home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>Paylane</span>
        </a>
        <nav className="nav-tabs" aria-label="Primary navigation">
          <button className={tab === "create" ? "active" : ""} onClick={() => setTab("create")}>Create</button>
          {encodedRequest && (
            <button className={tab === "request" ? "active" : ""} onClick={() => setTab("request")}>Pay request</button>
          )}
          <button className={tab === "proof" ? "active" : ""} onClick={() => setTab("proof")}>Proof</button>
        </nav>
        <a className="network-chip" href="https://celoscan.io" target="_blank" rel="noreferrer">
          <span /> Celo mainnet
        </a>
      </header>

      <main>
        {tab === "create" && <CreateCollection />}
        {tab === "request" && <PaymentDesk request={decoded.request} error={decoded.error} />}
        {tab === "proof" && <ProofDesk />}
      </main>

      <footer>
        <span>Paylane · ERC-8004 Agent #9790</span>
        <span>Direct USA₮ settlement · x402 facilitator pending</span>
      </footer>
    </div>
  );
}

function CreateCollection() {
  const [kind, setKind] = useState<CollectionKind>("event");
  const [form, setForm] = useState({
    title: "",
    organizer: "",
    recipient: "",
    amount: "",
    deadline: initialDeadline,
    note: "",
  });
  const [shareUrl, setShareUrl] = useState("");
  const [requestId, setRequestId] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setShareUrl("");
    setCopied(false);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const request = collectionRequestSchema.parse({
        version: 1,
        kind,
        title: form.title,
        organizer: form.organizer,
        recipient: getAddress(form.recipient),
        amount: form.amount,
        token: "USAT",
        deadline: new Date(form.deadline).toISOString(),
        note: form.note,
        createdAt: new Date().toISOString(),
      });
      if (isExpired(request)) throw new Error("Choose a deadline in the future.");
      setRequestId(await collectionRequestId(request));
      setShareUrl(createShareUrl(request, window.location));
    } catch (cause) {
      setError(cause instanceof Error && cause.message.includes("deadline") ? cause.message : "Check the recipient, amount, deadline, and required fields.");
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
  }

  return (
    <section className="workspace create-workspace">
      <div className="intro-column">
        <div className="title-lockup">
          <h1>Open a lane for<br />real payments.</h1>
          <p>Create one bounded USA₮ request. The recipient, amount, and deadline are locked into the share link before anyone connects a wallet.</p>
        </div>

        <div className="lane-list" aria-label="Collection templates">
          {(Object.keys(collectionKindLabels) as CollectionKind[]).map((item, index) => (
            <button key={item} className={kind === item ? "lane active" : "lane"} onClick={() => { setKind(item); setShareUrl(""); }}>
              <span className="lane-number">0{index + 1}</span>
              <span><strong>{collectionKindLabels[item]}</strong><small>{item === "event" ? "Tickets, dues, one-off contributions" : item === "merchant" ? "Orders, invoices, service requests" : "Recurring group contributions"}</small></span>
              <span className="lane-arrow" aria-hidden="true">↗</span>
            </button>
          ))}
        </div>

        <div className="rule-note">
          <strong>Bounded by design</strong>
          <p>Paylane never lets a payer edit the destination or amount. Expired requests and self-payments are rejected before the wallet opens.</p>
        </div>
      </div>

      <div className="desk-panel">
        <div className="panel-heading">
          <div><span>New request</span><h2>{collectionKindLabels[kind]}</h2></div>
          <span className="step-chip">Draft</span>
        </div>
        <form onSubmit={create} noValidate>
          <label>Collection title<input required minLength={3} maxLength={80} value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="September community workshop" /></label>
          <label>Organizer or merchant<input required minLength={2} maxLength={50} value={form.organizer} onChange={(event) => update("organizer", event.target.value)} placeholder="Celo Nigeria" /></label>
          <label>Recipient wallet<input required spellCheck={false} autoComplete="off" value={form.recipient} onChange={(event) => update("recipient", event.target.value)} placeholder="0x…" /></label>
          <div className="field-row">
            <label>Amount per payer<div className="amount-input"><input required inputMode="decimal" value={form.amount} onChange={(event) => update("amount", event.target.value)} placeholder="1.00" /><span>USA₮</span></div></label>
            <label>Closes at<input required type="datetime-local" value={form.deadline} onChange={(event) => update("deadline", event.target.value)} /></label>
          </div>
          <label>What the payment covers<textarea maxLength={240} value={form.note} onChange={(event) => update("note", event.target.value)} placeholder="Describe the real good, service, or contribution purpose." /></label>
          {error && <p className="form-message error" role="alert">{error}</p>}
          <button className="primary-button" type="submit">Lock request and create link <span>→</span></button>
        </form>

        {shareUrl && (
          <div className="share-result" aria-live="polite">
            <div><span>Request #{requestId}</span><strong>Ready to share</strong></div>
            <button onClick={copyLink}>{copied ? "Copied" : "Copy payment link"}</button>
            <p>No payment has been made. Open the link in a separate wallet to exercise the real flow.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function PaymentDesk({ request, error }: { request: CollectionRequest | null; error: string | null }) {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [state, setState] = useState<PaymentState>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [requestId, setRequestId] = useState("");

  useEffect(() => {
    if (request) void collectionRequestId(request).then(setRequestId);
  }, [request]);

  if (error || !request) {
    return <section className="empty-state"><div className="status-icon danger">×</div><h1>Request unavailable</h1><p>{error ?? "No collection request was supplied."}</p><a href="/">Create a new request</a></section>;
  }

  const expired = isExpired(request);

  async function connect() {
    setState("connecting");
    setMessage("");
    try {
      const connected = await connectWallet();
      setWallet(connected);
      if (connected.address.toLowerCase() === request!.recipient.toLowerCase()) {
        setState("rejected");
        setMessage("Self-payments are excluded. Connect an independent payer wallet.");
      } else {
        setState("review");
      }
    } catch (cause) {
      setState("failed");
      setMessage(messageFromError(cause));
    }
  }

  async function pay() {
    if (!wallet) return;
    if (expired) {
      setState("rejected");
      setMessage("This request has expired. The wallet was not opened.");
      return;
    }
    setState("pending");
    setMessage("Confirm the exact USA₮ transfer in your wallet.");
    try {
      const payment = await sendCollectionPayment(wallet, request!.recipient, request!.amount);
      setResult(payment);
      setState("confirmed");
      setMessage(payment.attributionVerified ? "Payment confirmed and attribution verified." : "Payment confirmed, but attribution could not be verified yet.");
    } catch (cause) {
      setState(messageFromError(cause).includes("Self-payments") ? "rejected" : "failed");
      setMessage(messageFromError(cause));
    }
  }

  return (
    <section className="payment-layout">
      <div className="request-summary">
        <a className="back-link" href="/">← Create another lane</a>
        <span className="request-type">{collectionKindLabels[request.kind]}</span>
        <h1>{request.title}</h1>
        <p>{request.note || `A payment request from ${request.organizer}.`}</p>
        <dl>
          <div><dt>Organizer</dt><dd>{request.organizer}</dd></div>
          <div><dt>Request ID</dt><dd className="mono">#{requestId || "…"}</dd></div>
          <div><dt>Deadline</dt><dd>{new Date(request.deadline).toLocaleString()}</dd></div>
          <div><dt>Status</dt><dd className={expired ? "danger-text" : "success-text"}>{expired ? "Expired" : "Open"}</dd></div>
        </dl>
      </div>

      <div className="payment-ticket">
        <div className="ticket-topline"><span>Payment authorization</span><span>USA₮ · Celo</span></div>
        <div className="ticket-amount"><span>Amount due</span><strong>{request.amount}<small> USA₮</small></strong></div>
        <div className="ticket-route">
          <div><span>From</span><strong>{wallet ? shortAddress(wallet.address) : "Connect payer"}</strong></div>
          <div className="route-line"><i /><span>locked route</span><i /></div>
          <div><span>To</span><strong>{shortAddress(request.recipient)}</strong></div>
        </div>
        {wallet && <div className="balance-row"><span>Wallet balance</span><strong>{wallet.formattedBalance} USA₮</strong></div>}

        {expired ? (
          <div className="decision-box rejected"><span>Rejected</span><p>The deadline has passed. Paylane will not open a wallet request.</p></div>
        ) : state === "confirmed" && result ? (
          <div className="decision-box confirmed"><span>Confirmed</span><p>{message}</p><a href={`${CELO_EXPLORER}/tx/${result.hash}`} target="_blank" rel="noreferrer">Inspect transaction ↗</a></div>
        ) : (
          <>
            {message && <div className={`decision-box ${state === "failed" || state === "rejected" ? "rejected" : "pending"}`} role="status"><span>{state}</span><p>{message}</p></div>}
            {!wallet ? (
              <button className="primary-button pay-button" onClick={connect} disabled={state === "connecting"}>{state === "connecting" ? "Connecting…" : "Connect payer wallet"}</button>
            ) : (
              <button className="primary-button pay-button" onClick={pay} disabled={state === "pending" || state === "rejected"}>{state === "pending" ? "Waiting for confirmation…" : `Authorize and pay ${request.amount} USA₮`}</button>
            )}
          </>
        )}
        <p className="wallet-disclosure">Direct Celo mainnet transfer. Your wallet will show the exact token, amount, and recipient before signing. No private key is shared with Paylane.</p>
      </div>
    </section>
  );
}

function ProofDesk() {
  return (
    <section className="proof-layout">
      <div className="proof-title"><h1>Proof, not promises.</h1><p>Paylane exposes the identity, payment rail, and attribution used by this build. Missing integrations stay visible.</p></div>
      <div className="proof-ledger">
        <a href="https://8004scan.io/agents/celo/9790" target="_blank" rel="noreferrer"><span>Agent identity</span><strong>ERC-8004 #9790</strong><small>Verified on Celo mainnet ↗</small></a>
        <div><span>Transaction attribution</span><strong className="mono">{ATTRIBUTION_TAG}</strong><small>Appended to every direct payment</small></div>
        <div><span>Current settlement rail</span><strong>Direct USA₮ transfer</strong><small>Recipient, amount, and deadline are locked</small></div>
        <div className="open-gap"><span>Open integration gap</span><strong>x402 facilitator</strong><small>Not configured yet; no x402 claim is made by this build</small></div>
      </div>
      <div className="threat-note"><h2>What Paylane refuses</h2><div><p><strong>Self-payment</strong><span>Payer and recipient cannot be the same wallet.</span></p><p><strong>Expired request</strong><span>No wallet prompt after the deadline.</span></p><p><strong>Mutable destination</strong><span>The payer cannot edit the recipient or amount.</span></p><p><strong>Unverified completion</strong><span>Success appears only after a confirmed receipt.</span></p></div></div>
    </section>
  );
}

export default App;
