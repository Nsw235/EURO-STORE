insert into catalog_products (ean, brand, name, category, image_url, source) values
  ('194252099985', 'Apple', 'iPhone 14 Pro 128Go', 'telephone', null, 'manual'),
  ('8806094891019', 'Samsung', 'Galaxy S23', 'telephone', null, 'manual'),
  ('194252700124', 'Apple', 'Coque MagSafe Cuir', 'accessoire', null, 'manual'),
  ('190199098702', 'Apple', 'AirPods Pro 2', 'accessoire', null, 'manual'),
  ('883049837921', 'Générique', 'Chargeur 20W USB-C', 'accessoire', null, 'manual')
on conflict (ean) do nothing;

-- Remplacer received_by par l'UUID réel d'un profil admin après création du compte.
insert into stock_items (ean, imei, purchase_price, sale_price, quantity, status) values
  ('194252099985', '356789101234567', 720.00, 989.00, 1, 'en_stock'),
  ('194252099985', '356789101234568', 720.00, 989.00, 1, 'en_stock'),
  ('194252099985', '356789101234569', 720.00, 989.00, 1, 'en_stock'),
  ('8806094891019', '356789101234570', 540.00, 749.00, 1, 'en_stock'),
  ('194252700124', null, 22.00, 55.00, 12, 'en_stock'),
  ('190199098702', null, 190.00, 279.00, 0, 'en_stock'),
  ('883049837921', null, 6.00, 19.00, 27, 'en_stock');
