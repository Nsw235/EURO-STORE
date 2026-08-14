# EURO STORE — La qualité européenne à votre portée

Application boutique (caisse vendeur + dashboard admin) fidèle aux maquettes fournies, en HTML/CSS/JS moderne, PWA-compatible et déployable en un clic sur Netlify.

## Structure

```
euro-store/
├── index.html                    # Connexion (Espace Vendeur / Administrateur)
├── caisse.html                   # Espace Vendeur — Caisse & Réception stock
├── admin.html                    # Espace Administrateur — Dashboard & pilotage
├── manifest.json                 # Manifeste PWA
├── sw.js                         # Service worker (cache app shell, mode offline)
├── netlify.toml                  # Config déploiement Netlify
├── js/
│   ├── db.js                     # Couche de données (localStorage aujourd'hui, Firestore demain)
│   ├── caisse.js                 # Logique caisse : scan, vente, réception stock
│   ├── admin.js                  # Logique dashboard : KPIs, stock, ventes, rapports
│   └── firebase-adapter.example.js  # Exemple de branchement Firebase (voir plus bas)
└── assets/                       # Icônes PWA (à fournir : icon-192.png, icon-512.png)
```

## Fonctionne immédiatement, sans backend

Toutes les données (catalogue, stock, ventes) sont persistées en `localStorage`
via `js/db.js`. L'app est **utilisable et démontrable hors ligne dès l'ouverture** —
catalogue Apple/Samsung/Xiaomi/Tecno/Infinix prérempli, unités de stock avec IMEI,
historique de ventes de démo.

- **Connexion admin démo : `admin123`** (modifiable dans `js/db.js` → `DB_KEYS.config`)
- **Espace vendeur** : saisir un prénom, pas de mot de passe (accès simplifié comptoir)

## Déploiement Netlify (aucune étape de build)

1. Poussez ce dossier sur un dépôt GitHub.
2. Sur [app.netlify.com](https://app.netlify.com) → "Add new site" → "Import an existing project".
3. Sélectionnez le dépôt. Build command : *(vide)*. Publish directory : `.`
4. Déployez — `netlify.toml` est déjà configuré (headers de sécurité + fallback SPA).

Alternative Cloudflare Pages : même principe, "Framework preset: None", build command vide, output directory `/`.

## Brancher Firebase (Firestore + Auth) pour une vraie synchronisation multi-postes

La version actuelle utilise `localStorage`, donc **chaque poste (vendeur/admin) a ses propres données** — parfait pour une démo ou un point de vente unique fonctionnant hors ligne, mais pas pour synchroniser plusieurs caisses en temps réel.

Pour passer en production multi-boutique :

1. Créez un projet Firebase, activez **Firestore** et **Authentication**.
2. Suivez le guide complet dans `js/firebase-adapter.example.js` : il contient
   déjà l'implémentation Firestore de `findByCode`, `sellItem`, `addStockItem`,
   `getStock`, `getSales`, ainsi que `Auth.loginVendeur` / `loginAdmin` avec
   Firebase Authentication, et un exemple de règles de sécurité Firestore.
3. Remplacez le contenu de `Store` et `Auth` dans `js/db.js` par les
   implémentations Firestore — **aucune modification n'est nécessaire dans
   `caisse.js` ou `admin.js`** puisque toute l'API est déjà asynchrone (Promises).

### Alternative Neon.tech (PostgreSQL)

Si vous préférez Postgres : exposez une petite API (Netlify Functions ou
Cloudflare Workers) qui reproduit les mêmes routes que l'objet `Store`
(`/api/stock`, `/api/sales`, `/api/sell`, etc.) branchée sur Neon via
`@neondatabase/serverless`, puis remplacez les appels `localStorage` de
`js/db.js` par des `fetch('/api/...')`. La structure des fonctions reste
identique (mêmes noms, mêmes retours), donc le front n'a pas besoin d'être
réécrit.

## Mode Offline / PWA

- `manifest.json` + `sw.js` permettent l'installation sur mobile/tablette
  (Ajouter à l'écran d'accueil) et la mise en cache de l'app shell.
- Les ventes réalisées hors connexion sont enregistrées localement et
  marquées "en attente de synchro" (`es_pending_sync` dans `localStorage`) ;
  elles sont automatiquement traitées au retour du réseau
  (`window.addEventListener('online', ...)` dans `js/caisse.js`).
- Avec Firestore, ce comportement est **natif** (persistance offline
  intégrée au SDK via `enableIndexedDbPersistence`), ce qui simplifie
  encore cette partie une fois le backend branché.

## Icônes PWA

Ajoutez `assets/icon-192.png` et `assets/icon-512.png` (logo EURO STORE,
fond `#14171D`) avant le déploiement final — le manifeste les référence déjà.

## Sécurité — à faire avant une mise en production réelle

- Remplacer le mot de passe admin en clair (`localStorage`) par Firebase
  Auth (voir adaptateur) ou un mécanisme équivalent côté serveur.
- Ajouter des règles de sécurité Firestore restreignant l'écriture sur
  `stock`/`sales` aux rôles authentifiés (`admin`, `vendeur`).
- Servir l'app exclusivement en HTTPS (Netlify/Cloudflare le font par défaut).
