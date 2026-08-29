# Paylane

Paylane is a bounded payment-collection agent for real communities and merchants on Celo.

**Live app:** https://nftkingiii.github.io/paylane/

It turns a concrete collection request into a locked payment link, settles a selected Celo stablecoin on mainnet, and refuses self-payments, expired requests, or mutations to the approved recipient and amount.

## Working slice

- Three request templates: event collection, merchant request, and contribution circle
- Shareable, URL-encoded requests with schema and size validation
- Browser-wallet connection with Celo mainnet enforcement
- Direct USDT or USA₮ transfer to the locked recipient (USDT is the default for new requests; USA₮ remains available for the hackathon rail)
- ERC-8021 transaction attribution using `celo_003382274302`
- Preflight simulation, confirmed-receipt success state, and Celoscan receipt link
- Public proof surface for ERC-8004 Agent #9790 and the current integration status

No payment is simulated. A success receipt is displayed only after a confirmed mainnet transaction.

## Hackathon focus

Paylane is being built for the Celo **Agents at Work Hackathon**.

- Primary track: Real World Adoption
- Target bounty: Best Stablecoin Adoption
- Network: Celo Mainnet

## Run locally

```powershell
npm install
npm run dev
```

For the production build:

```powershell
npm test -- --run
npm run build
npm run preview
```

## Telegram bot

The Telegram interface at [@PaylaneCeloBot](https://t.me/PaylaneCeloBot) guides a collector through the same locked-request schema and returns a live Paylane payment link. Drafts are held only in memory for 30 minutes; the bot stores no wallet keys and never signs payments.

Set the BotFather token only in the process environment, then start the long-polling worker:

```powershell
$secureToken = Read-Host "Paste the BotFather token" -AsSecureString
$env:TELEGRAM_BOT_TOKEN = [System.Net.NetworkCredential]::new("", $secureToken).Password
$env:TELEGRAM_BOT_USERNAME = "PaylaneCeloBot"
$env:PAYLANE_APP_URL = "https://nftkingiii.github.io/paylane/"
npm run bot:start
```

### Short payment links

The Railway worker also serves durable redirect links such as `https://paylane-bot-production.up.railway.app/p/AB23CD45`. `/collect` stores the existing locked request URL in SQLite on the mounted `/data` volume and returns only the eight-character public code. Codes exclude ambiguous characters, are not sequential, inherit the payment request deadline, and resolve with a no-cache 302 redirect. Invalid and expired codes return 404. The redirect service exposes `/healthz` for release verification and accepts no public write requests.

### VTpass sandbox airtime and data

The airtime/data integration is retained but hidden by default with `PAYLANE_BILL_BUY_ENABLED=false`. When deliberately enabled, `/buy` is locked to `https://sandbox.vtpass.com/api` unless the separate live gate is also approved. It supports MTN, Airtel, Glo, and 9mobile airtime/data simulations, loads current data variations from VTpass, requires an explicit confirmation, and labels every sandbox result as a simulation.

Add the four `VTPASS_*` values shown in `.env.example` to `.env.local` and the Railway service variables. In the VTpass sandbox dashboard, enable/whitelist the airtime and data products before testing; VTpass response code `028` means the product is not enabled for the account.

Use `08011111111` for VTpass's documented successful sandbox scenario. Other documented numbers exercise pending, timeout, no-response, and unexpected-response paths. Never switch `VTPASS_BASE_URL` to live without a separate production review, durable order storage, verified Celo settlement gating, and explicit approval.

### Live purchase safety gate

The live path is implemented but disabled by default. When deliberately activated, `/buy` persists the order in SQLite, creates a locked USA₮ request carrying Paylane's attribution tag, and requires `/settle ORDER_ID TX_HASH`. Before vending, the worker reads the Celo mainnet transaction and verifies all of the following: successful receipt, one additional confirmation, official USA₮ contract, exact treasury recipient, exact amount, independent sender, and `celo_003382274302` attribution. A unique database constraint prevents one transaction hash from fulfilling two orders.

Production activation requires all of these together:

- VTpass live API provisioning and funded live NGN balance.
- `VTPASS_BASE_URL=https://vtpass.com/api` with live keys.
- A persistent Railway volume mounted at `/data`.
- A registered Paylane pay-to wallet in `PAYLANE_TREASURY_ADDRESS`.
- A reviewed `PAYLANE_NGN_PER_USAT` quote and expiry policy.
- `PAYLANE_LIVE_BUY_ENABLED=true` only after an end-to-end low-value canary.

Do not enable the flag with sandbox credentials: real Celo payments must never trigger simulated fulfillment.

Use `/collect` in a private chat. The worker must remain running; GitHub Pages hosts the web app but cannot run the Telegram process.

## Verified project identity

- Repository: https://github.com/nftkingiii/paylane
- ERC-8004 Agent: https://8004scan.io/agents/celo/9790
- Agent wallet: `0x8aAB2E27bd9Ce18Ca44722CCE48ADCc10df0C4c4`
- Celo USDT contract: `0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e`
- Celo USA₮ contract: `0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771`

## Open integration gap

This slice uses direct USA₮ transfers. The Celo x402 facilitator is deliberately marked as pending until a facilitator API key and credits are provisioned; the product does not claim x402 settlement yet.

## Security

Paylane never asks users to share seed phrases or private keys. Wallet secrets stay in the user's wallet and are not committed. Request payloads are schema-validated and capped before parsing, payment calldata is simulated before signing, and success requires a confirmed receipt.
