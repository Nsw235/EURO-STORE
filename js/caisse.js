(function () {
  const { Auth, Store } = window.EuroStoreDB;
  const session = Auth.requireRole('vendeur');
  if (!session) return;

  document.getElementById('avatar').textContent = (session.name || 'VD').slice(0, 2).toUpperCase();
  document.getElementById('avatar').addEventListener('click', () => {
    if (confirm('Se déconnecter ?')) { Auth.logout(); window.location.href = 'index.html'; }
  });

  // Tabs
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(t.dataset.tab).classList.add('active');
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

  /* --------------------------- CAISSE (scan/vente) ------------------------ */

  let currentItem = null; // stock item currently loaded
  let currentCatalogOnly = null; // catalog match without a stock unit

  const scanInput = document.getElementById('scanInput');
  const emptyState = document.getElementById('emptyState');
  const productCard = document.getElementById('productCard');
  const scanError = document.getElementById('scanError');
  const btnVendre = document.getElementById('btnVendre');
  const vendreSub = document.getElementById('vendreSub');

  function fmtPrice(n) {
    const parts = Number(n).toFixed(2).split('.');
    return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '<sup>€' + parts[1] + '</sup>';
  }

  function showScanError(msg) {
    scanError.querySelector('span:last-child').textContent = msg;
    scanError.classList.add('show');
    setTimeout(() => scanError.classList.remove('show'), 3200);
  }

  function resetCard() {
    currentItem = null; currentCatalogOnly = null;
    productCard.classList.remove('show');
    emptyState.style.display = 'block';
    btnVendre.disabled = true;
    vendreSub.textContent = 'Scannez un article pour continuer';
  }

  function loadItem(item) {
    currentItem = item; currentCatalogOnly = null;
    emptyState.style.display = 'none';
    productCard.classList.add('show');
    document.getElementById('pcTitle').innerHTML = item.model + ' <span id="pcBrand">' + item.brand + '</span>';
    document.getElementById('pcImei').textContent = item.imei;
    document.getElementById('pcPrice').innerHTML = fmtPrice(item.price);
    document.getElementById('pcStockNote').textContent = item.state + ' · en stock';
    const badges = document.getElementById('pcBadges');
    badges.innerHTML = '';
    badges.innerHTML += `<div class="badge ${item.state === 'Neuf' ? 'badge-new' : 'badge-refurb'}">${item.state}</div>`;
    badges.innerHTML += `<div class="badge badge-neutral">${item.storage}</div>`;
    badges.innerHTML += `<div class="badge badge-neutral">${item.color}</div>`;
    btnVendre.disabled = false;
    vendreSub.textContent = 'Valider la transaction — ' + item.price.toFixed(2).replace('.', ',') + ' €';
  }

  async function handleScan() {
    const code = scanInput.value.trim();
    if (!code) return;
    const result = await Store.findByCode(code);
    if (!result) { showScanError('Aucun produit trouvé pour ce code.'); return; }
    if (result.type === 'catalog_only') {
      showScanError('Référence connue mais aucune unité en stock (' + result.item.brand + ' ' + result.item.model + ').');
      resetCard();
      return;
    }
    loadItem(result.item);
    scanInput.value = '';
  }
  scanInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleScan(); });

  document.getElementById('pcPrice').addEventListener('blur', function () {
    const raw = this.textContent.replace(/[^\d.,]/g, '').replace(',', '.');
    const val = parseFloat(raw);
    if (!isNaN(val) && currentItem) {
      currentItem.price = val;
      this.innerHTML = fmtPrice(val);
      vendreSub.textContent = 'Valider la transaction — ' + val.toFixed(2).replace('.', ',') + ' €';
    }
  });

  document.getElementById('btnEditPrice').addEventListener('click', () => {
    const el = document.getElementById('pcPrice');
    el.focus();
    document.getSelection().selectAllChildren(el);
  });

  document.getElementById('btnCancel').addEventListener('click', resetCard);

  function showToast(title, sub, ok) {
    const toast = document.getElementById('toast');
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastSub').textContent = sub;
    toast.classList.toggle('offline-toast', ok === false);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }

  btnVendre.addEventListener('click', async () => {
    if (!currentItem) return;
    btnVendre.disabled = true;
    try {
      const sale = await Store.sellItem(currentItem.imei, currentItem.price, session.name);
      const online = navigator.onLine;
      showToast('Vente enregistrée', sale.brand + ' ' + sale.model + ' · ' + sale.price.toFixed(2).replace('.', ',') + ' €' + (online ? '' : ' (hors ligne — en attente de synchro)'), online);
      setTimeout(resetCard, 900);
    } catch (e) {
      showScanError(e.message);
      btnVendre.disabled = false;
    }
  });

  resetCard();

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
