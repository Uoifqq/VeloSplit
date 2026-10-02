export const TOKEN_DECIMALS = 6;

export type InvoiceRecipient = {
  name: string;
  wallet: string;
  percent: number;
};

export type Invoice = {
  id: string;
  title: string;
  amount: string;
  mint: string;
  decimals: number;
  recipients: InvoiceRecipient[];
  status: "pending" | "paid";
  createdAt: string;
  paymentSignature?: string;
};

export function amountToUnits(value: string): bigint {
  const normalized = value.trim();
  const match = /^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(normalized);
  if (!match) throw new Error("Enter an amount with up to 6 decimal places");
  const units = BigInt(match[1]) * 10n ** BigInt(TOKEN_DECIMALS)
    + BigInt((match[2] ?? "").padEnd(TOKEN_DECIMALS, "0") || "0");
  if (units <= 0n) throw new Error("Amount must be greater than zero");
  return units;
}

export function allocateUnits(total: bigint, recipients: InvoiceRecipient[]): bigint[] {
  let assigned = 0n;
  return recipients.map((recipient, index) => {
    const value = index === recipients.length - 1
      ? total - assigned
      : (total * BigInt(recipient.percent)) / 100n;
    assigned += value;
    return value;
  });
}
