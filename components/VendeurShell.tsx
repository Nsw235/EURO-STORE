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

  const now = new Date();
  const dateLabel = now.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const dateLabelCapitalized = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
  const timeLabel = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="phone-shell">
      <RegisterSW />
      <header className="phone-header">
        <div className="brand-block">
          <div className="brand-mark">E</div>
          <div className="brand-wordmark">EURO STORE N&apos;DJAMENA</div>
        </div>
        <div className="avatar">{initials}</div>
      </header>

      <div className="datetime-row">
        <span className="datetime-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
          {timeLabel} · {dateLabelCapitalized}
        </span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
      </div>

      {!isOnline && (
        <div className="offline-banner">
          Mode hors-ligne — les ventes seront synchronisées au retour du réseau
          {pending > 0 ? ` (${pending} en attente)` : ""}
        </div>
      )}

      <main className="phone-content">{children}</main>

      <nav className="bottom-nav">
        <Link href="/vendeur/dashboard" className={!isCaisse ? "active" : ""}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="9" rx="1.5" />
            <rect x="14" y="3" width="7" height="5" rx="1.5" />
            <rect x="14" y="12" width="7" height="9" rx="1.5" />
            <rect x="3" y="16" width="7" height="5" rx="1.5" />
          </svg>
          Tableau de bord
        </Link>
        <Link href="/vendeur/caisse" className={isCaisse ? "active" : ""}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M8 7V5a4 4 0 0 1 8 0v2" />
          </svg>
          Caisse
        </Link>
      </nav>
    </div>
  );
}
