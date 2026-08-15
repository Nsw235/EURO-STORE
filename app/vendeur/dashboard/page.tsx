import { getCaDuJour } from "@/lib/vendeur-actions";
import StockSearch from "@/components/StockSearch";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ca = await getCaDuJour();

  return (
    <div className="dashboard">
      <div className="eyebrow">Chiffre d&apos;affaires du jour</div>
      <div className="ca-total">{ca.total.toFixed(0)}€</div>
      <div className="ca-meta">
        {ca.nbVentes} vente{ca.nbVentes > 1 ? "s" : ""} · panier moyen {ca.panierMoyen.toFixed(0)}€
      </div>

      <div className="section-title">Consulter le stock</div>
      <StockSearch />
    </div>
  );
}
