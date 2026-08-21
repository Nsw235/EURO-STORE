import { getStockOverview } from "@/lib/vendeur-actions";

export default async function StockOverview() {
  const { totalEnStock, ruptures, lowStock } = await getStockOverview();
  const totalProduits = totalEnStock + ruptures || 1;
  const blueRatio = Math.max(Math.round((totalEnStock / totalProduits) * 100), totalEnStock > 0 ? 12 : 0);
  const redRatio = Math.max(Math.round((ruptures / totalProduits) * 100), ruptures > 0 ? 12 : 0);

  return (
    <div>
      <div className="stock-card-row">
        <div className="stock-icon-card">
          <div className="stock-icon-sq blue">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div className="value">{totalEnStock}</div>
          <div className="label blue">En stock</div>
          <div className="stock-bar">
            <div className="stock-bar-fill" style={{ width: `${blueRatio}%` }} />
          </div>
        </div>
        <div className="stock-icon-card">
          <div className="stock-icon-sq danger">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div className="value danger">{ruptures}</div>
          <div className="label danger">Ruptures</div>
          <div className="stock-bar">
            <div className="stock-bar-fill danger" style={{ width: `${redRatio}%` }} />
          </div>
        </div>
      </div>

      {lowStock.length > 0 && (
        <>
          <div className="alert-label">Alertes stock faible</div>
          <div className="alert-list">
            {lowStock.map((item) => (
              <div className="alert-row" key={item.id}>
                <span className={`alert-icon ${item.category} ${item.quantity <= 1 ? "danger" : ""}`} aria-hidden="true" />
                <div className="alert-info">
                  <div className="alert-name">{item.name}</div>
                  <div className="alert-brand">{item.ean}</div>
                </div>
                <span className={`alert-badge ${item.quantity <= 1 ? "out" : "low"}`}>
                  {item.quantity} stock
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
