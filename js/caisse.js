(function () {
  const { Auth, Store } = window.EuroStoreDB;
  const session = Auth.requireRole('vendeur');
  if (!session) return;

  document.getElementById('avatar').textContent = (session.name || 'VD').slice(0, 2).toUpperCase();
  document.getElementById('avatar').addEventListener('click', () => {
    if (confirm('Se déconnecter ?')) { Auth.logout(); window.location.href = 'index.html'; }
  });

  /* --------------------------- Accueil (avant scan / après vente) --------------------------- */

  const homeState = document.getElementById('homeState');
  const productState = document.getElementById('productState');

  function firstName(name) { return (name || 'Vendeur').split(' ')[0]; }
  document.getElementById('homeGreeting').textContent = 'Bonjour, ' + firstName(session.name);

  function tickClock() {
    const now = new Date();
    document.getElementById('homeClock').textContent =
      now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' +
      now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  tickClock(); setInterval(tickClock, 30000);

  // Network status
  function updateNet() {
    const dot = document.getElementById('netDot');
    if (navigator.onLine) dot.classList.remove('offline'); else dot.classList.add('offline');
  }
  window.addEventListener('online', async () => { updateNet(); await Store.flushPendingSync(); });
  window.addEventListener('offline', updateNet);
  updateNet();

  /* --------------------------- Scan → fiche produit --------------------------- */

  let currentItem = null;

  const scanInput = document.getElementById('scanInput');
  const scanError = document.getElementById('scanError');
  const btnVendre = document.getElementById('btnVendre');
  const vendreSub = document.getElementById('vendreSub');

  const ICONS = {
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="10" y1="19" x2="14" y2="19"/></svg>',
    earbuds: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 10v6a2.5 2.5 0 0 0 5 0v-2"/><path d="M18 10v6a2.5 2.5 0 0 1-5 0v-2"/><circle cx="6" cy="8" r="2.5"/><circle cx="18" cy="8" r="2.5"/></svg>'
  };

  function fmtPrice(n) {
    const parts = Number(n).toFixed(2).split('.');
    return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '<sup>€' + parts[1] + '</sup>';
  }

  function showScanError(msg) {
    scanError.querySelector('span:last-child').textContent = msg;
    scanError.classList.add('show');
    setTimeout(() => scanError.classList.remove('show'), 3200);
  }

  function goHome() {
    currentItem = null;
    productState.classList.add('hide');
    homeState.classList.remove('hide');
    scanInput.value = '';
    scanInput.focus();
  }

  function showProduct(item) {
    currentItem = item;
    homeState.classList.add('hide');
    productState.classList.remove('hide');

    // Photo réelle si l'admin en a renseigné une pour ce produit, sinon
    // pictogramme générique selon la catégorie (téléphone / écouteurs…).
    const visual = document.getElementById('pcVisual');
    visual.innerHTML = item.imageUrl
      ? `<img src="${item.imageUrl}" alt="${item.brand} ${item.model}">`
      : (ICONS[item.category] || ICONS.phone);

    document.getElementById('pcTitle').innerHTML = item.model + ' <span id="pcBrand">' + item.brand + '</span>';
    document.getElementById('pcStorage').textContent = item.storage || '—';
    document.getElementById('pcColor').textContent = item.color || '—';
    document.getElementById('pcImei').textContent = item.imei;
    document.getElementById('pcPrice').innerHTML = fmtPrice(item.price);

    const badges = document.getElementById('pcBadges');
    badges.innerHTML = '';
    badges.innerHTML += `<div class="badge ${item.state === 'Neuf' ? 'badge-new' : 'badge-refurb'}">${item.state}</div>`;
    badges.innerHTML += `<div class="badge badge-neutral">${item.category === 'earbuds' ? 'Écouteurs' : 'Téléphone'}</div>`;

    vendreSub.textContent = 'Valider — ' + item.price.toFixed(2).replace('.', ',') + ' €';
  }

  async function handleScan() {
    const code = scanInput.value.trim();
    if (!code) return;
    const result = await Store.findByCode(code);
    if (!result) { showScanError('Aucun produit trouvé pour ce code.'); return; }
    if (result.type === 'catalog_only') {
      showScanError('Référence connue mais aucune unité en stock (' + result.item.brand + ' ' + result.item.model + '). Demandez un réapprovisionnement à l\u2019administrateur.');
      return;
    }
    showProduct(result.item);
    scanInput.value = '';
  }
  scanInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleScan(); });

  document.getElementById('btnCancel').addEventListener('click', goHome);

  function showToast(title, sub) {
    const toast = document.getElementById('toast');
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastSub').textContent = sub;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2400);
  }

  btnVendre.addEventListener('click', async () => {
    if (!currentItem) return;
    btnVendre.disabled = true;
    try {
      const sale = await Store.sellItem(currentItem.imei, currentItem.price, session.name);
      const online = navigator.onLine;
      showToast('Vente enregistrée', sale.brand + ' ' + sale.model + ' · ' + sale.price.toFixed(2).replace('.', ',') + ' €' + (online ? '' : ' (hors ligne — en attente de synchro)'));
      // L'article vient d'être déduit du stock (Store.sellItem passe son statut
      // à "sold") — retour à l'accueil pour la vente suivante.
      setTimeout(goHome, 900);
    } catch (e) {
      showScanError(e.message);
    } finally {
      btnVendre.disabled = false;
    }
  });

  goHome();

  /* --------------------------- Scan par caméra --------------------------- */

  const camModal = document.getElementById('camModal');
  const camStatus = document.getElementById('camStatus');
  let html5QrCode = null;

  async function openCameraScan() {
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
    camStatus.textContent = 'Code détecté : ' + code;
    scanInput.value = code;
    await closeCameraScan();
    handleScan();
  }

  document.getElementById('btnCamScan').addEventListener('click', openCameraScan);
  document.getElementById('camClose').addEventListener('click', closeCameraScan);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
