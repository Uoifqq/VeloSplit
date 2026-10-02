import { findInvoice } from "../../../lib/invoice-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invoice not found" }, { status: 404 });
  const { invoice } = await findInvoice(id);
  if (!invoice) return Response.json({ error: "Invoice not found" }, { status: 404 });
  return Response.json({ invoice }, { headers: { "cache-control": "no-store" } });
}
