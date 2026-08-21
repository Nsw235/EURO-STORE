import { getCaComparaison, getVentesRecentes, getCaSparkline } from "@/lib/vendeur-actions";
import StockOverview from "@/components/StockOverview";
import StockSearch from "@/components/StockSearch";
import { formatDual } from "@/lib/currency";

export const dynamic = "force-dynamic";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.max(1, Math.round(diffMs / 60000));
  if (min < 60) return `Il y a ${min} min`;
  const h = Math.round(min / 60);
  return `Il y a ${h} h`;
}

export default async function DashboardPage() {
  const [ca, ventes, spark] = await Promise.all([getCaComparaison(), getVentesRecentes(4), getCaSparkline()]);
  const total = formatDual(ca.total);
  const panierMoyen = formatDual(ca.panierMoyen);

  // Sparkline : courbe réelle du cumul de CA panier par panier aujourd'hui.
  // Avec 0-1 panier il n'y a rien à tracer — on masque le graphe plutôt que
  // d'inventer une tendance.
  const max = Math.max(...spark, 1);
  const sparkPoints =
    spark.length >= 2
      ? spark.map((v, i) => `${(i / (spark.length - 1)) * 300},${34 - (v / max) * 30}`).join(" ")
      : null;

  return (
    <div className="dashboard">
      <div className="ca-card">
        <div className="ca-card-head">
          <div>
            <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 5 }}>
              CA DU JOUR
              <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--gold)" stroke="none">
                <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" />
              </svg>
            </div>
            <div className="ca-total price-fcfa" style={{ fontSize: 28, whiteSpace: "nowrap" }}>
              {total.fcfa} FCFA
            </div>
          </div>
          {ca.variationPct !== null && (
            <span className={`trend-pill ${ca.variationPct < 0 ? "down" : ""}`}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                {ca.variationPct < 0 ? <path d="M7 7l5 5 4-4 6 6M17 6v6h-6" /> : <path d="M7 17l5-5 4 4 6-6M17 6h6v6" />}
              </svg>
              {ca.variationPct > 0 ? "+" : ""}
              {ca.variationPct}%
            </span>
          )}
        </div>
        <div className="price-eur">
          ≈ {total.eur} € · {ca.nbVentes} vente{ca.nbVentes > 1 ? "s" : ""} · panier moyen {panierMoyen.fcfa} F
        </div>
        {sparkPoints && (
          <svg width="100%" height="34" viewBox="0 0 300 34" style={{ marginTop: 12, display: "block" }} preserveAspectRatio="none">
            <polyline
              points={sparkPoints}
              fill="none"
              stroke="var(--gold)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.85"
            />
            <circle cx="300" cy={34 - (spark[spark.length - 1] / max) * 30} r="3" fill="var(--gold-light)" />
          </svg>
        )}
      </div>

      <button className="btn-gold" style={{ width: "100%", marginBottom: 20 }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" style={{ marginRight: 9, verticalAlign: -3 }}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a4 4 0 0 1 8 0v2" />
          <circle cx="12" cy="13.5" r="1.6" />
        </svg>
        Nouvelle vente
      </button>

      <div className="section-title">Stock</div>
      <StockOverview />

      <div className="section-title" style={{ marginTop: 4 }}>
        Rechercher un article
      </div>
      <StockSearch />

      <div className="section-title" style={{ marginTop: 20 }}>
        Ventes récentes
      </div>
      {ventes.length === 0 ? (
        <div className="empty">Aucune vente enregistrée pour le moment.</div>
      ) : (
        <div>
          {ventes.map((v) => {
            const amount = formatDual(v.total);
            return (
              <div className="sale-row" key={v.id}>
                <div className="sale-check">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="sale-info">
                  <span className="sale-id">{v.displayId}</span>
                  <span className="sale-time">{timeAgo(v.soldAt)}</span>
                </div>
                <span className="sale-amount">{amount.fcfa} FCFA</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
