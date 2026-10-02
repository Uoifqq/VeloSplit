# Contributing

## Development setup

1. Install Node.js 24 or later and npm.
2. From the repository root, run `cd frontend && npm ci`.
3. Start the local app with `npm run dev`.

The prototype is Devnet-only. Use a separate test wallet with no valuable assets. Do not commit wallet secrets, `.env` files, or local invoice data.

## Changes

Keep changes focused and describe the behavior they affect. Include clear reproduction steps when reporting a bug. Before opening a pull request, review the diff and ensure no secrets or `.data` files are included.
