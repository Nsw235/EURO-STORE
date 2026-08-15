/* ==========================================================================
   EURO STORE — Data Layer (js/db.js)
   ----------------------------------------------------------------------
   Backend-agnostic data layer. Today it persists to localStorage so the
   app works 100% offline out of the box. Every function is written so it
   can be swapped for real Firebase Firestore / Auth calls later — see
   js/firebase-adapter.example.js and README.md § "Brancher Firebase".
   All functions are async (Promise-based) on purpose, so swapping the
   internals for real network calls requires no change in caisse.js/admin.js.
   ========================================================================== */

const DB_KEYS = {
  catalog: 'es_catalog',
  stock: 'es_stock',
  sales: 'es_sales',
  session: 'es_session',
  config: 'es_config',
  pending: 'es_pending_sync',
  users: 'es_users'
};

/* ---------------------------- Seed accounts -----------------------------
   Login is unified (email + mot de passe) for every profile. The role
   (admin / vendeur) is resolved silently from the matched account — it is
   never chosen or displayed on the login screen. Adapt/replace this list
   with real accounts (or a Firebase Auth + Firestore "users" collection —
   see js/firebase-adapter.example.js) before going to production.
   ------------------------------------------------------------------------ */
const SEED_USERS = [
  { email: 'camille@eurostore.fr', password: 'admin123', role: 'admin', name: 'Camille L.' },
  { email: 'sofia@eurostore.fr', password: 'vendeur123', role: 'vendeur', name: 'Sofia M.' },
  { email: 'yanis@eurostore.fr', password: 'vendeur123', role: 'vendeur', name: 'Yanis B.' }
];

/* ---------------------------- Seed data -------------------------------- */

const SEED_CATALOG = [
  // Apple — téléphones
  { ean: '0194253715001', brand: 'Apple', model: 'iPhone 15 Pro', storage: '128 Go', color: 'Titane Noir', price: 1129, category: 'phone', imageUrl: null },
  { ean: '0194253715002', brand: 'Apple', model: 'iPhone 15 Pro', storage: '256 Go', color: 'Titane Naturel', price: 1329, category: 'phone', imageUrl: null },
  { ean: '0194253715003', brand: 'Apple', model: 'iPhone 15', storage: '128 Go', color: 'Noir', price: 899, category: 'phone', imageUrl: null },
  { ean: '0194253715004', brand: 'Apple', model: 'iPhone 14', storage: '128 Go', color: 'Minuit', price: 749, category: 'phone', imageUrl: null },
  { ean: '0194253715005', brand: 'Apple', model: 'iPhone 13', storage: '64 Go', color: 'Rose', price: 599, category: 'phone', imageUrl: null },
  // Samsung — téléphones
  { ean: '8806094567001', brand: 'Samsung', model: 'Galaxy S24', storage: '256 Go', color: 'Violet Cobalt', price: 879, category: 'phone', imageUrl: null },
  { ean: '8806094567002', brand: 'Samsung', model: 'Galaxy S24 Ultra', storage: '512 Go', color: 'Titane Gris', price: 1449, category: 'phone', imageUrl: null },
  { ean: '8806094567003', brand: 'Samsung', model: 'Galaxy S23', storage: '128 Go', color: 'Crème', price: 699, category: 'phone', imageUrl: null },
  { ean: '8806094567004', brand: 'Samsung', model: 'Galaxy A54', storage: '128 Go', color: 'Vert', price: 379, category: 'phone', imageUrl: null },
  // Xiaomi — téléphones
  { ean: '6941812345001', brand: 'Xiaomi', model: 'Redmi Note 13', storage: '128 Go', color: 'Bleu Océan', price: 219, category: 'phone', imageUrl: null },
  { ean: '6941812345002', brand: 'Xiaomi', model: 'Redmi Note 13 Pro', storage: '256 Go', color: 'Noir', price: 329, category: 'phone', imageUrl: null },
  { ean: '6941812345003', brand: 'Xiaomi', model: '13T', storage: '256 Go', color: 'Bleu', price: 599, category: 'phone', imageUrl: null },
  // Tecno — téléphones
  { ean: '6975988870001', brand: 'Tecno', model: 'Camon 20', storage: '256 Go', color: 'Argent', price: 229, category: 'phone', imageUrl: null },
  { ean: '6975988870002', brand: 'Tecno', model: 'Spark 10', storage: '128 Go', color: 'Vert', price: 149, category: 'phone', imageUrl: null },
  // Infinix — téléphones
  { ean: '6938533810001', brand: 'Infinix', model: 'Note 30', storage: '256 Go', color: 'Noir', price: 219, category: 'phone', imageUrl: null },
  { ean: '6938533810002', brand: 'Infinix', model: 'Hot 40', storage: '128 Go', color: 'Bleu', price: 159, category: 'phone', imageUrl: null },
  // Écouteurs — toutes marques passent par le même référentiel EAN/IMEI
  { ean: '0194253820001', brand: 'Apple', model: 'AirPods Pro 2', storage: 'USB-C', color: 'Blanc', price: 279, category: 'earbuds', imageUrl: null },
  { ean: '0194253820002', brand: 'Apple', model: 'AirPods 4', storage: '—', color: 'Blanc', price: 149, category: 'earbuds', imageUrl: null },
  { ean: '8806094580001', brand: 'Samsung', model: 'Galaxy Buds2 Pro', storage: '—', color: 'Graphite', price: 189, category: 'earbuds', imageUrl: null },
  { ean: '6941812380001', brand: 'Xiaomi', model: 'Redmi Buds 5', storage: '—', color: 'Noir', price: 39, category: 'earbuds', imageUrl: null },
];

function seedStock() {
  const mk = (ean, imei, state, hoursAgo) => {
    const c = SEED_CATALOG.find(p => p.ean === ean);
    return {
      imei, ean, brand: c.brand, model: c.model, storage: c.storage, color: c.color,
      category: c.category, imageUrl: c.imageUrl,
      price: c.price, state, status: 'in_stock',
      addedAt: new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString()
    };
  };
  return [
    mk('0194253715001', '352094088729145', 'Neuf', 5),
    mk('0194253715002', '352094088729152', 'Neuf', 30),
    mk('0194253715003', '352094088729167', 'Neuf', 40),
    mk('0194253715004', '352094088729178', 'Neuf', 60),
    mk('0194253715005', '013845229066123', 'Reconditionné', 80),
    mk('8806094567001', '356938024817731', 'Neuf', 10),
    mk('8806094567001', '356938024817748', 'Neuf', 12),
    mk('8806094567002', '356938024817755', 'Neuf', 20),
    mk('8806094567003', '356938024817762', 'Reconditionné', 90),
    mk('8806094567004', '356938024817779', 'Neuf', 100),
    mk('6941812345001', '861234095533018', 'Neuf', 8),
    mk('6941812345002', '861234095533025', 'Neuf', 15),
    mk('6941812345003', '861234095533032', 'Neuf', 25),
    mk('6975988870001', '699450012233441', 'Neuf', 18),
    mk('6975988870002', '699450012233458', 'Neuf', 45),
    mk('6938533810001', '355321099887701', 'Neuf', 22),
    mk('6938533810002', '355321099887718', 'Neuf', 33),
    mk('0194253820001', '990011223344551', 'Neuf', 6),
    mk('0194253820002', '990011223344568', 'Neuf', 14),
    mk('8806094580001', '990011223344575', 'Neuf', 9),
    mk('6941812380001', '990011223344582', 'Neuf', 28),
  ];
}

function seedSales() {
  const today = new Date();
  const at = (h, m, daysAgo = 0) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  return [
    { id: 'S1001', imei: '352094088729110', ean: '0194253715001', brand: 'Apple', model: 'iPhone 15 Pro', storage: '128 Go', price: 1129, timestamp: at(14, 32), seller: 'SM' },
    { id: 'S1002', imei: '356938024817700', ean: '8806094567001', brand: 'Samsung', model: 'Galaxy S24', storage: '256 Go', price: 879, timestamp: at(13, 47), seller: 'SM' },
    { id: 'S1003', imei: '861234095533001', ean: '6941812345001', brand: 'Xiaomi', model: 'Redmi Note 13', storage: '128 Go', price: 219, timestamp: at(11, 5), seller: 'SM' },
    { id: 'S1004', imei: '013845229066112', ean: '0194253715005', brand: 'Apple', model: 'iPhone 13 — Reconditionné', storage: '64 Go', price: 459, timestamp: at(9, 58), seller: 'SM' },
    { id: 'S1005', imei: '699450012233400', ean: '6975988870001', brand: 'Tecno', model: 'Camon 20', storage: '256 Go', price: 229, timestamp: at(16, 10, 1), seller: 'SM' },
    { id: 'S1006', imei: '355321099887700', ean: '6938533810001', brand: 'Infinix', model: 'Note 30', storage: '256 Go', price: 219, timestamp: at(10, 22, 2), seller: 'SM' },
  ];
}

/* ---------------------------- Storage helpers --------------------------- */

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function init() {
  if (!localStorage.getItem(DB_KEYS.catalog)) write(DB_KEYS.catalog, SEED_CATALOG);
  if (!localStorage.getItem(DB_KEYS.stock)) write(DB_KEYS.stock, seedStock());
  if (!localStorage.getItem(DB_KEYS.sales)) write(DB_KEYS.sales, seedSales());
  if (!localStorage.getItem(DB_KEYS.config)) {
    write(DB_KEYS.config, { storeName: 'EURO STORE — Rue de la République' });
  }
  if (!localStorage.getItem(DB_KEYS.users)) {
    write(DB_KEYS.users, SEED_USERS);
  }
  if (!localStorage.getItem(DB_KEYS.pending)) write(DB_KEYS.pending, []);
}
init();

const delay = (ms = 120) => new Promise(r => setTimeout(r, ms));

/* ------------------------------ Auth ------------------------------------ */

const Auth = {
  // Unified login: the caller never picks a role. The account matched by
  // email silently carries its own role (admin / vendeur), and the app
  // routes accordingly — nothing on screen ever says "Administrateur".
  async login(email, password) {
    await delay();
    const clean = (email || '').trim().toLowerCase();
    const users = read(DB_KEYS.users, SEED_USERS);
    const user = users.find(u => u.email.toLowerCase() === clean && u.password === password);
    if (!user) throw new Error('E-mail ou mot de passe incorrect.');
    const session = { role: user.role, name: user.name, email: user.email, ts: Date.now() };
    write(DB_KEYS.session, session);
    return session;
  },
  getSession() { return read(DB_KEYS.session, null); },
  logout() { localStorage.removeItem(DB_KEYS.session); },
  requireRole(role) {
    const s = Auth.getSession();
    if (!s || s.role !== role) {
      window.location.href = 'index.html';
      return null;
    }
    return s;
  }
};

/* ------------------------------ Catalog/Stock ---------------------------- */

const Store = {
  online() { return navigator.onLine; },

  async findByCode(code) {
    await delay(80);
    const clean = (code || '').trim();
    if (!clean) return null;
    const stock = read(DB_KEYS.stock, []);
    // Try IMEI match against in-stock item first
    let item = stock.find(s => s.imei === clean && s.status === 'in_stock');
    if (item) return { type: 'stock', item };
    // Try EAN match -> catalog reference item, then pick an available unit
    const catalog = read(DB_KEYS.catalog, []);
    const cat = catalog.find(c => c.ean === clean);
    if (cat) {
      const unit = stock.find(s => s.ean === clean && s.status === 'in_stock');
      if (unit) return { type: 'stock', item: unit };
      return { type: 'catalog_only', item: cat };
    }
    return null;
  },

  async getCatalogByEan(ean) {
    await delay(60);
    const catalog = read(DB_KEYS.catalog, []);
    return catalog.find(c => c.ean === ean) || null;
  },

  async addStockItem({ ean, price, imei, state, imageUrl }) {
    await delay();
    const catalog = read(DB_KEYS.catalog, []);
    const cat = catalog.find(c => c.ean === ean);
    if (!cat) throw new Error('EAN inconnu du référentiel catalogue.');
    const stock = read(DB_KEYS.stock, []);
    if (stock.some(s => s.imei === imei)) throw new Error('Cet IMEI existe déjà en stock.');
    const newItem = {
      imei, ean, brand: cat.brand, model: cat.model, storage: cat.storage, color: cat.color,
      category: cat.category || 'phone', imageUrl: imageUrl || cat.imageUrl || null,
      price: Number(price), state, status: 'in_stock', addedAt: new Date().toISOString()
    };
    stock.unshift(newItem);
    write(DB_KEYS.stock, stock);
    return newItem;
  },

  async sellItem(imei, finalPrice, seller) {
    await delay();
    const stock = read(DB_KEYS.stock, []);
    const idx = stock.findIndex(s => s.imei === imei && s.status === 'in_stock');
    if (idx === -1) throw new Error('Article introuvable en stock.');
    const item = stock[idx];
    item.status = 'sold';
    item.soldAt = new Date().toISOString();
    stock[idx] = item;
    write(DB_KEYS.stock, stock);

    const sale = {
      id: 'S' + Date.now(),
      imei: item.imei, ean: item.ean, brand: item.brand,
      model: item.state === 'Reconditionné' ? item.model + ' — Reconditionné' : item.model,
      storage: item.storage, category: item.category || 'phone', price: Number(finalPrice),
      timestamp: new Date().toISOString(), seller: seller || 'Vendeur'
    };
    const sales = read(DB_KEYS.sales, []);
    sales.unshift(sale);
    write(DB_KEYS.sales, sales);

    if (!Store.online()) {
      const pending = read(DB_KEYS.pending, []);
      pending.push({ type: 'sale', payload: sale, queuedAt: Date.now() });
      write(DB_KEYS.pending, pending);
    }
    return sale;
  },

  async updateStockItem(imei, updates) {
    await delay();
    const stock = read(DB_KEYS.stock, []);
    const idx = stock.findIndex(s => s.imei === imei);
    if (idx === -1) throw new Error('Article introuvable.');
    stock[idx] = { ...stock[idx], ...updates };
    write(DB_KEYS.stock, stock);
    return stock[idx];
  },

  async deleteStockItem(imei) {
    await delay();
    let stock = read(DB_KEYS.stock, []);
    stock = stock.filter(s => s.imei !== imei);
    write(DB_KEYS.stock, stock);
  },

  async getStock() {
    await delay(60);
    return read(DB_KEYS.stock, []).filter(s => s.status === 'in_stock');
  },

  async getSales(limit) {
    await delay(60);
    const sales = read(DB_KEYS.sales, []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return limit ? sales.slice(0, limit) : sales;
  },

  pendingSyncCount() { return read(DB_KEYS.pending, []).length; },

  async flushPendingSync() {
    if (!Store.online()) return 0;
    const pending = read(DB_KEYS.pending, []);
    write(DB_KEYS.pending, []);
    return pending.length;
  },

  /* --------------------------- KPIs / analytics --------------------------- */

  _rangeStart(range) {
    const d = new Date();
    if (range === 'day') { d.setHours(0, 0, 0, 0); return d; }
    if (range === 'week') { const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0); return d; }
    d.setDate(1); d.setHours(0, 0, 0, 0); return d; // month
  },

  async getKPIs(range = 'month') {
    await delay(80);
    const sales = read(DB_KEYS.sales, []);
    const start = Store._rangeStart(range);
    const inRange = sales.filter(s => new Date(s.timestamp) >= start);
    const ca = inRange.reduce((sum, s) => sum + s.price, 0);
    const volume = inRange.length;
    const marge = ca * 0.255; // estimated margin, matches mockup ratio; adjust when real cost data exists
    const panierMoyen = volume ? ca / volume : 0;
    return {
      ca: Math.round(ca), volume, marge: Math.round(marge), panierMoyen: Math.round(panierMoyen)
    };
  },

  async getSalesLast7Days() {
    await delay(80);
    const sales = read(DB_KEYS.sales, []);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
      const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
      const count = sales.filter(s => {
        const t = new Date(s.timestamp);
        return t >= dayStart && t <= dayEnd;
      }).length;
      days.push({ label: label.charAt(0).toUpperCase() + label.slice(1), count });
    }
    return days;
  },

  async getStockByBrand() {
    await delay(60);
    const stock = read(DB_KEYS.stock, []).filter(s => s.status === 'in_stock');
    const map = {};
    stock.forEach(s => { map[s.brand] = (map[s.brand] || 0) + 1; });
    return Object.entries(map).map(([brand, count]) => ({ brand, count })).sort((a, b) => b.count - a.count);
  }
};

window.EuroStoreDB = { Auth, Store, DB_KEYS, read, write };
