(function () {
  const { Auth, Store } = window.EuroStoreDB;
  const session = Auth.requireRole('vendeur');
  if (!session) return;

  const FX_RATE = 655.957; // 1 EUR = 655.957 FCFA (parité fixe)

  const initials = (session.name || 'VD').slice(0, 2).toUpperCase();
  document.getElementById('avatar').textContent = initials;
  document.getElementById('sideAvatar').textContent = initials;
  document.getElementById('sideName').textContent = session.name || 'Vendeur';

  function doLogout() {
    if (confirm('Se déconnecter ?')) { Auth.logout(); window.location.href = 'index.html'; }
  }
  document.getElementById('avatar').addEventListener('click', doLogout);
  document.getElementById('btnLogout').addEventListener('click', doLogout);

  /* ------------------------------- Navigation ------------------------------ */
  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => {
    const target = item.dataset.page;
    document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + target).classList.add('active');
    if (target === 'ventes') renderVentesPage();
    if (target === 'inventaire') renderInventairePage();
    if (target === 'reglages') renderReglagesPage();
    if (target === 'dashboard') scanInput.focus();
  }));

  // Clock
  function tick() { document.getElementById('clock').textContent = new Date().toLocaleTimeString('fr-FR'); }
  tick(); setInterval(tick, 1000);

  // Network status
  function updateNet() {
    const dot = document.getElementById('netDot');
    if (navigator.onLine) { dot.classList.remove('offline'); dot.querySelector('span').textContent = 'Connecté'; }
    else { dot.classList.add('offline'); dot.querySelector('span').textContent = 'Hors ligne'; }
  }
  window.addEventListener('online', async () => { updateNet(); const n = await Store.flushPendingSync(); if (n) showToast('Synchronisé', n + ' vente(s) envoyée(s) au serveur.', false); });
  window.addEventListener('offline', updateNet);
  updateNet();

  function showToast(title, sub, ok) {
    const toast = document.getElementById('toast');
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastSub').textContent = sub;
    toast.classList.toggle('offline-toast', ok === false);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }

  /* --------------------------- Formatting helpers -------------------------- */

  function fmtFcfa(eur) {
    const v = Math.round(Number(eur) * FX_RATE);
    return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';
  }
  function fmtEur(eur) {
    return Number(eur).toFixed(2).replace('.', ',') + ' €';
  }

  /* --------------------------- CAISSE (scan/panier) ------------------------ */

  let cart = []; // { imei, ean, brand, model, storage, color, state, price }
  let lastScannedImei = null;

  const scanInput = document.getElementById('scanInput');
  const emptyState = document.getElementById('emptyState');
  const productCard = document.getElementById('productCard');
  const scanError = document.getElementById('scanError');
  const btnVendre = document.getElementById('btnVendre');
  const vendreLabel = document.getElementById('vendreLabel');
  const cartItemsEl = document.getElementById('cartItems');
  const cartEmptyEl = document.getElementById('cartEmpty');
  const cartCountEl = document.getElementById('cartCount');

  function showScanError(msg) {
    scanError.querySelector('span:last-child').textContent = msg;
    scanError.classList.add('show');
    setTimeout(() => scanError.classList.remove('show'), 3200);
  }

  function cartTotal() { return cart.reduce((s, it) => s + Number(it.price), 0); }

  function renderCart() {
    cartItemsEl.innerHTML = '';
    if (!cart.length) {
      cartItemsEl.appendChild(cartEmptyEl);
      cartEmptyEl.style.display = 'block';
    } else {
      cart.forEach(it => {
        const row = document.createElement('div');
        row.className = 'cart-row';
        row.innerHTML =
          '<div class="ci-info">' +
            '<div class="ci-name">' + it.model + '</div>' +
            '<div class="ci-sub">' + it.storage + ' · ' + it.color + '</div>' +
          '</div>' +
          '<div class="ci-price"><span class="fcfa">' + fmtFcfa(it.price) + '</span><span class="eur">' + fmtEur(it.price) + '</span></div>' +
          '<button class="ci-remove" data-imei="' + it.imei + '" title="Retirer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
        cartItemsEl.appendChild(row);
      });
    }
    cartCountEl.textContent = cart.length + (cart.length > 1 ? ' articles' : ' article');
    document.getElementById('cartTotalFcfa').innerHTML = fmtFcfa(cartTotal()) + '<small id="cartTotalEur">' + fmtEur(cartTotal()) + '</small>';

    btnVendre.disabled = cart.length === 0;
    vendreLabel.textContent = cart.length ? 'Vendre — ' + fmtFcfa(cartTotal()) : 'Vendre';
    document.getElementById('btnSuspend').disabled = cart.length === 0;
    document.getElementById('btnCancel').disabled = cart.length === 0;

    cartItemsEl.querySelectorAll('.ci-remove').forEach(btn => btn.addEventListener('click', () => {
      removeFromCart(btn.dataset.imei);
    }));
  }

  function showProductPreview(item) {
    lastScannedImei = item.imei;
    emptyState.style.display = 'none';
    productCard.classList.add('show');
    document.getElementById('pcTitle').innerHTML = item.model + ' <span>' + item.brand + '</span>';
    document.getElementById('pcImei').textContent = item.imei;
    document.getElementById('pcPrice').textContent = fmtFcfa(item.price).replace(' FCFA', '');
    document.getElementById('pcPriceEur').textContent = fmtEur(item.price);
    document.getElementById('pcStockNote').textContent = 'Ajouté au panier';
    const badges = document.getElementById('pcBadges');
    badges.innerHTML = '';
    badges.innerHTML += '<div class="badge ' + (item.state === 'Neuf' ? 'badge-new' : 'badge-refurb') + '">' + item.state + '</div>';
    badges.innerHTML += '<div class="badge badge-neutral">' + item.storage + '</div>';
    badges.innerHTML += '<div class="badge badge-neutral">' + item.color + '</div>';
  }

  function resetPreview() {
    lastScannedImei = null;
    productCard.classList.remove('show');
    emptyState.style.display = 'block';
  }

  function addToCart(item) {
    if (cart.some(it => it.imei === item.imei)) {
      showScanError('Cet article est déjà dans le panier.');
      showProductPreview(cart.find(it => it.imei === item.imei));
      return;
    }
    cart.push({
      imei: item.imei, ean: item.ean, brand: item.brand, model: item.model,
      storage: item.storage, color: item.color, state: item.state, price: Number(item.price)
    });
    showProductPreview(cart[cart.length - 1]);
    renderCart();
  }

  function removeFromCart(imei) {
    cart = cart.filter(it => it.imei !== imei);
    if (lastScannedImei === imei) resetPreview();
    renderCart();
  }

  function resetAll() {
    cart = [];
    resetPreview();
    renderCart();
  }

  async function handleScan() {
    const code = scanInput.value.trim();
    if (!code) return;
    const result = await Store.findByCode(code);
    if (!result) { showScanError('Aucun produit trouvé pour ce code.'); scanInput.value = ''; return; }
    if (result.type === 'catalog_only') {
      showScanError('Référence connue mais aucune unité en stock (' + result.item.brand + ' ' + result.item.model + ').');
      scanInput.value = '';
      return;
    }
    addToCart(result.item);
    scanInput.value = '';
  }
  scanInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleScan(); });

  document.getElementById('pcPrice').addEventListener('blur', function () {
    const raw = this.textContent.replace(/[^\d.,]/g, '').replace(',', '.');
    const val = parseFloat(raw);
    if (!isNaN(val) && lastScannedImei) {
      const line = cart.find(it => it.imei === lastScannedImei);
      if (line) {
        line.price = val;
        document.getElementById('pcPriceEur').textContent = fmtEur(val);
        renderCart();
      }
    }
  });

  document.getElementById('btnCancel').addEventListener('click', resetAll);

  document.getElementById('btnCartTrash').addEventListener('click', () => {
    if (!cart.length) return;
    if (confirm('Vider le panier en cours ?')) resetAll();
  });

  btnVendre.addEventListener('click', async () => {
    if (!cart.length) return;
    btnVendre.disabled = true;
    try {
      const sales = await Store.sellCart(cart, session.name);
      const total = sales.reduce((s, x) => s + x.price, 0);
      const online = navigator.onLine;
      showToast('Vente enregistrée', sales.length + ' article(s) · ' + fmtFcfa(total) + (online ? '' : ' (hors ligne — en attente de synchro)'), online);
      setTimeout(resetAll, 900);
    } catch (e) {
      showScanError(e.message);
      btnVendre.disabled = false;
    }
  });

  document.getElementById('btnSuspend').addEventListener('click', async () => {
    if (!cart.length) return;
    await Store.suspendCart(cart, session.name);
    showToast('Vente suspendue', cart.length + ' article(s) mis de côté.', true);
    resetAll();
    renderSuspended();
  });

  async function renderSuspended() {
    const list = await Store.getSuspended();
    const row = document.getElementById('suspendedRow');
    row.innerHTML = '';
    if (!list.length) { row.style.display = 'none'; return; }
    row.style.display = 'flex';
    list.forEach(t => {
      const chip = document.createElement('div');
      chip.className = 'suspended-chip';
      chip.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
        'Reprendre · ' + t.items.length + ' art. · ' + fmtFcfa(t.total);
      chip.title = new Date(t.ts).toLocaleTimeString('fr-FR');
      chip.addEventListener('click', async () => {
        if (cart.length && !confirm('Remplacer le panier actuel par ce ticket en attente ?')) return;
        const ticket = await Store.resumeSuspended(t.id);
        cart = ticket.items;
        renderCart();
        if (cart.length) showProductPreview(cart[cart.length - 1]);
        renderSuspended();
      });
      row.appendChild(chip);
    });
  }

  renderCart();
  renderSuspended();

  /* --------------------------- RÉCEPTION STOCK ----------------------------- */

  const recEan = document.getElementById('recEan');
  const recPrice = document.getElementById('recPrice');
  const recImei = document.getElementById('recImei');
  const btnAddStock = document.getElementById('btnAddStock');
  const recError = document.getElementById('recError');
  let selectedState = 'Neuf';
  let recCatalog = null;

  document.querySelectorAll('#recState .chip-opt').forEach(c => c.addEventListener('click', () => {
    document.querySelectorAll('#recState .chip-opt').forEach(x => {
      x.classList.remove('selected');
      x.style.borderColor = 'var(--line)'; x.style.background = 'var(--surface-2)'; x.style.color = 'var(--muted)';
    });
    c.classList.add('selected');
    c.style.borderColor = 'var(--signal)'; c.style.background = 'var(--signal-dim)'; c.style.color = 'var(--signal)';
    selectedState = c.dataset.state;
  }));

  function showRecError(msg) {
    recError.querySelector('span:last-child').textContent = msg;
    recError.classList.add('show');
    recError.style.display = 'flex';
    setTimeout(() => { recError.classList.remove('show'); recError.style.display = 'none'; }, 3200);
  }

  function checkReadyToAdd() {
    btnAddStock.disabled = !(recCatalog && recPrice.value && recImei.value.trim());
  }

  async function lookupEan() {
    const ean = recEan.value.trim();
    recCatalog = ean ? await Store.getCatalogByEan(ean) : null;
    if (recCatalog) {
      document.getElementById('recBrand').value = recCatalog.brand;
      document.getElementById('recModel').value = recCatalog.model;
      document.getElementById('recStorage').value = recCatalog.storage;
      document.getElementById('recColor').value = recCatalog.color;
      recPrice.value = recCatalog.price;
      document.getElementById('prevTitle').textContent = recCatalog.model;
      document.getElementById('prevSub').textContent = recCatalog.storage + ' · ' + recCatalog.color;
      document.getElementById('prevEan').textContent = 'EAN ' + recCatalog.ean;
    } else {
      ['recBrand', 'recModel', 'recStorage', 'recColor'].forEach(id => document.getElementById(id).value = '—');
      document.getElementById('prevTitle').textContent = '—';
      document.getElementById('prevSub').textContent = '—';
      document.getElementById('prevEan').textContent = 'EAN —';
      if (ean) showRecError('EAN inconnu du référentiel catalogue.');
    }
    checkReadyToAdd();
  }
  recEan.addEventListener('keydown', e => { if (e.key === 'Enter') lookupEan(); });
  recEan.addEventListener('blur', lookupEan);
  recPrice.addEventListener('input', checkReadyToAdd);
  recImei.addEventListener('input', checkReadyToAdd);

  btnAddStock.addEventListener('click', async () => {
    if (!recCatalog) return;
    try {
      await Store.addStockItem({ ean: recCatalog.ean, price: recPrice.value, imei: recImei.value.trim(), state: selectedState });
      showToast('Ajouté au stock', recCatalog.model + ' · IMEI ' + recImei.value.trim(), true);
      recEan.value = ''; recImei.value = ''; recPrice.value = '';
      recCatalog = null;
      ['recBrand', 'recModel', 'recStorage', 'recColor'].forEach(id => document.getElementById(id).value = '—');
      document.getElementById('prevTitle').textContent = '—';
      document.getElementById('prevSub').textContent = '—';
      document.getElementById('prevEan').textContent = 'EAN —';
      checkReadyToAdd();
      recEan.focus();
    } catch (e) {
      showRecError(e.message);
    }
  });

  /* --------------------------------- VENTES --------------------------------- */

  async function renderVentesPage() {
    const sales = await Store.getSales();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todaySales = sales.filter(s => new Date(s.timestamp) >= today);
    const total = todaySales.reduce((s, x) => s + x.price, 0);

    document.getElementById('ventesTiles').innerHTML =
      '<div class="tile"><div class="t-label">Ventes du jour</div><div class="t-value">' + todaySales.length + '</div></div>' +
      '<div class="tile"><div class="t-label">Chiffre d\'affaires</div><div class="t-value">' + fmtFcfa(total) + '</div></div>' +
      '<div class="tile"><div class="t-label">Équivalent EUR</div><div class="t-value">' + fmtEur(total) + '</div></div>';

    const body = document.getElementById('ventesBody');
    body.innerHTML = '';
    if (!todaySales.length) {
      body.innerHTML = '<tr><td colspan="5" style="color:var(--muted); text-align:center; padding:30px;">Aucune vente enregistrée aujourd\'hui.</td></tr>';
      return;
    }
    todaySales.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="mono">' + new Date(s.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '</td>' +
        '<td>' + s.brand + ' ' + s.model + '</td>' +
        '<td class="mono">' + (s.storage || '—') + '</td>' +
        '<td>' + (s.seller || '—') + '</td>' +
        '<td class="mono">' + fmtFcfa(s.price) + '</td>';
      body.appendChild(tr);
    });
  }

  /* ------------------------------- INVENTAIRE ------------------------------- */

  let fullStock = [];
  async function renderInventairePage() {
    fullStock = await Store.getStock();
    const byBrand = {};
    fullStock.forEach(s => { byBrand[s.brand] = (byBrand[s.brand] || 0) + 1; });
    document.getElementById('invTiles').innerHTML =
      '<div class="tile"><div class="t-label">Unités en stock</div><div class="t-value">' + fullStock.length + '</div></div>' +
      Object.entries(byBrand).map(([b, c]) => '<div class="tile"><div class="t-label">' + b + '</div><div class="t-value">' + c + '</div></div>').join('');
    renderInvTable(fullStock);
  }
  function renderInvTable(list) {
    const body = document.getElementById('invBody');
    body.innerHTML = '';
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="6" style="color:var(--muted); text-align:center; padding:30px;">Aucun article ne correspond à la recherche.</td></tr>';
      return;
    }
    list.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + s.brand + '</td>' +
        '<td>' + s.model + '</td>' +
        '<td class="mono">' + s.storage + ' · ' + s.color + '</td>' +
        '<td>' + s.state + '</td>' +
        '<td class="mono">' + s.imei + '</td>' +
        '<td class="mono">' + fmtFcfa(s.price) + '</td>';
      body.appendChild(tr);
    });
  }
  document.getElementById('invSearch').addEventListener('input', function () {
    const q = this.value.trim().toLowerCase();
    if (!q) { renderInvTable(fullStock); return; }
    renderInvTable(fullStock.filter(s =>
      s.brand.toLowerCase().includes(q) || s.model.toLowerCase().includes(q) || s.imei.includes(q)
    ));
  });

  /* -------------------------------- RÉGLAGES -------------------------------- */

  async function renderReglagesPage() {
    const cfg = window.EuroStoreDB.read(window.EuroStoreDB.DB_KEYS.config, {});
    document.getElementById('setStore').textContent = cfg.storeName || '—';
    document.getElementById('setAgent').textContent = session.name || '—';
    document.getElementById('setEmail').textContent = session.email || '—';
  }

  /* --------------------------- Scan par caméra ----------------------------- */

  const camModal = document.getElementById('camModal');
  const camStatus = document.getElementById('camStatus');
  let html5QrCode = null;
  let camTargetInput = null;

  async function openCameraScan(targetInput) {
    camTargetInput = targetInput;
    camModal.classList.add('show');
    camStatus.classList.remove('err');
    camStatus.textContent = 'Initialisation de la caméra…';

    if (typeof Html5Qrcode === 'undefined') {
      camStatus.classList.add('err');
      camStatus.textContent = "Bibliothèque de scan indisponible (hors ligne ou bloquée). Utilisez la saisie manuelle.";
      return;
    }

    try {
      html5QrCode = new Html5Qrcode('camReader', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.QR_CODE
        ],
        verbose: false
      });
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 12, qrbox: { width: 260, height: 160 } },
        (decodedText) => onCameraDecode(decodedText),
        () => {}
      );
      camStatus.textContent = 'Caméra active — visez le code-barres.';
    } catch (err) {
      camStatus.classList.add('err');
      camStatus.textContent = "Impossible d'accéder à la caméra (permission refusée ou aucun périphérique). Utilisez la saisie manuelle.";
    }
  }

  async function closeCameraScan() {
    camModal.classList.remove('show');
    if (html5QrCode) {
      try { await html5QrCode.stop(); html5QrCode.clear(); } catch (e) {}
      html5QrCode = null;
    }
  }

  async function onCameraDecode(code) {
    if (!camTargetInput) return;
    camStatus.textContent = 'Code détecté : ' + code;
    camTargetInput.value = code;
    await closeCameraScan();
    if (camTargetInput === scanInput) {
      handleScan();
    } else if (camTargetInput === recEan) {
      lookupEan();
    }
  }

  document.getElementById('btnCamScan').addEventListener('click', () => openCameraScan(scanInput));
  document.getElementById('btnCamScanRec').addEventListener('click', () => openCameraScan(recEan));
  document.getElementById('camClose').addEventListener('click', closeCameraScan);

  // Register service worker
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
