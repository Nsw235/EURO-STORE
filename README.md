# EURO STORE — La qualité européenne à votre portée

Application boutique (caisse vendeur + dashboard admin) fidèle aux maquettes fournies, en HTML/CSS/JS moderne, PWA-compatible et déployable en un clic sur Netlify.

## Structure

```
euro-store/
├── index.html                    # Connexion unifiée (e-mail + mot de passe)
├── caisse.html                   # Caisse virtuelle — vente & réception stock
├── admin.html                    # Pilotage boutique — dashboard & gestion
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

### Connexion unifiée — rôle détecté automatiquement

Il n'y a plus de sélecteur "Vendeur / Administrateur" à l'écran : un seul
formulaire e-mail + mot de passe (`index.html`). Le rôle est résolu
silencieusement à partir du compte reconnu (voir `SEED_USERS` dans
`js/db.js`) et redirige vers `caisse.html` ou `admin.html` en conséquence —
le mot "Administrateur" n'apparaît nulle part côté interface.

Comptes de démo (à remplacer avant mise en production) :

| E-mail | Mot de passe | Rôle |
|---|---|---|
| camille@eurostore.fr | admin123 | Pilotage boutique |
| sofia@eurostore.fr | vendeur123 | Caisse |
| yanis@eurostore.fr | vendeur123 | Caisse |

## Scan par caméra

En plus de la saisie clavier/douchette, la caisse (`caisse.html`) et la
réception de stock permettent de scanner un code-barres EAN/IMEI ou un QR
code directement avec la caméra de l'appareil, via la bibliothèque
[html5-qrcode](https://github.com/mebjas/html5-qrcode) (chargée depuis un
CDN). Cliquez sur l'icône caméra à côté du champ de scan : la caméra arrière
s'ouvre dans une fenêtre, le code détecté remplit automatiquement le champ
et déclenche la recherche — sans étape manuelle supplémentaire.

Notes :
- Nécessite HTTPS (ou `localhost`) et l'autorisation d'accès caméra du
  navigateur — c'est le cas par défaut sur Netlify/Cloudflare Pages.
- Si la caméra n'est pas disponible (hors ligne sans cache CDN, permission
  refusée, aucun périphérique), l'app retombe automatiquement sur la saisie
  manuelle avec un message explicite — aucune fonctionnalité n'est bloquée.
- Pour un usage 100% offline garanti, téléchargez `html5-qrcode.min.js` en
  local (dans `js/`) et remplacez l'URL CDN dans `caisse.html` par le
  chemin local ; ajoutez-le aussi à la liste `ASSETS` de `sw.js`.

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

`assets/icon-192.png` et `assets/icon-512.png` sont déjà fournis (générés à
partir du logo EURO STORE sur fond `#14171D`) — le manifeste les référence.

## Caisse — tableau de bord vendeur

`caisse.html` a été refondu en interface à trois zones :

- **Menu latéral** (`logo-header.png` + `logo-full.png` dans `assets/`) avec
  navigation : Tableau de bord (scan/vente), Ventes, Clients *(à venir)*,
  Inventaire, Réception, Réglages.
- **Zone de scan continu** : chaque code EAN/IMEI scanné est ajouté au
  **panier** (plusieurs articles par transaction) et affiché dans une fiche
  produit avec prix éditable.
- **Panier à droite** : liste des articles scannés, total en **FCFA**
  (grand format, devise d'affichage principale) et en **€** (devise de
  référence éditable), bouton *Vider le panier* et *Suspendre la vente*
  (mise en attente, reprise possible depuis la puce orange en haut du
  panier).

Le taux de change EUR → FCFA (parité fixe zone UEMOA/CEMAC, 1 € = 655,957
FCFA par défaut) se règle dans la page **Réglages** de la caisse.

## Sécurité — à faire avant une mise en production réelle

- Remplacer le mot de passe admin en clair (`localStorage`) par Firebase
  Auth (voir adaptateur) ou un mécanisme équivalent côté serveur.
- Ajouter des règles de sécurité Firestore restreignant l'écriture sur
  `stock`/`sales` aux rôles authentifiés (`admin`, `vendeur`).
- Servir l'app exclusivement en HTTPS (Netlify/Cloudflare le font par défaut).
