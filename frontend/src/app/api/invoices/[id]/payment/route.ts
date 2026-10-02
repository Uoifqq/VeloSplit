import { address } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { allocateUnits, amountToUnits } from "../../../../lib/invoice";
import { findInvoice, writeInvoices } from "../../../../lib/invoice-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParsedInstruction = {
  program?: string;
  parsed?: {
    type?: string;
    info?: {
      mint?: string;
      source?: string;
      destination?: string;
      authority?: string;
      tokenAmount?: { amount?: string; decimals?: number };
    };
  };
};
type ParsedTransaction = {
  meta?: { err?: unknown } | null;
  transaction?: { message?: { instructions?: unknown } };
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invoice not found" }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || !("signature" in body) || typeof body.signature !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(body.signature)) {
    return Response.json({ error: "Invalid transaction signature" }, { status: 400 });
  }
  const signature = body.signature;
  const { invoices, invoice } = await findInvoice(id);
  if (!invoice) return Response.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.status === "paid") {
    return invoice.paymentSignature === signature
      ? Response.json({ invoice })
      : Response.json({ error: "This invoice has already been paid" }, { status: 409 });
  }
  if (invoices.some((item) => item.id !== id && item.paymentSignature === signature)) {
    return Response.json({ error: "This transaction has already been used for another invoice" }, { status: 409 });
  }

  let transaction: ParsedTransaction | null;
  try {
    const rpcResponse = await fetch("https://api.devnet.solana.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "splitpay-verify",
        method: "getTransaction",
        params: [signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const rpcBody: unknown = await rpcResponse.json();
    if (!rpcResponse.ok || !rpcBody || typeof rpcBody !== "object" || !("result" in rpcBody)) {
      return Response.json({ error: "Could not verify the transaction on Solana Devnet. Try refreshing the page." }, { status: 503 });
    }
    transaction = (rpcBody.result ?? null) as ParsedTransaction | null;
  } catch {
    return Response.json({ error: "Solana Devnet did not respond. The transaction may have been submitted; refresh the invoice in a few seconds." }, { status: 503 });
  }

  if (!transaction) return Response.json({ error: "Transaction not found on Devnet yet. Refresh the page in a few seconds." }, { status: 425 });
  if (transaction.meta?.err) return Response.json({ error: "The transaction failed on the network" }, { status: 422 });

  let expected: Map<string, bigint>;
  try {
    const allocations = allocateUnits(amountToUnits(invoice.amount), invoice.recipients);
    expected = new Map();
    for (const [index, recipient] of invoice.recipients.entries()) {
      const [ata] = await findAssociatedTokenPda({
        owner: address(recipient.wallet),
        mint: address(invoice.mint),
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
      expected.set(ata, allocations[index]);
    }
  } catch {
    return Response.json({ error: "Could not verify recipient details" }, { status: 500 });
  }

  const rawInstructions = transaction.transaction?.message?.instructions;
  if (!Array.isArray(rawInstructions)) return Response.json({ error: "No transfer instructions found in the transaction" }, { status: 422 });
  const transfers = (rawInstructions as ParsedInstruction[]).filter((instruction) =>
    instruction.program === "spl-token" && instruction.parsed?.type === "transferChecked"
  );
  if (transfers.length === 0) return Response.json({ error: "No recipient transfers found in the transaction" }, { status: 422 });

  const firstTransfer = transfers[0].parsed?.info;
  const commonAuthority = firstTransfer?.authority;
  const commonSource = firstTransfer?.source;
  if (!commonAuthority || !commonSource) return Response.json({ error: "Could not identify the payer" }, { status: 422 });
  if (transfers.some((transfer) => transfer.parsed?.info?.authority !== commonAuthority || transfer.parsed?.info?.source !== commonSource)) {
    return Response.json({ error: "All invoice transfers must come from the same payer" }, { status: 422 });
  }

  try {
    const [payerAta] = await findAssociatedTokenPda({
      owner: address(commonAuthority),
      mint: address(invoice.mint),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    if (payerAta !== commonSource) return Response.json({ error: "The transfer source does not belong to the payer" }, { status: 422 });
    // The payer's own allocation remains in their wallet; it is not an
    // outgoing transfer and must not be included in the signed transaction.
    expected.delete(payerAta);
  } catch {
    return Response.json({ error: "Could not verify the payer wallet" }, { status: 422 });
  }

  if (transfers.length !== expected.size) {
    return Response.json({ error: "The transaction does not contain exactly the expected transfers to recipients" }, { status: 422 });
  }

  for (const transfer of transfers) {
    const info = transfer.parsed?.info;
    const amount = info?.tokenAmount?.amount;
    if (!info || !amount || !info.mint || !info.destination || !info.authority || !info.source) {
      return Response.json({ error: "Could not read a transfer from the transaction" }, { status: 422 });
    }
    if (info.mint !== invoice.mint || info.tokenAmount?.decimals !== invoice.decimals) {
      return Response.json({ error: "The transaction token does not match the invoice token" }, { status: 422 });
    }
    const expectedAmount = expected.get(info.destination);
    if (expectedAmount === undefined || BigInt(amount) !== expectedAmount) {
      return Response.json({ error: "The amount or recipient address does not match the invoice" }, { status: 422 });
    }
    expected.delete(info.destination);
  }
  if (expected.size !== 0) {
    return Response.json({ error: "The transaction is missing transfers to one or more recipients" }, { status: 422 });
  }

  const updated = { ...invoice, status: "paid" as const, paymentSignature: signature };
  await writeInvoices(invoices.map((item) => item.id === id ? updated : item));
  return Response.json({ invoice: updated });
}
