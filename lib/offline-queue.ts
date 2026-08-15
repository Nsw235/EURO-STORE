"use client";

import { createClient } from "@/lib/supabase/client";

const QUEUE_KEY = "euro-store:pending-sales";

type PendingSale = {
  localId: string;
  stockItemId: string;
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

// Tente une vente en direct ; si le réseau échoue, met en file locale
// pour synchronisation automatique au retour de connexion.
export async function sellWithOfflineFallback(stockItemId: string) {
  const supabase = createClient();

  if (navigator.onLine) {
    const { data, error } = await supabase.rpc("sell_product", {
      p_stock_item_id: stockItemId,
    });
    if (!error) return { ok: true as const, offline: false, salePrice: Number(data.sale_price) };
    // erreur réseau probable -> on tente la mise en file, sinon on remonte l'erreur métier
    if (!navigator.onLine) {
      queueSale(stockItemId);
      return { ok: true as const, offline: true, salePrice: null };
    }
    return { ok: false as const, message: error.message };
  }

  queueSale(stockItemId);
  return { ok: true as const, offline: true, salePrice: null };
}

function queueSale(stockItemId: string) {
  const queue = readQueue();
  queue.push({
    localId: crypto.randomUUID(),
    stockItemId,
    queuedAt: new Date().toISOString(),
  });
  writeQueue(queue);
}

// Appelée au retour réseau (voir hook useOfflineSync) : rejoue les ventes en attente.
export async function syncPendingSales(): Promise<{ synced: number; failed: number }> {
  const supabase = createClient();
  const queue = readQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining: PendingSale[] = [];

  for (const sale of queue) {
    const { error } = await supabase.rpc("sell_product", {
      p_stock_item_id: sale.stockItemId,
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
