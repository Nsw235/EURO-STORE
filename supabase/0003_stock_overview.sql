-- ============================================================
-- EURO STORE — vue d'ensemble stock pour le tableau de bord vendeur
-- Suit la même convention que ca_du_jour() (0002) : agrégat en RPC,
-- security definer, lecture seule, accessible vendeur + admin.
-- ============================================================

create or replace function stock_overview()
returns table(total_en_stock integer, ruptures integer)
language sql stable security definer set search_path = public as $$
  select
    (select coalesce(sum(quantity), 0)::integer
       from stock_items where status = 'en_stock') as total_en_stock,
    (
      -- rupture = un produit déjà réceptionné en boutique au moins une fois
      -- (existe dans stock_items) mais qui n'a plus aucune unité disponible.
      -- Exclut le catalogue externe jamais commandé (source = 'external'
      -- sans réception) qui ne doit pas gonfler ce chiffre.
      select count(*)::integer
      from (
        select ean from stock_items group by ean
      ) deja_recu
      where not exists (
        select 1 from stock_items si
        where si.ean = deja_recu.ean and si.status = 'en_stock' and si.quantity > 0
      )
    ) as ruptures;
$$;

grant execute on function stock_overview() to authenticated;
