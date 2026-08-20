import { getCaDuJour } from "@/lib/vendeur-actions";
import StockOverview from "@/components/StockOverview";
import StockSearch from "@/components/StockSearch";
import { formatDual } from "@/lib/currency";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ca = await getCaDuJour();
  const total = formatDual(ca.total);
  const panierMoyen = formatDual(ca.panierMoyen);

  return (
    <div className="dashboard">
      <div className="eyebrow">Chiffre d&apos;affaires du jour</div>
      <div className="ca-total price-fcfa">{total.fcfa} FCFA</div>
      <div className="price-eur">≈ {total.eur} €</div>
      <div className="ca-meta">
        {ca.nbVentes} vente{ca.nbVentes > 1 ? "s" : ""} · panier moyen {panierMoyen.fcfa} FCFA (≈ {panierMoyen.eur} €)
      </div>

      <div className="section-title">Stock</div>
      <StockOverview />

      <div className="section-title" style={{ marginTop: 4 }}>
        Rechercher un article
      </div>
      <StockSearch />
    </div>
  );
}
