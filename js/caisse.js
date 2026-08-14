(function () {
  const { Auth, Store } = window.EuroStoreDB;
  const session = Auth.requireRole('vendeur');
  if (!session) return;

  const initials = (session.name || 'VD').slice(0, 2).toUpperCase();
  document.getElementById('avatarInit').textContent = initials;
  document.getElementById('agentInit').textContent = initials;
  document.getElementById('userName').textContent = session.name || 'Vendeur';
  document.getElementById('avatar').addEventListener('click', () => {
    if (confirm('Se déconnecter ?')) { Auth.logout(); window.location.href = 'index.html'; }
  });

  const cfg = Store.getConfig();
  document.getElementById('posLabel').textContent = 'Caisse — ' + (cfg.posLabel || 'Poste 01');

  /* ------------------------------- Navigation ------------------------------ */

  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + item.dataset.page).classList.add('active');
    if (item.dataset.page === 'ventes') renderVentes();
    if (item.dataset.page === 'inventaire') renderInventaire();
    if (item.dataset.page === 'reglages') fillSettings();
    if (item.dataset.page === 'pos') scanInput.focus();
  }));

  // Clock
  function tick() {
    const t = new Date().toLocaleTimeString('fr-FR');
    document.getElementById('clock').textContent = t;
    document.getElementById('clock2').textContent = t;
  }
  tick(); setInterval(tick, 1000);

  // Network status
  function updateNet() {
    const online = navigator.onLine;
    [document.getElementById('netDot'), document.getElementById('netDot2')].forEach(dot => {
      dot.classList.toggle('offline', !online);
      dot.querySelector('span').textContent = online ? 'Connecté' : 'Hors ligne';
    });
  }
  window.addEventListener('online', async () => { updateNet(); const n = await Store.flushPendingSync(); if (n) showToast('Synchronisé', n + ' vente(s) envoyée(s) au serveur.', false); });
  window.addEventListener('offline', updateNet);
  updateNet();

  /* ------------------------------ Devise (FCFA/€) --------------------------- */

  function fmtEur(n) {
    return Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d)(?=,))/g, ' ') + ' €';
  }
  function fmtXof(n) {
    const xof = Math.round(Number(n) * (Store.getConfig().fxRate || 655.957));
    return xof.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';
  }

  /* --------------------------- CAISSE (scan/panier) ------------------------ */

  let cart = [];          // articles scannés en attente de vente : { imei, ean, brand, model, storage, color, state, price }
  let selectedImei = null; // article actuellement affiché dans la fiche produit (édition du prix)

  const scanInput = document.getElementById('scanInput');
  const scanVisual = document.getElementById('scanVisual');
  const productCard = document.getElementById('productCard');
  const scanError = document.getElementById('scanError');
  const btnVendre = document.getElementById('btnVendre');
  const vendreSub = document.getElementById('vendreSub');
  const pcPriceEur = document.getElementById('pcPriceEur');

  function showScanError(msg) {
    scanError.querySelector('span:last-child').textContent = msg;
    scanError.classList.add('show');
    setTimeout(() => scanError.classList.remove('show'), 3200);
  }

  function showToast(title, sub, ok) {
    const toast = document.getElementById('toast');
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastSub').textContent = sub;
    toast.classList.toggle('offline-toast', ok === false);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function renderProductCard(item) {
    scanVisual.classList.add('has-card');
    productCard.classList.add('show');
    document.getElementById('pcTitle').innerHTML = item.model + ' <span id="pcBrand">' + item.brand + '</span>';
    document.getElementById('pcImei').textContent = item.imei;
    document.getElementById('pcPriceXof').textContent = fmtXof(item.price);
    pcPriceEur.value = item.price.toFixed(2);
    document.getElementById('pcStockNote').textContent = item.state + ' · ' + item.storage + ' · ' + item.color;
    const badges = document.getElementById('pcBadges');
    badges.innerHTML = '';
    badges.innerHTML += `<div class="badge ${item.state === 'Neuf' ? 'badge-new' : 'badge-refurb'}">${item.state}</div>`;
    badges.innerHTML += `<div class="badge badge-neutral">${item.storage}</div>`;
    badges.innerHTML += `<div class="badge badge-neutral">${item.color}</div>`;
  }

  function clearProductCard() {
    scanVisual.classList.remove('has-card');
    productCard.classList.remove('show');
    selectedImei = null;
  }

  function selectCartItem(imei) {
    const item = cart.find(c => c.imei === imei);
    if (!item) { clearProductCard(); return; }
    selectedImei = imei;
    renderProductCard(item);
    renderCart();
  }

  pcPriceEur.addEventListener('input', () => {
    const item = cart.find(c => c.imei === selectedImei);
    if (!item) return;
    const val = parseFloat(pcPriceEur.value);
    if (!isNaN(val) && val >= 0) {
      item.price = val;
      document.getElementById('pcPriceXof').textContent = fmtXof(val);
      renderCart();
    }
  });

  function renderCart() {
    const list = document.getElementById('cartList');
    if (!cart.length) {
      list.innerHTML = '<div class="cart-empty" id="cartEmpty">Aucun article scanné pour l\'instant.</div>';
    } else {
      list.innerHTML = cart.map(item => `
        <div class="cart-row ${item.imei === selectedImei ? 'selected' : ''}" data-imei="${item.imei}">
          <div class="ct-dot"></div>
          <div class="ct-info">
            <div class="ct-name">${item.brand} ${item.model}</div>
            <div class="ct-sub">${item.storage} · ${item.state}</div>
          </div>
          <div class="ct-price">
            <div class="xof">${fmtXof(item.price)}</div>
            <div class="eur">${fmtEur(item.price)}</div>
          </div>
          <div class="ct-remove" data-remove="${item.imei}" title="Retirer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </div>
        </div>`).join('');
    }

    document.querySelectorAll('.cart-row').forEach(row => row.addEventListener('click', (e) => {
      if (e.target.closest('.ct-remove')) return;
      selectCartItem(row.dataset.imei);
    }));
    document.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromCart(btn.dataset.remove);
    }));

    const count = cart.length;
    const total = cart.reduce((s, c) => s + c.price, 0);
    document.getElementById('cartCount').textContent = count;
    document.getElementById('cartTotalXof').textContent = fmtXof(total);
    document.getElementById('cartTotalEur').textContent = fmtEur(total);

    btnVendre.disabled = count === 0;
    vendreSub.textContent = count === 0
      ? 'Scannez un article pour continuer'
      : 'Valider la vente — ' + count + ' article(s) · ' + fmtXof(total);
  }

  function removeFromCart(imei) {
    cart = cart.filter(c => c.imei !== imei);
    if (selectedImei === imei) {
      selectedImei = cart.length ? cart[0].imei : null;
    }
    if (selectedImei) renderProductCard(cart.find(c => c.imei === selectedImei));
    else clearProductCard();
    renderCart();
  }

  function resetAll() {
    cart = [];
    clearProductCard();
    renderCart();
  }

  async function handleScan() {
    const code = scanInput.value.trim();
    if (!code) return;
    if (cart.some(c => c.imei === code)) {
      showScanError('Cet article est déjà dans le panier.');
      scanInput.value = '';
      return;
    }
    const result = await Store.findByCode(code);
    if (!result) { showScanError('Aucun produit trouvé pour ce code.'); return; }
    if (result.type === 'catalog_only') {
      showScanError('Référence connue mais aucune unité en stock (' + result.item.brand + ' ' + result.item.model + ').');
      return;
    }
    const item = { ...result.item };
    cart.push(item);
    selectedImei = item.imei;
    renderProductCard(item);
    renderCart();
    scanInput.value = '';
  }
  scanInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleScan(); });

  document.getElementById('btnClearCart').addEventListener('click', () => {
    if (!cart.length) return;
    if (confirm('Vider le panier en cours ?')) resetAll();
  });
  document.getElementById('btnClearCartIcon').addEventListener('click', () => {
    if (!cart.length) return;
    if (confirm('Vider le panier en cours ?')) resetAll();
  });

  document.getElementById('btnSuspend').addEventListener('click', async () => {
    if (!cart.length) { showScanError('Le panier est vide — rien à suspendre.'); return; }
    await Store.suspendSale(cart, session.name);
    showToast('Vente suspendue', cart.length + ' article(s) mis en attente.', true);
    resetAll();
    refreshSuspendedStrip();
  });

  btnVendre.addEventListener('click', async () => {
    if (!cart.length) return;
    btnVendre.disabled = true;
    const { sales, failed } = await Store.sellItems(cart.map(c => ({ imei: c.imei, price: c.price })), session.name);
    const online = navigator.onLine;
    if (sales.length) {
      const total = sales.reduce((s, x) => s + x.price, 0);
      showToast(
        'Vente enregistrée',
        sales.length + ' article(s) · ' + fmtXof(total) + (online ? '' : ' (hors ligne — en attente de synchro)'),
        online
      );
    }
    if (failed.length) {
      showScanError(failed.length + ' article(s) n\'ont pas pu être vendus (retirés du stock entre-temps).');
    }
    setTimeout(resetAll, 400);
  });

  resetAll();

  /* --------------------------- Ventes suspendues --------------------------- */

  async function refreshSuspendedStrip() {
    const suspended = await Store.getSuspendedSales();
    const strip = document.getElementById('suspendedStrip');
    document.getElementById('suspendedCount').textContent = suspended.length;
    strip.classList.toggle('show', suspended.length > 0);
  }
  refreshSuspendedStrip();

  document.getElementById('suspendedStrip').addEventListener('click', openSuspendedModal);
  document.getElementById('suspClose').addEventListener('click', () => document.getElementById('suspModal').classList.remove('show'));

  async function openSuspendedModal() {
    const suspended = await Store.getSuspendedSales();
    const list = document.getElementById('suspList');
    if (!suspended.length) {
      list.innerHTML = '<div class="susp-empty">Aucune vente suspendue.</div>';
    } else {
      list.innerHTML = suspended.map(s => {
        const total = s.items.reduce((sum, i) => sum + i.price, 0);
        const time = new Date(s.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        return `<div class="susp-item">
          <div class="si-info"><b>${s.items.length} article(s) · ${fmtXof(total)}</b><span>${time} · ${s.seller}</span></div>
          <button data-resume="${s.id}">Reprendre</button>
        </div>`;
      }).join('');
      document.querySelectorAll('[data-resume]').forEach(btn => btn.addEventListener('click', async () => {
        const rec = await Store.resumeSuspended(btn.dataset.resume);
        cart = rec.items;
        selectedImei = cart.length ? cart[0].imei : null;
        if (selectedImei) renderProductCard(cart.find(c => c.imei === selectedImei));
        renderCart();
        document.getElementById('suspModal').classList.remove('show');
        refreshSuspendedStrip();
        showToast('Vente reprise', cart.length + ' article(s) restaurés dans le panier.', true);
      }));
    }
    document.getElementById('suspModal').classList.add('show');
  }

  /* --------------------------------- Ventes --------------------------------- */

  async function renderVentes() {
    const query = (document.getElementById('ventesSearch').value || '').toLowerCase();
    const sales = await Store.getSales();
    const filtered = sales.filter(s =>
      s.model.toLowerCase().includes(query) || s.brand.toLowerCase().includes(query) || s.imei.includes(query)
    );
    document.getElementById('ventesCount').textContent = sales.length;
    const body = document.getElementById('ventesBody');
    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty-row">Aucune vente trouvée.</td></tr>';
      return;
    }
    body.innerHTML = filtered.map(s => {
      const time = new Date(s.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      return `<tr>
        <td class="mono" style="color:var(--muted); font-size:12px;">${time}</td>
        <td>${s.brand} ${s.model} · ${s.storage}</td>
        <td class="td-imei">${s.imei}</td>
        <td class="td-price">${fmtXof(s.price)}<span class="eur">${fmtEur(s.price)}</span></td>
      </tr>`;
    }).join('');
  }
  document.getElementById('ventesSearch').addEventListener('input', renderVentes);

  /* ------------------------------- Inventaire -------------------------------- */

  async function renderInventaire() {
    const query = (document.getElementById('invSearch').value || '').toLowerCase();
    const stock = await Store.getStock();
    const filtered = stock.filter(s =>
      s.model.toLowerCase().includes(query) || s.brand.toLowerCase().includes(query) || s.imei.includes(query)
    );
    document.getElementById('invCount').textContent = stock.length;
    const body = document.getElementById('invBody');
    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty-row">Aucun article trouvé.</td></tr>';
      return;
    }
    body.innerHTML = filtered.map(s => `
      <tr>
        <td>${s.brand} ${s.model} · ${s.storage} · ${s.color}</td>
        <td class="td-imei">${s.imei}</td>
        <td><span class="pill ${s.state === 'Neuf' ? 'neuf' : 'recond'}">${s.state}</span></td>
        <td class="td-price">${fmtXof(s.price)}<span class="eur">${fmtEur(s.price)}</span></td>
      </tr>`).join('');
  }
  document.getElementById('invSearch').addEventListener('input', renderInventaire);

  /* -------------------------------- Réglages ---------------------------------- */

  function fillSettings() {
    const c = Store.getConfig();
    document.getElementById('setStoreName').value = c.storeName || '';
    document.getElementById('setPosLabel').value = c.posLabel || '';
    document.getElementById('setFxRate').value = c.fxRate || 655.957;
    document.getElementById('setAgentName').value = session.name || '';
  }
  document.getElementById('btnSaveSettings').addEventListener('click', () => {
    const storeName = document.getElementById('setStoreName').value.trim();
    const posLabel = document.getElementById('setPosLabel').value.trim();
    const fxRate = parseFloat(document.getElementById('setFxRate').value);
    Store.setConfig({
      storeName: storeName || 'EURO STORE',
      posLabel: posLabel || 'Poste 01',
      fxRate: !isNaN(fxRate) && fxRate > 0 ? fxRate : 655.957
    });
    document.getElementById('posLabel').textContent = 'Caisse — ' + (posLabel || 'Poste 01');
    showToast('Réglages enregistrés', 'Les préférences de cette caisse ont été mises à jour.', true);
    renderCart();
  });

  /* --------------------------- RÉCEPTION STOCK ----------------------------- */

  const recEan = document.getElementById('recEan');
  const recPrice = document.getElementById('recPrice');
  const recImei = document.getElementById('recImei');
  const btnAddStock = document.getElementById('btnAddStock');
  const recError = document.getElementById('recError');
  let selectedState = 'Neuf';
  let recCatalog = null;

  document.querySelectorAll('#recState .chip-opt').forEach(c => c.addEventListener('click', () => {
    document.querySelectorAll('#recState .chip-opt').forEach(x => x.classList.remove('selected'));
    c.classList.add('selected');
    selectedState = c.dataset.state;
  }));

  function showRecError(msg) {
    recError.querySelector('span:last-child').textContent = msg;
    recError.classList.add('show');
    setTimeout(() => recError.classList.remove('show'), 3200);
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

  /* --------------------------- Scan par caméra ----------------------------- */

  const camModal = document.getElementById('camModal');
  const camStatus = document.getElementById('camStatus');
  let html5QrCode = null;
  let camTargetInput = null; // which input to fill once a code is decoded

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
        () => {} // per-frame decode failures — ignored, expected while aiming
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
