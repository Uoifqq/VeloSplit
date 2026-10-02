# API Reference

All routes are Next.js Node.js API routes. Responses are JSON.

## `POST /api/invoices`

Creates an invoice. The request contains `title`, `amount`, `mint`, `decimals`, and `recipients` (each with `name`, `wallet`, and integer `percent`). The title is limited to 100 characters; recipient names to 40 characters; there must be 2–5 unique wallets and shares must total 100%. DEMOUSD invoices use six decimals.

Returns `{ "invoice": ... }` with status `201`, or `{ "error": "..." }` with status `400` for invalid input.

## `GET /api/invoices/{id}`

Returns `{ "invoice": ... }` for a valid invoice ID. Unknown IDs return `404`.

## `POST /api/invoices/{id}/payment`

Request body: `{ "signature": "<base58 transaction signature>" }`.

The API checks the transaction on Solana Devnet, validates the expected token transfers, and marks the invoice paid when they match. Responses use `{ "invoice": ... }` on success or `{ "error": "..." }` with an appropriate HTTP status when the invoice, signature, network response, or transfers cannot be verified.
