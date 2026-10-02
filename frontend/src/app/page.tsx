"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import {
  address,
  type Address,
  type Instruction,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  useConnectedWallet,
} from "@solana/kit-plugin-wallet/react";
import { toast } from "sonner";
import { WalletButton } from "./components/wallet-button";
import { useAppClient } from "./lib/client-provider";
import { useCluster } from "./components/cluster-context";
import { amountToUnits, allocateUnits, type Invoice } from "./lib/invoice";

type DraftRecipient = { name: string; wallet: string; percent: string };
type CreatedInvoice = { invoice: Invoice; url: string };

const MINT_KEY = "splitpay-demo-mint";
const emptyRecipient = (): DraftRecipient => ({ name: "", wallet: "", percent: "" });
const subscribeToHydration = () => () => {};

function formatUnits(units: bigint, decimals = 6) {
  const scale = 10n ** BigInt(decimals);
  const whole = units / scale;
  const fraction = (units % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function shortAddress(value: string) {
  return `${value.slice(0, 5)}…${value.slice(-5)}`;
}

function WalletConnectInline() {
  const client = useAppClient();
  const connected = useConnectedWallet(client);
  return connected ? (
    <div className="wallet-ready"><span className="status-dot" /> Wallet connected · {shortAddress(connected.account.address)}</div>
  ) : (
    <div className="wallet-hint">Connect a wallet using the button above to continue.</div>
  );
}

export default function Home() {
  const client = useAppClient();
  const connected = useConnectedWallet(client);
  const { getExplorerUrl } = useCluster();
  const isHydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const invoiceId = isHydrated ? new URLSearchParams(window.location.search).get("invoice") : null;
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [created, setCreated] = useState<CreatedInvoice | null>(null);
  const [invoiceLoadError, setInvoiceLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingSignature, setPendingSignature] = useState("");
  const [demoMintState, setDemoMint] = useState("");
  const demoMint = demoMintState || (isHydrated ? localStorage.getItem(MINT_KEY) ?? "" : "");
  const [mintAmount, setMintAmount] = useState("10000");
  const [topupWallet, setTopupWallet] = useState("");
  const [topupAmount, setTopupAmount] = useState("100");
  const [title, setTitle] = useState("Project payment");
  const [amount, setAmount] = useState("100");
  const [recipients, setRecipients] = useState<DraftRecipient[]>([
    { name: "Design", wallet: "", percent: "60" },
    { name: "Development", wallet: "", percent: "40" },
  ]);
  const splitTotal = recipients.reduce((sum, recipient) => sum + Number(recipient.percent || 0), 0);
  const splitIsValid = splitTotal === 100;
  let previewAmounts: string[] = [];
  try {
    if (splitIsValid) {
      const previewUnits = allocateUnits(
        amountToUnits(amount),
        recipients.map((recipient) => ({ ...recipient, percent: Number(recipient.percent) })),
      );
      previewAmounts = previewUnits.map((units) => formatUnits(units));
    }
  } catch {
    previewAmounts = [];
  }

  useEffect(() => {
    if (!invoiceId || !/^[0-9a-f-]{36}$/i.test(invoiceId)) return;
    let active = true;
    void fetch(`/api/invoices/${invoiceId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not load invoice");
        return body.invoice as Invoice;
      })
      .then((loadedInvoice) => {
        if (!active) return;
        setInvoice(loadedInvoice);
        const savedSignature = localStorage.getItem(`splitpay-pending-${invoiceId}`) ?? "";
        setPendingSignature(loadedInvoice.status === "paid" ? "" : savedSignature);
        if (loadedInvoice.status === "paid") localStorage.removeItem(`splitpay-pending-${invoiceId}`);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setInvoiceLoadError(true);
        toast.error(error instanceof Error ? error.message : "Could not load invoice");
      });
    return () => { active = false; };
  }, [invoiceId]);

  const updateRecipient = (index: number, field: keyof DraftRecipient, value: string) => {
    setRecipients((current) => current.map((recipient, i) => i === index ? { ...recipient, [field]: value } : recipient));
  };

  const createDemoMint = async () => {
    if (!connected?.signer) {
      toast.error("Connect a wallet first");
      return;
    }
    setBusy(true);
    try {
      const mintSigner = await import("@solana/kit").then(({ generateKeyPairSigner }) => generateKeyPairSigner());
      const result = await client.token.instructions.createMint({
        newMint: mintSigner,
        decimals: 6,
        mintAuthority: connected.signer.address,
      }).sendTransaction();
      setDemoMint(mintSigner.address);
      localStorage.setItem(MINT_KEY, mintSigner.address);
      toast.success("DEMOUSD created on Devnet", {
        description: <a href={getExplorerUrl(`/address/${mintSigner.address}`)} target="_blank" rel="noreferrer" className="underline">View mint in Explorer</a>,
      });
      void result;
    } catch (error) {
      console.error(error);
      toast.error("Could not create the test token. Make sure you have SOL for Devnet fees.");
    } finally {
      setBusy(false);
    }
  };

  const mintDemoTokens = async () => {
    if (!connected?.signer || !demoMint) return;
    let units: bigint;
    try { units = amountToUnits(mintAmount); } catch (error) {
      toast.error(error instanceof Error ? error.message : "Check the amount");
      return;
    }
    setBusy(true);
    try {
      const mint = address(demoMint);
      const signature = await client.token.instructions.mintToATA({
        mint,
        owner: connected.signer.address,
        mintAuthority: connected.signer,
        amount: units,
        decimals: 6,
      }).sendTransaction();
      toast.success("Test tokens minted", {
        description: <a href={getExplorerUrl(`/tx/${signature.context.signature}`)} target="_blank" rel="noreferrer" className="underline">View transaction</a>,
      });
    } catch (error) {
      console.error(error);
      toast.error("Could not mint tokens. Only the wallet that created the mint can do this.");
    } finally { setBusy(false); }
  };

  const sendDemoTokens = async () => {
    if (!connected?.signer || !demoMint) return;
    let recipient: Address;
    let units: bigint;
    try {
      recipient = address(topupWallet.trim());
      units = amountToUnits(topupAmount);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Check the address and amount");
      return;
    }
    setBusy(true);
    try {
      const signature = await client.token.instructions.transferToATA({
        mint: address(demoMint),
        authority: connected.signer,
        recipient,
        amount: units,
        decimals: 6,
      }).sendTransaction();
      toast.success("Test tokens sent", {
        description: <a href={getExplorerUrl(`/tx/${signature.context.signature}`)} target="_blank" rel="noreferrer" className="underline">View transaction</a>,
      });
    } catch (error) {
      console.error(error);
      toast.error("Transfer failed. Check your DEMOUSD and SOL balances on Devnet.");
    } finally { setBusy(false); }
  };

  const createInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!demoMint) {
      toast.error("Create a demo token on Devnet first");
      return;
    }
    try {
      amountToUnits(amount);
      const cleanRecipients = recipients.map((recipient) => ({
        name: recipient.name.trim(),
        wallet: address(recipient.wallet.trim()),
        percent: Number(recipient.percent),
      }));
      if (cleanRecipients.some((recipient) => !recipient.name || !Number.isInteger(recipient.percent) || recipient.percent < 1 || recipient.percent > 100)) {
        throw new Error("Enter a name, wallet address, and whole-number share from 1 to 100% for each recipient");
      }
      if (cleanRecipients.reduce((sum, recipient) => sum + recipient.percent, 0) !== 100) {
        throw new Error("Shares must add up to exactly 100%");
      }
      if (new Set(cleanRecipients.map((recipient) => recipient.wallet)).size !== cleanRecipients.length) {
        throw new Error("Each recipient must have a unique wallet address");
      }
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), amount, mint: demoMint, decimals: 6, recipients: cleanRecipients }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create invoice");
      const url = `${window.location.origin}/?invoice=${body.invoice.id}`;
      setCreated({ invoice: body.invoice as Invoice, url });
      toast.success("Invoice created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Check the invoice details");
    }
  };

  const payInvoice = async () => {
    if (!invoice || !connected?.signer || invoice.status === "paid") return;
    setBusy(true);
    try {
      const mint = address(invoice.mint);
      const payer = connected.signer;
      const [source] = await findAssociatedTokenPda({ owner: payer.address, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
      const allocations = allocateUnits(amountToUnits(invoice.amount), invoice.recipients);
      const instructions: Instruction[] = [];
      for (const [index, recipient] of invoice.recipients.entries()) {
        const owner = address(recipient.wallet);
        // A payer who is also a recipient already owns their share. A token
        // transfer from an ATA back to itself can fail during simulation.
        if (owner === payer.address) continue;
        const [ata] = await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
        instructions.push(getCreateAssociatedTokenIdempotentInstruction({ payer, ata, owner, mint }));
        instructions.push(getTransferCheckedInstruction({
          source,
          mint,
          destination: ata,
          authority: payer,
          amount: allocations[index],
          decimals: invoice.decimals,
        }));
      }
      const result = await client.sendTransaction(instructions);
      const signature = result.context.signature;
      setPendingSignature(signature);
      localStorage.setItem(`splitpay-pending-${invoice.id}`, signature);
      const response = await fetch(`/api/invoices/${invoice.id}/payment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signature }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Payment submitted but not yet confirmed by the app. Refresh the page in a few seconds.");
      setInvoice(body.invoice as Invoice);
      setPendingSignature("");
      localStorage.removeItem(`splitpay-pending-${invoice.id}`);
      toast.success("Payment confirmed", {
        description: <a href={getExplorerUrl(`/tx/${signature}`)} target="_blank" rel="noreferrer" className="underline">View transaction</a>,
      });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Payment failed");
    } finally { setBusy(false); }
  };

  const retryPaymentVerification = async () => {
    if (!invoice || !pendingSignature) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/invoices/${invoice.id}/payment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signature: pendingSignature }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Transaction is not confirmed yet. Try again in a few seconds.");
      setInvoice(body.invoice as Invoice);
      setPendingSignature("");
      localStorage.removeItem(`splitpay-pending-${invoice.id}`);
      toast.success("Payment confirmed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not verify transaction");
    } finally { setBusy(false); }
  };

  const copyText = async (text: string, success: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(success); }
    catch { toast.error("Could not copy. Select the link and copy it manually."); }
  };

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> TEAM PAYMENTS <i /> SOLANA DEVNET</div>
          <h1>One invoice.<br /><span>The whole team.</span></h1>
          <p>One link for your client. The exact amount goes straight to each team member’s wallet.</p>
        </div>
        <div className="hero-note"><span className="note-icon">↗</span><div><strong>Funds go directly to recipients</strong><small>VeloSplit never holds funds or asks for your seed phrase.</small></div><span className="hero-note-rule" /></div>
      </section>

      <WalletConnectInline />

      {invoiceId ? (
        <InvoiceView invoice={invoice} loading={!invoice && !invoiceLoadError} connected={Boolean(connected?.signer)} busy={busy} pendingSignature={pendingSignature} onPay={payInvoice} onVerify={retryPaymentVerification} onCopy={copyText} />
      ) : (
        <div className="workspace-grid">
          <section className="panel invoice-panel">
            <div className="panel-heading"><div><div className="step-label">01 / NEW INVOICE</div><h2>Create an invoice</h2><p className="panel-subtitle">Set the amount and split it between team members.</p></div><span className="panel-mark">↗</span></div>
            <form onSubmit={createInvoice} className="form-stack">
              <label className="field"><span>What is this payment for?</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required placeholder="For example, product launch landing page" /></label>
              <div className="field-row">
                <label className="field"><span>Amount, DEMOUSD</span><input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0.000001" step="0.000001" required /></label>
                <div className="field"><span>Network</span><div className="readonly-value"><i className="status-dot" /> Solana devnet</div></div>
              </div>
              <div className="recipient-heading"><span>Split between team members</span><small>{recipients.length} of 5 recipients</small></div>
              <div className="recipient-list">
                {recipients.map((recipient, index) => (
                  <div className="recipient-row" key={index}>
                    <span className="recipient-index">0{index + 1}</span>
                    <input aria-label={`Name or role for recipient ${index + 1}`} value={recipient.name} onChange={(e) => updateRecipient(index, "name", e.target.value)} placeholder="Name or role" required />
                    <input aria-label={`Wallet address for recipient ${index + 1}`} className="wallet-input" value={recipient.wallet} onChange={(e) => updateRecipient(index, "wallet", e.target.value)} placeholder="Wallet address" spellCheck={false} autoCapitalize="none" required />
                    <label className="percent-input"><input aria-label={`Share for recipient ${index + 1}`} value={recipient.percent} onChange={(e) => updateRecipient(index, "percent", e.target.value)} type="number" min="1" max="100" step="1" required /><span>%</span></label>
                    {recipients.length > 2 && <button type="button" className="icon-button remove-recipient" aria-label="Remove recipient" onClick={() => setRecipients((current) => current.filter((_, i) => i !== index))}>×</button>}
                  </div>
                ))}
              </div>
              {recipients.length < 5 && <button type="button" className="add-recipient" onClick={() => setRecipients((current) => [...current, emptyRecipient()])}>＋ Add recipient</button>}
              <div className="split-meter" role="progressbar" aria-label="Payment distribution" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(splitTotal, 100)}><span className={splitIsValid ? "complete" : splitTotal > 100 ? "over" : ""} style={{ width: `${Math.min(splitTotal, 100)}%` }} /></div>
              <div className="split-total"><span>Allocated</span><strong className={splitIsValid ? "good" : "bad"}>{splitTotal}% <small>/ 100%</small></strong></div>
              {!splitIsValid && <p className="split-feedback" role="status">{splitTotal < 100 ? `Add another ${100 - splitTotal}% to recipient shares.` : `Reduce shares by ${splitTotal - 100}%, so the total is 100%.`}</p>}
              <button className="primary-button" disabled={busy || !connected?.signer || !demoMint || recipients.length < 2 || recipients.length > 5 || !splitIsValid} type="submit">Create payment link <span>→</span></button>
              {!demoMint && <p className="field-help">Create a test token in the “Devnet setup” section below first.</p>}
            </form>
            {created && <div className="created-card"><div className="created-icon">✓</div><div className="created-content"><strong>Invoice ready to share</strong><span>{created.url}</span><div className="created-actions"><a href={created.url}>Open invoice</a><button onClick={() => void copyText(created.url, "Link copied")}>Copy link</button></div></div></div>}
          </section>

          <aside className="side-column">
            <section className="settlement-card">
              <div className="settlement-top"><div><div className="step-label">PREVIEW</div><h2>Who gets paid</h2></div><span className="settlement-chip"><i /> LIVE</span></div>
              <div className="settlement-total"><span>Total amount</span><strong>{amount || "0"}<small> DEMOUSD</small></strong></div>
              <div className="settlement-list">
                {recipients.map((recipient, index) => (
                  <div className="settlement-item" key={`preview-${index}`}>
                    <span className={`settlement-avatar tone-${index % 4}`}>{(recipient.name || `R${index + 1}`).slice(0, 1).toUpperCase()}</span>
                    <div className="settlement-person"><strong>{recipient.name || `Recipient ${index + 1}`}</strong><div className="settlement-track"><span style={{ width: `${Math.min(100, Math.max(0, Number(recipient.percent) || 0))}%` }} /></div></div>
                    <div className="settlement-share"><strong>{previewAmounts[index] ?? "—"}</strong><small>{recipient.percent || 0}%</small></div>
                  </div>
                ))}
              </div>
              <div className="settlement-bottom"><span className="settlement-lock">↗</span><span>One signature — direct transfers to everyone</span></div>
            </section>

            <section className="panel setup-panel">
              <div className="panel-heading"><div><div className="step-label">GETTING STARTED</div><h2>Devnet setup</h2></div><span className="setup-symbol">◎</span></div>
              <p className="panel-intro">Create your own test token for the demo. It only works on Devnet and has no real-world value.</p>
              {!demoMint ? (
                <button className="secondary-button" onClick={() => void createDemoMint()} disabled={busy || !connected?.signer}>{busy ? "Please wait…" : "Create DEMOUSD"}</button>
              ) : (
                <>
                  <div className="mint-address"><span>MINT ADDRESS</span><a href={getExplorerUrl(`/address/${demoMint}`)} target="_blank" rel="noreferrer">{shortAddress(demoMint)} ↗</a></div>
                  <label className="field compact-field"><span>Mint test tokens to your wallet</span><div className="inline-control"><input value={mintAmount} onChange={(e) => setMintAmount(e.target.value)} type="number" min="0.000001" step="0.000001" /><button className="secondary-button" onClick={() => void mintDemoTokens()} disabled={busy || !connected?.signer}>Mint</button></div></label>
                  <div className="divider" />
                  <label className="field compact-field"><span>Send test tokens to the payer</span><input value={topupWallet} onChange={(e) => setTopupWallet(e.target.value)} placeholder="Client wallet address" spellCheck={false} autoCapitalize="none" /></label>
                  <div className="inline-control topup-control"><input aria-label="Test token amount" value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} type="number" min="0.000001" step="0.000001" /><button className="secondary-button" onClick={() => void sendDemoTokens()} disabled={busy || !connected?.signer || !topupWallet}>Send</button></div>
                </>
              )}
              <div className="warning-box"><span>!</span><p>Transactions require SOL on Devnet. Use a separate test wallet with no valuable assets.</p></div>
            </section>

            <section className="how-card"><div className="step-label">HOW IT WORKS</div><ol><li><span>1</span><p><strong>Create an invoice</strong><small>Add team wallet addresses and shares.</small></p></li><li><span>2</span><p><strong>Share the link</strong><small>The client will see the exact split.</small></p></li><li><span>3</span><p><strong>Get paid</strong><small>One signature — transfers to everyone.</small></p></li></ol></section>
          </aside>
        </div>
      )}

      <footer className="app-footer"><span>VELOSPLIT <i>·</i> DEMO BUILD</span><span>Devnet only · No real payments</span></footer>
    </main>
  );
}

function InvoiceView({
  invoice,
  loading,
  connected,
  busy,
  pendingSignature,
  onPay,
  onVerify,
  onCopy,
}: {
  invoice: Invoice | null;
  loading: boolean;
  connected: boolean;
  busy: boolean;
  pendingSignature: string;
  onPay: () => void;
  onVerify: () => void;
  onCopy: (text: string, success: string) => void;
}) {
  const { getExplorerUrl } = useCluster();
  if (loading || !invoice) return <section className="panel invoice-view"><div className="step-label">INVOICE</div><h2>{loading ? "Loading invoice…" : "Invoice not found"}</h2><Link className="back-link" href="/">← Create an invoice</Link></section>;
  const allocation = allocateUnits(amountToUnits(invoice.amount), invoice.recipients);
  return (
    <section className="panel invoice-view">
      <div className="invoice-view-top"><div><div className="step-label">INVOICE VELOSPLIT · DEVNET</div><h2>{invoice.title}</h2></div><span className={`status-pill ${invoice.status}`}>{invoice.status === "paid" ? "Paid" : "Awaiting payment"}</span></div>
      <div className="invoice-amount"><span>Total due</span><strong>{invoice.amount}<small> DEMOUSD</small></strong><code>Test token · {shortAddress(invoice.mint)}</code></div>
      <div className="recipient-heading"><span>Payment distribution</span><small>{invoice.recipients.length} recipient(s)</small></div>
      <div className="payee-list">{invoice.recipients.map((recipient, index) => <div className="payee-row" key={recipient.wallet}><span className="payee-avatar">{recipient.name.slice(0, 1).toUpperCase()}</span><div className="payee-info"><strong>{recipient.name}</strong><code>{shortAddress(recipient.wallet)}</code></div><div className="payee-amount"><strong>{formatUnits(allocation[index])}</strong><small>{recipient.percent}%</small></div></div>)}</div>
      {invoice.status === "paid" && invoice.paymentSignature ? (
        <div className="paid-box"><span className="paid-check">✓</span><div><strong>Transaction confirmed</strong><a href={getExplorerUrl(`/tx/${invoice.paymentSignature}`)} target="_blank" rel="noreferrer">View in Solana Explorer ↗</a></div></div>
      ) : (
        <>
          <div className="sign-note"><span>i</span><p>Funds will go directly to the recipients. The payer also covers network fees and the creation of any missing token accounts. Check the addresses and amount in your wallet before signing.</p></div>
          {pendingSignature ? <><div className="paid-box pending-box"><span className="paid-check">…</span><div><strong>Transaction submitted; checking confirmation</strong><a href={getExplorerUrl(`/tx/${pendingSignature}`)} target="_blank" rel="noreferrer">View in Explorer ↗</a></div></div><button className="secondary-button verify-button" disabled={busy} onClick={onVerify}>{busy ? "Checking…" : "Check status again"}</button></> : connected ? <button className="primary-button pay-button" disabled={busy} onClick={onPay}>{busy ? "Waiting for confirmation…" : `Pay ${invoice.amount} DEMOUSD`} <span>→</span></button> : <div className="connect-prompt"><p>Connect a Devnet wallet to pay.</p><WalletButton /></div>}
        </>
      )}
      <button className="copy-invoice" onClick={() => void onCopy(window.location.href, "Invoice link copied")}>Copy invoice link</button>
      <Link className="back-link" href="/">← Back to invoice creation</Link>
    </section>
  );
}
