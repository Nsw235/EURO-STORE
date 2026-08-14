(function () {
  const { Auth, Store, read, write, DB_KEYS } = window.EuroStoreDB;
  const session = Auth.requireRole('admin');
  if (!session) return;

  document.getElementById('adminName').textContent = session.name;
  document.getElementById('adminEmail').textContent = session.email || '';
  document.getElementById('adminAvatar').textContent = session.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('logoutBtn').addEventListener('click', () => {
    if (confirm('Se déconnecter ?')) { Auth.logout(); window.location.href = 'index.html'; }
  });

  const cfg = read(DB_KEYS.config, {});
  document.getElementById('storeNameLabel').textContent = cfg.storeName || 'EURO STORE';
  document.getElementById('storeNameInput').value = cfg.storeName || '';

  /* --------------------------- Navigation --------------------------- */
  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + item.dataset.page).classList.add('active');
    if (item.dataset.page === 'stock') renderStockTable();
    if (item.dataset.page === 'ventes') renderAllSales();
    if (item.dataset.page === 'rapports') renderReports();
  }));

  /* --------------------------- Dashboard --------------------------- */
  let currentRange = 'month';

  document.querySelectorAll('.range-opt').forEach(opt => opt.addEventListener('click', () => {
    document.querySelectorAll('.range-opt').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
    currentRange = opt.dataset.range;
    renderDashboard();
  }));

  function eur(n) { return Math.round(n).toLocaleString('fr-FR') + ' €'; }

  async function renderDashboard() {
    const kpis = await Store.getKPIs(currentRange);
    document.getElementById('kpiCa').textContent = eur(kpis.ca);
    document.getElementById('kpiVol').textContent = kpis.volume;
    document.getElementById('kpiMarge').textContent = eur(kpis.marge);
    document.getElementById('subMarge').textContent = kpis.ca ? Math.round((kpis.marge / kpis.ca) * 100) + '% du CA' : '—';
    document.getElementById('kpiPanier').textContent = eur(kpis.panierMoyen);
    document.getElementById('trendCa').textContent = kpis.ca > 0 ? '↑' : '—';
    document.getElementById('trendVol').textContent = kpis.volume > 0 ? '+' + kpis.volume : '—';
    document.getElementById('subCa').textContent = { day: "aujourd'hui", week: 'cette semaine', month: 'ce mois-ci' }[currentRange];

    const days = await Store.getSalesLast7Days();
    const max = Math.max(1, ...days.map(d => d.count));
    const bars = document.getElementById('bars');
    bars.innerHTML = days.map(d => `
      <div class="bar-col">
        <div class="bar" style="height:${Math.max(10, (d.count / max) * 150)}px"><i style="height:100%"></i></div>
        <div class="lbl">${d.label}</div>
      </div>`).join('');
    document.getElementById('barsTotal').textContent = days.reduce((s, d) => s + d.count, 0) + ' unités';

    const brands = await Store.getStockByBrand();
    const totalStock = brands.reduce((s, b) => s + b.count, 0);
    document.getElementById('stockTotal').textContent = totalStock + ' unités';
    const maxCount = Math.max(1, ...brands.map(b => b.count));
    document.getElementById('stockList').innerHTML = brands.map(b => {
      const bars4 = Math.round((b.count / maxCount) * 4) || 1;
      const low = b.count <= 5;
      return `<div class="stock-row">
        <div class="name">${b.brand}</div>
        <div class="stock-meter ${low ? 'low' : ''}">${[0,1,2,3].map(i => `<span class="${i < bars4 ? 'on' : ''}"></span>`).join('')}</div>
        <div class="count">${b.count}</div>
      </div>`;
    }).join('');
    const lowest = brands.filter(b => b.count <= 5).sort((a,b) => a.count - b.count)[0];
    const alertBox = document.getElementById('lowStockAlert');
    if (lowest) {
      alertBox.style.display = 'flex';
      document.getElementById('lowStockTitle').textContent = 'Stock bas — ' + lowest.brand;
      document.getElementById('lowStockDesc').textContent = `Seulement ${lowest.count} unité(s) restante(s). Envisager un réapprovisionnement.`;
    } else { alertBox.style.display = 'none'; }

    const sales = await Store.getSales(8);
    document.getElementById('salesTableBody').innerHTML = sales.map(rowHtml).join('');
    attachRowActions();
  }

  function rowHtml(s) {
    const d = new Date(s.timestamp);
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `<tr>
      <td>${time}</td>
      <td><div class="prod-cell"><div class="prod-thumb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="6" y="2" width="12" height="20" rx="2.5"/></svg></div>${s.brand} ${s.model} · ${s.storage}</div></td>
      <td class="imei-cell">${s.imei}</td>
      <td class="price-cell">${s.price.toFixed(2).replace('.', ',')} €</td>
      <td><div class="row-actions"><div class="icon-btn" title="Détails"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></div></div></td>
    </tr>`;
  }
  function attachRowActions() {} // placeholder for future row-level edit/delete on sales history

  /* --------------------------- Stock management --------------------------- */

  let editingImei = null;

  async function renderStockTable() {
    const query = (document.getElementById('stockSearch').value || '').toLowerCase();
    const stock = await Store.getStock();
    const filtered = stock.filter(s =>
      s.model.toLowerCase().includes(query) || s.brand.toLowerCase().includes(query) || s.imei.includes(query)
    );
    document.getElementById('stockTableBody').innerHTML = filtered.map(s => `
      <tr>
        <td><div class="prod-cell"><div class="prod-thumb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="6" y="2" width="12" height="20" rx="2.5"/></svg></div>${s.brand} ${s.model} · ${s.storage} · ${s.color}</div></td>
        <td class="imei-cell">${s.imei}</td>
        <td><span class="status-pill in">${s.state}</span></td>
        <td class="price-cell">${s.price.toFixed(2).replace('.', ',')} €</td>
        <td><div class="row-actions">
          <div class="icon-btn edit-stock" data-imei="${s.imei}" title="Modifier"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></div>
          <div class="icon-btn danger delete-stock" data-imei="${s.imei}" title="Supprimer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></div>
        </div></td>
      </tr>`).join('');

    document.querySelectorAll('.edit-stock').forEach(btn => btn.addEventListener('click', () => openEditModal(btn.dataset.imei)));
    document.querySelectorAll('.delete-stock').forEach(btn => btn.addEventListener('click', async () => {
      if (confirm('Supprimer cet article du stock ?')) {
        await Store.deleteStockItem(btn.dataset.imei);
        renderStockTable();
      }
    }));
  }
  document.getElementById('stockSearch').addEventListener('input', renderStockTable);

  async function openEditModal(imei) {
    const stock = await Store.getStock();
    const item = stock.find(s => s.imei === imei);
    if (!item) return;
    editingImei = imei;
    document.getElementById('editPrice').value = item.price;
    document.getElementById('editState').value = item.state;
    document.getElementById('editModal').classList.add('show');
  }
  document.getElementById('cancelEdit').addEventListener('click', () => document.getElementById('editModal').classList.remove('show'));
  document.getElementById('confirmEdit').addEventListener('click', async () => {
    if (!editingImei) return;
    const price = parseFloat(document.getElementById('editPrice').value);
    const state = document.getElementById('editState').value.trim() || 'Neuf';
    await Store.updateStockItem(editingImei, { price, state });
    document.getElementById('editModal').classList.remove('show');
    renderStockTable();
  });

  /* --------------------------- Ventes page --------------------------- */

  async function renderAllSales() {
    const sales = await Store.getSales();
    document.getElementById('allSalesBody').innerHTML = sales.map(s => {
      const d = new Date(s.timestamp);
      return `<tr>
        <td>${d.toLocaleDateString('fr-FR')}</td>
        <td>${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
        <td>${s.brand} ${s.model} · ${s.storage}</td>
        <td class="imei-cell">${s.imei}</td>
        <td class="price-cell">${s.price.toFixed(2).replace('.', ',')} €</td>
      </tr>`;
    }).join('');
  }

  /* --------------------------- Rapports page --------------------------- */

  async function renderReports() {
    const sales = await Store.getSales();
    const since = new Date(); since.setDate(since.getDate() - 30);
    const recent = sales.filter(s => new Date(s.timestamp) >= since);
    const byBrand = {};
    recent.forEach(s => { byBrand[s.brand] = byBrand[s.brand] || { count: 0, ca: 0 }; byBrand[s.brand].count++; byBrand[s.brand].ca += s.price; });
    const entries = Object.entries(byBrand).sort((a, b) => b[1].ca - a[1].ca);
    const maxCa = Math.max(1, ...entries.map(e => e[1].ca));
    document.getElementById('reportByBrand').innerHTML = entries.map(([brand, d]) => `
      <div class="stock-row">
        <div class="name">${brand}</div>
        <div class="stock-meter"><span class="on" style="flex:${d.ca}"></span><span style="flex:${Math.max(1, maxCa - d.ca)}"></span></div>
        <div class="count">${eur(d.ca)}</div>
      </div>`).join('') || '<p style="color:var(--muted); font-size:13px;">Aucune vente sur la période.</p>';

    const totalCa = recent.reduce((s, x) => s + x.price, 0);
    document.getElementById('reportSummary').innerHTML = `
      <div class="stock-row"><div class="name">Ventes (30 j)</div><div class="count">${recent.length}</div></div>
      <div class="stock-row"><div class="name">CA (30 j)</div><div class="count">${eur(totalCa)}</div></div>
      <div class="stock-row"><div class="name">Panier moyen</div><div class="count">${eur(recent.length ? totalCa / recent.length : 0)}</div></div>
    `;
  }

  /* --------------------------- Paramètres --------------------------- */
  document.getElementById('saveSettings').addEventListener('click', () => {
    const c = read(DB_KEYS.config, {});
    c.storeName = document.getElementById('storeNameInput').value.trim() || c.storeName;
    write(DB_KEYS.config, c);
    document.getElementById('storeNameLabel').textContent = c.storeName;
    alert('Paramètres enregistrés.');
  });

  renderDashboard();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
