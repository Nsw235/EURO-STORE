"use server";

import { createClient } from "@/lib/supabase/server";

export type ScannedProduct = {
  stockItemId: string;
  ean: string;
  imei: string | null;
  name: string;
  brand: string;
  category: "telephone" | "accessoire";
  salePrice: number;
  quantity: number;
};

// Cherche l'article par EAN (accessoire) ou IMEI (téléphone), retourne
// le premier lot "en_stock" disponible avec quantité > 0.
export async function scanArticle(code: string): Promise<
  { ok: true; product: ScannedProduct } | { ok: false; message: string }
> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("stock_items")
    .select("id, ean, imei, sale_price, quantity, status, catalog_products(name, brand, category)")
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
      salePrice: Number(data.sale_price),
      quantity: data.quantity,
    },
  };
}

// Vente atomique via la fonction RPC sell_product() (decrement + transaction).
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

export async function getCaDuJour(): Promise<{
  total: number;
  nbVentes: number;
  panierMoyen: number;
}> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("ca_du_jour").single();

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
