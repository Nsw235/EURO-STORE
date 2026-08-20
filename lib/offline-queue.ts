"use client";

import { createClient } from "@/lib/supabase/client";
import type { CartLine, PaymentMethod, SaleReceipt } from "@/lib/vendeur-actions";

const QUEUE_KEY = "euro-store:pending-sales";

type PendingSale = {
  localId: string;
  items: CartLine[];
  paymentMethod: PaymentMethod;
  queuedAt: string;
};

function readQueue(): PendingSale[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingSale[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function queuePendingCount() {
  return readQueue().length;
}

// Tente une vente panier en direct ; si le réseau échoue, met en file locale
// pour synchronisation automatique au retour de connexion.
export async function sellCartWithOfflineFallback(
  items: CartLine[],
  paymentMethod: PaymentMethod
): Promise<
  | { ok: true; offline: false; sale: SaleReceipt }
  | { ok: true; offline: true; sale: null }
  | { ok: false; message: string }
> {
  const supabase = createClient();

  if (typeof navigator !== "undefined" && navigator.onLine) {
    const { data, error } = await supabase.rpc("create_sale", {
      p_items: items.map((i) => ({
        produit_id: i.produitId,
        unite_imei_id: i.uniteImeiId,
        quantity: i.quantity,
      })),
      p_payment_method: paymentMethod,
    });

    if (!error && data) {
      return {
        ok: true,
        offline: false,
        sale: {
          saleId: data.id,
          subtotal: Number(data.subtotal),
          tva: Number(data.tva),
          total: Number(data.total),
          paymentMethod: data.payment_method,
          soldAt: data.sold_at,
        },
      };
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      queueSale(items, paymentMethod);
      return { ok: true, offline: true, sale: null };
    }
    return { ok: false, message: error?.message ?? "Échec du paiement." };
  }

  queueSale(items, paymentMethod);
  return { ok: true, offline: true, sale: null };
}

function queueSale(items: CartLine[], paymentMethod: PaymentMethod) {
  const queue = readQueue();
  queue.push({
    localId: crypto.randomUUID(),
    items,
    paymentMethod,
    queuedAt: new Date().toISOString(),
  });
  writeQueue(queue);
}

// Appelée au retour réseau (voir hook useOfflineSync) : rejoue les paniers en attente.
export async function syncPendingSales(): Promise<{ synced: number; failed: number }> {
  const supabase = createClient();
  const queue = readQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining: PendingSale[] = [];

  for (const sale of queue) {
    const { error } = await supabase.rpc("create_sale", {
      p_items: sale.items.map((i) => ({
        produit_id: i.produitId,
        unite_imei_id: i.uniteImeiId,
        quantity: i.quantity,
      })),
      p_payment_method: sale.paymentMethod,
    });
    if (error) {
      failed++;
      remaining.push(sale);
    } else {
      synced++;
    }
  }

  writeQueue(remaining);
  return { synced, failed };
}
