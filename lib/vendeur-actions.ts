"use server";

import { createClient } from "@/lib/supabase/server";

export type ScannedProduct = {
  produitId: string;
  uniteImeiId: string | null; // non-null pour un téléphone (unité physique précise)
  ean: string;
  imei: string | null;
  name: string;
  brand: string;
  category: "telephone" | "accessoire";
  imageUrl: string | null;
  salePrice: number;
  quantity: number; // quantité disponible (1 pour un IMEI, stock_global pour accessoire)
};

// Un téléphone se scanne par IMEI (unité précise), un accessoire par EAN
// (stock global, pas d'unité individuelle) — schéma réel produits/unites_imei.
export async function scanArticle(code: string): Promise<
  { ok: true; product: ScannedProduct } | { ok: false; message: string }
> {
  const supabase = createClient();

  const { data: unite } = await supabase
    .from("unites_imei")
    .select("id, imei, produit_id, produits(id, marque, modele, type, categorie, code_ean, image_url, prix_vente)")
    .eq("imei", code)
    .eq("statut", "EN_STOCK")
    .maybeSingle();

  if (unite) {
    const p = Array.isArray(unite.produits) ? unite.produits[0] : unite.produits;
    if (!p) return { ok: false, message: "Article introuvable ou rupture de stock." };
    return {
      ok: true,
      product: {
        produitId: p.id,
        uniteImeiId: unite.id,
        ean: p.code_ean,
        imei: unite.imei,
        name: `${p.marque} ${p.modele}`,
        brand: p.marque,
        category: "telephone",
        imageUrl: p.image_url,
        salePrice: Number(p.prix_vente),
        quantity: 1,
      },
    };
  }

  const { data: produit } = await supabase
    .from("produits")
    .select("id, marque, modele, type, categorie, code_ean, image_url, prix_vente, stock_global")
    .eq("code_ean", code)
    .maybeSingle();

  if (!produit || produit.stock_global <= 0) {
    return { ok: false, message: "Article introuvable ou rupture de stock." };
  }

  return {
    ok: true,
    product: {
      produitId: produit.id,
      uniteImeiId: null,
      ean: produit.code_ean,
      imei: null,
      name: `${produit.marque} ${produit.modele}`,
      brand: produit.marque,
      category: produit.type === "telephone" ? "telephone" : "accessoire",
      imageUrl: produit.image_url,
      salePrice: Number(produit.prix_vente),
      quantity: produit.stock_global,
    },
  };
}

export type PaymentMethod = "mobile_money" | "especes" | "carte" | "virement" | "autre";

export type CartLine = { produitId: string; uniteImeiId: string | null; quantity: number };

export type SaleReceipt = {
  saleId: string;
  subtotal: number;
  tva: number;
  total: number;
  paymentMethod: PaymentMethod;
  soldAt: string;
};

// Vente panier : un ou plusieurs articles + mode de paiement, en une seule
// transaction atomique côté base (create_sale, schéma produits/unites_imei).
export async function createSale(
  items: CartLine[],
  paymentMethod: PaymentMethod
): Promise<{ ok: true; sale: SaleReceipt } | { ok: false; message: string }> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("create_sale", {
    p_items: items.map((i) => ({
      produit_id: i.produitId,
      unite_imei_id: i.uniteImeiId,
      quantity: i.quantity,
    })),
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
    .from("stock_overview")
    .select("produit_id, code_ean, marque, modele, prix_vente, quantite_disponible")
    .ilike("modele", `%${query}%`)
    .order("quantite_disponible", { ascending: false })
    .limit(20);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.produit_id,
    ean: row.code_ean,
    name: `${row.marque} ${row.modele}`,
    brand: row.marque,
    price: Number(row.prix_vente),
    quantity: row.quantite_disponible,
  }));
}

const LOW_STOCK_THRESHOLD = 3;

export type LowStockItem = {
  id: string;
  name: string;
  brand: string;
  category: "telephone" | "accessoire";
  quantity: number;
};

export type StockOverview = {
  totalEnStock: number;
  ruptures: number;
  lowStock: LowStockItem[];
};

// Vue d'ensemble stock, directement sur la vue stock_overview réelle
// (quantite_disponible = count(unites_imei EN_STOCK) pour un téléphone,
// stock_global pour un accessoire).
export async function getStockOverview(): Promise<StockOverview> {
  const supabase = createClient();

  const { data } = await supabase
    .from("stock_overview")
    .select("produit_id, type, marque, modele, quantite_disponible");

  const rows = data ?? [];
  const totalEnStock = rows.reduce((sum, r) => sum + Number(r.quantite_disponible), 0);
  const ruptures = rows.filter((r) => Number(r.quantite_disponible) === 0).length;
  const lowStock: LowStockItem[] = rows
    .filter((r) => Number(r.quantite_disponible) > 0 && Number(r.quantite_disponible) <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => Number(a.quantite_disponible) - Number(b.quantite_disponible))
    .slice(0, 5)
    .map((r) => ({
      id: r.produit_id,
      name: r.modele,
      brand: r.marque,
      category: r.type === "telephone" ? "telephone" : "accessoire",
      quantity: Number(r.quantite_disponible),
    }));

  return { totalEnStock, ruptures, lowStock };
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
