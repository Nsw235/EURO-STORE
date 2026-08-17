-- ============================================================
-- EURO STORE — panier multi-articles + choix du mode de paiement
-- Déjà appliqué en direct sur le projet Supabase "euro-store"
-- (tvxvomvzsytycbwxoead). Ce fichier sert de trace pour le repo
-- et pour `supabase db push` sur d'autres environnements.
--
-- Note : la base réelle utilise `app_user_role()` comme helper de
-- rôle (et non `current_role()`, mot réservé Postgres qui casse la
-- syntaxe `current_role()` dans une fonction plpgsql). schema.sql
-- historique mentionnait `current_role()` mais ce n'est pas ce qui
-- tourne en prod — ce fichier suit la version réelle.
-- ============================================================

-- 1. Table "sales" = ticket de caisse (un panier validé = une ligne)
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  sold_by uuid not null references profiles(id),
  payment_method text not null check (payment_method in ('especes','carte','virement','autre')),
  subtotal numeric(10,2) not null,
  tva numeric(10,2) not null,
  total numeric(10,2) not null,
  sold_at timestamptz not null default now(),
  offline_synced_at timestamptz
);

create index if not exists idx_sales_sold_at on sales(sold_at);
create index if not exists idx_sales_sold_by on sales(sold_by);

alter table sales enable row level security;

drop policy if exists "read sales" on sales;
create policy "read sales" on sales
  for select using (auth.role() = 'authenticated');

drop policy if exists "vendeur inserts own sale" on sales;
create policy "vendeur inserts own sale" on sales
  for insert with check (sold_by = auth.uid());

-- 2. "transactions" devient les lignes d'un ticket : sale_id + quantity
alter table transactions add column if not exists sale_id uuid references sales(id);
alter table transactions add column if not exists quantity integer not null default 1;

create index if not exists idx_transactions_sale_id on transactions(sale_id);

-- 3. RPC : vente panier atomique (plusieurs articles + mode de paiement)
--    p_items: [{"stock_item_id": "uuid", "quantity": 1}, ...]
create or replace function create_sale(p_items jsonb, p_payment_method text)
returns sales
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_sale sales;
  v_item record;
  v_stock stock_items;
  v_subtotal numeric := 0;
begin
  if app_user_role() not in ('vendeur', 'admin') then
    raise exception 'Non autorisé';
  end if;

  if p_payment_method not in ('especes','carte','virement','autre') then
    raise exception 'Mode de paiement invalide';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Panier vide';
  end if;

  -- Passe 1 : verrouille et valide chaque ligne, calcule le sous-total
  for v_item in
    select * from jsonb_to_recordset(p_items) as x(stock_item_id uuid, quantity integer)
  loop
    select * into v_stock from stock_items where id = v_item.stock_item_id for update;

    if v_stock is null then
      raise exception 'Article introuvable';
    end if;
    if v_stock.status <> 'en_stock' or v_stock.quantity < v_item.quantity then
      raise exception 'Stock insuffisant pour %', v_stock.ean;
    end if;

    v_subtotal := v_subtotal + (v_stock.sale_price * v_item.quantity);
  end loop;

  insert into sales (sold_by, payment_method, subtotal, tva, total)
  values (
    auth.uid(),
    p_payment_method,
    v_subtotal,
    round(v_subtotal - v_subtotal / 1.2, 2),
    v_subtotal
  )
  returning * into v_sale;

  -- Passe 2 : décrémente le stock et insère les lignes de vente
  for v_item in
    select * from jsonb_to_recordset(p_items) as x(stock_item_id uuid, quantity integer)
  loop
    select * into v_stock from stock_items where id = v_item.stock_item_id for update;

    if v_stock.quantity > v_item.quantity then
      update stock_items set quantity = quantity - v_item.quantity where id = v_stock.id;
    else
      update stock_items set quantity = 0, status = 'vendu' where id = v_stock.id;
    end if;

    insert into transactions (stock_item_id, ean, sale_price, sold_by, sale_id, quantity)
    values (v_stock.id, v_stock.ean, v_stock.sale_price, auth.uid(), v_sale.id, v_item.quantity);
  end loop;

  return v_sale;
end;
$fn$;

revoke all on function create_sale(jsonb, text) from public;
revoke all on function create_sale(jsonb, text) from anon;
grant execute on function create_sale(jsonb, text) to authenticated;

-- 4. ca_du_jour recalculé par panier (compatible avec les ventes
--    historiques faites via sell_product, où sale_id est null)
create or replace function ca_du_jour()
returns table(total numeric, nb_ventes integer, panier_moyen numeric)
language sql stable security definer set search_path = public as $fn$
  with t as (
    select
      coalesce(sale_id, id) as basket_id,
      sale_price * quantity as line_total
    from transactions
    where sold_at::date = now()::date
      and sold_by = auth.uid()
  ), b as (
    select basket_id, sum(line_total) as basket_total
    from t group by basket_id
  )
  select
    coalesce(sum(basket_total), 0)::numeric as total,
    count(*)::integer as nb_ventes,
    coalesce(avg(basket_total), 0)::numeric as panier_moyen
  from b;
$fn$;

grant execute on function ca_du_jour() to authenticated;
