# Architecture

VeloSplit is a Next.js app with client-side wallet interaction and server API routes for invoice records and payment verification.

## Components

- `frontend/src/app`: pages, layout, API routes, components, and client logic.
- Wallet connection: Solana Wallet Standard through `@solana/react` and `@solana/kit`.
- Invoice API: creates and reads invoices, and accepts a submitted transaction signature for verification.
- Invoice store: reads and writes JSON at `.data/invoices.json` relative to the frontend process working directory.
- Solana Devnet RPC: queried by the payment endpoint to verify the submitted transaction and its transfers.

## Payment flow

1. The team creates an invoice with a token mint, total amount, and 2–5 recipients whose percentages total 100%.
2. The payer opens the invoice and connects a wallet configured for Devnet.
3. The browser prepares the SPL token transfers and asks the payer's wallet to sign and submit the transaction.
4. The browser sends the transaction signature to the invoice payment endpoint.
5. The API fetches the confirmed transaction from the Devnet RPC, checks the mint, decimals, source, destination wallets, and allocated amounts, then marks the invoice paid.

## Storage and hosting

Invoice records are stored in a local JSON file. This works for a single local process but is not durable or shared across serverless instances. A hosted deployment needs persistent shared storage before invoice creation and payment verification can be relied on across requests.

The app is Devnet-only. DEMOUSD is a test token and has no real-world value.
