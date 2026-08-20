"use server";

import { createClient } from "@/lib/supabase/server";

export type ScannedProduct = {
  stockItemId: string;
  ean: string;
  imei: string | null;
  name: string;
  brand: string;
  category: "telephone" | "accessoire";
  condition: string;
  imageUrl: string | null;
  salePrice: number;
  quantity: number;
};

export async function scanArticle(code: string): Promise<
  { ok: true; product: ScannedProduct } | { ok: false; message: string }
> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("stock_items")
    .select(
      "id, ean, imei, sale_price, quantity, status, condition, catalog_products(name, brand, category, image_url)"
    )
    .or(`imei.eq.${code},ean.eq.${code}`)
    .eq("status", "en_stock")
    .gt("quantity", 0)
    .order("received_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, message: "Article introuvable ou rupture de stock." };
  }

  const catalog = Array.isArray(data.catalog_products)
    ? data.catalog_products[0]
    : data.catalog_products;

  return {
    ok: true,
    product: {
      stockItemId: data.id,
      ean: data.ean,
      imei: data.imei,
      name: catalog?.name ?? "Article",
      brand: catalog?.brand ?? "",
      category: catalog?.category ?? "accessoire",
      condition: data.condition,
      imageUrl: catalog?.image_url ?? null,
      salePrice: Number(data.sale_price),
      quantity: data.quantity,
    },
  };
}

export async function sellArticle(stockItemId: string): Promise<
  { ok: true; salePrice: number } | { ok: false; message: string }
> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("sell_product", {
    p_stock_item_id: stockItemId,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, salePrice: Number(data.sale_price) };
}

export type PaymentMethod = "especes" | "carte" | "virement" | "autre";

export type CartLine = { stockItemId: string; quantity: number };

export type SaleReceipt = {
  saleId: string;
  subtotal: number;
  tva: number;
  total: number;
  paymentMethod: PaymentMethod;
  soldAt: string;
};

// Vente panier : un ou plusieurs articles + mode de paiement, en une seule
// transaction atomique côté base (voir la fonction create_sale).
export async function createSale(
  items: CartLine[],
  paymentMethod: PaymentMethod
): Promise<{ ok: true; sale: SaleReceipt } | { ok: false; message: string }> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("create_sale", {
    p_items: items.map((i) => ({ stock_item_id: i.stockItemId, quantity: i.quantity })),
    p_payment_method: paymentMethod,
  });

  if (error || !data) {
    return { ok: false, message: error?.message ?? "Échec du paiement." };
  }

  return {
    ok: true,
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

export async function getCaDuJour(): Promise<{
  total: number;
  nbVentes: number;
  panierMoyen: number;
}> {
  const supabase = createClient();

  const { data, error } = await supabase
    .rpc("ca_du_jour")
    .single<{ total: number; nb_ventes: number; panier_moyen: number }>();

  if (error || !data) return { total: 0, nbVentes: 0, panierMoyen: 0 };

  return {
    total: Number(data.total),
    nbVentes: Number(data.nb_ventes),
    panierMoyen: Number(data.panier_moyen),
  };
}

export async function searchStock(query: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("stock_items")
    .select("id, ean, sale_price, quantity, status, catalog_products(name, brand)")
    .eq("status", "en_stock")
    .ilike("catalog_products.name", `%${query}%`)
    .limit(20);

  if (error || !data) return [];

  return data.map((row) => {
    const catalog = Array.isArray(row.catalog_products)
      ? row.catalog_products[0]
      : row.catalog_products;
    return {
      id: row.id,
      ean: row.ean,
      name: catalog?.name ?? "Article",
      brand: catalog?.brand ?? "",
      price: Number(row.sale_price),
      quantity: row.quantity,
    };
  });
}

const LOW_STOCK_THRESHOLD = 3;

export type LowStockItem = {
  id: string;
  name: string;
  brand: string;
  category: "telephone" | "accessoire";
  condition: string;
  quantity: number;
};

export type StockOverview = {
  totalEnStock: number;
  ruptures: number;
  lowStock: LowStockItem[];
};

// Vue d'ensemble stock : compteurs (RPC stock_overview) + articles sous le
// seuil d'alerte (même seuil que le badge "stock-badge low" de la caisse).
export async function getStockOverview(): Promise<StockOverview> {
  const supabase = createClient();

  const [{ data: overview }, { data: lowStockRows }] = await Promise.all([
    supabase.rpc("stock_overview").single<{ total_en_stock: number; ruptures: number }>(),
    supabase
      .from("stock_items")
      .select("id, quantity, condition, catalog_products(name, brand, category)")
      .eq("status", "en_stock")
      .lte("quantity", LOW_STOCK_THRESHOLD)
      .order("quantity", { ascending: true })
      .limit(5),
  ]);

  const lowStock: LowStockItem[] = (lowStockRows ?? []).map((row) => {
    const catalog = Array.isArray(row.catalog_products) ? row.catalog_products[0] : row.catalog_products;
    return {
      id: row.id,
      name: catalog?.name ?? "Article",
      brand: catalog?.brand ?? "",
      category: (catalog?.category as "telephone" | "accessoire") ?? "accessoire",
      condition: row.condition,
      quantity: row.quantity,
    };
  });

  return {
    totalEnStock: overview?.total_en_stock ?? 0,
    ruptures: overview?.ruptures ?? 0,
    lowStock,
  };
}

export async function raiseLowStockAlert(ean: string, note: string) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const };

  const { error } = await supabase.from("low_stock_alerts").insert({
    ean,
    note,
    raised_by: user.id,
  });

  return { ok: !error };
}
