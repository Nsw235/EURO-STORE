"use client";

import { useEffect, useRef, useState } from "react";
import { scanArticle, raiseLowStockAlert, getCaDuJour, type ScannedProduct } from "@/lib/vendeur-actions";
import type { PaymentMethod, SaleReceipt } from "@/lib/vendeur-actions";
import { sellCartWithOfflineFallback } from "@/lib/offline-queue";
import { formatDual } from "@/lib/currency";

type Screen = "scan" | "panier" | "paiement" | "encours" | "validee" | "error";

type CartItem = {
  stockItemId: string;
  ean: string;
  imei: string | null;
  name: string;
  brand: string;
  category: "telephone" | "accessoire";
  imageUrl: string | null;
  unitPrice: number;
  availableQty: number; // stock disponible au moment du scan
  qty: number; // quantité dans le panier
};

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    id: "mobile_money",
    label: "Mobile Money",
    sub: "Airtel Money / Moov Money",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="6" y="2" width="12" height="20" rx="2.5" />
        <path d="M10 18h4" />
      </svg>
    ),
  },
  {
    id: "especes",
    label: "Espèces",
    sub: "Paiement en liquide",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    id: "carte",
    label: "Carte bancaire",
    sub: "Carte de crédit / débit",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    ),
  },
  {
    id: "virement",
    label: "Virement / QR code",
    sub: "Paiement par virement",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h.01" />
      </svg>
    ),
  },
  {
    id: "autre",
    label: "Autre",
    sub: "Autre moyen de paiement",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
    ),
  },
];

export default function CaissePage() {
  const [screen, setScreen] = useState<Screen>("scan");
  const [scanning, setScanning] = useState(false);
  const [modalProduct, setModalProduct] = useState<ScannedProduct | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("mobile_money");
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [offlineSale, setOfflineSale] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showAlert, setShowAlert] = useState(false);
  const [ventesDuJour, setVentesDuJour] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cartTotal = cart.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);

  useEffect(() => {
    getCaDuJour().then((ca) => setVentesDuJour(ca.nbVentes));
  }, []);

  async function handleScan(code: string) {
    if (!code || scanning) return;
    setScanning(true);
    const result = await scanArticle(code.trim());
    setScanning(false);
    if (!result.ok) {
      setErrorMsg(result.message);
      setScreen("error");
      return;
    }
    setPhotoFailed(false);
    setModalProduct(result.product);
  }

  function addToCart() {
    if (!modalProduct) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.stockItemId === modalProduct.stockItemId);
      if (existing) {
        const nextQty = Math.min(existing.qty + 1, modalProduct.quantity);
        return prev.map((i) =>
          i.stockItemId === modalProduct.stockItemId ? { ...i, qty: nextQty } : i
        );
      }
      return [
        ...prev,
        {
          stockItemId: modalProduct.stockItemId,
          ean: modalProduct.ean,
          imei: modalProduct.imei,
          name: modalProduct.name,
          brand: modalProduct.brand,
          category: modalProduct.category,
          imageUrl: modalProduct.imageUrl,
          unitPrice: modalProduct.salePrice,
          availableQty: modalProduct.quantity,
          qty: 1,
        },
      ];
    });
    setModalProduct(null);
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.focus();
  }

  function changeQty(stockItemId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) =>
          i.stockItemId === stockItemId
            ? { ...i, qty: Math.max(0, Math.min(i.qty + delta, i.availableQty)) }
            : i
        )
        .filter((i) => i.qty > 0)
    );
  }

  async function confirmPayment() {
    setScreen("encours");
    const result = await sellCartWithOfflineFallback(
      cart.map((i) => ({ stockItemId: i.stockItemId, quantity: i.qty })),
      paymentMethod
    );
    if (!result.ok) {
      setErrorMsg(result.message);
      setScreen("error");
      return;
    }
    if (result.offline) {
      setOfflineSale(true);
      setReceipt({
        saleId: "HORS-LIGNE",
        subtotal: cartTotal,
        tva: Math.round((cartTotal - cartTotal / 1.2) * 100) / 100,
        total: cartTotal,
        paymentMethod,
        soldAt: new Date().toISOString(),
      });
    } else {
      setOfflineSale(false);
      setReceipt(result.sale);
    }
    setScreen("validee");
    setVentesDuJour((n) => (n ?? 0) + 1);
  }

  function reset() {
    setCart([]);
    setModalProduct(null);
    setReceipt(null);
    setOfflineSale(false);
    setScreen("scan");
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.focus();
  }

  return (
    <div className="caisse">
      {/* ============ 1. SCAN ============ */}
      {screen === "scan" && (
        <div className="scan-zone">
          <div className="flag-stripe" style={{ margin: "-20px -20px 16px" }}>
            <span className="b" /><span className="y" /><span className="r" />
          </div>

          {ventesDuJour !== null && ventesDuJour > 0 && (
            <div className="streak-badge" style={{ marginBottom: 14 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2L3 14h7l-1 8 11-14h-7l1-6z" />
              </svg>
              {ventesDuJour}
              {ventesDuJour === 1 ? "re" : "e"} vente du jour
            </div>
          )}

          <div className="viewfinder">
            <div className="corner tl" />
            <div className="corner tr" />
            <div className="corner bl" />
            <div className="corner br" />
            <div className="crosshair" />
            <div className="vf-icon flash" aria-label="Flash">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2L3 14h7l-1 8 11-14h-7l1-6z" />
              </svg>
            </div>
            <div className="vf-icon flip" aria-label="Retourner caméra">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 2l4 4-4 4" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <path d="M7 22l-4-4 4-4" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </div>
          </div>

          <div className="divider-text">— OU SAISIE MANUELLE —</div>
          <form
            className="manual-input"
            onSubmit={(e) => {
              e.preventDefault();
              handleScan(inputRef.current?.value ?? "");
            }}
          >
            <input
              ref={inputRef}
              autoFocus
              placeholder={scanning ? "Recherche..." : "Scanner ou saisir IMEI / EAN..."}
              disabled={scanning}
            />
          </form>
          <p className="manual-sub">IMEI (téléphone) ou code EAN (accessoire)</p>
          <button className="alert-link" onClick={() => setShowAlert(true)}>
            Signaler un stock bas
          </button>

          {cart.length > 0 && (
            <div className="cart-actions" style={{ marginTop: "auto" }}>
              <button className="btn-outline" onClick={() => setScreen("panier")}>
                <span className="btn-icon-inline" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="20" cy="21" r="1" />
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                  </svg>
                </span>
                {cartCount} article{cartCount > 1 ? "s" : ""} · {formatDual(cartTotal).fcfa} F
              </button>
              <button className="btn-gold" onClick={() => setScreen("panier")}>
                Voir le panier →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Fiche produit détecté (bottom sheet, au-dessus de l'écran scan) */}
      {modalProduct && (
        <div className="modal-backdrop">
          <div className="product-sheet">
            {modalProduct.quantity <= 3 ? (
              <div className="stock-badge low">
                <span className="dot" /> Stock bas ({modalProduct.quantity} restant
                {modalProduct.quantity > 1 ? "s" : ""})
              </div>
            ) : (
              <div className="stock-badge ok">
                <span className="dot" /> Stock : Disponible
              </div>
            )}
            <div className="product-row">
              <div className="product-photo">
                {modalProduct.imageUrl && !photoFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={modalProduct.imageUrl}
                    alt={modalProduct.name}
                    onError={() => setPhotoFailed(true)}
                  />
                ) : (
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#c5a059" strokeWidth="1.3">
                    <rect x="6" y="2" width="12" height="20" rx="3" />
                    <circle cx="12" cy="18.4" r="1.1" fill="#c5a059" stroke="none" />
                    <rect x="9" y="4.3" width="6" height="1" rx="0.5" fill="#c5a059" stroke="none" />
                  </svg>
                )}
              </div>
              <div className="product-info">
                <h3>{modalProduct.name}</h3>
                <div className="variant">{modalProduct.brand} · {modalProduct.condition}</div>
                <div className="code">
                  {modalProduct.category === "telephone"
                    ? `IMEI : ${modalProduct.imei}`
                    : `EAN : ${modalProduct.ean}`}
                </div>
              </div>
            </div>
            <div className="modal-price price-fcfa">{formatDual(modalProduct.salePrice).fcfa} FCFA</div>
            <div className="price-eur" style={{ textAlign: "center", marginTop: -6, marginBottom: 10 }}>
              ≈ {formatDual(modalProduct.salePrice).eur} €
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setModalProduct(null)}>
                Annuler
              </button>
              <button className="btn-gold" onClick={addToCart}>
                Ajouter au panier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ 2. PANIER ============ */}
      {screen === "panier" && (
        <div className="scan-zone">
          <div className="h-page">Panier</div>

          {cart.length === 0 ? (
            <div className="cart-empty">Le panier est vide.</div>
          ) : (
            <>
              {cart.map((item) => (
                <div className="cart-card" key={item.stockItemId}>
                  <div className="cart-item">
                    <div className="cart-photo">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt={item.name} />
                      ) : null}
                    </div>
                    <div className="cart-details">
                      <h4>{item.name}</h4>
                      <div className="cart-ref">
                        {item.category === "telephone" ? `IMEI ${item.imei}` : `EAN ${item.ean}`}
                      </div>
                    </div>
                  </div>
                  <div className="cart-qtyrow">
                    <div>
                      <div className="qty-label">Quantité</div>
                      <div className="qty-stepper">
                        <button className="qty-btn" onClick={() => changeQty(item.stockItemId, -1)}>–</button>
                        <span className="val">{item.qty}</span>
                        <button className="qty-btn" onClick={() => changeQty(item.stockItemId, 1)}>+</button>
                      </div>
                    </div>
                    <div>
                      <div className="price-label">Prix</div>
                      <div className="price-val price-fcfa">{formatDual(item.unitPrice * item.qty).fcfa} F</div>
                      <div className="price-eur">≈ {formatDual(item.unitPrice * item.qty).eur} €</div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="cart-card">
                <div className="summary-row">
                  <span>Sous-total</span>
                  <span>{formatDual(cartTotal).fcfa} F <span className="price-eur">(≈ {formatDual(cartTotal).eur} €)</span></span>
                </div>
                <div className="summary-divider" />
                <div className="summary-row">
                  <span>TVA (20 %)</span>
                  <span>
                    {formatDual(Math.round((cartTotal - cartTotal / 1.2) * 100) / 100).fcfa} F{" "}
                    <span className="price-eur">
                      (≈ {formatDual(Math.round((cartTotal - cartTotal / 1.2) * 100) / 100).eur} €)
                    </span>
                  </span>
                </div>
              </div>

              <div className="grand-total">
                <span className="label">Total :</span>
                <span className="amount price-fcfa">{formatDual(cartTotal).fcfa} FCFA</span>
              </div>
              <div className="price-eur" style={{ textAlign: "right", marginTop: -8 }}>
                ≈ {formatDual(cartTotal).eur} €
              </div>

              <div className="cart-actions">
                <button className="btn-outline" onClick={() => setScreen("scan")}>
                  <span className="btn-icon-inline" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                    </svg>
                  </span>
                  Modifier le panier
                </button>
                <button className="btn-gold" onClick={() => setScreen("paiement")}>
                  Valider la vente →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ 3. CHOIX DU PAIEMENT ============ */}
      {screen === "paiement" && (
        <div className="scan-zone">
          <div className="h-page" style={{ marginBottom: 4 }}>Paiement</div>
          <div className="pay-amount-label">MONTANT À PAYER</div>
          <div className="pay-amount price-fcfa">{formatDual(cartTotal).fcfa} FCFA</div>
          <div className="price-eur" style={{ textAlign: "center", marginBottom: 8 }}>
            ≈ {formatDual(cartTotal).eur} €
          </div>

          <div className="pay-section-label">MODE DE PAIEMENT</div>
          <div className="pay-options">
            {PAYMENT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                className={`pay-option ${paymentMethod === opt.id ? "selected" : ""}`}
                onClick={() => setPaymentMethod(opt.id)}
              >
                <span className="pay-icon">{opt.icon}</span>
                <span className="pay-text">
                  <h4>{opt.label}</h4>
                  <p>{opt.sub}</p>
                </span>
                <span className="pay-chevron">›</span>
              </button>
            ))}
          </div>

          <div className="pay-confirm">
            <button className="btn-gold" style={{ width: "100%" }} onClick={confirmPayment}>
              ✓ Confirmer le paiement
            </button>
          </div>
        </div>
      )}

      {/* ============ 4. PAIEMENT EN COURS ============ */}
      {screen === "encours" && (
        <div className="processing">
          <div className="ring"><div className="ring-inner" /></div>
          <h2>Paiement en cours...</h2>
          <p className="sub">Veuillez patienter ou présenter la carte,</p>
          <div className="totalcard">
            <div className="tl">TOTAL</div>
            <div className="tv price-fcfa">{formatDual(cartTotal).fcfa} FCFA</div>
            <div className="price-eur">≈ {formatDual(cartTotal).eur} €</div>
          </div>
          <div className="footlock">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Paiement sécurisé et crypté
          </div>
        </div>
      )}

      {/* ============ 5. VENTE VALIDÉE ============ */}
      {screen === "validee" && receipt && (
        <div className="success-zone" style={{ position: "relative", overflow: "hidden" }}>
          <span className="confetti" style={{ top: 10, left: 30, background: "#0033a0" }} />
          <span className="confetti" style={{ top: 26, left: 60, background: "#ffd100" }} />
          <span className="confetti" style={{ top: 16, right: 34, background: "#d21034" }} />
          <span className="confetti" style={{ top: 44, right: 54, width: 4, height: 4, background: "#0033a0" }} />
          <span className="confetti" style={{ top: 36, left: 90, width: 4, height: 4, background: "#d21034" }} />
          <span className="confetti" style={{ top: 52, right: 24, background: "#ffd100" }} />

          <div className="check-ring">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2>Vente validée !{offlineSale ? " (hors-ligne)" : ""}</h2>
          <div className="success-amount price-fcfa">{formatDual(receipt.total).fcfa} FCFA</div>
          <div className="price-eur" style={{ textAlign: "center" }}>≈ {formatDual(receipt.total).eur} €</div>
          <div className="success-meta">
            {new Date(receipt.soldAt).toLocaleDateString("fr-FR")} ·{" "}
            {new Date(receipt.soldAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="success-txn">ID Transaction : {receipt.saleId}</div>

          <div className="success-actions">
            <button className="btn-gold" onClick={() => window.print()}>
              <span className="btn-icon-inline" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9V2h12v7" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
              </span>
              Imprimer le ticket
            </button>
            <button className="btn-outline">
              <span className="btn-icon-inline" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13" />
                  <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </span>
              Envoyer par email / SMS
            </button>
          </div>
          <button className="success-link" onClick={reset}>Nouvelle vente →</button>

          <div className="receipt">
            <div className="receipt-header-row"><span>ARTICLES</span><span>TOTAL</span></div>
            <hr />
            {cart.map((item) => (
              <div className="receipt-line" key={item.stockItemId}>
                <span>{item.qty} × {item.name}</span>
                <span>
                  {formatDual(item.unitPrice * item.qty).fcfa} F{" "}
                  <span className="price-eur">(≈{formatDual(item.unitPrice * item.qty).eur}€)</span>
                </span>
              </div>
            ))}
            <div className="receipt-total">
              <span>TOTAL</span>
              <span>
                {formatDual(receipt.total).fcfa} FCFA <span className="price-eur">(≈{formatDual(receipt.total).eur}€)</span>
              </span>
            </div>
            <div className="receipt-thanks">Merci pour votre confiance.</div>
          </div>
        </div>
      )}

      {/* ============ ERREUR ============ */}
      {screen === "error" && (
        <div className="scan-zone" style={{ justifyContent: "center", alignItems: "center", gap: 18 }}>
          <p className="error-text">{errorMsg}</p>
          <button className="btn-secondary" onClick={reset}>Réessayer</button>
        </div>
      )}

      {showAlert && <AlertModal ean={cart[0]?.ean ?? ""} onClose={() => setShowAlert(false)} />}
    </div>
  );
}

function AlertModal({ ean, onClose }: { ean: string; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    await raiseLowStockAlert(ean, note);
    setSending(false);
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <div className="product-sheet">
        <h3 style={{ marginBottom: 6 }}>Signaler un stock bas</h3>
        <p className="manual-sub" style={{ marginBottom: 14 }}>Notifie l&apos;administrateur pour ce produit.</p>
        <div className="manual-input">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Précision (optionnel)" />
        </div>
        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn-cancel" onClick={onClose}>Annuler</button>
          <button className="btn-gold" onClick={send} disabled={sending}>
            {sending ? "..." : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}
