# EURO STORE — Vue Vendeur

Interface Vendeur (Caisse + Tableau de bord), conforme au mock-up validé.
La création/modification du stock reste 100 % réservée à l'Admin (à venir : Interface 2).

## Mise en place

1. Créer un projet Supabase.
2. Exécuter `supabase/schema.sql` puis `supabase/seed.sql` dans le SQL editor.
3. Créer un utilisateur (Auth > Users), puis lui ajouter une ligne dans `profiles` :
   ```sql
   insert into profiles (id, full_name, role) values ('<uuid-utilisateur>', 'Vendeur Démo', 'vendeur');
   ```
4. Copier `.env.example` en `.env.local` et renseigner l'URL + clé anonyme du projet.
5. `npm install && npm run dev`

## Ce qui est branché

- **Caisse** : scan (IMEI ou EAN) → `scanArticle()` → fiche produit → `VENDRE` appelle la RPC
  `sell_product()` (décrément atomique du stock + transaction). En cas de coupure réseau, la vente
  est mise en file locale (`lib/offline-queue.ts`) et resynchronisée automatiquement au retour
  du réseau (`lib/use-offline-sync.ts`).
- **Tableau de bord** : `ca_du_jour()` (RPC) pour le CA du jour, `searchStock()` pour la recherche
  d'articles disponibles (lecture seule).
- **Alerte stock bas** : insertion dans `low_stock_alerts`, visible côté Admin.
- **Sécurité** : RLS Postgres interdit toute écriture directe du rôle `vendeur` sur `stock_items`
  et `catalog_products` — seule la fonction `sell_product()` (security definer) peut décrémenter
  le stock. Le middleware Next.js protège aussi les routes `/vendeur/*` et `/admin/*` par rôle.
- **PWA** : `manifest.json` + `public/sw.js` (cache de l'app shell). Étape suivante possible :
  Background Sync API pour déclencher la resynchronisation sans que l'app soit ouverte.

## Prochaine étape

Interface 2 (Admin — réception marchandise, pilotage & finance) après validation de cette vue.
