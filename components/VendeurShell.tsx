"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOfflineSync } from "@/lib/use-offline-sync";
import RegisterSW from "@/components/RegisterSW";

export default function VendeurShell({
  fullName,
  children,
}: {
  fullName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { isOnline, pending } = useOfflineSync();
  const initials = fullName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isCaisse = pathname.startsWith("/vendeur/caisse");

  return (
    <div className="phone-shell">
      <RegisterSW />
      <header className="phone-header">
        <div className="brand-block">
          <div className="brand-badge">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-header.png" alt="EURO STORE" className="brand-logo" />
          </div>
          <div className="brand-locale">N&apos;DJAMENA · TCHAD</div>
        </div>
        <div className="avatar">{initials}</div>
      </header>

      <div className="subtitle-row">
        {isCaisse ? "Vue vendeur · Comptoir & caisse" : "Vue vendeur · Tableau de bord"}
      </div>

      {!isOnline && (
        <div className="offline-banner">
          Mode hors-ligne — les ventes seront synchronisées au retour du réseau
          {pending > 0 ? ` (${pending} en attente)` : ""}
        </div>
      )}

      <main className="phone-content">{children}</main>

      <nav className="bottom-nav">
        <Link href="/vendeur/caisse" className={isCaisse ? "active" : ""}>
          Caisse
        </Link>
        <Link href="/vendeur/dashboard" className={!isCaisse ? "active" : ""}>
          Tableau de bord
        </Link>
      </nav>
    </div>
  );
}
