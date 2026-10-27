(function () {
  'use strict';

  const state = {
    user: null,
    usersPage: 0,
    usersLimit: 20,
    usersTotal: 0,
    usersFilter: '',
    usersSearch: '',
    currentUserId: null,
    currentUserEmail: null,
    currentUserPoints: 0,
    visitors: [],
    configs: {},
    initialized: false,
    bootstrapped: false
  };

  const ROLE_ALLOWED = ['admin', 'owner'];

  function $(id) { return document.getElementById(id); }
  function $all(sel) { return document.querySelectorAll(sel); }

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fmtNum(n) {
    return Number(n || 0).toLocaleString('id-ID');
  }

  function fmtDate(ts) {
    if (!ts) return '-';
    try {
      return new Date(ts * 1000).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return '-'; }
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

  function adminToast(msg, type) {
    type = type || 'success';
    let wrap = $('admin-toast');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'admin-toast';
      wrap.className = 'admin-toast-wrap';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = 'admin-toast' + (type === 'error' ? ' admin-toast-error' : type === 'warning' ? ' admin-toast-warning' : '');
    const iconColor = type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#10b981';
    const iconName = type === 'error' ? 'x' : type === 'warning' ? 'alert-triangle' : 'check';
    el.innerHTML =
      '<div style="color:' + iconColor + ';flex-shrink:0"><i data-lucide="' + iconName + '" class="w-4 h-4"></i></div>' +
      '<div class="flex-1 min-w-0"><p class="text-xs font-semibold text-slate-800 break-words">' + esc(msg) + '</p></div>';
    wrap.appendChild(el);
    if (window.lucide) window.lucide.createIcons();
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      el.style.transition = 'all 0.2s';
      setTimeout(function () { el.remove(); }, 200);
    }, 4000);
  }

  function adminLoading(show) {
    let loader = $('admin-loader');
    if (!loader && show) {
      loader = document.createElement('div');
      loader.id = 'admin-loader';
      loader.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.4);backdrop-filter:blur(4px)';
      loader.innerHTML =
        '<div style="background:#fff;padding:20px 28px;border-radius:12px;display:flex;align-items:center;gap:12px;box-shadow:0 12px 40px -8px rgba(15,23,42,0.3)">' +
          '<div style="width:20px;height:20px;border:2.5px solid rgba(245,158,11,0.25);border-top-color:#f59e0b;border-radius:50%;animation:spin 0.7s linear infinite"></div>' +
          '<span style="font-size:13px;font-weight:600;color:#0f172a">Memproses...</span>' +
        '</div>' +
        '<style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
      document.body.appendChild(loader);
    } else if (loader && !show) {
      loader.remove();
    }
  }

  function toggleAdminSidebar() {
    const panel = $('admin-sidebar');
    const overlay = $('admin-sidebar-overlay');
    if (!panel || !overlay) return;
    if (panel.classList.contains('is-open')) {
      panel.classList.remove('is-open');
      overlay.classList.add('hidden');
    } else {
      panel.classList.add('is-open');
      overlay.classList.remove('hidden');
    }
  }

  function adminSwitchView(name, ev) {
    if (ev) ev.preventDefault();

    $all('.admin-view').forEach(function (v) { v.classList.remove('active'); });
    const target = $('admin-view-' + name);
    if (target) target.classList.add('active');

    $all('.admin-nav-item').forEach(function (i) { i.classList.remove('active'); });
    $all('.admin-nav-item').forEach(function (i) {
      if (i.getAttribute('data-view') === name) i.classList.add('active');
    });

    const titles = {
      overview: ['Overview', 'Ringkasan platform'],
      users: ['Kelola Pengguna', 'Cari, edit, dan kelola akun'],
      points: ['Poin Ledger', 'Semua transaksi poin'],
      config: ['Konfigurasi', 'Harga dan limit sistem'],
      visitors: ['Visitor & IP', 'Monitor dan kelola visitor']
    };
    const t = titles[name] || titles.overview;
    if ($('topbar-title')) $('topbar-title').textContent = t[0];
    if ($('topbar-sub')) $('topbar-sub').textContent = t[1];

    if (window.innerWidth < 768) {
      const panel = $('admin-sidebar');
      if (panel && panel.classList.contains('is-open')) toggleAdminSidebar();
    }

    if (name === 'overview') loadOverview();
    if (name === 'users') loadUsers();
    if (name === 'points') loadPointsLedger();
    if (name === 'config') loadConfig();
    if (name === 'visitors') loadVisitors();

    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.lucide) window.lucide.createIcons();
  }

  function openModal(id) {
    const m = $(id);
    if (m) m.classList.remove('hidden');
  }

  function closeModal(id) {
    const m = $(id);
    if (m) m.classList.add('hidden');
  }

  function delay(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  async function tryFetchMe() {
    return await apiFetch('/api/web/auth/me', { skipAuthRedirect: true });
  }

  async function guardRole() {
    const token = getToken();
    if (!token) {
      window.location.replace('login.html');
      return false;
    }

    let res = null;
    let err = null;

    try {
      res = await tryFetchMe();
    } catch (e) {
      err = e;
    }

    if (!res?.data?.user || err) {
      const retryToken = getToken();
      if (retryToken) {
        await delay(600);
        try {
          res = await tryFetchMe();
          err = null;
        } catch (e2) {
          err = e2;
        }
      }
    }

    if (!res?.data?.user) {
      clearToken();
      window.location.replace('login.html');
      return false;
    }

    const user = res.data.user;
    if (!ROLE_ALLOWED.includes(user.role)) {
      window.location.replace('404.html');
      return false;
    }

    state.user = user;
    setToken(getToken(), user);

    if ($('admin-avatar')) $('admin-avatar').textContent = (user.display_name || user.email).charAt(0).toUpperCase();
    if ($('admin-name')) $('admin-name').textContent = user.display_name || user.email.split('@')[0];
    if ($('admin-email')) $('admin-email').textContent = user.email;

    return true;
  }

  async function loadOverview() {
    try {
      const res = await apiFetch('/api/admin/web/stats');
      const d = res?.data || {};
      const m = d.mailboxes || {};
      const v = d.visitors || {};
      const msgs = d.messages || {};

      if ($('stat-users')) $('stat-users').textContent = fmtNum(v.total || 0);
      if ($('stat-users-hint')) $('stat-users-hint').textContent = (v.active_24h || 0) + ' aktif 24 jam';

      if ($('stat-mailboxes')) $('stat-mailboxes').textContent = fmtNum(m.total || 0);
      if ($('stat-mailboxes-hint')) $('stat-mailboxes-hint').textContent = (m.active || 0) + ' aktif · ' + (m.expired || 0) + ' expired';

      if ($('stat-subdomains')) $('stat-subdomains').textContent = fmtNum(msgs.total || 0);
      if ($('stat-subdomains-hint')) $('stat-subdomains-hint').textContent = 'Total pesan masuk';

      if ($('stat-points')) $('stat-points').textContent = fmtNum(v.banned || 0);
      if ($('stat-points-hint')) $('stat-points-hint').textContent = (v.whitelist || 0) + ' whitelist';

      if ($('nav-user-count')) $('nav-user-count').textContent = fmtNum(v.total || 0);

      renderRecentActivity();
    } catch (err) {
      adminToast(err.message || 'Gagal memuat overview', 'error');
    }
  }

  async function renderRecentActivity() {
    const box = $('recent-activity');
    if (!box) return;

    try {
      const res = await apiFetch('/api/admin/web/points/ledger?limit=5');
      const txs = res?.data?.transactions || [];

      if (!txs.length) {
        box.innerHTML = '<p class="p-4 text-xs text-slate-500">Belum ada transaksi.</p>';
        return;
      }

      box.innerHTML = txs.map(function (t) {
        const isPlus = t.delta > 0;
        let label = t.reason || 'Transaksi';
        if (t.reason === 'signup_bonus') label = 'Signup bonus';
        else if (t.reason === 'create_pointing_subdomain') label = 'Create pointing subdomain';
        else if (t.reason === 'create_termux_subdomain') label = 'Create termux subdomain';
        else if (t.reason === 'admin_adjustment') label = 'Admin adjustment';

        return (
          '<div class="p-3 flex items-start gap-3 hover:bg-slate-50 transition rounded-lg">' +
            '<div class="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ' + (isPlus ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700') + '">' + (isPlus ? '+' : '−') + '</div>' +
            '<div class="min-w-0 flex-1">' +
              '<p class="text-xs font-semibold text-slate-800 truncate">' + esc(label) + '</p>' +
              '<p class="text-[10px] text-slate-500 truncate">' + esc(t.email || t.user_id || '-') + '</p>' +
              '<p class="text-[10px] text-slate-400 mt-0.5">' + esc(fmtRel(t.created_at)) + '</p>' +
            '</div>' +
            '<p class="text-xs font-bold ' + (isPlus ? 'text-emerald-600' : 'text-red-600') + ' shrink-0">' + (isPlus ? '+' : '') + fmtNum(t.delta) + '</p>' +
          '</div>'
        );
      }).join('');
    } catch (err) {
      box.innerHTML = '<p class="p-4 text-xs text-red-500">' + esc(err.message) + '</p>';
    }
  }

  // ==========================================
  // RENDER USERS: MENGGUNAKAN CARD LIST MODERN
  // ==========================================
  async function loadUsers() {
    const wrap = $('users-tbody');
    if (wrap) wrap.innerHTML = '<div class="admin-skeleton h-16 w-full rounded-xl mb-3"></div><div class="admin-skeleton h-16 w-full rounded-xl"></div>';

    try {
      const params = new URLSearchParams();
      params.set('limit', state.usersLimit);
      params.set('offset', state.usersPage * state.usersLimit);
      if (state.usersFilter) params.set('filter', state.usersFilter);

      const res = await apiFetch('/api/admin/web/users?' + params.toString());
      const users = res?.data?.users || [];
      const total = res?.data?.total || 0;
      state.usersTotal = total;

      const filtered = state.usersSearch
        ? users.filter(function (u) {
            const s = state.usersSearch.toLowerCase();
            return (u.email || '').toLowerCase().includes(s) || (u.display_name || '').toLowerCase().includes(s);
          })
        : users;

      if (!filtered.length) {
        wrap.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Tidak ada user.</div>';
        renderUsersPagination();
        return;
      }

      wrap.innerHTML = filtered.map(function (u) {
        let statusBadge = '';
        if (u.banned) statusBadge = '<span class="admin-badge admin-badge-red">Banned</span>';
        else if (!u.email_verified) statusBadge = '<span class="admin-badge admin-badge-amber">Unverified</span>';
        else statusBadge = '<span class="admin-badge admin-badge-green">Verified</span>';

        const tierBadge = u.tier === 'premium'
          ? '<span class="admin-badge admin-badge-amber">Premium</span>'
          : '<span class="admin-badge admin-badge-gray">Free</span>';

        return (
          '<div style="background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:16px; margin-bottom:12px; display:flex; flex-direction:column; sm:flex-direction:row; align-items:flex-start; justify-content:space-between; gap:16px; box-shadow:0 2px 8px rgba(0,0,0,0.02);">' +
            '<div style="display:flex; align-items:center; gap:14px; flex:1; min-width:0;">' +
              '<div style="width:42px; height:42px; border-radius:12px; background:#eff6ff; color:#2563eb; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:18px; flex-shrink:0;">' + esc((u.display_name || u.email).charAt(0).toUpperCase()) + '</div>' +
              '<div style="min-width:0;">' +
                '<p style="font-weight:700; font-size:14px; color:#0f172a; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + esc(u.email) + '</p>' +
                '<div style="display:flex; align-items:center; gap:6px; margin-top:4px; flex-wrap:wrap;">' +
                  '<span style="font-size:11px; color:#64748b;">' + esc(u.display_name || '-') + '</span>' +
                  tierBadge + statusBadge +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:8px; flex-shrink:0; width:100%; sm:width:auto; margin-top:12px; sm:margin-top:0;">' +
              '<div>' +
                '<p style="font-weight:700; font-size:14px; color:#d97706; margin:0;">' + fmtNum(u.points || 0) + ' Poin</p>' +
                '<p style="font-size:10px; color:#94a3b8; margin:2px 0 0;">Daftar: ' + esc(fmtDate(u.created_at)) + '</p>' +
              '</div>' +
              '<div style="display:flex; gap:8px; width:100%; justify-content:flex-end;">' +
                '<button onclick="openUserDetail(\'' + esc(u.id) + '\')" style="padding:8px 16px; border-radius:10px; font-size:12px; font-weight:700; background:#f1f5f9; color:#334155; border:none; cursor:pointer;">Detail</button>' +
                '<button onclick="openUserPointsModal(\'' + esc(u.id) + '\',\'' + esc(u.email) + '\',' + (u.points || 0) + ')" style="padding:8px 16px; border-radius:10px; font-size:12px; font-weight:700; background:#fffbeb; color:#b45309; border:1px solid #fde68a; cursor:pointer;">Poin</button>' +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      renderUsersPagination();
    } catch (err) {
      wrap.innerHTML = '<div class="p-8 text-center text-xs text-red-500">' + esc(err.message) + '</div>';
    }
  }

  function renderUsersPagination() {
    const wrap = $('users-pagination');
    if (!wrap) return;

    const start = state.usersPage * state.usersLimit + 1;
    const end = Math.min((state.usersPage + 1) * state.usersLimit, state.usersTotal);
    const hasPrev = state.usersPage > 0;
    const hasNext = (state.usersPage + 1) * state.usersLimit < state.usersTotal;

    wrap.innerHTML =
      '<span style="font-size:12px; color:#64748b;">Menampilkan ' + (state.usersTotal ? start : 0) + '–' + end + ' dari ' + state.usersTotal + '</span>' +
      '<div class="flex gap-1">' +
        '<button onclick="changeUsersPage(-1)" ' + (!hasPrev ? 'disabled' : '') + ' class="admin-action-btn admin-action-btn-view" style="opacity:' + (hasPrev ? '1' : '0.4') + '; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:600; background:#f1f5f9; color:#334155; border:none;">Prev</button>' +
        '<button onclick="changeUsersPage(1)" ' + (!hasNext ? 'disabled' : '') + ' class="admin-action-btn admin-action-btn-view" style="opacity:' + (hasNext ? '1' : '0.4') + '; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:600; background:#f1f5f9; color:#334155; border:none;">Next</button>' +
      '</div>';
  }

  function changeUsersPage(delta) {
    const next = state.usersPage + delta;
    if (next < 0) return;
    if (delta > 0 && (next * state.usersLimit) >= state.usersTotal) return;
    state.usersPage = next;
    loadUsers();
  }

  function filterUsers() {
    const f = $('user-filter')?.value || '';
    state.usersFilter = f;
    state.usersPage = 0;
    loadUsers();
  }

  function searchUsers() {
    state.usersSearch = ($('user-search')?.value || '').trim();
    loadUsers();
  }

  async function openUserDetail(userId) {
    state.currentUserId = userId;
    const modal = $('modal-user-detail');
    const body = $('modal-user-body');
    if (!modal || !body) return;

    if ($('modal-user-email')) $('modal-user-email').textContent = 'Memuat...';
    body.innerHTML = '<div class="admin-skeleton h-32 w-full rounded-xl"></div>';
    openModal('modal-user-detail');

    try {
      const res = await apiFetch('/api/admin/web/users/' + encodeURIComponent(userId));
      const u = res?.data || {};
      if ($('modal-user-email')) $('modal-user-email').textContent = u.email || '-';

      const infoRow = function (label, value) {
        return (
          '<div class="flex items-center justify-between py-2 border-b border-slate-100">' +
            '<span class="text-xs text-slate-500">' + esc(label) + '</span>' +
            '<span class="text-xs font-semibold text-slate-800 text-right">' + value + '</span>' +
          '</div>'
        );
      };

      body.innerHTML =
        '<div class="space-y-1 mb-4">' +
          infoRow('Nama', esc(u.display_name || '-')) +
          infoRow('Role', '<span class="admin-badge ' + (u.role === 'admin' || u.role === 'owner' ? 'admin-badge-amber' : 'admin-badge-gray') + '">' + esc((u.role || 'user').toUpperCase()) + '</span>') +
          infoRow('Tier', '<span class="admin-badge ' + (u.tier === 'premium' ? 'admin-badge-amber' : 'admin-badge-gray') + '">' + esc((u.tier || 'free').toUpperCase()) + '</span>') +
          infoRow('Email Verified', u.email_verified ? '<span class="text-emerald-600">Ya</span>' : '<span class="text-red-600">Tidak</span>') +
          infoRow('Poin', '<span class="text-amber-600 font-bold">' + fmtNum(u.points || 0) + '</span>') +
          infoRow('Login Count', fmtNum(u.login_count || 0)) +
          infoRow('Last Login', esc(fmtDate(u.last_login))) +
          infoRow('Daftar', esc(fmtDate(u.created_at))) +
          infoRow('Signup IP', '<span class="font-mono-code">' + esc(u.signup_ip || '-') + '</span>') +
          infoRow('Mailbox Aktif', fmtNum(u.mailbox_count || 0)) +
          infoRow('Subdomain', fmtNum(u.subdomain_count || 0)) +
          infoRow('Sesi Aktif', fmtNum(u.active_sessions || 0)) +
        '</div>' +
        '<div class="grid grid-cols-2 gap-2">' +
          '<button onclick="openUserPointsModal(\'' + esc(u.id) + '\',\'' + esc(u.email) + '\',' + (u.points || 0) + ')" class="admin-btn-primary justify-center" style="width:100%;">Kelola Poin</button>' +
          (u.banned
            ? '<button onclick="submitUserUnban(\'' + esc(u.id) + '\')" class="admin-btn-secondary justify-center" style="width:100%;">Unban</button>'
            : '<button onclick="openBanModal(\'' + esc(u.id) + '\',\'' + esc(u.email) + '\')" class="admin-btn-secondary justify-center" style="color:#b91c1c;border-color:#fecaca; width:100%;">Ban</button>'
          ) +
          '<button onclick="submitDeleteUser(\'' + esc(u.id) + '\',\'' + esc(u.email) + '\')" class="admin-btn-danger justify-center col-span-2" style="width:100%; margin-top:8px;">Hapus Akun Permanen</button>' +
        '</div>';
    } catch (err) {
      body.innerHTML = '<p class="text-xs text-red-500 p-4">' + esc(err.message) + '</p>';
    }
  }

  function openUserPointsModal(userId, email, currentPoints) {
    state.currentUserId = userId;
    state.currentUserEmail = email;
    state.currentUserPoints = currentPoints || 0;

    if ($('modal-points-email')) $('modal-points-email').textContent = email + ' (saldo: ' + fmtNum(currentPoints) + ')';
    if ($('modal-points-delta')) $('modal-points-delta').value = '';
    if ($('modal-points-reason')) $('modal-points-reason').value = '';

    openModal('modal-user-points');
  }

  async function submitUserPoints() {
    const delta = parseInt($('modal-points-delta')?.value);
    const reason = ($('modal-points-reason')?.value || '').trim() || 'admin_adjustment';

    if (!Number.isInteger(delta) || delta === 0) {
      adminToast('Delta harus bilangan bulat selain nol', 'error');
      return;
    }

    adminLoading(true);
    try {
      const res = await apiFetch('/api/admin/web/users/' + encodeURIComponent(state.currentUserId) + '/points', {
        method: 'POST',
        body: { delta: delta, reason: reason, admin_id: state.user?.email || 'admin' }
      });
      adminToast('Poin disesuaikan. Saldo baru: ' + fmtNum(res.data.balance_after), 'success');
      closeModal('modal-user-points');
      
      // Paksa refresh list user dan detail modal jika sedang terbuka
      loadUsers();
      if (!$('modal-user-detail')?.classList.contains('hidden')) {
        openUserDetail(state.currentUserId);
      }

    } catch (err) {
      adminToast(err.message, 'error');
    } finally {
      adminLoading(false);
    }
  }

  function openBanModal(userId, email) {
    state.currentUserId = userId;
    if ($('modal-ban-email')) $('modal-ban-email').textContent = email;
    if ($('modal-ban-duration')) $('modal-ban-duration').value = '24';
    if ($('modal-ban-reason')) $('modal-ban-reason').value = '';
    openModal('modal-user-ban');
  }

  async function submitUserBan() {
    const duration = parseInt($('modal-ban-duration')?.value || '24');
    const reason = ($('modal-ban-reason')?.value || '').trim() || 'Diblokir oleh admin';

    if (isNaN(duration) || duration < 0) {
      adminToast('Durasi tidak valid', 'error');
      return;
    }

    adminLoading(true);
    try {
      await apiFetch('/api/admin/web/users/' + encodeURIComponent(state.currentUserId) + '/ban', {
        method: 'POST',
        body: { reason: reason, duration_hours: duration }
      });
      adminToast('User dibanned' + (duration > 0 ? ' selama ' + duration + ' jam' : ' permanen'), 'success');
      closeModal('modal-user-ban');
      closeModal('modal-user-detail');
      loadUsers();
    } catch (err) {
      adminToast(err.message, 'error');
    } finally {
      adminLoading(false);
    }
  }

  async function submitUserUnban(userId) {
    if (!confirm('Yakin unban user ini?')) return;
    adminLoading(true);
    try {
      await apiFetch('/api/admin/web/users/' + encodeURIComponent(userId) + '/unban', { method: 'POST' });
      adminToast('User di-unban', 'success');
      closeModal('modal-user-detail');
      loadUsers();
    } catch (err) {
      adminToast(err.message, 'error');
    } finally {
      adminLoading(false);
    }
  }

  async function submitDeleteUser(userId, email) {
    const input = prompt('Ketik "' + email + '" untuk konfirmasi hapus permanen:');
    if (input !== email) {
      adminToast('Konfirmasi salah', 'warning');
      return;
    }

    adminLoading(true);
    try {
      await apiFetch('/api/admin/web/users/' + encodeURIComponent(userId), { method: 'DELETE' });
      adminToast('User dihapus permanen', 'success');
      closeModal('modal-user-detail');
      loadUsers();
    } catch (err) {
      adminToast(err.message, 'error');
    } finally {
      adminLoading(false);
    }
  }

  async function loadPointsLedger() {
    const tbody = $('ledger-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center p-8"><div class="admin-skeleton h-12 w-full rounded-xl"></div></td></tr>';

    try {
      const reason = $('ledger-reason')?.value || '';
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (reason) params.set('reason', reason);

      const res = await apiFetch('/api/admin/web/points/ledger?' + params.toString());
      const txs = res?.data?.transactions || [];

      if (!txs.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-8 text-xs text-slate-400">Belum ada transaksi.</td></tr>';
        return;
      }

      tbody.innerHTML = txs.map(function (t) {
        const isPlus = t.delta > 0;
        let label = t.reason || 'transaksi';
        if (t.reason === 'signup_bonus') label = 'Signup bonus';
        else if (t.reason === 'create_pointing_subdomain') label = 'Create pointing';
        else if (t.reason === 'create_termux_subdomain') label = 'Create termux';
        else if (t.reason === 'admin_adjustment') label = 'Admin adjustment';
        else if (t.reason === 'retroactive_signup_bonus') label = 'Retroactive bonus';

        return (
          '<tr>' +
            '<td class="text-xs text-slate-500">' + esc(fmtRel(t.created_at)) + '</td>' +
            '<td class="text-xs">' + esc(t.email || t.user_id) + '</td>' +
            '<td class="font-bold ' + (isPlus ? 'text-emerald-600' : 'text-red-600') + '">' + (isPlus ? '+' : '') + fmtNum(t.delta) + '</td>' +
            '<td class="font-semibold text-slate-800">' + fmtNum(t.balance_after) + '</td>' +
            '<td class="text-xs">' + esc(label) + '</td>' +
            '<td class="text-xs text-slate-500">' + esc(t.admin_id || '-') + '</td>' +
          '</tr>'
        );
      }).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center p-8 text-xs text-red-500">' + esc(err.message) + '</td></tr>';
    }
  }

  const CONFIG_KEYS = [
    { key: 'signup_bonus_points', label: 'Bonus Signup (poin)', group: 'Poin & Subdomain' },
    { key: 'subdomain_pointing_cost', label: 'Biaya Subdomain Pointing (poin)', group: 'Poin & Subdomain' },
    { key: 'subdomain_termux_cost', label: 'Biaya Subdomain Termux (poin)', group: 'Poin & Subdomain' },
    { key: 'free_max_active_subdomain', label: 'Max Subdomain Aktif (Free)', group: 'Poin & Subdomain' },
    { key: 'premium_max_active_subdomain', label: 'Max Subdomain Aktif (Premium)', group: 'Poin & Subdomain' },
    { key: 'max_mailbox_per_ip_day', label: 'Max Mailbox per IP/hari', group: 'Mailbox' },
    { key: 'mailbox_duration_minutes', label: 'Durasi Mailbox (menit)', group: 'Mailbox' },
    { key: 'max_messages_per_mailbox', label: 'Max Pesan per Mailbox', group: 'Mailbox' },
    { key: 'max_concurrent_mailbox', label: 'Max Mailbox Aktif per User', group: 'Mailbox' },
    { key: 'global_max_mailbox_per_day', label: 'Global Max Mailbox/hari', group: 'Mailbox' },
    { key: 'max_accounts_per_ip', label: 'Max Akun per IP', group: 'Keamanan' },
    { key: 'max_accounts_per_device', label: 'Max Akun per Device', group: 'Keamanan' },
    { key: 'captcha_enabled', label: 'Captcha Aktif (1/0)', group: 'Keamanan' },
    { key: 'email_whitelist_enabled', label: 'Whitelist Provider Aktif (1/0)', group: 'Keamanan' },
    { key: 'maintenance_mode', label: 'Mode Maintenance (1/0)', group: 'Sistem' },
    { key: 'web_enabled', label: 'Web Aktif (1/0)', group: 'Sistem' },
    { key: 'require_login', label: 'Wajib Login (1/0)', group: 'Sistem' },
    { key: 'broadcast_banner', label: 'Broadcast Banner', group: 'Sistem' }
  ];

  async function loadConfig() {
    const grid = $('config-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="admin-skeleton h-24 w-full rounded-xl"></div><div class="admin-skeleton h-24 w-full rounded-xl"></div>';

    try {
      const res = await apiFetch('/api/admin/web/config');
      const configArr = res?.data?.config || [];
      const map = {};
      configArr.forEach(function (c) { map[c.key] = c.value; });
      state.configs = map;

      const groups = {};
      CONFIG_KEYS.forEach(function (c) {
        if (!groups[c.group]) groups[c.group] = [];
        groups[c.group].push(c);
      });

      grid.innerHTML = Object.keys(groups).map(function (groupName) {
        const fields = groups[groupName].map(function (c) {
          const val = map[c.key] !== undefined ? map[c.key] : '';
          return (
            '<div class="admin-config-field">' +
              '<label class="admin-field-label">' + esc(c.label) + '</label>' +
              '<input type="text" data-config-key="' + esc(c.key) + '" value="' + esc(val) + '" class="admin-field-input" />' +
              '<p class="admin-config-hint">key: ' + esc(c.key) + '</p>' +
            '</div>'
          );
        }).join('');
        return (
          '<div class="admin-config-group">' +
            '<p class="admin-config-group-title">' + esc(groupName) + '</p>' +
            fields +
          '</div>'
        );
      }).join('');
    } catch (err) {
      grid.innerHTML = '<p class="text-xs text-red-500 p-4">' + esc(err.message) + '</p>';
    }
  }

  async function saveConfig() {
    const inputs = $all('input[data-config-key]');
    const payload = {};

    inputs.forEach(function (inp) {
      const key = inp.getAttribute('data-config-key');
      const val = inp.value.trim();
      if (state.configs[key] !== val) {
        const numKeys = ['signup_bonus_points', 'subdomain_pointing_cost', 'subdomain_termux_cost',
          'free_max_active_subdomain', 'premium_max_active_subdomain', 'max_mailbox_per_ip_day',
          'mailbox_duration_minutes', 'max_messages_per_mailbox', 'max_concurrent_mailbox',
          'global_max_mailbox_per_day', 'max_accounts_per_ip', 'max_accounts_per_device'];

        if (numKeys.includes(key)) {
          payload[key] = parseInt(val);
          if (isNaN(payload[key])) payload[key] = 0;
        } else if (val === '1' || val === '0' || val === 'true' || val === 'false') {
          payload[key] = (val === '1' || val === 'true');
        } else {
          payload[key] = val;
        }
      }
    });

    if (Object.keys(payload).length === 0) {
      adminToast('Tidak ada perubahan', 'warning');
      return;
    }

    adminLoading(true);
    try {
      await apiFetch('/api/admin/web/config', { method: 'PATCH', body: payload });
      adminToast('Konfigurasi tersimpan (' + Object.keys(payload).length + ' field)', 'success');
      loadConfig();
    } catch (err) {
      adminToast(err.message, 'error');
    } finally {
      adminLoading(false);
    }
  }

  async function loadVisitors() {
    const tbody = $('visitors-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center p-8"><div class="admin-skeleton h-12 w-full rounded-xl"></div></td></tr>';

    try {
      const res = await apiFetch('/api/admin/web/visitors?limit=100');
      const visitors = res?.data?.visitors || [];
      state.visitors = visitors;

      if (!visitors.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-8 text-xs text-slate-400">Belum ada visitor.</td></tr>';
        return;
      }

      tbody.innerHTML = visitors.map(function (v) {
        let statusBadge = '<span class="admin-badge admin-badge-green">Normal</span>';
        if (v.banned) statusBadge = '<span class="admin-badge admin-badge-red">Banned</span>';
        else if (v.is_whitelist) statusBadge = '<span class="admin-badge admin-badge-amber">Whitelist</span>';

        return (
          '<tr>' +
            '<td><span class="font-mono-code text-xs font-semibold">' + esc(v.ip) + '</span></td>' +
            '<td class="text-[10px] font-mono-code text-slate-500 truncate max-w-[120px]">' + esc((v.fingerprint || '-').slice(0, 16)) + '</td>' +
            '<td class="text-xs">' + fmtNum(v.mailbox_count_today || 0) + ' / ' + fmtNum(v.mailbox_count_total || 0) + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td class="text-xs text-slate-500">' + esc(fmtRel(v.last_mailbox_at || v.updated_at)) + '</td>' +
            '<td class="text-right">' +
              '<div class="inline-flex gap-1">' +
                (v.banned
                  ? '<button onclick="submitUnblockIp(\'' + esc(v.ip) + '\')" class="admin-action-btn admin-action-btn-success" style="padding:4px 8px; font-size:11px;">Unblock</button>'
                  : '<button onclick="submitBlockIpDirect(\'' + esc(v.ip) + '\')" class="admin-action-btn admin-action-btn-danger" style="padding:4px 8px; font-size:11px;">Block</button>'
                ) +
                '<button onclick="submitToggleWhitelist(\'' + esc(v.ip) + '\',' + (v.is_whitelist ? 0 : 1) + ')" class="admin-action-btn admin-action-btn-points" style="padding:4px 8px; font-size:11px;">' + (v.is_whitelist ? 'Unwhitelist' : 'Whitelist') + '</button>' +
              '</div>' +
            '</td>' +
          '</tr>'
        );
      }).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center p-8 text-xs text-red-500">' + esc(err.message) + '</td></tr>';
    }
  }

  function openBlockIpModal() {
    if ($('modal-ip-value')) $('modal-ip-value').value = '';
    if ($('modal-ip-reason')) $('modal-ip-reason').value = '';
    if ($('modal-ip-duration')) $('modal-ip-duration').value = '1440';
    openModal('modal-block-ip');
  }

  async function submitBlockIp() {
    const ip = ($('modal-ip-value')?.value || '').trim();
    const reason = ($('modal-ip-reason')?.value || '').trim() || 'Diblokir oleh admin';
    const duration = parseInt($('modal-ip-duration')?.value || '1440');

    if (!ip) {
      adminToast('IP wajib diisi', 'error');
      return;
    }

    adminLoading(true);
    try {
      await apiFetch('/api/admin/web/visitors/block', {
        method: 'POST',
        body: { ip: ip, reason: reason, duration_minutes: duration }
      });
      adminToast('IP ' + ip + ' diblokir', 'success');
      closeModal('modal-block-ip');
      loadVisitors();
    } catch (err) {
      adminToast(err.message, 'error');
    } finally {
      adminLoading(false);
    }
  }

  async function submitBlockIpDirect(ip) {
    if (!confirm('Block IP ' + ip + ' permanent?')) return;
    adminLoading(true);
    try {
      await apiFetch('/api/admin/web/visitors/block', {
        method: 'POST',
        body: { ip: ip, reason: 'Blocked by admin', duration_minutes: 0 }
      });
      adminToast('IP diblokir', 'success');
      loadVisitors();
    } catch (err) {
      adminToast(err.message, 'error');
    } finally {
      adminLoading(false);
    }
  }

  async function submitUnblockIp(ip) {
    adminLoading(true);
    try {
      await apiFetch('/api/admin/web/visitors/unblock', {
        method: 'POST',
        body: { ip: ip }
      });
      adminToast('IP di-unblock', 'success');
      loadVisitors();
    } catch (err) {
      adminToast(err.message, 'error');
    } finally {
      adminLoading(false);
    }
  }

  async function submitToggleWhitelist(ip, enabled) {
    adminLoading(true);
    try {
      await apiFetch('/api/admin/web/visitors/whitelist', {
        method: 'POST',
        body: { ip: ip, enabled: !!enabled }
      });
      adminToast('Whitelist diupdate', 'success');
      loadVisitors();
    } catch (err) {
      adminToast(err.message, 'error');
    } finally {
      adminLoading(false);
    }
  }

  async function adminLogout() {
    adminLoading(true);
    try {
      await apiFetch('/api/web/auth/logout', { method: 'POST', skipAuthRedirect: true });
    } catch (e) {}
    clearToken();
    window.location.replace('login.html');
  }

  function bindEvents() {
    const userFilter = $('user-filter');
    if (userFilter) userFilter.addEventListener('change', filterUsers);

    const searchInput = $('user-search');
    if (searchInput) {
      let debounce;
      searchInput.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(searchUsers, 350);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeModal('modal-user-detail');
        closeModal('modal-user-points');
        closeModal('modal-user-ban');
        closeModal('modal-block-ip');
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

    const ok = await guardRole();
    if (!ok) return;

    await loadOverview();
    if (state.initialized) return;
    state.initialized = true;
  }

  window.adminSwitchView = adminSwitchView;
  window.toggleAdminSidebar = toggleAdminSidebar;
  window.adminLogout = adminLogout;
  window.loadOverview = loadOverview;
  window.loadUsers = loadUsers;
  window.changeUsersPage = changeUsersPage;
  window.filterUsers = filterUsers;
  window.searchUsers = searchUsers;
  window.openUserDetail = openUserDetail;
  window.openUserPointsModal = openUserPointsModal;
  window.submitUserPoints = submitUserPoints;
  window.openBanModal = openBanModal;
  window.submitUserBan = submitUserBan;
  window.submitUserUnban = submitUserUnban;
  window.submitDeleteUser = submitDeleteUser;
  window.loadPointsLedger = loadPointsLedger;
  window.loadConfig = loadConfig;
  window.saveConfig = saveConfig;
  window.loadVisitors = loadVisitors;
  window.openBlockIpModal = openBlockIpModal;
  window.submitBlockIp = submitBlockIp;
  window.submitBlockIpDirect = submitBlockIpDirect;
  window.submitUnblockIp = submitUnblockIp;
  window.submitToggleWhitelist = submitToggleWhitelist;
  window.closeModal = closeModal;
  window.adminToast = adminToast;

  document.addEventListener('DOMContentLoaded', init);
})();
