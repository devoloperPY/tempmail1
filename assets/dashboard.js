(function () {
  'use strict';

  const state = {
    user: null,
    sessionId: null,
    subdomains: [],
    currentSubdomain: null,
    currentDnsEdit: null,
    currentFilter: 'all',
    createKind: 'pointing',
    pointsPage: 0,
    initialized: false
  };

  function $(id) { return document.getElementById(id); }
  function $all(sel) { return document.querySelectorAll(sel); }

  function toast(msg, type = 'info') {
    if (window.Utils && Utils.showToast) return Utils.showToast(msg, type);
    const c = $('toast-container');
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'toast-item p-3';
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function fmtNum(n) {
    return Number(n || 0).toLocaleString('id-ID');
  }

  function fmtDate(ts) {
    if (!ts) return '-';
    try {
      return new Date(ts * 1000).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch { return '-'; }
  }

  function fmtRel(ts) {
    if (!ts) return '-';
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return 'Baru saja';
    if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} hari lalu`;
    return fmtDate(ts);
  }

  function escHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function toggleSidebar() {
    const panel = $('sidebar-panel');
    const overlay = $('sidebar-overlay');
    if (!panel || !overlay) return;
    const isOpen = panel.classList.contains('is-open');
    if (isOpen) {
      panel.classList.remove('is-open');
      overlay.classList.add('hidden');
    } else {
      panel.classList.add('is-open');
      overlay.classList.remove('hidden');
    }
  }

  function switchView(name, ev) {
    if (ev) ev.preventDefault();
    $all('.dash-view').forEach(v => v.classList.remove('active'));
    const target = $('view-' + name);
    if (target) target.classList.add('active');
    $all('.dash-nav-item').forEach(i => i.classList.remove('active'));
    $all('.dash-nav-item').forEach(i => {
      if (i.getAttribute('data-view') === name) i.classList.add('active');
    });
    if (window.innerWidth < 1024) {
      const panel = $('sidebar-panel');
      if (panel && panel.classList.contains('is-open')) toggleSidebar();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (name === 'tempmail' && window.TempMailModule) TempMailModule.init();
    if (name === 'subdomain') loadSubdomains();
    if (name === 'points') loadPoints();
    if (name === 'account') renderAccount();
    if (window.lucide) window.lucide.createIcons();
  }

  async function loadUser() {
    try {
      const res = await apiFetch('/api/web/auth/me');
      if (!res?.data?.user) {
        clearToken();
        window.location.replace('login.html');
        return false;
      }
      state.user = res.data.user;
      state.sessionId = res.data.session_id;
      setToken(getToken(), state.user);
      renderUser();
      return true;
    } catch (err) {
      clearToken();
      window.location.replace('login.html');
      return false;
    }
  }

  function renderUser() {
    const u = state.user;
    if (!u) return;
    const name = u.display_name || u.email.split('@')[0];
    const tier = (u.tier || 'FREE').toUpperCase();
    const points = u.points || 0;

    if ($('nav-user-tier')) $('nav-user-tier').textContent = tier;
    if ($('nav-points')) $('nav-points').textContent = fmtNum(points);
    if ($('nav-points-badge')) $('nav-points-badge').textContent = fmtNum(points);
    if ($('sidebar-avatar')) $('sidebar-avatar').textContent = name.charAt(0).toUpperCase();
    if ($('sidebar-name')) $('sidebar-name').textContent = name;
    if ($('sidebar-email')) $('sidebar-email').textContent = u.email;
    if ($('ov-name')) $('ov-name').textContent = name;
    if ($('ov-points')) $('ov-points').textContent = fmtNum(points);
    if ($('ac-avatar')) $('ac-avatar').textContent = name.charAt(0).toUpperCase();
    if ($('ac-name')) $('ac-name').textContent = name;
    if ($('ac-email')) $('ac-email').textContent = u.email;
    if ($('ac-email-static')) $('ac-email-static').value = u.email;
    if ($('ac-display-name')) $('ac-display-name').value = name;
    if ($('ac-tier')) $('ac-tier').textContent = tier;
    if ($('ac-member-since') && u.created_at) $('ac-member-since').textContent = 'Member sejak ' + fmtDate(u.created_at);
    if ($('cs-balance')) $('cs-balance').textContent = fmtNum(points);
  }

  async function loadQuota() {
    try {
      const res = await apiFetch('/api/web/user/quota');
      const q = res?.data || {};
      if ($('ov-mailbox')) $('ov-mailbox').textContent = fmtNum(q.used_today || 0);
      if ($('ov-mailbox-max')) $('ov-mailbox-max').textContent = fmtNum(q.max_per_day || 10);
    } catch {}
  }

  async function loadStats() {
    try {
      const res = await apiFetch('/api/web/user/stats');
      const s = res?.data || {};
      const mb = typeof s.mailboxes === 'object' ? (s.mailboxes?.total || 0) : (s.mailboxes || 0);
      const msg = typeof s.messages === 'object' ? (s.messages?.total || 0) : (s.messages || 0);
      if ($('ov-messages')) $('ov-messages').textContent = fmtNum(msg);
    } catch {}
  }

  async function loadActivity() {
    const box = $('ov-activity');
    if (!box) return;
    try {
      const res = await apiFetch('/api/web/user/points?limit=3');
      const txs = res?.data?.transactions || [];
      if (!txs.length) {
        box.innerHTML = '<div class="dash-activity-row"><div class="min-w-0 flex-1"><p class="text-xs text-slate-500">Belum ada aktivitas.</p></div></div>';
        return;
      }
      box.innerHTML = txs.map(t => {
        const isPlus = t.delta > 0;
        const iconCls = isPlus ? 'dash-ledger-plus' : 'dash-ledger-minus';
        const label = t.reason === 'signup_bonus' ? 'Signup bonus'
          : t.reason === 'create_pointing_subdomain' ? 'Create subdomain (pointing)'
          : t.reason === 'create_termux_subdomain' ? 'Create subdomain (termux)'
          : t.reason || 'Transaksi';
        return `
          <div class="dash-activity-row">
            <div class="dash-activity-icon ${iconCls}">${isPlus ? '+' : '−'}</div>
            <div class="min-w-0 flex-1">
              <p class="text-xs font-semibold text-slate-800 truncate">${escHtml(label)}</p>
              <p class="text-[10px] text-slate-500 mt-0.5">${escHtml(fmtRel(t.created_at))}</p>
            </div>
            <p class="text-xs font-bold ${isPlus ? 'text-emerald-600' : 'text-red-600'} shrink-0">${isPlus ? '+' : ''}${fmtNum(t.delta)}</p>
          </div>
        `;
      }).join('');
    } catch {
      box.innerHTML = '<div class="dash-activity-row"><p class="text-xs text-slate-500">Gagal memuat aktivitas.</p></div>';
    }
  }

  async function loadOverview() {
    await Promise.allSettled([loadQuota(), loadStats(), loadActivity(), loadSubdomainsSummary()]);
  }

  async function loadSubdomainsSummary() {
    try {
      const res = await apiFetch('/api/web/user/subdomains');
      const subs = res?.data?.subdomains || [];
      const active = subs.filter(s => s.status !== 'blocked').length;
      const max = state.user?.tier === 'premium' ? 20 : 3;
      if ($('ov-subdomain')) $('ov-subdomain').textContent = active;
      if ($('ov-subdomain-max')) $('ov-subdomain-max').textContent = max;
      if ($('nav-subdomain-count')) $('nav-subdomain-count').textContent = `${active}/${max} subdomain`;
      if ($('nav-subdomain-badge')) $('nav-subdomain-badge').textContent = active;
      if ($('sd-active')) $('sd-active').textContent = active;
      if ($('sd-max')) $('sd-max').textContent = max;
      if ($('sd-points')) $('sd-points').textContent = fmtNum(state.user?.points || 0);
    } catch {}
  }

  async function loadSubdomains() {
    const list = $('sd-list');
    if (!list) return;
    list.innerHTML = '<div class="skeleton h-24 w-full rounded-2xl mb-2"></div><div class="skeleton h-24 w-full rounded-2xl"></div>';
    try {
      const res = await apiFetch('/api/web/user/subdomains');
      state.subdomains = res?.data?.subdomains || [];
      renderSubdomains();
      loadSubdomainsSummary();
    } catch (err) {
      list.innerHTML = `<div class="glass-card rounded-2xl p-6 text-center text-xs text-red-500">${escHtml(err.message)}</div>`;
    }
  }

  function filterSubdomains(kind, btn) {
    state.currentFilter = kind;
    $all('.dash-filter-pill').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderSubdomains();
  }

  function renderSubdomains() {
    const list = $('sd-list');
    if (!list) return;
    const subs = state.currentFilter === 'all'
      ? state.subdomains
      : state.subdomains.filter(s => (s.is_termux ? 'termux' : 'pointing') === state.currentFilter);

    if (!subs.length) {
      list.innerHTML = `
        <div class="glass-card rounded-2xl p-10 text-center">
          <div class="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <i data-lucide="globe" class="w-6 h-6"></i>
          </div>
          <p class="text-sm font-semibold text-slate-700">Belum ada subdomain</p>
          <p class="text-xs text-slate-500 mt-1">Buat subdomain baru dengan tombol di atas.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    list.innerHTML = subs.map(s => {
      const typeClass = s.is_termux ? 'dash-badge-termux' : 'dash-badge-pointing';
      const typeLabel = s.is_termux ? 'Termux' : 'Pointing';
      const statusClass = s.verified ? 'dash-badge-active' : (s.status === 'blocked' ? 'dash-badge-blocked' : 'dash-badge-pending');
      const statusLabel = s.verified ? 'Active' : (s.status === 'blocked' ? 'Blocked' : 'Pending');
      const proxyLabel = s.proxied ? 'ON' : 'OFF';
      const proxyCls = s.proxied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600';
      const targetLine = s.is_termux
        ? `port ${s.service_port || 3000} · ${s.service_type || 'http'}`
        : `→ ${s.target || '-'}`;

      return `
        <div onclick="openSubdomainDetail('${escHtml(s.id)}')" class="dash-subdomain-card">
          <div class="flex items-start justify-between gap-3 mb-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="dash-badge-type ${typeClass}">${typeLabel}</span>
              <span class="dash-badge-type ${statusClass}">${statusLabel}</span>
            </div>
            <span class="dash-badge-type ${proxyCls}">Proxy ${proxyLabel}</span>
          </div>
          <p class="font-mono-code text-sm font-bold text-slate-900 break-all">${escHtml(s.full_subdomain)}</p>
          <p class="text-[11px] text-slate-500 truncate mt-1">${escHtml(targetLine)}</p>
        </div>
      `;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
  }

  async function openSubdomainDetail(id) {
    const panel = $('sd-detail-panel');
    const overlay = $('sd-detail-overlay');
    const body = $('sd-detail-body');
    const title = $('sd-detail-title');
    if (!panel || !overlay || !body) return;

    title.textContent = 'Memuat...';
    body.innerHTML = '<div class="space-y-2"><div class="skeleton h-20 rounded-xl"></div><div class="skeleton h-20 rounded-xl"></div></div>';
    panel.classList.add('is-open');
    overlay.classList.remove('hidden');

    try {
      const res = await apiFetch(`/api/web/user/subdomains/${encodeURIComponent(id)}`);
      state.currentSubdomain = res.data;
      title.textContent = res.data.full_subdomain;
      renderSubdomainDetail(res.data);
    } catch (err) {
      body.innerHTML = `<div class="text-center text-xs text-red-500 p-4">${escHtml(err.message)}</div>`;
    }
  }

  function renderSubdomainDetail(s) {
    const body = $('sd-detail-body');
    const isTermux = s.is_termux;
    const records = s.records || [];

    const recordsHtml = records.map(r => {
      const isPrimary = r.is_primary;
      const typeCls = r.type === 'A' || r.type === 'AAAA' ? 'bg-blue-100 text-blue-700'
        : r.type === 'CNAME' ? 'bg-indigo-100 text-indigo-700'
        : r.type === 'TXT' ? 'bg-slate-100 text-slate-700'
        : r.type === 'MX' ? 'bg-purple-100 text-purple-700'
        : 'bg-slate-100 text-slate-700';
      return `
        <div class="p-3 rounded-lg border border-slate-200 bg-white">
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="flex items-center gap-1.5">
              <span class="dash-badge-type ${typeCls}">${escHtml(r.type)}</span>
              ${isPrimary ? '<span class="dash-badge-type dash-badge-pending">Primary</span>' : ''}
            </div>
            <div class="flex items-center gap-1">
              ${!isPrimary ? `<button onclick="deleteDnsRecord('${escHtml(s.id)}','${escHtml(r.id)}')" class="dash-icon-btn dash-icon-btn-danger" title="Hapus"><i data-lucide="trash-2" class="w-3 h-3"></i></button>` : ''}
            </div>
          </div>
          <p class="text-xs font-mono-code text-slate-900 break-all"><span class="text-slate-400">${escHtml(r.name)}</span> → ${escHtml(r.content)}</p>
          <div class="flex items-center justify-between mt-2 text-[10px] text-slate-500">
            <span>TTL ${r.ttl === 1 ? 'auto' : r.ttl}</span>
            <span>Proxy: ${r.proxied ? 'ON' : 'OFF'}</span>
          </div>
        </div>
      `;
    }).join('');

    const termuxSection = isTermux ? `
      <div class="border-t border-slate-200 pt-4 mt-4">
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs font-bold text-slate-900">Installer Termux</p>
          <span class="dash-badge-type dash-badge-termux">Termux Only</span>
        </div>
        <div class="space-y-1.5">
          <button onclick="regenerateInstaller('${escHtml(s.id)}')" class="w-full dash-btn-secondary px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 justify-center">
            <i data-lucide="refresh-cw" class="w-3 h-3"></i>
            Regenerate Installer URL
          </button>
          <div class="grid grid-cols-2 gap-1.5">
            <button onclick="copyInstallerUrl('${escHtml(s.id)}')" class="dash-btn-secondary px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 justify-center">
              <i data-lucide="copy" class="w-3 h-3"></i>
              Copy URL
            </button>
            <button onclick="downloadInstaller('${escHtml(s.id)}')" class="dash-btn-secondary px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 justify-center">
              <i data-lucide="download" class="w-3 h-3"></i>
              Download
            </button>
          </div>
        </div>
      </div>
    ` : '';

    const settingSection = isTermux ? `
      <div class="space-y-3">
        <div>
          <p class="dash-field-label">Subdomain</p>
          <p class="font-mono-code text-xs text-slate-900 break-all">${escHtml(s.full_subdomain)}</p>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <p class="dash-field-label">Port</p>
            <p class="font-mono-code text-xs text-slate-900">${s.service_port || 3000}</p>
          </div>
          <div>
            <p class="dash-field-label">Service</p>
            <p class="font-mono-code text-xs text-slate-900">${s.service_type || 'http'}</p>
          </div>
        </div>
        <div class="p-2.5 rounded-lg bg-purple-50 border border-purple-200 text-[11px] text-purple-800">
          Subdomain Termux nggak bisa edit target/proxy. Hapus & bikin ulang kalau perlu ubah.
        </div>
      </div>
    ` : `
      <div class="space-y-3">
        <div>
          <label class="dash-field-label">Target</label>
          <input type="text" id="sd-edit-target" value="${escHtml(s.target || '')}" class="dash-field-input font-mono-code" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="dash-field-label">Tipe</label>
            <select id="sd-edit-type" class="dash-field-input">
              <option value="pages" ${s.type === 'pages' ? 'selected' : ''}>Pages (CNAME)</option>
              <option value="ip" ${s.type === 'ip' ? 'selected' : ''}>IP (A)</option>
              <option value="redirect" ${s.type === 'redirect' ? 'selected' : ''}>Redirect</option>
              <option value="custom" ${s.type === 'custom' ? 'selected' : ''}>Custom</option>
            </select>
          </div>
          <div>
            <label class="dash-field-label">Proxy</label>
            <select id="sd-edit-proxied" class="dash-field-input">
              <option value="0" ${!s.proxied ? 'selected' : ''}>OFF</option>
              <option value="1" ${s.proxied ? 'selected' : ''}>ON</option>
            </select>
          </div>
        </div>
        <div class="flex gap-2">
          <button onclick="applySubdomainEdit('${escHtml(s.id)}')" class="btn-primary px-4 py-2 rounded-lg text-xs font-semibold">Apply Perubahan</button>
          <button onclick="verifySubdomain('${escHtml(s.id)}')" class="dash-btn-secondary px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5">
            <i data-lucide="check-circle" class="w-3 h-3"></i>
            Verify
          </button>
        </div>
      </div>
    `;

    body.innerHTML = `
      <div class="space-y-3 mb-4">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="dash-badge-type ${isTermux ? 'dash-badge-termux' : 'dash-badge-pointing'}">${isTermux ? 'Termux' : 'Pointing'}</span>
          <span class="dash-badge-type ${s.verified ? 'dash-badge-active' : (s.status === 'blocked' ? 'dash-badge-blocked' : 'dash-badge-pending')}">${s.verified ? 'Active' : (s.status === 'blocked' ? 'Blocked' : 'Pending')}</span>
          <span class="dash-badge-type ${s.proxied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}">Proxy ${s.proxied ? 'ON' : 'OFF'}</span>
        </div>
        <p class="font-mono-code text-sm font-bold text-slate-900 break-all">${escHtml(s.full_subdomain)}</p>
        <p class="text-[11px] text-slate-500">${escHtml(isTermux ? `port ${s.service_port || 3000} · ${s.service_type || 'http'}` : `→ ${s.target || '-'}`)}</p>
      </div>

      <div class="border-b border-slate-200 flex mb-3">
        <button onclick="dashTab('setting')" id="dtab-setting" class="dash-tab active">Setting</button>
        <button onclick="dashTab('dns')" id="dtab-dns" class="dash-tab">DNS Records</button>
      </div>

      <div id="dpanel-setting" class="space-y-3">
        ${settingSection}
        ${termuxSection}
        <div class="border-t border-slate-200 pt-3 mt-3">
          <button onclick="deleteSubdomain('${escHtml(s.id)}')" class="w-full dash-btn-danger px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5">
            <i data-lucide="trash-2" class="w-3 h-3"></i>
            Hapus Subdomain
          </button>
        </div>
      </div>

      <div id="dpanel-dns" class="hidden space-y-2">
        <div class="flex items-center justify-between mb-1">
          <p class="text-xs font-bold text-slate-900">DNS Records <span class="text-slate-400 font-normal">(${records.length})</span></p>
          <button onclick="openDnsModal('${escHtml(s.id)}', null)" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-semibold">
            <i data-lucide="plus" class="w-3 h-3"></i>
            Tambah
          </button>
        </div>
        ${recordsHtml || '<p class="text-xs text-slate-400 text-center py-4">Belum ada record tambahan.</p>'}
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  }

  function dashTab(name) {
    ['setting', 'dns'].forEach(t => {
      const btn = $('dtab-' + t);
      const panel = $('dpanel-' + t);
      if (btn) btn.classList.remove('active');
      if (panel) panel.classList.add('hidden');
    });
    const btn = $('dtab-' + name);
    const panel = $('dpanel-' + name);
    if (btn) btn.classList.add('active');
    if (panel) panel.classList.remove('hidden');
  }

  function closeSubdomainDetail() {
    const panel = $('sd-detail-panel');
    const overlay = $('sd-detail-overlay');
    if (panel) panel.classList.remove('is-open');
    if (overlay) overlay.classList.add('hidden');
    state.currentSubdomain = null;
  }

  async function applySubdomainEdit(id) {
    const target = $('sd-edit-target')?.value.trim();
    const type = $('sd-edit-type')?.value;
    const proxied = $('sd-edit-proxied')?.value === '1';
    if (!target) return toast('Target wajib diisi', 'warning');
    Utils.showLoading('Menyimpan perubahan...');
    try {
      await apiFetch(`/api/web/user/subdomains/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { target, target_type: type, proxied }
      });
      toast('Perubahan tersimpan', 'success');
      await loadSubdomains();
      openSubdomainDetail(id);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  async function verifySubdomain(id) {
    Utils.showLoading('Memverifikasi DNS...');
    try {
      const res = await apiFetch(`/api/web/user/subdomains/${encodeURIComponent(id)}/verify`, { method: 'POST' });
      const d = res.data || {};
      if (d.verified) {
        toast('Subdomain terverifikasi & aktif', 'success');
      } else {
        toast(d.reason || 'Belum terverifikasi — DNS belum propagasi', 'warning');
      }
      await loadSubdomains();
      openSubdomainDetail(id);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  async function deleteSubdomain(id) {
    const s = state.currentSubdomain;
    if (!s) return;
    const input = prompt(`Ketik "${s.subdomain}" untuk konfirmasi hapus:`);
    if (input !== s.subdomain) return toast('Konfirmasi salah', 'warning');
    Utils.showLoading('Menghapus subdomain...');
    try {
      await apiFetch(`/api/web/user/subdomains/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast('Subdomain dihapus', 'success');
      closeSubdomainDetail();
      await loadSubdomains();
      await loadSubdomainsSummary();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  async function regenerateInstaller(id) {
    Utils.showLoading('Generate installer...');
    try {
      const res = await apiFetch(`/api/web/user/subdomains/${encodeURIComponent(id)}/regenerate-installer`, { method: 'POST' });
      const url = res?.data?.installer_url;
      if (url) {
        Utils.copyToClipboard(url, 'Installer URL disalin ke clipboard!');
      } else {
        toast('Gagal generate URL', 'error');
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  async function copyInstallerUrl(id) {
    try {
      const res = await apiFetch(`/api/web/user/subdomains/${encodeURIComponent(id)}/regenerate-installer`, { method: 'POST' });
      const url = res?.data?.installer_url;
      if (url) Utils.copyToClipboard(url, 'Installer URL disalin!');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function downloadInstaller(id) {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/api/web/user/subdomains/${encodeURIComponent(id)}/installer-script`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Gagal download installer');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `install-${id}.sh`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Installer didownload', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function openCreateSubdomainModal() {
    const modal = $('create-subdomain-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    if ($('cs-balance')) $('cs-balance').textContent = fmtNum(state.user?.points || 0);
    switchCreateTab('pointing');
  }

  function closeCreateSubdomainModal() {
    const modal = $('create-subdomain-modal');
    if (modal) modal.classList.add('hidden');
  }

  function switchCreateTab(kind) {
    state.createKind = kind;
    ['pointing', 'termux'].forEach(t => {
      const btn = $('create-tab-' + t);
      const form = $('form-' + t);
      if (btn) btn.classList.remove('active');
      if (form) form.classList.add('hidden');
    });
    const btn = $('create-tab-' + kind);
    const form = $('form-' + kind);
    if (btn) btn.classList.add('active');
    if (form) form.classList.remove('hidden');
  }

  async function submitCreateSubdomain() {
    const kind = state.createKind;
    let body = { kind };

    if (kind === 'pointing') {
      const subdomain = ($('cs-pointing-subdomain')?.value || '').trim().toLowerCase();
      const target = ($('cs-pointing-target')?.value || '').trim();
      const targetType = $('cs-pointing-type')?.value || 'pages';
      const proxied = $('cs-pointing-proxied')?.value === '1';
      if (!subdomain || !target) return toast('Subdomain & target wajib', 'warning');
      body = { ...body, subdomain, target, target_type: targetType, proxied };
    } else {
      const subdomain = ($('cs-termux-subdomain')?.value || '').trim().toLowerCase();
      const service_port = parseInt($('cs-termux-port')?.value || '3000');
      const service_type = $('cs-termux-service')?.value || 'http';
      if (!subdomain) return toast('Subdomain wajib', 'warning');
      body = { ...body, subdomain, service_port, service_type };
    }

    Utils.showLoading('Membuat subdomain...');
    try {
      const res = await apiFetch('/api/web/user/subdomains', { method: 'POST', body });
      toast(`Subdomain ${res.data.full_subdomain || res.data.subdomain} dibuat`, 'success');
      closeCreateSubdomainModal();
      if (state.user) {
        state.user.points = res.data.balance_after ?? state.user.points;
        renderUser();
      }
      await loadSubdomains();
      await loadSubdomainsSummary();
      if (kind === 'termux' && res.data.id) {
        setTimeout(() => openSubdomainDetail(res.data.id), 400);
      }
    } catch (err) {
      if (err.status === 402) {
        toast('Poin nggak cukup. Topup dulu.', 'warning');
        switchView('points');
        closeCreateSubdomainModal();
      } else if (err.status === 429) {
        toast(err.message || 'Batas subdomain tercapai', 'warning');
      } else {
        toast(err.message, 'error');
      }
    } finally {
      Utils.hideLoading();
    }
  }

  function openDnsModal(subdomainId, record) {
    state.currentDnsEdit = { subdomainId, record };
    const modal = $('dns-modal');
    if (!modal) return;
    if ($('dns-modal-title')) $('dns-modal-title').textContent = record ? 'Edit DNS Record' : 'Tambah DNS Record';
    if ($('dns-type')) $('dns-type').value = record?.type || 'A';
    if ($('dns-name')) $('dns-name').value = record?.name || '@';
    if ($('dns-content')) $('dns-content').value = record?.content || '';
    if ($('dns-ttl')) $('dns-ttl').value = record?.ttl || 1;
    if ($('dns-proxied')) $('dns-proxied').value = record?.proxied ? '1' : '0';
    if ($('dns-priority')) $('dns-priority').value = '10';
    toggleDnsPriority();
    modal.classList.remove('hidden');
  }

  function closeDnsModal() {
    const modal = $('dns-modal');
    if (modal) modal.classList.add('hidden');
    state.currentDnsEdit = null;
  }

  function toggleDnsPriority() {
    const type = $('dns-type')?.value;
    const wrap = $('dns-priority-wrap');
    if (wrap) wrap.classList.toggle('hidden', type !== 'MX');
  }

  async function submitDnsRecord() {
    if (!state.currentDnsEdit) return;
    const { subdomainId, record } = state.currentDnsEdit;
    const type = $('dns-type')?.value;
    const name = ($('dns-name')?.value || '@').trim();
    let content = ($('dns-content')?.value || '').trim();
    const ttl = parseInt($('dns-ttl')?.value || '1');
    const proxied = $('dns-proxied')?.value === '1';
    if (type === 'MX') {
      const prio = parseInt($('dns-priority')?.value || '10');
      content = `${prio} ${content}`;
    }
    if (!content) return toast('Content wajib', 'warning');

    Utils.showLoading('Menyimpan DNS...');
    try {
      if (record) {
        await apiFetch(`/api/web/user/subdomains/${encodeURIComponent(subdomainId)}/records/${encodeURIComponent(record.id)}`, {
          method: 'PATCH',
          body: { type, name, content, ttl, proxied }
        });
      } else {
        await apiFetch(`/api/web/user/subdomains/${encodeURIComponent(subdomainId)}/records`, {
          method: 'POST',
          body: { type, name, content, ttl, proxied }
        });
      }
      toast('DNS record tersimpan', 'success');
      closeDnsModal();
      openSubdomainDetail(subdomainId);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  async function deleteDnsRecord(subdomainId, recordId) {
    if (!confirm('Hapus DNS record ini?')) return;
    Utils.showLoading('Menghapus DNS...');
    try {
      await apiFetch(`/api/web/user/subdomains/${encodeURIComponent(subdomainId)}/records/${encodeURIComponent(recordId)}`, { method: 'DELETE' });
      toast('DNS record dihapus', 'success');
      openSubdomainDetail(subdomainId);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  async function loadPoints() {
    const ledger = $('pt-ledger');
    if (ledger) ledger.innerHTML = '<div class="skeleton h-14 m-3 rounded-xl"></div><div class="skeleton h-14 m-3 rounded-xl"></div>';
    try {
      const res = await apiFetch('/api/web/user/points?limit=50');
      const data = res?.data || {};
      const summary = data.summary || {};
      if ($('pt-balance')) $('pt-balance').textContent = fmtNum(summary.balance);
      if ($('pt-earned')) $('pt-earned').textContent = '+' + fmtNum(summary.total_earned);
      if ($('pt-spent')) $('pt-spent').textContent = '−' + fmtNum(summary.total_spent);
      if (state.user) {
        state.user.points = summary.balance;
        renderUser();
      }

      const txs = data.transactions || [];
      if (!txs.length) {
        if (ledger) ledger.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Belum ada transaksi.</div>';
        return;
      }
      if (ledger) {
        ledger.innerHTML = txs.map(t => {
          const isPlus = t.delta > 0;
          const label = t.reason === 'signup_bonus' ? 'Signup bonus'
            : t.reason === 'create_pointing_subdomain' ? 'Create subdomain (pointing)'
            : t.reason === 'create_termux_subdomain' ? 'Create subdomain (termux)'
            : t.reason || 'Transaksi';
          return `
            <div class="dash-ledger-row">
              <div class="dash-ledger-icon ${isPlus ? 'dash-ledger-plus' : 'dash-ledger-minus'}">${isPlus ? '+' : '−'}</div>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-semibold text-slate-800 truncate">${escHtml(label)}</p>
                <p class="text-[10px] text-slate-500 mt-0.5">${escHtml(fmtRel(t.created_at))}</p>
              </div>
              <div class="text-right shrink-0">
                <p class="text-xs font-bold ${isPlus ? 'text-emerald-600' : 'text-red-600'}">${isPlus ? '+' : ''}${fmtNum(t.delta)}</p>
                <p class="text-[10px] text-slate-400">→ ${fmtNum(t.balance_after)}</p>
              </div>
            </div>
          `;
        }).join('');
      }
    } catch (err) {
      if (ledger) ledger.innerHTML = `<div class="p-6 text-center text-xs text-red-500">${escHtml(err.message)}</div>`;
    }
  }

  function openTopupInfo() {
    const msg = 'Topup poin dilakukan manual oleh admin. Hubungi @sigitchan di Telegram untuk pembelian poin.';
    if (confirm(msg)) {
      window.open('https://t.me/sigitchan', '_blank', 'noopener');
    }
  }

  function renderAccount() {
    renderUser();
    loadSessions();
  }

  function switchAccTab(name) {
    ['profile', 'security', 'sessions', 'danger'].forEach(t => {
      const btn = $('atab-' + t);
      const panel = $('apanel-' + t);
      if (btn) btn.classList.remove('active');
      if (panel) panel.classList.add('hidden');
    });
    const btn = $('atab-' + name);
    const panel = $('apanel-' + name);
    if (btn) btn.classList.add('active');
    if (panel) panel.classList.remove('hidden');
    if (name === 'sessions') loadSessions();
  }

  async function loadSessions() {
    const list = $('ac-sessions-list');
    if (!list) return;
    list.innerHTML = '<div class="skeleton h-14 rounded-xl"></div>';
    try {
      const res = await apiFetch('/api/web/user/sessions');
      const sessions = res?.data?.sessions || [];
      if (!sessions.length) {
        list.innerHTML = '<p class="text-xs text-slate-400">Tidak ada sesi.</p>';
        return;
      }
      list.innerHTML = sessions.map(s => {
        const isCurrent = s.id === state.sessionId || s.is_current;
        return `
          <div class="p-3 rounded-lg border ${isCurrent ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'} flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-xs font-bold text-slate-900 truncate">${escHtml(s.ip || 'IP tidak diketahui')}</p>
              <p class="text-[10px] text-slate-500 truncate">${escHtml((s.user_agent || '').slice(0, 50) || 'Device')}</p>
              <p class="text-[10px] text-slate-400">${escHtml(fmtRel(s.last_active || s.created_at))}</p>
            </div>
            ${isCurrent
              ? '<span class="dash-badge-type dash-badge-active">Sesi ini</span>'
              : `<button onclick="revokeSession('${escHtml(s.id)}')" class="dash-btn-danger px-2.5 py-1 rounded-md text-[11px] font-semibold">Cabut</button>`}
          </div>
        `;
      }).join('');
    } catch (err) {
      list.innerHTML = `<p class="text-xs text-red-500">${escHtml(err.message)}</p>`;
    }
  }

  async function revokeSession(id) {
    try {
      await apiFetch(`/api/web/user/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast('Sesi dicabut', 'success');
      loadSessions();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function revokeAllSessions() {
    if (!confirm('Cabut semua sesi lain?')) return;
    try {
      await apiFetch('/api/web/user/sessions', { method: 'DELETE' });
      toast('Semua sesi lain dicabut', 'success');
      loadSessions();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function saveProfile() {
    const name = $('ac-display-name')?.value.trim();
    if (!name) return toast('Nama wajib', 'warning');
    Utils.showLoading('Menyimpan...');
    try {
      await apiFetch('/api/web/user/profile', { method: 'PATCH', body: { display_name: name } });
      state.user.display_name = name;
      renderUser();
      toast('Profil disimpan', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  async function changePassword() {
    const oldPwd = $('ac-old-pwd')?.value;
    const newPwd = $('ac-new-pwd')?.value;
    if (!oldPwd || !newPwd) return toast('Isi kedua password', 'warning');
    Utils.showLoading('Mengubah password...');
    try {
      await apiFetch('/api/web/user/change-password', { method: 'POST', body: { old_password: oldPwd, new_password: newPwd } });
      toast('Password diubah. Sesi lain ter-logout.', 'success');
      $('ac-old-pwd').value = '';
      $('ac-new-pwd').value = '';
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  async function deleteAccount() {
    const pwd = $('ac-delete-pwd')?.value;
    if (!pwd) return toast('Password wajib', 'warning');
    if (!confirm('Akun dan semua data akan dihapus permanen. Lanjut?')) return;
    Utils.showLoading('Menghapus akun...');
    try {
      await apiFetch('/api/web/user/delete-account', { method: 'POST', body: { password: pwd } });
      clearToken();
      toast('Akun dihapus', 'info');
      setTimeout(() => window.location.replace('login.html'), 800);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  function openPwdModal() { $('pwd-modal')?.classList.remove('hidden'); }
  function closePwdModal() { $('pwd-modal')?.classList.add('hidden'); }

  async function submitPwdModal(e) {
    if (e) e.preventDefault();
    const oldPwd = $('pwd-old')?.value;
    const newPwd = $('pwd-new')?.value;
    if (!oldPwd || !newPwd) return toast('Isi kedua password', 'warning');
    Utils.showLoading('Mengubah password...');
    try {
      await apiFetch('/api/web/user/change-password', { method: 'POST', body: { old_password: oldPwd, new_password: newPwd } });
      toast('Password diubah', 'success');
      closePwdModal();
      $('pwd-old').value = '';
      $('pwd-new').value = '';
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  async function logout() {
    Utils.showLoading('Logout...');
    try {
      await apiFetch('/api/web/auth/logout', { method: 'POST', skipAuthRedirect: true });
    } catch {}
    clearToken();
    window.location.replace('login.html');
  }

  function bindEvents() {
    $('btn-logout')?.addEventListener('click', logout);
    $('btn-open-pwd-modal')?.addEventListener('click', openPwdModal);
    $('btn-close-pwd-modal')?.addEventListener('click', closePwdModal);
    $('btn-cancel-pwd')?.addEventListener('click', closePwdModal);
    $('change-pwd-form')?.addEventListener('submit', submitPwdModal);

    $('sd-btn-refresh')?.addEventListener('click', loadSubdomains);
    $('cs-btn-submit')?.addEventListener('click', submitCreateSubdomain);
    $('dns-type')?.addEventListener('change', toggleDnsPriority);
    $('dns-btn-submit')?.addEventListener('click', submitDnsRecord);

    $('ac-btn-save-profile')?.addEventListener('click', saveProfile);
    $('ac-btn-change-pwd')?.addEventListener('click', changePassword);
    $('ac-btn-revoke-all')?.addEventListener('click', revokeAllSessions);
    $('ac-btn-delete-account')?.addEventListener('click', deleteAccount);

    $('pt-btn-refresh')?.addEventListener('click', loadPoints);
    $('tm-btn-refresh-mailboxes')?.addEventListener('click', () => {
      if (window.TempMailModule) TempMailModule.loadMailboxes();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSubdomainDetail();
        closeCreateSubdomainModal();
        closeDnsModal();
        closePwdModal();
      }
    });
  }

  async function init() {
    if (!isLoggedIn()) {
      window.location.replace('login.html');
      return;
    }
    if (window.lucide) window.lucide.createIcons();
    bindEvents();
    const ok = await loadUser();
    if (!ok) return;
    await loadOverview();
    if (state.initialized) return;
    state.initialized = true;
    const hashView = (window.location.hash || '').replace('#', '');
    if (hashView && $('view-' + hashView)) {
      switchView(hashView);
    }
  }

  window.Dashboard = {
    switchView,
    toggleSidebar,
    openSubdomainDetail,
    closeSubdomainDetail,
    applySubdomainEdit,
    verifySubdomain,
    deleteSubdomain,
    regenerateInstaller,
    copyInstallerUrl,
    downloadInstaller,
    openCreateSubdomainModal,
    closeCreateSubdomainModal,
    switchCreateTab,
    filterSubdomains,
    dashTab,
    openDnsModal,
    closeDnsModal,
    submitDnsRecord,
    deleteDnsRecord,
    switchAccTab,
    openTopupInfo,
    loadPoints,
    refreshSidebarBadges: loadSubdomainsSummary,
    toast,
    fmtNum
  };

  window.toggleSidebar = toggleSidebar;
  window.switchView = switchView;
  window.openSubdomainDetail = openSubdomainDetail;
  window.closeSubdomainDetail = closeSubdomainDetail;
  window.applySubdomainEdit = applySubdomainEdit;
  window.verifySubdomain = verifySubdomain;
  window.deleteSubdomain = deleteSubdomain;
  window.regenerateInstaller = regenerateInstaller;
  window.copyInstallerUrl = copyInstallerUrl;
  window.downloadInstaller = downloadInstaller;
  window.openCreateSubdomainModal = openCreateSubdomainModal;
  window.closeCreateSubdomainModal = closeCreateSubdomainModal;
  window.switchCreateTab = switchCreateTab;
  window.filterSubdomains = filterSubdomains;
  window.dashTab = dashTab;
  window.openDnsModal = openDnsModal;
  window.closeDnsModal = closeDnsModal;
  window.submitDnsRecord = submitDnsRecord;
  window.deleteDnsRecord = deleteDnsRecord;
  window.switchAccTab = switchAccTab;
  window.openTopupInfo = openTopupInfo;
  window.revokeSession = revokeSession;
  window.saveProfile = saveProfile;
  window.changePassword = changePassword;
  window.deleteAccount = deleteAccount;

  document.addEventListener('DOMContentLoaded', init);
})();