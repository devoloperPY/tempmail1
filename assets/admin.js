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
      wrap.className = 'fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-full max-w-sm pointer-events-none';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    const colors = {
      success: 'border-emerald-500 bg-emerald-50 text-emerald-800',
      error: 'border-red-500 bg-red-50 text-red-800',
      warning: 'border-amber-500 bg-amber-50 text-amber-800'
    };
    el.className = `pointer-events-auto border-l-4 p-4 rounded-xl shadow-lg text-xs font-semibold ${colors[type] || colors.success}`;
    const iconName = type === 'error' ? 'x-circle' : type === 'warning' ? 'alert-triangle' : 'check-circle';
    el.innerHTML = `<div class="flex items-center gap-2"><i data-lucide="${iconName}" class="w-4 h-4"></i><span>${esc(msg)}</span></div>`;
    wrap.appendChild(el);
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      el.style.transition = 'all 0.2s';
      setTimeout(() => el.remove(), 200);
    }, 4000);
  }

  function adminLoading(show) {
    let loader = $('admin-loader');
    if (!loader && show) {
      loader = document.createElement('div');
      loader.id = 'admin-loader';
      loader.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.4);backdrop-filter:blur(4px)';
      loader.innerHTML = '<div style="background:#fff;padding:20px 28px;border-radius:12px;display:flex;align-items:center;gap:12px;box-shadow:0 12px 40px -8px rgba(15,23,42,0.3)"><div style="width:20px;height:20px;border:2.5px solid rgba(37,99,235,0.25);border-top-color:#2563eb;border-radius:50%;animation:spin 0.7s linear infinite"></div><span style="font-size:13px;font-weight:600;color:#0f172a">Memproses...</span></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
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

    $all('.admin-view').forEach(v => v.classList.remove('active'));
    const target = $('admin-view-' + name);
    if (target) target.classList.add('active');

    $all('.admin-nav-item').forEach(i => i.classList.remove('active'));
    $all('.admin-nav-item').forEach(i => {
      if (i.getAttribute('data-view') === name) i.classList.add('active');
    });

    const titles = {
      overview: ['Overview', 'Ringkasan platform'],
      users: ['Kelola Pengguna', 'Cari, edit, dan kelola akun'],
      points: ['Poin Ledger', 'Semua transaksi poin'],
      domains: ['Domain Manager', 'Kelola domain aktif'],
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
    if (name === 'domains') loadDomains();
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
    try {
      res = await tryFetchMe();
    } catch (e) {}

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
        box.innerHTML = '<p class="p-4 text-xs text-slate-500 text-center">Belum ada transaksi.</p>';
        return;
      }

      box.innerHTML = txs.map(t => {
        const isPlus = t.delta > 0;
        let label = t.reason || 'Transaksi';
        if (t.reason === 'signup_bonus') label = 'Signup bonus';
        else if (t.reason === 'create_pointing_subdomain') label = 'Create subdomain';
        else if (t.reason === 'create_termux_subdomain') label = 'Create termux';
        else if (t.reason === 'admin_adjustment') label = 'Admin adjustment';

        return `
          <div class="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${isPlus ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}">${isPlus ? '+' : '−'}</div>
            <div class="min-w-0 flex-1">
              <p class="text-xs font-bold text-slate-800 truncate">${esc(label)}</p>
              <p class="text-[10px] text-slate-500 truncate">${esc(t.email || t.user_id || '-')}</p>
            </div>
            <div class="text-right shrink-0">
              <p class="text-xs font-bold ${isPlus ? 'text-emerald-600' : 'text-red-600'}">${isPlus ? '+' : ''}${fmtNum(t.delta)}</p>
              <p class="text-[10px] text-slate-400">${esc(fmtRel(t.created_at))}</p>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      box.innerHTML = `<p class="p-4 text-xs text-red-500">${esc(err.message)}</p>`;
    }
  }

  async function loadUsers() {
    const wrap = $('users-tbody');
    if (wrap) wrap.innerHTML = '<div class="admin-skeleton h-14 w-full rounded-xl mb-2"></div><div class="admin-skeleton h-14 w-full rounded-xl"></div>';

    try {
      const params = new URLSearchParams();
      params.set('limit', state.usersLimit);
      params.set('offset', state.usersPage * state.usersLimit);
      if (state.usersFilter) params.set('filter', state.usersFilter);

      const res = await apiFetch('/api/admin/web/users?' + params.toString());
      const users = res?.data?.users || [];
      state.usersTotal = res?.data?.total || 0;

      const filtered = state.usersSearch
        ? users.filter(u => (u.email || '').toLowerCase().includes(state.usersSearch) || (u.display_name || '').toLowerCase().includes(state.usersSearch))
        : users;

      if (!filtered.length) {
        wrap.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Tidak ada user.</div>';
        renderUsersPagination();
        return;
      }

      wrap.innerHTML = filtered.map(u => {
        let statusBadge = u.banned
          ? '<span class="admin-badge admin-badge-red">Banned</span>'
          : (!u.email_verified ? '<span class="admin-badge admin-badge-amber">Unverified</span>' : '<span class="admin-badge admin-badge-green">Verified</span>');
        
        let tierBadge = '';
        if (u.tier === 'owner') tierBadge = '<span class="admin-badge admin-badge-default">OWNER</span>';
        else if (u.tier === 'premium') tierBadge = '<span class="admin-badge admin-badge-amber">Premium</span>';
        else tierBadge = '<span class="admin-badge admin-badge-gray">Free</span>';

        return `
          <div class="admin-data-row" style="padding: 10px 14px; gap: 8px;">
            <div class="admin-data-info" style="gap: 10px;">
              <div class="admin-data-avatar" style="width: 32px; height: 32px; font-size: 14px; border-radius: 8px;">${esc((u.display_name || u.email).charAt(0).toUpperCase())}</div>
              <div class="admin-data-text">
                <p class="admin-data-title" style="font-size: 13px;">${esc(u.email)}</p>
                <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span class="text-[10px] text-slate-500">${esc(u.display_name || '-')}</span>
                  ${tierBadge} ${statusBadge}
                </div>
              </div>
            </div>
            <div class="flex flex-col items-end gap-1 shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
              <div class="text-right">
                <p class="text-xs font-extrabold text-amber-600">${fmtNum(u.points || 0)} Poin</p>
                <p class="text-[9px] text-slate-400">Daftar: ${esc(fmtDate(u.created_at))}</p>
              </div>
              <div class="flex gap-1.5 w-full sm:w-auto justify-end mt-1">
                <button onclick="openUserDetail('${esc(u.id)}')" class="admin-btn-secondary" style="padding:4px 10px; font-size:10px;">Detail</button>
                <button onclick="openUserPointsModal('${esc(u.id)}','${esc(u.email)}',${u.points || 0})" class="admin-btn-secondary" style="padding:4px 10px; font-size:10px; color:#d97706; border-color:#fde68a; background:#fffbeb;">Kelola Poin</button>
              </div>
            </div>
          </div>`;
      }).join('');

      renderUsersPagination();
    } catch (err) {
      wrap.innerHTML = `<div class="p-8 text-center text-xs text-red-500">${esc(err.message)}</div>`;
    }
  }

  function renderUsersPagination() {
    const wrap = $('users-pagination');
    if (!wrap) return;

    const start = state.usersPage * state.usersLimit + 1;
    const end = Math.min((state.usersPage + 1) * state.usersLimit, state.usersTotal);
    const hasPrev = state.usersPage > 0;
    const hasNext = (state.usersPage + 1) * state.usersLimit < state.usersTotal;

    wrap.innerHTML = `
      <span class="text-xs text-slate-500">Menampilkan ${state.usersTotal ? start : 0}–${end} dari ${state.usersTotal}</span>
      <div class="flex gap-2">
        <button onclick="changeUsersPage(-1)" ${!hasPrev ? 'disabled' : ''} class="admin-btn-secondary" style="padding:6px 12px; font-size:11px; opacity:${hasPrev ? '1' : '0.4'}">Prev</button>
        <button onclick="changeUsersPage(1)" ${!hasNext ? 'disabled' : ''} class="admin-btn-secondary" style="padding:6px 12px; font-size:11px; opacity:${hasNext ? '1' : '0.4'}">Next</button>
      </div>`;
  }

  function changeUsersPage(delta) {
    const next = state.usersPage + delta;
    if (next < 0) return;
    if (delta > 0 && (next * state.usersLimit) >= state.usersTotal) return;
    state.usersPage = next;
    loadUsers();
  }

  function filterUsers() {
    state.usersFilter = $('user-filter')?.value || '';
    state.usersPage = 0;
    loadUsers();
  }

  function searchUsers() {
    state.usersSearch = ($('user-search')?.value || '').trim().toLowerCase();
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

      const infoRow = (label, value) => `
        <div class="flex justify-between py-1.5 border-b border-slate-100">
          <span class="text-[11px] text-slate-500">${esc(label)}</span>
          <span class="text-[11px] font-semibold text-slate-800 text-right">${value}</span>
        </div>`;

      let tierBadge = 'admin-badge-gray';
      if (u.tier === 'owner') tierBadge = 'admin-badge-default';
      else if (u.tier === 'premium') tierBadge = 'admin-badge-amber';

      body.innerHTML = `
        <div class="space-y-0.5 mb-4">
          ${infoRow('Nama', esc(u.display_name || '-'))}
          ${infoRow('Email Verified', u.email_verified ? '<span class="text-emerald-600">Ya</span>' : '<span class="text-red-600">Tidak</span>')}
          ${infoRow('Poin', `<span class="text-amber-600 font-bold">${fmtNum(u.points || 0)}</span>`)}
          ${infoRow('Login Count', fmtNum(u.login_count || 0))}
          ${infoRow('Last Login', esc(fmtDate(u.last_login)))}
          ${infoRow('Signup IP', `<span class="font-mono text-xs">${esc(u.signup_ip || '-')}</span>`)}
          ${infoRow('Mailbox Aktif', fmtNum(u.mailbox_count || 0))}
          ${infoRow('Subdomain', fmtNum(u.subdomain_count || 0))}
          ${infoRow('Sesi Aktif', fmtNum(u.active_sessions || 0))}
        </div>

        <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 mb-4">
          <h4 class="text-xs font-bold text-slate-800 mb-3">Edit Role & Tier</h4>
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label class="admin-field-label">Role Akses</label>
              <select id="edit-user-role" class="admin-field-input">
                <option value="user" ${u.role === 'user' ? 'selected' : ''}>User (Hanya Dashboard)</label>
                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin (Bisa Buka /admin)</option>
                <option value="owner" ${u.role === 'owner' ? 'selected' : ''}>Owner (Akses Penuh)</option>
              </select>
            </div>
            <div>
              <label class="admin-field-label">Tier Limit</label>
              <select id="edit-user-tier" class="admin-field-input">
                <option value="free" ${u.tier === 'free' ? 'selected' : ''}>Free</option>
                <option value="premium" ${u.tier === 'premium' ? 'selected' : ''}>Premium</option>
                <option value="owner" ${u.tier === 'owner' ? 'selected' : ''}>Owner (Unlimited)</option>
              </select>
            </div>
          </div>
          <button onclick="submitUserRoleTier('${esc(u.id)}')" class="w-full admin-btn-primary justify-center" style="padding: 8px; font-size: 11px;">Simpan Perubahan Role & Tier</button>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button onclick="openUserPointsModal('${esc(u.id)}','${esc(u.email)}',${u.points || 0})" class="admin-btn-primary justify-center" style="width:100%; font-size:11px; padding:8px;">Kelola Poin</button>
          ${u.banned
            ? `<button onclick="submitUserUnban('${esc(u.id)}')" class="admin-btn-secondary justify-center" style="width:100%; font-size:11px; padding:8px;">Unban</button>`
            : `<button onclick="openBanModal('${esc(u.id)}','${esc(u.email)}')" class="admin-btn-secondary justify-center" style="color:#b91c1c;border-color:#fecaca; width:100%; font-size:11px; padding:8px;">Ban</button>`}
          <button onclick="submitDeleteUser('${esc(u.id)}','${esc(u.email)}')" class="admin-btn-danger justify-center col-span-2" style="width:100%; margin-top:4px; font-size:11px; padding:8px;">Hapus Akun Permanen</button>
        </div>`;
    } catch (err) {
      body.innerHTML = `<p class="text-xs text-red-500 p-4">${esc(err.message)}</p>`;
    }
  }

  async function submitUserRoleTier(userId) {
    const role = $('edit-user-role')?.value;
    const tier = $('edit-user-tier')?.value;
    if (!role || !tier) return;

    adminLoading(true);
    try {
      await apiFetch('/api/admin/web/users/' + encodeURIComponent(userId), {
        method: 'PATCH',
        body: { role, tier }
      });
      adminToast('Role & Tier berhasil diupdate', 'success');
      closeModal('modal-user-detail');
      loadUsers();
    } catch (err) {
      adminToast(err.message, 'error');
    } finally {
      adminLoading(false);
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
        body: { delta, reason, admin_id: state.user?.email || 'admin' }
      });
      adminToast('Poin disesuaikan. Saldo baru: ' + fmtNum(res.data.balance_after), 'success');
      closeModal('modal-user-points');
      loadUsers();
      if (!$('modal-user-detail')?.classList.contains('hidden')) openUserDetail(state.currentUserId);
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
        body: { reason, duration_hours: duration }
      });
      adminToast('User dibanned', 'success');
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
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center p-8"><div class="admin-skeleton h-12 w-full rounded-xl"></div></td></tr>';

    try {
      const reason = $('ledger-reason')?.value || '';
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (reason) params.set('reason', reason);

      const res = await apiFetch('/api/admin/web/points/ledger?' + params.toString());
      const txs = res?.data?.transactions || [];

      if (!txs.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center p-8 text-xs text-slate-400">Belum ada transaksi.</td></tr>';
        return;
      }

      tbody.innerHTML = txs.map(t => {
        const isPlus = t.delta > 0;
        return `
          <tr class="hover:bg-slate-50 transition border-b border-slate-100">
            <td class="p-4 text-xs text-slate-500">${esc(fmtRel(t.created_at))}</td>
            <td class="p-4 text-xs font-semibold">${esc(t.email || t.user_id)}</td>
            <td class="p-4 font-bold ${isPlus ? 'text-emerald-600' : 'text-red-600'}">${isPlus ? '+' : ''}${fmtNum(t.delta)}</td>
            <td class="p-4 font-semibold text-slate-800">${fmtNum(t.balance_after)}</td>
            <td class="p-4 text-xs text-slate-600">${esc(t.reason || '-')}</td>
          </tr>`;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center p-8 text-xs text-red-500">${esc(err.message)}</td></tr>`;
    }
  }

  async function loadDomains() {
    const wrap = $('domains-list');
    if (wrap) wrap.innerHTML = '<div class="admin-skeleton h-16 w-full rounded-xl mb-3"></div><div class="admin-skeleton h-16 w-full rounded-xl"></div>';

    try {
      const res = await apiFetch('/api/admin/web/domains');
      const domains = res?.data?.domains || [];

      if (!domains.length) {
        wrap.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Belum ada domain. Klik "Tambah Domain".</div>';
        return;
      }

      wrap.innerHTML = domains.map(d => {
        const defaultBadge = d.is_default ? '<span class="admin-badge admin-badge-default">DEFAULT</span>' : '';
        const activeBadge = d.is_active ? '<span class="admin-badge admin-badge-green">Aktif</span>' : '<span class="admin-badge admin-badge-red">Nonaktif</span>';
        
        let routingBadge = '';
        if (d.is_routing_active === 1) {
          routingBadge = '<span class="admin-badge admin-badge-green">Routing Active</span>';
        } else {
          routingBadge = '<span class="admin-badge admin-badge-gray">Routing Off</span>';
        }

        return `
          <div class="admin-domain-card">
            <div class="min-w-0 flex-1">
              <p class="font-mono text-sm font-bold text-slate-900 break-all">${esc(d.domain)}</p>
              <div class="flex items-center gap-2 mt-1 flex-wrap">
                ${activeBadge} ${defaultBadge} ${routingBadge}
                <span class="text-[11px] text-slate-500">${esc(d.description || '-')}</span>
              </div>
              <p class="text-[10px] text-slate-400 mt-1">Dibuat: ${esc(fmtDate(d.created_at))}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0 mt-3 sm:mt-0 flex-wrap justify-end">
              <button onclick="toggleDomainRouting('${esc(d.id)}', ${d.is_routing_active === 1})" class="admin-btn-secondary" style="padding:6px 10px; font-size:11px; color:${d.is_routing_active === 1 ? '#b91c1c' : '#059669'}; border-color:${d.is_routing_active === 1 ? '#fecaca' : '#a7f3d0'}; background:${d.is_routing_active === 1 ? '#fef2f2' : '#ecfdf5'};">
                ${d.is_routing_active === 1 ? 'Matikan Routing' : 'Aktifkan Routing'}
              </button>
              ${!d.is_default ? `<button onclick="setDefaultDomain('${esc(d.id)}')" class="admin-btn-secondary" style="padding:6px 10px; font-size:11px;">Jadikan Default</button>` : ''}
              ${!d.is_default ? `<button onclick="deleteDomain('${esc(d.id)}', '${esc(d.domain)}')" class="admin-btn-secondary" style="padding:6px 10px; font-size:11px; color:#b91c1c; border-color:#fecaca;">Hapus</button>` : ''}
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      wrap.innerHTML = `<div class="p-8 text-center text-xs text-red-500">${esc(err.message)}</div>`;
    }
  }

  async function toggleDomainRouting(id, isActive) {
    const actionText = isActive ? 'menonaktifkan' : 'mengaktifkan';
    if (!confirm(`Yakin ingin ${actionText} Email Routing untuk domain ini?`)) return;

    adminLoading(true);
    try {
      const res = await apiFetch('/api/admin/web/domains/' + encodeURIComponent(id) + '/toggle-routing', {
        method: 'PATCH',
        skipAuthRedirect: true
      });
      const successMsg = res?.message || 'Routing berhasil diubah';
      adminToast(successMsg, 'success');
      loadDomains();
    } catch (err) {
      adminToast(err.message || 'Gagal mengubah routing', 'error');
    } finally {
      adminLoading(false);
    }
  }

  function openAddDomainModal() {
    if ($('modal-domain-value')) $('modal-domain-value').value = '';
    if ($('modal-domain-desc')) $('modal-domain-desc').value = '';
    if ($('modal-domain-default')) $('modal-domain-default').checked = false;
    openModal('modal-add-domain');
  }

  async function submitAddDomain() {
    const domain = ($('modal-domain-value')?.value || '').trim().toLowerCase();
    const description = ($('modal-domain-desc')?.value || '').trim();
    const isDefault = $('modal-domain-default')?.checked || false;

    if (!domain) {
      adminToast('Domain wajib diisi', 'error');
      return;
    }

    adminLoading(true);
    try {
      await apiFetch('/api/admin/web/domains', {
        method: 'POST',
        body: { domain, description, is_active: true, is_default: isDefault }
      });
      adminToast('Domain berhasil ditambahkan', 'success');
      closeModal('modal-add-domain');
      loadDomains();
    } catch (err) {
      adminToast(err.message, 'error');
    } finally {
      adminLoading(false);
    }
  }

  async function setDefaultDomain(id) {
    if (!confirm('Jadikan domain ini sebagai default? Domain lain akan dinonaktifkan status default-nya.')) return;
    adminLoading(true);
    try {
      await apiFetch('/api/admin/web/domains/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: { is_default: true }
      });
      adminToast('Domain default diubah', 'success');
      loadDomains();
    } catch (err) {
      adminToast(err.message, 'error');
    } finally {
      adminLoading(false);
    }
  }

  async function deleteDomain(id, domain) {
    const input = prompt('Ketik "' + domain + '" untuk konfirmasi hapus domain:');
    if (input !== domain) {
      adminToast('Konfirmasi salah', 'warning');
      return;
    }

    adminLoading(true);
    try {
      await apiFetch('/api/admin/web/domains/' + encodeURIComponent(id), { method: 'DELETE' });
      adminToast('Domain dihapus', 'success');
      loadDomains();
    } catch (err) {
      adminToast(err.message, 'error');
    } finally {
      adminLoading(false);
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
    
    { key: 'free_user_daily_limit', label: 'Free: Limit Mailbox/Hari', group: 'User Tiers' },
    { key: 'free_user_mailbox_duration', label: 'Free: Durasi Mailbox (menit)', group: 'User Tiers' },
    { key: 'free_user_max_messages', label: 'Free: Max Pesan', group: 'User Tiers' },
    { key: 'premium_user_daily_limit', label: 'Premium: Limit Mailbox/Hari', group: 'User Tiers' },
    { key: 'premium_user_mailbox_duration', label: 'Premium: Durasi Mailbox (menit)', group: 'User Tiers' },
    { key: 'premium_user_max_messages', label: 'Premium: Max Pesan', group: 'User Tiers' },
    
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
      configArr.forEach(c => { map[c.key] = c.value; });
      state.configs = map;

      const groups = {};
      CONFIG_KEYS.forEach(c => {
        if (!groups[c.group]) groups[c.group] = [];
        groups[c.group].push(c);
      });

      grid.innerHTML = Object.keys(groups).map(groupName => {
        const fields = groups[groupName].map(c => {
          const val = map[c.key] !== undefined ? map[c.key] : '';
          return `
            <div class="mb-3">
              <label class="admin-field-label">${esc(c.label)}</label>
              <input type="text" data-config-key="${esc(c.key)}" value="${esc(val)}" class="admin-field-input" />
            </div>`;
        }).join('');
        return `
          <div class="admin-card p-5 h-full">
            <h3 class="text-sm font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">${esc(groupName)}</h3>
            ${fields}
          </div>`;
      }).join('');
    } catch (err) {
      grid.innerHTML = `<p class="text-xs text-red-500 p-4">${esc(err.message)}</p>`;
    }
  }

  async function saveConfig() {
    const inputs = $all('input[data-config-key]');
    const payload = {};

    inputs.forEach(inp => {
      const key = inp.getAttribute('data-config-key');
      const val = inp.value.trim();
      if (state.configs[key] !== val) {
        const numKeys = [
          'signup_bonus_points', 'subdomain_pointing_cost', 'subdomain_termux_cost',
          'free_max_active_subdomain', 'premium_max_active_subdomain', 'max_mailbox_per_ip_day',
          'mailbox_duration_minutes', 'max_messages_per_mailbox', 'max_concurrent_mailbox',
          'global_max_mailbox_per_day', 'max_accounts_per_ip', 'max_accounts_per_device',
          'free_user_daily_limit', 'free_user_mailbox_duration', 'free_user_max_messages',
          'premium_user_daily_limit', 'premium_user_mailbox_duration', 'premium_user_max_messages'
        ];

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
    const wrap = $('visitors-tbody');
    if (wrap) wrap.innerHTML = '<div class="admin-skeleton h-16 w-full rounded-xl mb-3"></div><div class="admin-skeleton h-16 w-full rounded-xl"></div>';

    try {
      const res = await apiFetch('/api/admin/web/visitors?limit=100');
      const visitors = res?.data?.visitors || [];
      state.visitors = visitors;

      if (!visitors.length) {
        wrap.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Belum ada visitor.</div>';
        return;
      }

      wrap.innerHTML = visitors.map(v => {
        let statusBadge = '<span class="admin-badge admin-badge-green">Normal</span>';
        if (v.banned) statusBadge = '<span class="admin-badge admin-badge-red">Banned</span>';
        else if (v.is_whitelist) statusBadge = '<span class="admin-badge admin-badge-amber">Whitelist</span>';

        return `
          <div class="admin-data-row" style="align-items:flex-start;">
            <div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
              <p class="font-mono text-sm font-bold text-slate-900">${esc(v.ip)}</p>
              <p class="text-[10px] text-slate-500 font-mono truncate max-w-[200px]">FP: ${esc((v.fingerprint || '-').slice(0, 16))}</p>
              <div class="flex items-center gap-2 mt-1">
                ${statusBadge}
                <span class="text-[11px] text-slate-500">${fmtNum(v.mailbox_count_today || 0)} / ${fmtNum(v.mailbox_count_total || 0)} mailbox</span>
              </div>
            </div>
            <div class="flex flex-col items-end gap-2 shrink-0 mt-3 sm:mt-0">
              <p class="text-[10px] text-slate-400 mb-1">Terakhir: ${esc(fmtRel(v.last_mailbox_at || v.updated_at))}</p>
              <div class="flex gap-2">
                ${v.banned
                  ? `<button onclick="submitUnblockIp('${esc(v.ip)}')" class="admin-btn-secondary" style="padding:6px 10px; font-size:11px; color:#059669;">Unblock</button>`
                  : `<button onclick="submitBlockIpDirect('${esc(v.ip)}')" class="admin-btn-secondary" style="padding:6px 10px; font-size:11px; color:#b91c1c;">Block</button>`}
                <button onclick="submitToggleWhitelist('${esc(v.ip)}',${v.is_whitelist ? 0 : 1})" class="admin-btn-secondary" style="padding:6px 10px; font-size:11px;">
                  ${v.is_whitelist ? 'Unwhitelist' : 'Whitelist'}
                </button>
              </div>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      wrap.innerHTML = `<div class="p-8 text-center text-xs text-red-500">${esc(err.message)}</div>`;
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
      await apiFetch('/api/admin/web/visitors/block', { method: 'POST', body: { ip, reason, duration_minutes: duration } });
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
      await apiFetch('/api/admin/web/visitors/block', { method: 'POST', body: { ip, reason: 'Blocked by admin', duration_minutes: 0 } });
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
      await apiFetch('/api/admin/web/visitors/unblock', { method: 'POST', body: { ip } });
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
      await apiFetch('/api/admin/web/visitors/whitelist', { method: 'POST', body: { ip, enabled: !!enabled } });
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
      searchInput.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(searchUsers, 350);
      });
    }

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeModal('modal-user-detail');
        closeModal('modal-user-points');
        closeModal('modal-user-ban');
        closeModal('modal-block-ip');
        closeModal('modal-add-domain');
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
  window.submitUserRoleTier = submitUserRoleTier;
  window.openUserPointsModal = openUserPointsModal;
  window.submitUserPoints = submitUserPoints;
  window.openBanModal = openBanModal;
  window.submitUserBan = submitUserBan;
  window.submitUserUnban = submitUserUnban;
  window.submitDeleteUser = submitDeleteUser;
  window.loadPointsLedger = loadPointsLedger;
  window.loadDomains = loadDomains;
  window.openAddDomainModal = openAddDomainModal;
  window.submitAddDomain = submitAddDomain;
  window.setDefaultDomain = setDefaultDomain;
  window.deleteDomain = deleteDomain;
  window.toggleDomainRouting = toggleDomainRouting;
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
