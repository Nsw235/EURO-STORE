-- ============================================================
-- EURO STORE — schema, roles & RLS
-- Sépare strictement VENDEUR (vente uniquement) et ADMIN (stock).
-- ============================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------
-- 1. Profils & rôles (lié à auth.users de Supabase Auth)
-- ----------------------------------------------------------------
create type user_role as enum ('vendeur', 'admin');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'vendeur',
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- 2. Référentiel mondial produits (catalogue EAN/UPC)
--    Rempli par l'API code-barres + cache local à chaque lookup.
-- ----------------------------------------------------------------
create table catalog_products (
  ean text primary key,
  brand text not null,
  name text not null,
  category text not null check (category in ('telephone', 'accessoire')),
  image_url text,
  source text not null default 'external', -- 'external' | 'manual'
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- 3. Stock boutique EURO STORE (ce que l'admin réceptionne)
-- ----------------------------------------------------------------
create table stock_items (
  id uuid primary key default gen_random_uuid(),
  ean text not null references catalog_products(ean),
  imei text unique,                          -- rempli si téléphone
  purchase_price numeric(10,2) not null,
  sale_price numeric(10,2) not null,
  quantity integer not null default 1,       -- accessoires (quantité), 1 pour téléphone
  condition text not null default 'neuf' check (condition in ('neuf', 'occasion', 'reconditionne')),
  status text not null default 'en_stock' check (status in ('en_stock', 'vendu', 'retire')),
  received_at timestamptz not null default now(),
  received_by uuid references profiles(id)
);

create index idx_stock_ean on stock_items(ean);
create index idx_stock_status on stock_items(status);

-- ----------------------------------------------------------------
-- 4. Historique des transactions (ventes)
-- ----------------------------------------------------------------
create table transactions (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references stock_items(id),
  ean text not null,
  sale_price numeric(10,2) not null,
  sold_by uuid not null references profiles(id),
  sold_at timestamptz not null default now(),
  offline_synced_at timestamptz -- rempli si la vente a été faite hors-ligne
);

create index idx_transactions_sold_at on transactions(sold_at);
create index idx_transactions_sold_by on transactions(sold_by);

-- ----------------------------------------------------------------
-- 5. Alertes de réapprovisionnement (vendeur -> admin)
-- ----------------------------------------------------------------
create table low_stock_alerts (
  id uuid primary key default gen_random_uuid(),
  ean text not null,
  note text,
  raised_by uuid not null references profiles(id),
  raised_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolved_at timestamptz
);

-- ============================================================
-- RLS — le vendeur ne touche jamais à la création/modif de stock
-- ============================================================
alter table profiles enable row level security;
alter table catalog_products enable row level security;
alter table stock_items enable row level security;
alter table transactions enable row level security;
alter table low_stock_alerts enable row level security;

create function current_role() returns user_role
language sql stable as $$
  select role from profiles where id = auth.uid();
$$;

-- profiles : chacun lit son propre profil
create policy "read own profile" on profiles
  for select using (id = auth.uid());

-- catalog_products : lecture pour tous les rôles authentifiés
create policy "read catalog" on catalog_products
  for select using (auth.role() = 'authenticated');
create policy "admin writes catalog" on catalog_products
  for insert with check (current_role() = 'admin');
create policy "admin updates catalog" on catalog_products
  for update using (current_role() = 'admin');

-- stock_items : vendeur = lecture seule. admin = tout.
create policy "read stock (vendeur+admin)" on stock_items
  for select using (auth.role() = 'authenticated');
create policy "admin inserts stock" on stock_items
  for insert with check (current_role() = 'admin');
create policy "admin updates stock" on stock_items
  for update using (current_role() = 'admin');
-- Le vendeur passe uniquement par la fonction sell_product() (security definer)
-- ci-dessous : aucune policy UPDATE ne lui est accordée directement.

-- transactions : vendeur crée les siennes, tous lisent
create policy "read transactions" on transactions
  for select using (auth.role() = 'authenticated');
create policy "vendeur inserts own sale" on transactions
  for insert with check (sold_by = auth.uid());

-- low_stock_alerts : vendeur crée, tous lisent, admin résout
create policy "read alerts" on low_stock_alerts
  for select using (auth.role() = 'authenticated');
create policy "vendeur raises alert" on low_stock_alerts
  for insert with check (raised_by = auth.uid());
create policy "admin resolves alert" on low_stock_alerts
  for update using (current_role() = 'admin');

-- ============================================================
-- RPC : vente atomique (le seul chemin d'écriture du vendeur sur le stock)
-- decremente/marque vendu + insère la transaction, dans une seule transaction SQL
-- ============================================================
create or replace function sell_product(p_stock_item_id uuid)
returns transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item stock_items;
  v_tx transactions;
begin
  if current_role() not in ('vendeur', 'admin') then
    raise exception 'Non autorisé';
  end if;

  select * into v_item from stock_items where id = p_stock_item_id for update;

  if v_item is null then
    raise exception 'Article introuvable';
  end if;
  if v_item.status <> 'en_stock' or v_item.quantity < 1 then
    raise exception 'Article indisponible';
  end if;

  if v_item.quantity > 1 then
    update stock_items set quantity = quantity - 1 where id = p_stock_item_id;
  else
    update stock_items set quantity = 0, status = 'vendu' where id = p_stock_item_id;
  end if;

  insert into transactions (stock_item_id, ean, sale_price, sold_by)
  values (v_item.id, v_item.ean, v_item.sale_price, auth.uid())
  returning * into v_tx;

  return v_tx;
end;
$$;

grant execute on function sell_product(uuid) to authenticated;

-- ============================================================
-- RPC : CA du jour pour le vendeur connecté
-- ============================================================
create or replace function ca_du_jour()
returns table(total numeric, nb_ventes integer, panier_moyen numeric)
language sql stable security definer set search_path = public as $$
  select
    coalesce(sum(sale_price), 0)::numeric as total,
    count(*)::integer as nb_ventes,
    coalesce(avg(sale_price), 0)::numeric as panier_moyen
  from transactions
  where sold_at::date = now()::date
    and sold_by = auth.uid();
$$;

grant execute on function ca_du_jour() to authenticated;
