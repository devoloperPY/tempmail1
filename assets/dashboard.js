(function () {
  'use strict';

  const state = {
    user: null,
    sessionId: null,
    subdomains: [],
    availableDomains: [],
    config: {
      pointingCost: 500,
      termuxCost: 500
    },
    currentSubdomain: null,
    currentDnsEdit: null,
    currentFilter: 'all',
    createKind: 'pointing',
    expandedId: null,
    initialized: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  function $all(sel) {
    return document.querySelectorAll(sel);
  }

  function toast(msg, type) {
    type = type || 'info';
    if (window.Utils && Utils.showToast) {
      return Utils.showToast(msg, type);
    }
    const c = $('toast-container');
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'toast-item p-3';
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 3500);
  }

  function fmtNum(n) {
    return Number(n || 0).toLocaleString('id-ID');
  }

  function fmtDate(ts) {
    if (!ts) return '-';
    try {
      return new Date(ts * 1000).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return '-';
    }
  }

  function fmtRel(ts) {
    if (!ts) return '-';
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return 'Baru saja';
    if (diff < 3600) return Math.floor(diff / 60) + ' mnt lalu';
    if (diff < 86400) return Math.floor(diff / 3600) + ' jam lalu';
    if (diff < 604800) return Math.floor(diff / 86400) + ' hari lalu';
    return fmtDate(ts);
  }

  function escHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
    $all('.dash-view').forEach(function (v) {
      v.classList.remove('active');
    });
    const target = $('view-' + name);
    if (target) target.classList.add('active');

    $all('.dash-nav-item').forEach(function (i) {
      i.classList.remove('active');
    });
    $all('.dash-nav-item').forEach(function (i) {
      if (i.getAttribute('data-view') === name) {
        i.classList.add('active');
      }
    });

    if (window.innerWidth < 1024) {
      const panel = $('sidebar-panel');
      if (panel && panel.classList.contains('is-open')) toggleSidebar();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (name === 'tempmail' && window.TempMailModule) {
      window.TempMailModule.init();
    }
    if (name === 'subdomain') {
      loadSubdomains();
    }
    if (name === 'points') {
      loadPoints();
    }
    if (name === 'account') {
      renderAccount();
    }
    if (window.lucide) window.lucide.createIcons();
  }

  async function loadUser() {
    try {
      const res = await apiFetch('/api/web/auth/me', { cache: 'no-store' });
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
    const isOwner = u.role === 'owner' || u.tier === 'owner';
    
    let tierLabel = tier;
    if (isOwner) tierLabel = 'OWNER';

    if ($('nav-user-tier')) $('nav-user-tier').textContent = tierLabel;
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
    if ($('ac-tier')) $('ac-tier').textContent = tierLabel;
    if ($('ac-member-since') && u.created_at) $('ac-member-since').textContent = 'Member sejak ' + fmtDate(u.created_at);
    if ($('cs-balance')) $('cs-balance').textContent = fmtNum(points);
  }

  async function loadQuota() {
    try {
      const res = await apiFetch('/api/web/user/quota');
      const q = res?.data || {};
      const isOwner = q.is_owner || false;
      
      const used = q.used_today || 0;
      const max = isOwner ? '∞' : fmtNum(q.max_per_day || 10);
      
      if ($('ov-mailbox')) $('ov-mailbox').textContent = fmtNum(used);
      if ($('ov-mailbox-max')) $('ov-mailbox-max').textContent = max;
    } catch (e) {}
  }

  async function loadStats() {
    try {
      const res = await apiFetch('/api/web/user/stats');
      const s = res?.data || {};
      const msg = typeof s.messages === 'object' ? (s.messages?.total || 0) : (s.messages || 0);
      if ($('ov-messages')) $('ov-messages').textContent = fmtNum(msg);
    } catch (e) {}
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
      box.innerHTML = txs.map(function (t) {
        const isPlus = t.delta > 0;
        const iconCls = isPlus ? 'dash-ledger-plus' : 'dash-ledger-minus';
        let label = t.reason || 'Transaksi';
        if (t.reason === 'signup_bonus') label = 'Signup bonus';
        else if (t.reason === 'create_pointing_subdomain') label = 'Create subdomain (pointing)';
        else if (t.reason === 'create_termux_subdomain') label = 'Create subdomain (termux)';

        return (
          '<div class="dash-activity-row">' +
            '<div class="dash-activity-icon ' + iconCls + '">' + (isPlus ? '+' : '−') + '</div>' +
            '<div class="min-w-0 flex-1">' +
              '<p class="text-xs font-semibold text-slate-800 truncate">' + escHtml(label) + '</p>' +
              '<p class="text-[10px] text-slate-500 mt-0.5">' + escHtml(fmtRel(t.created_at)) + '</p>' +
            '</div>' +
            '<p class="text-xs font-bold ' + (isPlus ? 'text-emerald-600' : 'text-red-600') + ' shrink-0">' + (isPlus ? '+' : '') + fmtNum(t.delta) + '</p>' +
          '</div>'
        );
      }).join('');
    } catch (e) {
      box.innerHTML = '<div class="dash-activity-row"><p class="text-xs text-slate-500">Gagal memuat aktivitas.</p></div>';
    }
  }

  async function loadOverview() {
    await Promise.allSettled([
      loadQuota(),
      loadStats(),
      loadActivity(),
      loadSubdomainsSummary()
    ]);
  }

  async function loadConfigCost() {
    try {
      const res = await apiFetch('/api/web/config?t=' + Date.now(), { cache: 'no-store' });
      const cfg = res?.data || {};
      
      const isOwner = state.user?.role === 'owner' || state.user?.tier === 'owner';
      
      state.config.pointingCost = isOwner ? 0 : (parseInt(cfg.subdomain_pointing_cost) || 500);
      state.config.termuxCost = isOwner ? 0 : (parseInt(cfg.subdomain_termux_cost) || 500);
      state.config.free_max_active_subdomain = parseInt(cfg.free_max_active_subdomain) || 3;
      state.config.premium_max_active_subdomain = parseInt(cfg.premium_max_active_subdomain) || 20;
      
      const cost = state.config.pointingCost;
      if ($('quick-cost')) $('quick-cost').textContent = isOwner ? 'Gratis' : fmtNum(cost);
      if ($('modal-cost')) $('modal-cost').textContent = isOwner ? 'Gratis' : fmtNum(cost);
    } catch (e) {
      console.log('Gagal memuat config cost:', e);
    }
  }

  async function loadDomains() {
    try {
      const res = await apiFetch('/api/web/domains', { cache: 'no-store' });
      state.availableDomains = res?.data?.domains || [];
      
      const options = state.availableDomains.map(d => 
        `<option value="${escHtml(d.domain)}">.${escHtml(d.domain)}</option>`
      ).join('');
      
      const selPointing = $('cs-domain-select-pointing');
      const selTermux = $('cs-domain-select-termux');
      
      if (selPointing) selPointing.innerHTML = options || '<option value="">No domain</option>';
      if (selTermux) selTermux.innerHTML = options || '<option value="">No domain</option>';
    } catch (e) {
      console.log('Gagal memuat domains:', e);
    }
  }

  async function loadSubdomainsSummary() {
    try {
      const res = await apiFetch('/api/web/user/subdomains');
      const subs = res?.data?.subdomains || [];
      const active = subs.filter(function (s) {
        return s.status !== 'blocked';
      }).length;
      
      const isOwner = state.user?.role === 'owner' || state.user?.tier === 'owner';
      let max = 0;
      
      if (isOwner) {
        max = '∞';
      } else if (state.user?.tier === 'premium') {
        max = parseInt(state.config.premium_max_active_subdomain) || 20;
      } else {
        max = parseInt(state.config.free_max_active_subdomain) || 3;
      }

      if ($('ov-subdomain')) $('ov-subdomain').textContent = active;
      if ($('ov-subdomain-max')) $('ov-subdomain-max').textContent = max;
      if ($('nav-subdomain-count')) $('nav-subdomain-count').textContent = active + '/' + max + ' subdomain';
      if ($('nav-subdomain-badge')) $('nav-subdomain-badge').textContent = active;
      if ($('sd-active')) $('sd-active').textContent = active;
      if ($('sd-max')) $('sd-max').textContent = max;
      if ($('sd-points')) $('sd-points').textContent = fmtNum(state.user?.points || 0);
    } catch (e) {}
  }

  async function loadSubdomains() {
    const list = $('sd-list');
    if (!list) return;
    list.innerHTML =
      '<div class="skeleton h-24 w-full rounded-2xl mb-2"></div>' +
      '<div class="skeleton h-24 w-full rounded-2xl"></div>';
    try {
      const res = await apiFetch('/api/web/user/subdomains');
      state.subdomains = res?.data?.subdomains || [];
      renderSubdomains();
      loadSubdomainsSummary();
    } catch (err) {
      list.innerHTML = '<div class="glass-card rounded-2xl p-6 text-center text-xs text-red-500">' + escHtml(err.message) + '</div>';
    }
  }

  function filterSubdomains(kind, btn) {
    state.currentFilter = kind;
    $all('.dash-filter-pill').forEach(function (b) {
      b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
    renderSubdomains();
  }

  function toggleExpand(id) {
    state.expandedId = (state.expandedId === id) ? null : id;
    renderSubdomains();
  }

  function renderSubdomains() {
    const list = $('sd-list');
    if (!list) return;
    const subs = state.currentFilter === 'all'
      ? state.subdomains
      : state.subdomains.filter(function (s) {
          return (s.is_termux ? 'termux' : 'pointing') === state.currentFilter;
        });

    if (!subs.length) {
      list.innerHTML = (
        '<div class="glass-card rounded-2xl p-10 text-center">' +
          '<div class="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">' +
            '<i data-lucide="globe" class="w-6 h-6"></i>' +
          '</div>' +
          '<p class="text-sm font-semibold text-slate-700">Belum ada subdomain</p>' +
          '<p class="text-xs text-slate-500 mt-1">Buat subdomain baru dengan tombol di atas.</p>' +
        '</div>'
      );
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    list.innerHTML = subs.map(function (s) {
      const typeClass = s.is_termux ? 'dash-badge-termux' : 'dash-badge-pointing';
      const typeLabel = s.is_termux ? 'Termux' : 'Pointing';
      const statusClass = s.verified ? 'dash-badge-active' : (s.status === 'blocked' ? 'dash-badge-blocked' : 'dash-badge-pending');
      const statusLabel = s.verified ? 'Active' : (s.status === 'blocked' ? 'Blocked' : 'Pending');
      const proxyLabel = s.proxied ? 'ON' : 'OFF';
      const proxyCls = s.proxied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600';
      const targetLine = s.is_termux
        ? 'Port ' + (s.service_port || 3000) + ' &middot; ' + (s.service_type || 'http')
        : s.target || '-';
      const createdDate = s.created_at ? fmtDate(s.created_at) : '-';

      const isExpanded = state.expandedId === s.id;

      let accordionHtml = '';
      if (isExpanded) {
        accordionHtml = (
          '<div class="accordion-content border-t border-slate-100 mt-3 pt-3">' +
            '<div class="flex flex-col gap-2 mb-3">' +
              '<div class="flex items-center justify-between text-[11px]">' +
                '<span class="text-slate-500 flex items-center gap-1"><i data-lucide="link" class="w-3.5 h-3.5"></i> Target</span>' +
                '<span class="font-mono-code font-semibold text-slate-800 text-right break-all">' + escHtml(targetLine) + '</span>' +
              '</div>' +
              '<div class="flex items-center justify-between text-[11px]">' +
                '<span class="text-slate-500 flex items-center gap-1"><i data-lucide="calendar" class="w-3.5 h-3.5"></i> Dibuat</span>' +
                '<span class="font-medium text-slate-800">' + escHtml(createdDate) + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="flex gap-2 pt-2 border-t border-slate-100">' +
              '<button onclick="event.stopPropagation(); openSettingsModal(\'' + escHtml(s.id) + '\')" class="flex-1 btn-primary px-3 py-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5">' +
                '<i data-lucide="settings" class="w-3.5 h-3.5"></i> Gear Setting' +
              '</button>' +
              '<button onclick="event.stopPropagation(); verifySubdomain(\'' + escHtml(s.id) + '\')" class="dash-btn-secondary px-3 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-1.5">' +
                '<i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Verify' +
              '</button>' +
            '</div>' +
          '</div>'
        );
      }

      return (
        '<div class="dash-subdomain-card mb-2 transition-all duration-300 ' + (isExpanded ? 'ring-2 ring-blue-500 bg-blue-50/20' : '') + '" onclick="toggleExpand(\'' + escHtml(s.id) + '\')">' +
          '<div class="flex items-start justify-between gap-3">' +
            '<div class="flex items-center gap-1.5 flex-wrap">' +
              '<span class="dash-badge-type ' + typeClass + '">' + typeLabel + '</span>' +
              '<span class="dash-badge-type ' + statusClass + '">' + statusLabel + '</span>' +
              '<span class="dash-badge-type ' + proxyCls + '">Proxy ' + proxyLabel + '</span>' +
            '</div>' +
            '<i data-lucide="chevron-down" class="w-4 h-4 text-slate-400 transition-transform duration-300 ' + (isExpanded ? 'rotate-180' : '') + '"></i>' +
          '</div>' +
          '<p class="font-mono-code text-sm font-bold text-slate-900 break-all mt-2">' + escHtml(s.full_subdomain) + '</p>' +
          accordionHtml +
        '</div>'
      );
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  async function openSettingsModal(id) {
    const modal = $('settings-modal');
    const body = $('settings-body');
    const title = $('settings-title');
    if (!modal || !body) return;

    title.textContent = 'Memuat...';
    body.innerHTML = '<div class="skeleton h-32 rounded-xl"></div>';
    modal.classList.remove('hidden');

    try {
      const res = await apiFetch('/api/web/user/subdomains/' + encodeURIComponent(id));
      state.currentSubdomain = res.data;
      title.textContent = res.data.full_subdomain;
      renderSettingsDetail(res.data);
    } catch (err) {
      body.innerHTML = '<div class="text-center text-xs text-red-500 p-4">' + escHtml(err.message) + '</div>';
    }
  }

  function renderSettingsDetail(s) {
    const body = $('settings-body');
    const isTermux = s.is_termux;
    const records = s.records || [];

    const recordsHtml = records.map(function (r) {
      const isPrimary = r.is_primary;
      let typeCls = 'bg-slate-100 text-slate-700';
      if (r.type === 'A' || r.type === 'AAAA') typeCls = 'bg-blue-100 text-blue-700';
      else if (r.type === 'CNAME') typeCls = 'bg-indigo-100 text-indigo-700';
      else if (r.type === 'MX') typeCls = 'bg-purple-100 text-purple-700';

      return (
        '<div class="p-3 rounded-xl border border-slate-200 bg-white mb-2 shadow-sm">' +
          '<div class="flex items-center justify-between gap-2 mb-2">' +
            '<div class="flex items-center gap-1.5">' +
              '<span class="dash-badge-type ' + typeCls + '">' + escHtml(r.type) + '</span>' +
              (isPrimary ? '<span class="dash-badge-type dash-badge-pending">Primary</span>' : '') +
            '</div>' +
            '<div class="flex items-center gap-1">' +
              (!isPrimary
                ? '<button onclick="deleteDnsRecord(\'' + escHtml(s.id) + '\',\'' + escHtml(r.id) + '\')" class="dash-icon-btn dash-icon-btn-danger" title="Hapus"><i data-lucide="trash-2" class="w-3 h-3"></i></button>'
                : '') +
            '</div>' +
          '</div>' +
          '<p class="text-xs font-mono-code text-slate-900 break-all"><span class="text-slate-400">' + escHtml(r.name) + '</span> &rarr; ' + escHtml(r.content) + '</p>' +
          '<div class="flex items-center justify-between mt-2 text-[10px] text-slate-500">' +
            '<span>TTL ' + (r.ttl === 1 ? 'auto' : r.ttl) + '</span>' +
            '<span>Proxy: ' + (r.proxied ? 'ON' : 'OFF') + '</span>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    const termuxSection = isTermux
      ? (
        '<div class="border-t border-slate-200/60 pt-4 mt-4">' +
          '<div class="flex items-center justify-between mb-2">' +
            '<p class="text-xs font-bold text-slate-900">Installer Termux</p>' +
            '<span class="dash-badge-type dash-badge-termux">Termux Only</span>' +
          '</div>' +
          '<div class="space-y-1.5">' +
            '<button onclick="regenerateInstaller(\'' + escHtml(s.id) + '\')" class="w-full dash-btn-secondary px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 justify-center">' +
              '<i data-lucide="refresh-cw" class="w-3 h-3"></i> Regenerate Installer URL' +
            '</button>' +
            '<div class="grid grid-cols-2 gap-1.5">' +
              '<button onclick="copyInstallerUrl(\'' + escHtml(s.id) + '\')" class="dash-btn-secondary px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 justify-center">' +
                '<i data-lucide="copy" class="w-3 h-3"></i> Copy URL' +
              '</button>' +
              '<button onclick="downloadInstaller(\'' + escHtml(s.id) + '\')" class="dash-btn-secondary px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 justify-center">' +
                '<i data-lucide="download" class="w-3 h-3"></i> Download' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      )
      : '';

    const settingSection = isTermux
      ? (
        '<div class="space-y-3">' +
          '<div>' +
            '<p class="dash-field-label">Subdomain</p>' +
            '<p class="font-mono-code text-xs text-slate-900 break-all">' + escHtml(s.full_subdomain) + '</p>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-2">' +
            '<div>' +
              '<p class="dash-field-label">Port</p>' +
              '<p class="font-mono-code text-xs text-slate-900">' + (s.service_port || 3000) + '</p>' +
            '</div>' +
            '<div>' +
              '<p class="dash-field-label">Service</p>' +
              '<p class="font-mono-code text-xs text-slate-900">' + (s.service_type || 'http') + '</p>' +
            '</div>' +
          '</div>' +
          '<div class="p-2.5 rounded-lg bg-purple-50 border border-purple-200 text-[11px] text-purple-800">' +
            'Subdomain Termux nggak bisa edit target/proxy. Hapus & bikin ulang kalau perlu ubah.' +
          '</div>' +
        '</div>'
      )
      : (
        '<div class="space-y-3">' +
          '<div>' +
            '<label class="dash-field-label">Target</label>' +
            '<input type="text" id="sd-edit-target" value="' + escHtml(s.target || '') + '" class="dash-field-input font-mono-code" />' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-2">' +
            '<div>' +
              '<label class="dash-field-label">Tipe</label>' +
              '<select id="sd-edit-type" class="dash-field-input">' +
                '<option value="pages" ' + (s.type === 'pages' ? 'selected' : '') + '>Pages (CNAME)</option>' +
                '<option value="ip" ' + (s.type === 'ip' ? 'selected' : '') + '>IP (A)</option>' +
                '<option value="redirect" ' + (s.type === 'redirect' ? 'selected' : '') + '>Redirect</option>' +
              '</select>' +
            '</div>' +
            '<div>' +
              '<label class="dash-field-label">Proxy</label>' +
              '<select id="sd-edit-proxied" class="dash-field-input">' +
                '<option value="0" ' + (!s.proxied ? 'selected' : '') + '>OFF</option>' +
                '<option value="1" ' + (s.proxied ? 'selected' : '') + '>ON</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<button onclick="applySubdomainEdit(\'' + escHtml(s.id) + '\')" class="w-full btn-primary px-4 py-2 rounded-lg text-xs font-semibold mt-2">Apply Perubahan</button>' +
        '</div>'
      );

    body.innerHTML = (
      '<div class="border-b border-slate-200/60 flex mb-4">' +
        '<button onclick="dashTab(\'setting\')" id="dtab-setting" class="dash-tab active flex-1">Setting</button>' +
        '<button onclick="dashTab(\'dns\')" id="dtab-dns" class="dash-tab flex-1">DNS Records</button>' +
      '</div>' +
      '<div id="dpanel-setting" class="space-y-3">' +
        settingSection +
        termuxSection +
        '<div class="border-t border-slate-200/60 pt-4 mt-4">' +
          '<button onclick="deleteSubdomain(\'' + escHtml(s.id) + '\')" class="w-full dash-btn-danger px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5">' +
            '<i data-lucide="trash-2" class="w-3 h-3"></i> Hapus Subdomain' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div id="dpanel-dns" class="hidden space-y-2">' +
        '<div class="flex items-center justify-between mb-2">' +
          '<p class="text-xs font-bold text-slate-900">DNS Records <span class="text-slate-400 font-normal">(' + records.length + ')</span></p>' +
          '<button onclick="openDnsModal(\'' + escHtml(s.id) + '\', null)" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-semibold transition">' +
            '<i data-lucide="plus" class="w-3 h-3"></i> Tambah' +
          '</button>' +
        '</div>' +
        (recordsHtml || '<div class="text-center py-6"><p class="text-xs text-slate-400">Belum ada record tambahan.</p></div>') +
      '</div>'
    );

    if (window.lucide) window.lucide.createIcons();
  }

  function dashTab(name) {
    ['setting', 'dns'].forEach(function (t) {
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

  function closeSettingsModal() {
    const modal = $('settings-modal');
    if (modal) modal.classList.add('hidden');
    state.currentSubdomain = null;
  }

  async function applySubdomainEdit(id) {
    const target = $('sd-edit-target')?.value.trim();
    const type = $('sd-edit-type')?.value;
    const proxied = $('sd-edit-proxied')?.value === '1';

    if (!target) return toast('Target wajib diisi', 'warning');

    Utils.showLoading('Menyimpan perubahan...');
    try {
      await apiFetch('/api/web/user/subdomains/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: { target: target, target_type: type, proxied: proxied }
      });
      toast('Perubahan tersimpan', 'success');
      await loadSubdomains();
      openSettingsModal(id);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  async function verifySubdomain(id) {
    Utils.showLoading('Memverifikasi DNS...');
    try {
      const res = await apiFetch('/api/web/user/subdomains/' + encodeURIComponent(id) + '/verify', { method: 'POST' });
      const d = res.data || {};
      if (d.verified) {
        toast('Subdomain terverifikasi & aktif', 'success');
      } else {
        toast(d.reason || 'Belum terverifikasi — DNS belum propagasi', 'warning');
      }
      await loadSubdomains();
      const modal = $('settings-modal');
      if (modal && !modal.classList.contains('hidden')) {
        openSettingsModal(id);
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  async function deleteSubdomain(id) {
    const s = state.currentSubdomain;
    if (!s) return;
    const input = prompt('Ketik "' + s.subdomain + '" untuk konfirmasi hapus:');
    if (input !== s.subdomain) return toast('Konfirmasi salah', 'warning');

    Utils.showLoading('Menghapus subdomain...');
    try {
      await apiFetch('/api/web/user/subdomains/' + encodeURIComponent(id), { method: 'DELETE' });
      toast('Subdomain dihapus', 'success');
      closeSettingsModal();
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
      const res = await apiFetch('/api/web/user/subdomains/' + encodeURIComponent(id) + '/regenerate-installer', { method: 'POST' });
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
      const res = await apiFetch('/api/web/user/subdomains/' + encodeURIComponent(id) + '/regenerate-installer', { method: 'POST' });
      const url = res?.data?.installer_url;
      if (url) Utils.copyToClipboard(url, 'Installer URL disalin!');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function downloadInstaller(id) {
    try {
      const token = getToken();
      const res = await fetch(API_BASE_URL + '/api/web/user/subdomains/' + encodeURIComponent(id) + '/installer-script', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) throw new Error('Gagal download installer');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'install-' + id + '.sh';
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
    ['pointing', 'termux'].forEach(function (t) {
      const btn = $('create-tab-' + t);
      const form = $('form-' + t);
      if (btn) btn.classList.remove('active');
      if (form) form.classList.add('hidden');
    });
    const btn = $('create-tab-' + kind);
    const form = $('form-' + kind);
    if (btn) btn.classList.add('active');
    if (form) form.classList.remove('hidden');

    const isOwner = state.user?.role === 'owner' || state.user?.tier === 'owner';
    const cost = kind === 'termux' ? state.config.termuxCost : state.config.pointingCost;
    
    if ($('modal-cost')) $('modal-cost').textContent = isOwner ? 'Gratis' : fmtNum(cost);
  }

  async function submitCreateSubdomain() {
    const kind = state.createKind;
    let body = { kind: kind };

    if (kind === 'pointing') {
      const subdomain = ($('cs-pointing-subdomain')?.value || '').trim().toLowerCase();
      const target = ($('cs-pointing-target')?.value || '').trim();
      const targetType = $('cs-pointing-type')?.value || 'pages';
      const proxied = $('cs-pointing-proxied')?.value === '1';
      const domainSelected = $('cs-domain-select-pointing')?.value || '';
      
      if (!subdomain || !target) return toast('Subdomain & target wajib', 'warning');
      body.subdomain = subdomain;
      body.target = target;
      body.target_type = targetType;
      body.proxied = proxied;
      body.domain_selected = domainSelected;
    } else {
      const subdomain = ($('cs-termux-subdomain')?.value || '').trim().toLowerCase();
      const service_port = parseInt($('cs-termux-port')?.value || '3000');
      const service_type = $('cs-termux-service')?.value || 'http';
      const domainSelected = $('cs-domain-select-termux')?.value || '';
      
      if (!subdomain) return toast('Subdomain wajib', 'warning');
      body.subdomain = subdomain;
      body.service_port = service_port;
      body.service_type = service_type;
      body.domain_selected = domainSelected;
    }

    Utils.showLoading('Membuat subdomain...');
    try {
      const res = await apiFetch('/api/web/user/subdomains', { method: 'POST', body: body });
      toast('Subdomain ' + (res.data.full_subdomain || res.data.subdomain) + ' dibuat', 'success');
      closeCreateSubdomainModal();

      if (state.user) {
        state.user.points = res.data.balance_after ?? state.user.points;
        renderUser();
      }

      await loadSubdomains();
      await loadSubdomainsSummary();

      if (kind === 'termux' && res.data.id) {
        setTimeout(function () {
          openSettingsModal(res.data.id);
        }, 400);
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
    state.currentDnsEdit = { subdomainId: subdomainId, record: record };
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
    const subdomainId = state.currentDnsEdit.subdomainId;
    const record = state.currentDnsEdit.record;

    const type = $('dns-type')?.value;
    const name = ($('dns-name')?.value || '@').trim();
    let content = ($('dns-content')?.value || '').trim();
    const ttl = parseInt($('dns-ttl')?.value || '1');
    const proxied = $('dns-proxied')?.value === '1';

    if (type === 'MX') {
      const prio = parseInt($('dns-priority')?.value || '10');
      content = prio + ' ' + content;
    }

    if (!content) return toast('Content wajib', 'warning');

    Utils.showLoading('Menyimpan DNS...');
    try {
      if (record) {
        await apiFetch('/api/web/user/subdomains/' + encodeURIComponent(subdomainId) + '/records/' + encodeURIComponent(record.id), {
          method: 'PATCH',
          body: { type: type, name: name, content: content, ttl: ttl, proxied: proxied }
        });
      } else {
        await apiFetch('/api/web/user/subdomains/' + encodeURIComponent(subdomainId) + '/records', {
          method: 'POST',
          body: { type: type, name: name, content: content, ttl: ttl, proxied: proxied }
        });
      }
      toast('DNS record tersimpan', 'success');
      closeDnsModal();
      const modal = $('settings-modal');
      if (modal && !modal.classList.contains('hidden')) {
        openSettingsModal(subdomainId);
      }
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
      await apiFetch('/api/web/user/subdomains/' + encodeURIComponent(subdomainId) + '/records/' + encodeURIComponent(recordId), { method: 'DELETE' });
      toast('DNS record dihapus', 'success');
      openSettingsModal(subdomainId);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  async function loadPoints() {
    const ledger = $('pt-ledger');
    if (ledger) {
      ledger.innerHTML =
        '<div class="skeleton h-14 m-3 rounded-xl"></div>' +
        '<div class="skeleton h-14 m-3 rounded-xl"></div>';
    }

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
        ledger.innerHTML = txs.map(function (t) {
          const isPlus = t.delta > 0;
          let label = t.reason || 'Transaksi';
          if (t.reason === 'signup_bonus') label = 'Signup bonus';
          else if (t.reason === 'create_pointing_subdomain') label = 'Create subdomain (pointing)';
          else if (t.reason === 'create_termux_subdomain') label = 'Create subdomain (termux)';

          return (
            '<div class="dash-ledger-row">' +
              '<div class="dash-ledger-icon ' + (isPlus ? 'dash-ledger-plus' : 'dash-ledger-minus') + '">' + (isPlus ? '+' : '−') + '</div>' +
              '<div class="min-w-0 flex-1">' +
                '<p class="text-xs font-semibold text-slate-800 truncate">' + escHtml(label) + '</p>' +
                '<p class="text-[10px] text-slate-500 mt-0.5">' + escHtml(fmtRel(t.created_at)) + '</p>' +
              '</div>' +
              '<div class="text-right shrink-0">' +
                '<p class="text-xs font-bold ' + (isPlus ? 'text-emerald-600' : 'text-red-600') + '">' + (isPlus ? '+' : '') + fmtNum(t.delta) + '</p>' +
                '<p class="text-[10px] text-slate-400">&rarr; ' + fmtNum(t.balance_after) + '</p>' +
              '</div>' +
            '</div>'
          );
        }).join('');
      }
    } catch (err) {
      if (ledger) ledger.innerHTML = '<div class="p-6 text-center text-xs text-red-500">' + escHtml(err.message) + '</div>';
    }
  }

  function openTopupInfo() {
    switchView('points');
    toast('Pilih paket di bawah lalu hubungi admin.', 'info');
  }

  function handleBuyPoin(amount) {
    const username = 'sigitchan';
    const message = 'Halo admin, saya mau beli paket ' + fmtNum(amount) + ' poin untuk akun ' + (state.user?.email || '-');
    const url = 'https://t.me/' + username + '?text=' + encodeURIComponent(message);
    window.open(url, '_blank', 'noopener');
  }

  function handleClearCache() {
    if (!confirm('Bersihkan cache dan muat ulang halaman? Sesi login tetap aman.')) return;

    const btn = document.querySelector('.dash-clear-cache');
    if (btn) {
      btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> <span>Membersihkan...</span>';
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      if (window.caches) {
        caches.keys().then(function (names) {
          return Promise.all(names.map(function (name) {
            return caches.delete(name);
          }));
        });
      }

      const token = getToken();
      const user = getCurrentUser();
      const mailboxId = localStorage.getItem(STORAGE_KEYS.MAILBOX_ID);

      localStorage.clear();
      sessionStorage.clear();

      if (token) localStorage.setItem(STORAGE_KEYS.TOKEN, token);
      if (user) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      if (mailboxId) localStorage.setItem(STORAGE_KEYS.MAILBOX_ID, mailboxId);

      toast('Cache dibersihkan. Memuat ulang...', 'success');
      setTimeout(function () {
        window.location.reload(true);
      }, 800);
    } catch (e) {
      toast('Gagal membersihkan cache: ' + e.message, 'error');
      if (btn) {
        btn.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i> <span>Bersihkan Cache</span>';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  function renderAccount() {
    renderUser();
    loadSessions();
  }

  function switchAccTab(name) {
    ['profile', 'security', 'api-keys', 'sessions', 'danger'].forEach(function (t) {
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
    if (name === 'api-keys') loadApiKeys();
  }

  async function loadApiKeys() {
    const list = $('api-keys-list');
    if (!list) return;
    list.innerHTML = '<div class="skeleton h-16 rounded-xl"></div>';

    try {
      const res = await apiFetch('/api/web/user/api-keys');
      const keys = res?.data?.keys || [];

      if (!keys.length) {
        list.innerHTML = '<p class="text-xs text-slate-400">Belum ada API Key. Buat baru di atas.</p>';
        return;
      }

      list.innerHTML = keys.map(function (k) {
        const isRevoked = k.revoked;
        const expiredText = k.expires_at ? 'Expired: ' + fmtDate(k.expires_at) : 'Tidak ada expired';
        const lastUsedText = k.last_used_at ? 'Terakhir dipakai: ' + fmtRel(k.last_used_at) : 'Belum pernah dipakai';
        
        return `
          <div class="p-3 rounded-xl border ${isRevoked ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'} mb-2">
            <div class="flex items-center justify-between gap-2 mb-1">
              <p class="text-xs font-bold text-slate-800 truncate">${escHtml(k.label)}</p>
              ${isRevoked ? '<span class="dash-badge-type dash-badge-blocked">Revoked</span>' : '<span class="dash-badge-type dash-badge-active">Aktif</span>'}
            </div>
            <p class="font-mono-code text-xs text-slate-600 mb-2 break-all">${escHtml(k.prefix)}...****</p>
            <div class="flex items-center justify-between text-[10px] text-slate-500">
              <span>${escHtml(lastUsedText)}</span>
              ${!isRevoked ? `<button onclick="revokeApiKey('${escHtml(k.id)}', '${escHtml(k.label)}')" class="text-red-600 hover:underline font-semibold">Cabut</button>` : ''}
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      list.innerHTML = `<p class="text-xs text-red-500">${escHtml(err.message)}</p>`;
    }
  }

  async function generateApiKey() {
    const label = ($('api-key-label')?.value || '').trim() || 'default';
    
    if (!confirm('API Key hanya akan ditampilkan SEKALI. Pastikan Anda menyimpannya dengan aman. Lanjutkan?')) return;

    Utils.showLoading('Membuat API Key...');
    try {
      const res = await apiFetch('/api/web/user/api-keys', {
        method: 'POST',
        body: { label: label, scopes: ['mailbox:read', 'mailbox:write'] }
      });
      
      const key = res?.data?.key;
      if (key) {
        prompt('Ini API Key Anda. Salin sekarang (tidak akan ditampilkan lagi):', key);
        $('api-key-label').value = '';
        loadApiKeys();
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  async function revokeApiKey(id, label) {
    if (!confirm(`Cabut API Key "${label}"? Key yang sudah dicabut tidak akan bisa dipakai lagi.`)) return;

    Utils.showLoading('Mencabut API Key...');
    try {
      await apiFetch('/api/web/user/api-keys/' + encodeURIComponent(id), { method: 'DELETE' });
      toast('API Key dicabut', 'success');
      loadApiKeys();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
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

      list.innerHTML = sessions.map(function (s) {
        const isCurrent = s.id === state.sessionId || s.is_current;
        return (
          '<div class="p-3 rounded-lg border ' + (isCurrent ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200') + ' flex items-center justify-between gap-2 mb-2">' +
            '<div class="min-w-0">' +
              '<p class="text-xs font-bold text-slate-900 truncate">' + escHtml(s.ip || 'IP tidak diketahui') + '</p>' +
              '<p class="text-[10px] text-slate-500 truncate">' + escHtml((s.user_agent || '').slice(0, 50) || 'Device') + '</p>' +
              '<p class="text-[10px] text-slate-400">' + escHtml(fmtRel(s.last_active || s.created_at)) + '</p>' +
            '</div>' +
            (isCurrent
              ? '<span class="dash-badge-type dash-badge-active">Sesi ini</span>'
              : '<button onclick="revokeSession(\'' + escHtml(s.id) + '\')" class="dash-btn-danger px-2.5 py-1 rounded-md text-[11px] font-semibold">Cabut</button>') +
          '</div>'
        );
      }).join('');
    } catch (err) {
      list.innerHTML = '<p class="text-xs text-red-500">' + escHtml(err.message) + '</p>';
    }
  }

  async function revokeSession(id) {
    try {
      await apiFetch('/api/web/user/sessions/' + encodeURIComponent(id), { method: 'DELETE' });
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
      setTimeout(function () {
        window.location.replace('login.html');
      }, 800);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  function openPwdModal() {
    $('pwd-modal')?.classList.remove('hidden');
  }

  function closePwdModal() {
    $('pwd-modal')?.classList.add('hidden');
  }

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
    } catch (e) {}
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
    $('ac-btn-generate-api')?.addEventListener('click', generateApiKey);

    $('pt-btn-refresh')?.addEventListener('click', loadPoints);
    $('tm-btn-refresh-mailboxes')?.addEventListener('click', function () {
      if (window.TempMailModule) window.TempMailModule.loadMailboxes();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeSettingsModal();
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

    await loadConfigCost();
    await loadDomains();
    await loadOverview();
    if (state.initialized) return;
    state.initialized = true;

    const hashView = (window.location.hash || '').replace('#', '');
    if (hashView && $('view-' + hashView)) {
      switchView(hashView);
    }
  }

  window.Dashboard = {
    user: state.user,
    switchView: switchView,
    toggleSidebar: toggleSidebar,
    openSettingsModal: openSettingsModal,
    closeSettingsModal: closeSettingsModal,
    applySubdomainEdit: applySubdomainEdit,
    verifySubdomain: verifySubdomain,
    deleteSubdomain: deleteSubdomain,
    regenerateInstaller: regenerateInstaller,
    copyInstallerUrl: copyInstallerUrl,
    downloadInstaller: downloadInstaller,
    openCreateSubdomainModal: openCreateSubdomainModal,
    closeCreateSubdomainModal: closeCreateSubdomainModal,
    switchCreateTab: switchCreateTab,
    filterSubdomains: filterSubdomains,
    toggleExpand: toggleExpand,
    dashTab: dashTab,
    openDnsModal: openDnsModal,
    closeDnsModal: closeDnsModal,
    submitDnsRecord: submitDnsRecord,
    deleteDnsRecord: deleteDnsRecord,
    switchAccTab: switchAccTab,
    openTopupInfo: openTopupInfo,
    handleBuyPoin: handleBuyPoin,
    handleClearCache: handleClearCache,
    loadPoints: loadPoints,
    refreshSidebarBadges: loadSubdomainsSummary,
    toast: toast,
    fmtNum: fmtNum
  };

  window.toggleSidebar = toggleSidebar;
  window.switchView = switchView;
  window.openSettingsModal = openSettingsModal;
  window.closeSettingsModal = closeSettingsModal;
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
  window.toggleExpand = toggleExpand;
  window.dashTab = dashTab;
  window.openDnsModal = openDnsModal;
  window.closeDnsModal = closeDnsModal;
  window.submitDnsRecord = submitDnsRecord;
  window.deleteDnsRecord = deleteDnsRecord;
  window.switchAccTab = switchAccTab;
  window.openTopupInfo = openTopupInfo;
  window.handleBuyPoin = handleBuyPoin;
  window.handleClearCache = handleClearCache;
  window.revokeSession = revokeSession;
  window.saveProfile = saveProfile;
  window.changePassword = changePassword;
  window.deleteAccount = deleteAccount;
  window.generateApiKey = generateApiKey;
  window.revokeApiKey = revokeApiKey;

  document.addEventListener('DOMContentLoaded', init);
})();
