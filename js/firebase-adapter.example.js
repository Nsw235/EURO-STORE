/* ==========================================================================
   EURO STORE — Firebase Adapter (EXEMPLE, non chargé par défaut)
   ----------------------------------------------------------------------
   Ce fichier montre comment remplacer le backend localStorage (js/db.js)
   par Firebase (Firestore + Auth), sans changer caisse.js / admin.js,
   puisque toutes les fonctions de Store/Auth sont déjà asynchrones.

   ÉTAPES :
   1. Créez un projet sur https://console.firebase.google.com
   2. Activez Firestore (mode production) et Authentication
      (Email/Password, ou Anonymous pour l'espace vendeur).
   3. Ajoutez les SDK Firebase dans index.html / caisse.html / admin.html :

      <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
        import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
        import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

        const firebaseConfig = {
          apiKey: "...",
          authDomain: "...",
          projectId: "...",
          storageBucket: "...",
          messagingSenderId: "...",
          appId: "..."
        };
        const app = initializeApp(firebaseConfig);
        window.firestoreDB = getFirestore(app);
        window.firebaseAuth = getAuth(app);
      </script>

   4. Remplacez les fonctions ci-dessous (déjà au bon format) dans js/db.js.
      Collections suggérées :
        - catalog  (doc id = EAN)
        - stock    (doc id = IMEI, champ status: 'in_stock' | 'sold')
        - sales    (doc id = auto, champ timestamp = serverTimestamp())
        - config   (doc unique 'store')
   ========================================================================== */

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  signInAnonymously, signInWithEmailAndPassword, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export function buildFirebaseStore(db) {
  return {
    async findByCode(code) {
      // 1) try stock by IMEI (doc id lookup = O(1))
      const stockRef = doc(db, 'stock', code);
      const stockSnap = await getDoc(stockRef);
      if (stockSnap.exists() && stockSnap.data().status === 'in_stock') {
        return { type: 'stock', item: { imei: code, ...stockSnap.data() } };
      }
      // 2) try EAN -> catalog, then find an available unit
      const catRef = doc(db, 'catalog', code);
      const catSnap = await getDoc(catRef);
      if (catSnap.exists()) {
        const q = query(collection(db, 'stock'), where('ean', '==', code), where('status', '==', 'in_stock'), limit(1));
        const units = await getDocs(q);
        if (!units.empty) {
          const d = units.docs[0];
          return { type: 'stock', item: { imei: d.id, ...d.data() } };
        }
        return { type: 'catalog_only', item: { ean: code, ...catSnap.data() } };
      }
      return null;
    },

    async sellItem(imei, finalPrice, seller) {
      const stockRef = doc(db, 'stock', imei);
      const snap = await getDoc(stockRef);
      if (!snap.exists() || snap.data().status !== 'in_stock') throw new Error('Article introuvable en stock.');
      const item = snap.data();
      await updateDoc(stockRef, { status: 'sold', soldAt: serverTimestamp() });
      const saleRef = doc(collection(db, 'sales'));
      const sale = {
        imei, ean: item.ean, brand: item.brand, model: item.model, storage: item.storage,
        price: Number(finalPrice), timestamp: serverTimestamp(), seller: seller || 'Vendeur'
      };
      await setDoc(saleRef, sale);
      return { id: saleRef.id, ...sale, timestamp: new Date().toISOString() };
    },

    async addStockItem({ ean, price, imei, state }) {
      const catSnap = await getDoc(doc(db, 'catalog', ean));
      if (!catSnap.exists()) throw new Error('EAN inconnu du référentiel catalogue.');
      const existing = await getDoc(doc(db, 'stock', imei));
      if (existing.exists()) throw new Error('Cet IMEI existe déjà en stock.');
      const cat = catSnap.data();
      const item = {
        ean, brand: cat.brand, model: cat.model, storage: cat.storage, color: cat.color,
        price: Number(price), state, status: 'in_stock', addedAt: serverTimestamp()
      };
      await setDoc(doc(db, 'stock', imei), item);
      return { imei, ...item };
    },

    async getStock() {
      const q = query(collection(db, 'stock'), where('status', '==', 'in_stock'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ imei: d.id, ...d.data() }));
    },

    async getSales(limitN) {
      let q = query(collection(db, 'sales'), orderBy('timestamp', 'desc'));
      if (limitN) q = query(q, limit(limitN));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // ... implement updateStockItem, deleteStockItem, getKPIs, getSalesLast7Days,
    // getStockByBrand following the same pattern as js/db.js (Store object).
  };
}

export function buildFirebaseAuth(auth, db) {
  return {
    async loginVendeur(name) {
      const cred = await signInAnonymously(auth);
      return { role: 'vendeur', name: name || 'Vendeur', uid: cred.user.uid };
    },
    async loginAdmin(email, password) {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // Recommended: check a custom claim or a Firestore 'admins/{uid}' doc
      // to confirm this account is authorized as admin before proceeding.
      return { role: 'admin', name: cred.user.email, uid: cred.user.uid };
    },
    onChange(cb) { return onAuthStateChanged(auth, cb); }
  };
}

/* Security notes for production:
   - Never keep the admin password in a public config doc (as the demo
     localStorage version does) — use Firebase Auth + Firestore Security
     Rules restricting writes on 'stock'/'sales' to authenticated admin
     or seller roles (custom claims).
   - Example Firestore rule sketch:
       match /stock/{imei} {
         allow read: if request.auth != null;
         allow write: if request.auth.token.role in ['admin','vendeur'];
       }
       match /sales/{saleId} {
         allow create: if request.auth.token.role in ['admin','vendeur'];
         allow read, update, delete: if request.auth.token.role == 'admin';
       }
*/
