import { randomUUID } from "node:crypto";
import { address } from "@solana/kit";
import { amountToUnits, TOKEN_DECIMALS, type Invoice, type InvoiceRecipient } from "../../lib/invoice";
import { readInvoices, writeInvoices } from "../../lib/invoice-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!isRecord(body)) return Response.json({ error: "Invalid invoice data" }, { status: 400 });

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const amount = typeof body.amount === "string" ? body.amount.trim() : "";
  const mint = typeof body.mint === "string" ? body.mint.trim() : "";
  const rawRecipients = body.recipients;
  if (!title || title.length > 100) return Response.json({ error: "Invoice title must be between 1 and 100 characters" }, { status: 400 });
  if (body.decimals !== TOKEN_DECIMALS) return Response.json({ error: "DEMOUSD requires 6 decimal places" }, { status: 400 });
  try { amountToUnits(amount); address(mint); } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Check the amount and mint address" }, { status: 400 });
  }
  if (!Array.isArray(rawRecipients) || rawRecipients.length < 2 || rawRecipients.length > 5) {
    return Response.json({ error: "An invoice must have 2 to 5 recipients" }, { status: 400 });
  }

  const recipients: InvoiceRecipient[] = [];
  try {
    for (const item of rawRecipients) {
      if (!isRecord(item) || typeof item.name !== "string" || typeof item.wallet !== "string" || !Number.isInteger(item.percent)) {
        throw new Error("Check each recipient’s name, address, and share");
      }
      const name = item.name.trim();
      const wallet = address(item.wallet.trim());
      const percent = Number(item.percent);
      if (!name || name.length > 40 || percent < 1 || percent > 100) throw new Error("Check each recipient’s name and share");
      recipients.push({ name, wallet, percent });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid wallet address" }, { status: 400 });
  }

  if (recipients.reduce((sum, item) => sum + item.percent, 0) !== 100) {
    return Response.json({ error: "Recipient shares must add up to exactly 100%" }, { status: 400 });
  }
  if (new Set(recipients.map((item) => item.wallet)).size !== recipients.length) {
    return Response.json({ error: "Recipient wallet addresses must be unique" }, { status: 400 });
  }

  const invoices = await readInvoices();
  const invoice: Invoice = {
    id: randomUUID(),
    title,
    amount,
    mint,
    decimals: TOKEN_DECIMALS,
    recipients,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  invoices.push(invoice);
  await writeInvoices(invoices);
  return Response.json({ invoice }, { status: 201 });
}
