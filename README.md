# Paylane

Paylane is a bounded payment-collection agent for real communities and merchants on Celo.

It turns a concrete collection request into a reviewable payment mandate, accepts stablecoin payments through Celo-native rails, reconciles each payment for the organiser, and refuses requests that exceed the approved recipient, amount, or deadline.

## Hackathon focus

Paylane is being built for the Celo **Agents at Work Hackathon**.

- Primary track: Real World Adoption
- Target bounty: Best Stablecoin Adoption
- Network: Celo Mainnet

## Status

Registration and the initial agent identity are in progress. Product implementation will begin with one real end-to-end payment collection flow and an inspectable rejected-mandate state.

## Security

Paylane never asks users to share seed phrases or private keys. Wallet secrets are held outside this repository and will not be committed.

