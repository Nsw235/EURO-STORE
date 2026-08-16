"use client";

import { useRef, useState } from "react";
import { scanArticle, raiseLowStockAlert, type ScannedProduct } from "@/lib/vendeur-actions";
import { sellWithOfflineFallback } from "@/lib/offline-queue";

type Screen = "idle" | "scanning" | "product" | "sold" | "error";

export default function CaissePage() {
  const [screen, setScreen] = useState<Screen>("idle");
  const [product, setProduct] = useState<ScannedProduct | null>(null);
  const [soldOffline, setSoldOffline] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showAlert, setShowAlert] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleScan(code: string) {
    if (!code) return;
    setScreen("scanning");
    const result = await scanArticle(code.trim());
    if (!result.ok) {
      setErrorMsg(result.message);
      setScreen("error");
      return;
    }
    setPhotoFailed(false);
    setProduct(result.product);
    setScreen("product");
  }

  async function handleSell() {
    if (!product) return;
    const result = await sellWithOfflineFallback(product.stockItemId);
    if (!result.ok) {
      setErrorMsg(result.message);
      setScreen("error");
      return;
    }
    setSoldOffline(result.offline);
    setScreen("sold");
  }

  function reset() {
    setProduct(null);
    setSoldOffline(false);
    setScreen("idle");
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.focus();
  }

  return (
    <div className="caisse">
      {(screen === "idle" || screen === "scanning") && (
        <div className="scan-zone">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleScan(inputRef.current?.value ?? "");
            }}
          >
            <button
              type="button"
              className={`lens ${screen === "scanning" ? "busy" : ""}`}
              onClick={() => inputRef.current?.focus()}
            >
              <span>{screen === "scanning" ? "SCAN..." : "SCAN"}</span>
            </button>
            <input
              ref={inputRef}
              autoFocus
              className="scan-input"
              placeholder="Scanner ou saisir IMEI / EAN"
            />
          </form>
          <p className="hint">IMEI (téléphone) ou code EAN (accessoire)</p>
          <button className="alert-link" onClick={() => setShowAlert(true)}>
            Signaler stock bas
          </button>
        </div>
      )}

      {screen === "error" && (
        <div className="scan-zone">
          <p className="error-text">{errorMsg}</p>
          <button className="btn-secondary" onClick={reset}>
            Réessayer
          </button>
        </div>
      )}

      {screen === "product" && product && (
        <div className="product-card">
          <div className="product-photo">
            {product.imageUrl && !photoFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt={product.name}
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <div className="photo-placeholder">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-header.png" alt="" className="photo-placeholder-mark" />
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="3" y="6" width="18" height="14" rx="2" />
                  <circle cx="12" cy="13" r="3.4" />
                  <path d="M8 6l1.4-2h5.2L16 6" />
                </svg>
                <span>Photo à venir</span>
              </div>
            )}
          </div>

          <div className="product-info">
            <div className="eyebrow">{product.brand.toUpperCase()}</div>
            <div className="product-name">{product.name}</div>
            <div className="chip-row">
              <span className="chip">{product.condition}</span>
              <span className="chip">
                {product.category === "telephone"
                  ? `IMEI ${product.imei}`
                  : `EAN ${product.ean}`}
              </span>
            </div>
            <div className="price">{product.salePrice.toFixed(0)}€</div>
            <div className="stock-note">TTC · {product.quantity} en stock</div>
          </div>

          <div className="actions">
            <button className="btn-sell" onClick={handleSell}>
              VENDRE
            </button>
            <button className="btn-cancel" onClick={reset}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {screen === "sold" && product && (
        <div className="sold-zone">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-header.png" alt="EURO STORE" className="sold-logo" />
          <div className="check-circle">✓</div>
          <p className="sold-label">
            {soldOffline ? "Vente enregistrée (hors-ligne)" : "Vente enregistrée"}
          </p>
          <div className="price">{product.salePrice.toFixed(0)}€</div>
          <button className="btn-secondary" onClick={reset}>
            Nouvelle vente
          </button>
        </div>
      )}

      {showAlert && (
        <AlertModal
          ean={product?.ean ?? ""}
          onClose={() => setShowAlert(false)}
        />
      )}
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
      <div className="modal">
        <div className="modal-title">Signaler un stock bas</div>
        <p className="modal-sub">Notifie l&apos;administrateur pour ce produit.</p>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Précision (optionnel)"
        />
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>
            Annuler
          </button>
          <button className="btn-gold" onClick={send} disabled={sending}>
            {sending ? "..." : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}
