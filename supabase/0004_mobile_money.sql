-- ============================================================
-- EURO STORE — ajout du Mobile Money (Airtel/Moov) comme mode
-- de paiement, standard pour le marché tchadien.
-- Reprend create_sale() de 0002_add_cart_and_payment.sql à
-- l'identique — seule la liste des modes acceptés change.
-- ============================================================

alter table sales drop constraint if exists sales_payment_method_check;
alter table sales add constraint sales_payment_method_check
  check (payment_method in ('mobile_money', 'especes', 'carte', 'virement', 'autre'));

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

  if p_payment_method not in ('mobile_money', 'especes', 'carte', 'virement', 'autre') then
    raise exception 'Mode de paiement invalide';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Panier vide';
  end if;

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
