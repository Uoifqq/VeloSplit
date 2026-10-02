"use client";

import { WalletButton } from "./wallet-button";
import Link from "next/link";

export function AppHeader() {
  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="VeloSplit — Home">
        <span className="brand-mark">V<span>↗</span></span>
        <span>VELO<span className="brand-light">SPLIT</span></span>
      </Link>
      <div className="topbar-right">
        <span className="network-pill"><i /> DEVNET</span>
        <WalletButton />
      </div>
    </header>
  );
}
