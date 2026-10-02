import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { Invoice } from "./invoice";

const dataDirectory = join(process.cwd(), ".data");
const dataFile = join(dataDirectory, "invoices.json");

export async function readInvoices(): Promise<Invoice[]> {
  try {
    const content = await readFile(dataFile, "utf8");
    const parsed: unknown = JSON.parse(content);
    return Array.isArray(parsed) ? parsed as Invoice[] : [];
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function writeInvoices(invoices: Invoice[]) {
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const temporaryFile = `${dataFile}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(invoices, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporaryFile, dataFile);
}

export async function findInvoice(id: string) {
  const invoices = await readInvoices();
  return { invoices, invoice: invoices.find((invoice) => invoice.id === id) ?? null };
}
