"use client";

import { useEffect, useState, useTransition } from "react";
import { searchStock } from "@/lib/vendeur-actions";

type Row = { id: string; ean: string; name: string; brand: string; price: number; quantity: number };

export default function StockSearch() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timeout = setTimeout(() => {
      startTransition(async () => {
        setRows(await searchStock(query));
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div>
      <input
        className="search-input"
        placeholder="Rechercher un article..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="stock-list">
        {rows.map((r) => (
          <div key={r.id} className="stock-row">
            <div>
              <div className="stock-name">{r.name}</div>
              <div className={`stock-qty ${r.quantity === 0 ? "out" : ""}`}>
                {r.quantity === 0 ? "Rupture de stock" : `${r.quantity} en stock`}
              </div>
            </div>
            <div className="stock-price">{r.price.toFixed(0)}€</div>
          </div>
        ))}
        {!isPending && rows.length === 0 && <p className="empty">Aucun article trouvé.</p>}
      </div>
    </div>
  );
}
