# Paylane

Paylane is a bounded payment-collection agent for real communities and merchants on Celo.

**Live app:** https://nftkingiii.github.io/paylane/

It turns a concrete collection request into a locked payment link, settles USA₮ on Celo mainnet, and refuses self-payments, expired requests, or mutations to the approved recipient and amount.

## Working slice

- Three request templates: event collection, merchant request, and contribution circle
- Shareable, URL-encoded requests with schema and size validation
- Browser-wallet connection with Celo mainnet enforcement
- Direct USA₮ transfer to the locked recipient
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

## Verified project identity

- Repository: https://github.com/nftkingiii/paylane
- ERC-8004 Agent: https://8004scan.io/agents/celo/9790
- Agent wallet: `0x8aAB2E27bd9Ce18Ca44722CCE48ADCc10df0C4c4`
- USA₮ contract: `0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771`

## Open integration gap

This slice uses direct USA₮ transfers. The Celo x402 facilitator is deliberately marked as pending until a facilitator API key and credits are provisioned; the product does not claim x402 settlement yet.

## Security

Paylane never asks users to share seed phrases or private keys. Wallet secrets stay in the user's wallet and are not committed. Request payloads are schema-validated and capped before parsing, payment calldata is simulated before signing, and success requires a confirmed receipt.
