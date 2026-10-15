document.addEventListener('DOMContentLoaded', () => {
  if (!isLoggedIn()) {
    window.location.href = 'login.html';
    return;
  }

  if (window.lucide) window.lucide.createIcons();

  let selectedMailbox = null;
  let showAllMailboxes = false;
  let currentSessionId = null;

  async function initDashboard() {
    try {
      const meRes = await apiFetch('/api/web/auth/me');
      if (!meRes?.data?.user) {
        clearToken();
        window.location.href = 'login.html';
        return;
      }
      currentSessionId = meRes.data.session_id;
      renderProfile(meRes.data.user);

      await Promise.allSettled([
        loadQuota(),
        loadStats(),
        loadMailboxes(),
        loadSessions(),
        loadLoginHistory()
      ]);
    } catch (err) {
      clearToken();
      window.location.href = 'login.html';
    }
  }

  function renderProfile(user) {
    if (!user) return;
    setToken(getToken(), user);
    const name = user.display_name || user.email.split('@')[0];
    document.getElementById('profile-name').textContent = name;
    document.getElementById('profile-email').textContent = user.email;
    document.getElementById('profile-avatar').textContent = name.charAt(0).toUpperCase();
    const tier = (user.tier || 'FREE').toUpperCase();
    document.getElementById('profile-tier-badge').textContent = tier;
    document.getElementById('nav-user-tier').textContent = tier;
  }

  async function loadQuota() {
    const res = await apiFetch('/api/web/user/quota');
    const q = res?.data || {};
    const used = q.used_today ?? 0;
    const max = q.max_per_day ?? 1;
    const rem = q.remaining ?? 0;

    document.getElementById('dash-quota-used').textContent = used;
    document.getElementById('dash-quota-max').textContent = max;
    document.getElementById('dash-quota-remaining').textContent = `${rem} mailbox`;
    if (q.tier) {
      document.getElementById('profile-tier-badge').textContent = String(q.tier).toUpperCase();
    }

    const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
    document.getElementById('dash-quota-bar').style.width = `${pct}%`;
  }

  async function loadStats() {
    const res = await apiFetch('/api/web/user/stats');
    const s = res?.data || {};
    const mbTotal = typeof s.mailboxes === 'object' ? (s.mailboxes.total ?? s.mailboxes.active ?? 0) : (s.mailboxes ?? 0);
    const msgTotal = typeof s.messages === 'object' ? (s.messages.total ?? 0) : (s.messages ?? 0);

    document.getElementById('dash-stat-mailboxes').textContent = mbTotal;
    document.getElementById('dash-stat-messages').textContent = msgTotal;
  }

  async function loadMailboxes() {
    const endpoint = showAllMailboxes ? '/api/web/user/my-mailboxes/all' : '/api/web/user/my-mailboxes';
    const res = await apiFetch(endpoint);
    const mailboxes = res?.data?.mailboxes || [];
    const listEl = document.getElementById('dash-mailboxes-list');

    if (!mailboxes.length) {
      listEl.innerHTML = `
        <div class="text-center py-8 text-xs text-slate-400">
          Belum ada mailbox aktif. Buat mailbox baru di atas.
        </div>
      `;
      return;
    }

    listEl.innerHTML = mailboxes
      .map((m) => {
        const isSelected = selectedMailbox && selectedMailbox.id === m.id;
        return `
          <div data-id="${Utils.escapeHtml(m.id)}" data-email="${Utils.escapeHtml(m.email)}" class="dash-mb-item p-3.5 rounded-2xl border ${
          isSelected ? 'bg-blue-50/90 border-blue-400' : 'bg-white/80 border-slate-200/80 hover:border-blue-300'
        } flex items-center justify-between gap-2 cursor-pointer transition">
            <div class="min-w-0">
              <p class="font-mono-code text-xs font-bold text-slate-900 truncate">${Utils.escapeHtml(m.email)}</p>
              <p class="text-[11px] text-slate-500 mt-0.5">
                Pesan: <strong>${m.message_count ?? 0}</strong> • Exp: ${Utils.formatRelative(m.expires_at)}
              </p>
            </div>
            <button type="button" data-del-id="${Utils.escapeHtml(m.id)}" class="btn-del-mb p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition" title="Hapus Mailbox">
              ✕
            </button>
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('.dash-mb-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.btn-del-mb')) return;
        selectMailbox({
          id: el.getAttribute('data-id'),
          email: el.getAttribute('data-email')
        });
      });
    });

    listEl.querySelectorAll('.btn-del-mb').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-del-id');
        if (!confirm('Hapus mailbox ini?')) return;
        Utils.showLoading('Menghapus mailbox...');
        try {
          await apiFetch(`/api/web/user/my-mailboxes/${encodeURIComponent(id)}`, { method: 'DELETE' });
          Utils.showToast('Mailbox dihapus.', 'success');
          if (selectedMailbox?.id === id) {
            selectedMailbox = null;
            document.getElementById('dash-selected-email').textContent = 'Pilih atau buat mailbox di sebelah kiri';
            document.getElementById('dash-messages-container').innerHTML = '<p class="text-xs text-slate-400">Mailbox telah dihapus.</p>';
          }
          loadMailboxes();
          loadStats();
        } catch (err) {
          Utils.showToast(err.message, 'error');
        } finally {
          Utils.hideLoading();
        }
      });
    });

    if (!selectedMailbox && mailboxes.length > 0) {
      selectMailbox({ id: mailboxes[0].id, email: mailboxes[0].email });
    }
  }

  async function selectMailbox(mb) {
    selectedMailbox = mb;
    document.getElementById('dash-selected-email').textContent = mb.email;
    document.getElementById('btn-dash-copy-email').disabled = false;
    document.getElementById('btn-dash-refresh-msgs').disabled = false;
    loadMailboxes();
    await loadMailboxMessages(mb.id);
  }

  async function loadMailboxMessages(mailboxId) {
    const container = document.getElementById('dash-messages-container');
    container.innerHTML = `<div class="w-full space-y-2"><div class="skeleton h-14 w-full"></div><div class="skeleton h-14 w-full"></div></div>`;
    try {
      const res = await apiFetch(`/api/web/mailbox/${encodeURIComponent(mailboxId)}/messages`);
      const messages = res?.data?.messages || [];

      if (!messages.length) {
        container.innerHTML = `
          <div class="py-12 text-center text-xs text-slate-400">
            Belum ada pesan masuk di <strong>${Utils.escapeHtml(selectedMailbox?.email || '')}</strong>.
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="w-full divide-y divide-slate-200/70 text-left self-start">
          ${messages
            .map(
              (m) => `
              <div data-msg-id="${Utils.escapeHtml(m.id)}" class="dash-msg-row p-3.5 hover:bg-blue-50/70 rounded-2xl cursor-pointer transition flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-xs font-bold text-slate-900 truncate">${Utils.escapeHtml(m.subject || '(Tanpa Subjek)')}</p>
                  <p class="text-xs text-slate-500 truncate mt-0.5">${Utils.escapeHtml(m.sender || '-')}</p>
                </div>
                <span class="text-[11px] text-slate-400 shrink-0">${Utils.formatRelative(m.received_at)}</span>
              </div>
            `
            )
            .join('')}
        </div>
      `;

      container.querySelectorAll('.dash-msg-row').forEach((row) => {
        row.addEventListener('click', () => openDashMessage(row.getAttribute('data-msg-id')));
      });
    } catch (err) {
      container.innerHTML = `<p class="text-xs text-red-500">${Utils.escapeHtml(err.message)}</p>`;
    }
  }

  async function openDashMessage(msgId) {
    Utils.showLoading('Membuka pesan...');
    try {
      const res = await apiFetch(`/api/web/message/${encodeURIComponent(msgId)}`);
      const msg = res.data;
      document.getElementById('dash-modal-subject').textContent = msg.subject || '(Tanpa Subjek)';
      document.getElementById('dash-modal-sender').textContent = msg.sender || '-';
      document.getElementById('dash-modal-date').textContent = Utils.formatDate(msg.received_at);
      document.getElementById('dash-modal-body').textContent = msg.body || '';
      document.getElementById('dash-msg-modal').classList.remove('hidden');
    } catch (err) {
      Utils.showToast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  async function loadSessions() {
    const res = await apiFetch('/api/web/user/sessions');
    const sessions = res?.data?.sessions || [];
    const listEl = document.getElementById('dash-sessions-list');

    if (!sessions.length) {
      listEl.innerHTML = `<p class="text-xs text-slate-400">Tidak ada data sesi.</p>`;
      return;
    }

    listEl.innerHTML = sessions
      .map((s) => {
        const isCurrent = s.id === currentSessionId || s.is_current;
        return `
          <div class="p-3 rounded-2xl bg-white/80 border border-slate-200/80 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-xs font-bold text-slate-800 truncate">${Utils.escapeHtml(s.ip_address || s.user_agent || 'Perangkat Web')}</p>
                ${isCurrent ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">Sesi Ini</span>' : ''}
              </div>
              <p class="text-[11px] text-slate-500 truncate mt-0.5">${Utils.formatDate(s.created_at || s.expires_at)}</p>
            </div>
            ${
              !isCurrent
                ? `<button data-sid="${Utils.escapeHtml(s.id)}" class="btn-revoke-session px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold shrink-0">Cabut</button>`
                : ''
            }
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('.btn-revoke-session').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sid = btn.getAttribute('data-sid');
        try {
          await apiFetch(`/api/web/user/sessions/${encodeURIComponent(sid)}`, { method: 'DELETE' });
          Utils.showToast('Sesi berhasil dicabut.', 'success');
          loadSessions();
        } catch (err) {
          Utils.showToast(err.message, 'error');
        }
      });
    });
  }

  async function loadLoginHistory() {
    const res = await apiFetch('/api/web/user/login-history?limit=30');
    const logs = res?.data?.logs || [];
    const container = document.getElementById('dash-login-history');

    if (!logs.length) {
      container.innerHTML = `<p class="text-xs text-slate-400">Belum ada riwayat login.</p>`;
      return;
    }

    container.innerHTML = logs
      .map(
        (l) => `
        <div class="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/60 flex items-center justify-between text-xs">
          <div class="min-w-0">
            <span class="font-semibold text-slate-800">${Utils.escapeHtml(l.ip_address || 'IP Tidak Diketahui')}</span>
            <p class="text-[11px] text-slate-400 truncate">${Utils.escapeHtml(l.user_agent || l.status || 'Login Sukses')}</p>
          </div>
          <span class="text-[11px] text-slate-500 shrink-0">${Utils.formatRelative(l.created_at || l.login_at)}</span>
        </div>
      `
      )
      .join('');
  }

  document.getElementById('dash-create-mailbox-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const prefixInput = document.getElementById('dash-custom-prefix');
    const prefix = prefixInput.value.trim();

    Utils.showLoading('Membuat mailbox baru...');
    try {
      const res = await apiFetch('/api/web/mailbox/create', {
        method: 'POST',
        body: prefix ? { prefix } : {}
      });
      prefixInput.value = '';
      Utils.showToast(`Mailbox ${res.data.email} berhasil dibuat!`, 'success');
      await Promise.all([loadQuota(), loadStats(), loadMailboxes()]);
      selectMailbox({ id: res.data.id, email: res.data.email });
    } catch (err) {
      Utils.showToast(err.message || 'Gagal membuat mailbox.', 'error');
    } finally {
      Utils.hideLoading();
    }
  });

  document.getElementById('btn-toggle-all-mailboxes').addEventListener('click', (e) => {
    showAllMailboxes = !showAllMailboxes;
    e.target.textContent = showAllMailboxes ? 'Hanya Aktif' : 'Tampilkan Semua';
    loadMailboxes();
  });

  document.getElementById('btn-dash-copy-email').addEventListener('click', () => {
    if (selectedMailbox) Utils.copyToClipboard(selectedMailbox.email, 'Alamat email berhasil disalin!');
  });

  document.getElementById('btn-dash-refresh-msgs').addEventListener('click', () => {
    if (selectedMailbox) loadMailboxMessages(selectedMailbox.id);
  });

  document.getElementById('btn-close-dash-msg').addEventListener('click', () => {
    document.getElementById('dash-msg-modal').classList.add('hidden');
  });

  document.getElementById('btn-edit-profile').addEventListener('click', async () => {
    const current = document.getElementById('profile-name').textContent;
    const nextName = prompt('Masukkan Nama Tampilan (Display Name) baru:', current);
    if (!nextName || nextName.trim() === current) return;

    Utils.showLoading('Menyimpan profil...');
    try {
      await apiFetch('/api/web/user/profile', {
        method: 'PATCH',
        body: { display_name: nextName.trim() }
      });
      document.getElementById('profile-name').textContent = nextName.trim();
      Utils.showToast('Profil berhasil diperbarui!', 'success');
    } catch (err) {
      Utils.showToast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  });

  const pwdModal = document.getElementById('pwd-modal');
  document.getElementById('btn-open-pwd-modal').addEventListener('click', () => pwdModal.classList.remove('hidden'));
  document.getElementById('btn-close-pwd-modal').addEventListener('click', () => pwdModal.classList.add('hidden'));
  document.getElementById('btn-cancel-pwd').addEventListener('click', () => pwdModal.classList.add('hidden'));

  document.getElementById('change-pwd-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;

    const check = Utils.validatePassword(newPassword);
    if (!check.valid) {
      Utils.showToast('Password baru wajib minimal 8 karakter, ada huruf besar, kecil, dan angka.', 'warning');
      return;
    }

    Utils.showLoading('Mengubah password...');
    try {
      await apiFetch('/api/web/user/change-password', {
        method: 'POST',
        body: { old_password: oldPassword, new_password: newPassword }
      });
      pwdModal.classList.add('hidden');
      e.target.reset();
      Utils.showToast('Password berhasil diperbarui!', 'success');
    } catch (err) {
      Utils.showToast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  });

  document.getElementById('btn-revoke-all-sessions').addEventListener('click', async () => {
    if (!confirm('Cabut semua sesi aktif di perangkat lain?')) return;
    Utils.showLoading('Mencabut sesi...');
    try {
      await apiFetch('/api/web/user/sessions', { method: 'DELETE' });
      Utils.showToast('Seluruh sesi perangkat lain berhasil dicabut.', 'success');
      loadSessions();
    } catch (err) {
      Utils.showToast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  });

  document.getElementById('btn-delete-account').addEventListener('click', async () => {
    const pwd = prompt('Konfirmasi penghapusan akun permanen. Masukkan password Anda:');
    if (!pwd) return;
    Utils.showLoading('Menghapus akun...');
    try {
      await apiFetch('/api/web/user/delete-account', {
        method: 'POST',
        body: { password: pwd }
      });
      clearToken();
      Utils.showToast('Akun Anda telah dihapus permanen.', 'info');
      setTimeout(() => (window.location.href = 'login.html'), 800);
    } catch (err) {
      Utils.showToast(err.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    Utils.showLoading('Keluar dari sesi...');
    try {
      await apiFetch('/api/web/auth/logout', { method: 'POST', skipAuthRedirect: true });
    } catch (e) {
    } finally {
      clearToken();
      Utils.hideLoading();
      window.location.href = 'login.html';
    }
  });

  initDashboard();
});