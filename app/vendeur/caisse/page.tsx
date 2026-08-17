"use client";

import { useRef, useState } from "react";
import { scanArticle, raiseLowStockAlert, type ScannedProduct } from "@/lib/vendeur-actions";
import type { PaymentMethod, SaleReceipt } from "@/lib/vendeur-actions";
import { sellCartWithOfflineFallback } from "@/lib/offline-queue";

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

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; sub: string }[] = [
  { id: "especes", label: "Espèces", sub: "Paiement en liquide" },
  { id: "carte", label: "Carte bancaire", sub: "Carte de crédit / débit" },
  { id: "virement", label: "Virement / QR code", sub: "Paiement par virement" },
  { id: "autre", label: "Autre", sub: "Autre moyen de paiement" },
];

export default function CaissePage() {
  const [screen, setScreen] = useState<Screen>("scan");
  const [scanning, setScanning] = useState(false);
  const [modalProduct, setModalProduct] = useState<ScannedProduct | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("especes");
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [offlineSale, setOfflineSale] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showAlert, setShowAlert] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cartTotal = cart.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);

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
                🛒 {cartCount} article{cartCount > 1 ? "s" : ""} · {cartTotal.toFixed(2)} €
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
            <div className="modal-price">{modalProduct.salePrice.toFixed(2)} €</div>
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
                      <div className="price-val">{(item.unitPrice * item.qty).toFixed(2)} €</div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="cart-card">
                <div className="summary-row">
                  <span>Sous-total</span>
                  <span>{cartTotal.toFixed(2)} €</span>
                </div>
                <div className="summary-divider" />
                <div className="summary-row">
                  <span>TVA (20 %)</span>
                  <span>{Math.round((cartTotal - cartTotal / 1.2) * 100) / 100} €</span>
                </div>
              </div>

              <div className="grand-total">
                <span className="label">Total :</span>
                <span className="amount">{cartTotal.toFixed(2)} €</span>
              </div>

              <div className="cart-actions">
                <button className="btn-outline" onClick={() => setScreen("scan")}>
                  ✎ Modifier le panier
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
          <div className="pay-amount">{cartTotal.toFixed(2)} €</div>

          <div className="pay-section-label">MODE DE PAIEMENT</div>
          <div className="pay-options">
            {PAYMENT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                className={`pay-option ${paymentMethod === opt.id ? "selected" : ""}`}
                onClick={() => setPaymentMethod(opt.id)}
              >
                <span className="pay-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <path d="M2 10h20" />
                  </svg>
                </span>
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
            <div className="tv">{cartTotal.toFixed(2)} €</div>
          </div>
          <div className="footlock">🔒 Paiement sécurisé et crypté</div>
        </div>
      )}

      {/* ============ 5. VENTE VALIDÉE ============ */}
      {screen === "validee" && receipt && (
        <div className="success-zone">
          <div className="check-ring">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2>Vente validée !{offlineSale ? " (hors-ligne)" : ""}</h2>
          <div className="success-amount">{receipt.total.toFixed(2)} €</div>
          <div className="success-meta">
            {new Date(receipt.soldAt).toLocaleDateString("fr-FR")} ·{" "}
            {new Date(receipt.soldAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="success-txn">ID Transaction : {receipt.saleId}</div>

          <div className="success-actions">
            <button className="btn-gold" onClick={() => window.print()}>🖶 Imprimer le ticket</button>
            <button className="btn-outline">➤ Envoyer par email / SMS</button>
          </div>
          <button className="success-link" onClick={reset}>Nouvelle vente →</button>

          <div className="receipt">
            <div className="receipt-header-row"><span>ARTICLES</span><span>TOTAL</span></div>
            <hr />
            {cart.map((item) => (
              <div className="receipt-line" key={item.stockItemId}>
                <span>{item.qty} × {item.name}</span>
                <span>{(item.unitPrice * item.qty).toFixed(2)} €</span>
              </div>
            ))}
            <div className="receipt-total"><span>TOTAL</span><span>{receipt.total.toFixed(2)} €</span></div>
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
