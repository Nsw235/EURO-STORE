import { getStockOverview } from "@/lib/vendeur-actions";

export default async function StockOverview() {
  const { totalEnStock, ruptures, lowStock } = await getStockOverview();

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{totalEnStock}</div>
          <div className="stat-label">Articles en stock</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-value">{ruptures}</div>
          <div className="stat-label">Ruptures</div>
        </div>
      </div>

      {lowStock.length > 0 && (
        <>
          <div className="alert-label">Alertes stock bas</div>
          <div className="alert-list">
            {lowStock.map((item) => (
              <div className="alert-row" key={item.id}>
                <span className={`alert-icon ${item.category}`} aria-hidden="true" />
                <div className="alert-info">
                  <div className="alert-name">
                    {item.name}
                    {item.condition !== "neuf" ? ` · ${item.condition}` : ""}
                  </div>
                  <div className="alert-brand">{item.brand}</div>
                </div>
                <span className={`alert-badge ${item.quantity === 0 ? "out" : "low"}`}>
                  {item.quantity === 0 ? "Rupture" : `${item.quantity} restant${item.quantity > 1 ? "s" : ""}`}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
