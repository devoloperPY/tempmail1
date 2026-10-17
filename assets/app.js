(function initConsoleShield() {
  const originalConsoleError = console.error;
  console.error = function (...args) {
    if (
      args.length === 0 ||
      (args.length === 1 && (args[0] === null || args[0] === undefined || args[0] === ''))
    ) {
      return;
    }
    return originalConsoleError.apply(console, args);
  };

  window.addEventListener(
    'error',
    function (event) {
      if (!event.error && (!event.message || event.message === 'Script error.')) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    function (event) {
      if (event.reason === null || event.reason === undefined) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    true
  );
})();

document.addEventListener('DOMContentLoaded', async () => {
  if (!isLoggedIn()) {
    window.location.replace('login.html');
    return;
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }

  let currentMailboxId = localStorage.getItem(STORAGE_KEYS.MAILBOX_ID) || null;
  let currentMailboxEmail = '';
  let currentMailboxCreatedAt = 0;
  let countdownInstance = null;
  let lastOpenedMessageBody = '';

  const stateGenerate = document.getElementById('state-generate');
  const stateActive = document.getElementById('state-active-mailbox');
  const inputPrefix = document.getElementById('custom-prefix');
  const btnGenerate = document.getElementById('btn-generate');
  const activeEmailDisplay = document.getElementById('active-email-display');
  const mailboxCountdown = document.getElementById('mailbox-countdown');
  const mailboxMsgCounter = document.getElementById('mailbox-msg-counter');
  const inboxCountBadge = document.getElementById('inbox-count-badge');
  const autoRefreshLabel = document.getElementById('auto-refresh-label');
  const inboxEmptyState = document.getElementById('inbox-empty-state');
  const inboxSkeleton = document.getElementById('inbox-skeleton');
  const inboxList = document.getElementById('inbox-list');
  const btnRefreshInbox = document.getElementById('btn-refresh-inbox');

  const btnShowInfo = document.getElementById('btn-show-info');
  const infoModal = document.getElementById('info-modal');
  
  async function verifyUserSession() {
    try {
      const res = await apiFetch('/api/web/auth/me', { skipAuthRedirect: true });
      const user = res?.data?.user;
      if (!user) {
        clearToken();
        window.location.replace('login.html');
        return false;
      }

      setToken(getToken(), user);
      const navEmail = document.getElementById('nav-user-email');
      const tierLabel = document.getElementById('user-tier-label');
      if (navEmail) navEmail.textContent = user.email;
      if (tierLabel) tierLabel.textContent = (user.tier || 'MEMBER').toUpperCase();
      
      if (user.tier === 'free' && inputPrefix) {
        inputPrefix.disabled = true;
        inputPrefix.placeholder = "Khusus Premium (User Free dapat nama acak)";
        inputPrefix.classList.add('bg-slate-100', 'cursor-not-allowed');
        const hint = document.getElementById('prefix-hint');
        if (hint) hint.textContent = "(Khusus Premium)";
      }
      
      return true;
    } catch (err) {
      clearToken();
      window.location.replace('login.html');
      return false;
    }
  }

  async function loadUserQuota() {
    try {
      const res = await apiFetch('/api/web/user/quota');
      if (res && res.data) {
        const q = res.data;
        const usedEl = document.getElementById('quota-used');
        const maxEl = document.getElementById('quota-max');
        const remBadge = document.getElementById('quota-remaining-badge');
        const tierLabel = document.getElementById('user-tier-label');

        if (usedEl) usedEl.textContent = q.used_today ?? 0;
        if (maxEl) maxEl.textContent = q.max_per_day ?? '-';
        if (remBadge) remBadge.textContent = q.remaining ?? 0;
        if (tierLabel && q.tier) tierLabel.textContent = String(q.tier).toUpperCase();
      }
    } catch (e) {}
  }

  async function loadUserMailboxes() {
    const wrap = document.getElementById('recent-mailboxes-wrap');
    const list = document.getElementById('recent-mailboxes-list');
    if (!wrap || !list) return;

    try {
      const res = await apiFetch('/api/web/user/my-mailboxes');
      const mailboxes = res?.data?.mailboxes || [];

      if (!mailboxes.length) {
        wrap.classList.add('hidden');
        return;
      }

      wrap.classList.remove('hidden');
      list.innerHTML = mailboxes
        .map(
          (m) => `
          <button
            type="button"
            data-id="${Utils.escapeHtml(m.id)}"
            class="recent-mb-btn px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/70 font-mono-code text-xs font-semibold transition"
          >
            ${Utils.escapeHtml(m.email)}
          </button>
        `
        )
        .join('');

      list.querySelectorAll('.recent-mb-btn').forEach((btn) => {
        btn.addEventListener('click', () => restoreMailbox(btn.getAttribute('data-id')));
      });
    } catch (e) {
      wrap.classList.add('hidden');
    }
  }

  async function handleGenerateMailbox() {
    if (!isLoggedIn()) {
      window.location.replace('login.html');
      return;
    }

    const isPremium = document.getElementById('user-tier-label')?.textContent === 'PREMIUM';
    const prefix = (isPremium && inputPrefix) ? inputPrefix.value.trim() : '';

    Utils.showLoading('Membuat alamat email sementara...');
    try {
      const body = {};
      if (prefix) body.prefix = prefix;

      const res = await apiFetch('/api/web/mailbox/create', {
        method: 'POST',
        body
      });

      const data = res.data;
      localStorage.setItem(STORAGE_KEYS.MAILBOX_ID, data.id);
      currentMailboxId = data.id;
      currentMailboxEmail = data.email;
      currentMailboxCreatedAt = data.created_at;

      if (inputPrefix) inputPrefix.value = '';
      Utils.showToast(`Mailbox ${data.email} berhasil dibuat!`, 'success');

      activateMailboxUI(data);
      loadUserQuota();
    } catch (err) {
      Utils.showToast(err.message || 'Gagal membuat temp mail.', 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  async function restoreMailbox(id) {
    if (!id) return;
    try {
      const res = await apiFetch(`/api/web/mailbox/${encodeURIComponent(id)}`);
      const d = res.data;
      if (!d || d.is_expired || !d.is_active) {
        localStorage.removeItem(STORAGE_KEYS.MAILBOX_ID);
        currentMailboxId = null;
        showGenerateState();
        return;
      }

      const mb = d.mailbox || d;
      currentMailboxId = mb.id || id;
      currentMailboxEmail = mb.email;
      currentMailboxCreatedAt = mb.created_at;
      localStorage.setItem(STORAGE_KEYS.MAILBOX_ID, currentMailboxId);

      activateMailboxUI({
        id: currentMailboxId,
        email: mb.email,
        expires_at: mb.expires_at,
        created_at: mb.created_at,
        remaining_seconds: d.remaining_seconds,
        message_count: mb.message_count || 0,
        max_messages: mb.max_messages || 50
      });
    } catch (err) {
      localStorage.removeItem(STORAGE_KEYS.MAILBOX_ID);
      currentMailboxId = null;
      showGenerateState();
    }
  }

  function stopTimers() {
    if (countdownInstance) {
      countdownInstance.stop();
      countdownInstance = null;
    }
  }

  function showGenerateState() {
    stopTimers();
    if (stateActive) stateActive.classList.add('hidden');
    if (stateGenerate) stateGenerate.classList.remove('hidden');
    if (inboxList) inboxList.classList.add('hidden');
    if (inboxEmptyState) inboxEmptyState.classList.remove('hidden');
    if (inboxCountBadge) inboxCountBadge.textContent = '0';
    if (autoRefreshLabel) autoRefreshLabel.textContent = 'Pilih / buat mailbox...';
    loadUserMailboxes();
  }

  function activateMailboxUI(data) {
    if (stateGenerate) stateGenerate.classList.add('hidden');
    if (stateActive) stateActive.classList.remove('hidden');

    if (activeEmailDisplay) activeEmailDisplay.textContent = data.email;
    if (mailboxMsgCounter) {
      mailboxMsgCounter.textContent = `${data.message_count ?? 0} / ${data.max_messages ?? 50} pesan`;
    }
    if (autoRefreshLabel) autoRefreshLabel.textContent = 'Manual refresh';
    
    currentMailboxCreatedAt = data.created_at || Math.floor(Date.now() / 1000);

    if (countdownInstance) countdownInstance.stop();
    const target = data.remaining_seconds ?? data.expires_at;
    if (target && mailboxCountdown) {
      countdownInstance = Utils.countdown(
        target,
        ({ formatted }) => {
          mailboxCountdown.textContent = formatted;
        },
        () => {
          Utils.showToast('Masa aktif mailbox telah berakhir (Expired).', 'warning');
          localStorage.removeItem(STORAGE_KEYS.MAILBOX_ID);
          currentMailboxId = null;
          showGenerateState();
        }
      );
    }

    fetchInboxMessages(true);
  }

  async function fetchInboxMessages(showSkeleton = false) {
    if (!currentMailboxId) return;

    const refreshIcon = document.getElementById('icon-refresh');
    if (refreshIcon) refreshIcon.classList.add('animate-spin');

    if (showSkeleton) {
      if (inboxEmptyState) inboxEmptyState.classList.add('hidden');
      if (inboxList) inboxList.classList.add('hidden');
      if (inboxSkeleton) inboxSkeleton.classList.remove('hidden');
    }

    try {
      const res = await apiFetch(`/api/web/mailbox/${encodeURIComponent(currentMailboxId)}/messages`);
      const messages = res?.data?.messages || [];
      const total = res?.data?.total ?? messages.length;

      if (inboxCountBadge) inboxCountBadge.textContent = String(total);
      if (inboxSkeleton) inboxSkeleton.classList.add('hidden');

      if (!messages.length) {
        if (inboxList) inboxList.classList.add('hidden');
        if (inboxEmptyState) inboxEmptyState.classList.remove('hidden');
        return;
      }

      if (inboxEmptyState) inboxEmptyState.classList.add('hidden');
      if (inboxList) {
        inboxList.classList.remove('hidden');
        inboxList.innerHTML = messages
          .map(
            (m) => `
            <div
              data-msg-id="${Utils.escapeHtml(m.id)}"
              class="msg-row p-3.5 hover:bg-blue-50/70 rounded-2xl cursor-pointer transition flex items-start justify-between gap-3 group"
            >
              <div class="flex items-start gap-3 min-w-0">
                <div class="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  ${Utils.escapeHtml((m.sender || 'M')[0].toUpperCase())}
                </div>
                <div class="min-w-0">
                  <p class="text-xs font-bold text-slate-900 truncate group-hover:text-blue-600 transition">
                    ${Utils.escapeHtml(m.subject || '(Tanpa Subjek)')}
                  </p>
                  <p class="text-xs text-slate-500 truncate mt-0.5">
                    ${Utils.escapeHtml(m.sender || '-')}
                  </p>
                </div>
              </div>
              <span class="text-[11px] text-slate-400 shrink-0">
                ${Utils.formatRelative(m.received_at)}
              </span>
            </div>
          `
          )
          .join('');

        inboxList.querySelectorAll('.msg-row').forEach((row) => {
          row.addEventListener('click', () => openMessageDetail(row.getAttribute('data-msg-id')));
        });
      }
    } catch (err) {
      if (inboxSkeleton) inboxSkeleton.classList.add('hidden');
      if (err.status === 404 || err.status === 410) {
        localStorage.removeItem(STORAGE_KEYS.MAILBOX_ID);
        currentMailboxId = null;
        showGenerateState();
      }
    } finally {
      if (refreshIcon) {
        setTimeout(() => refreshIcon.classList.remove('animate-spin'), 600);
      }
    }
  }

  function stripHtml(html) {
    if (!html) return '';
    let text = String(html);
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n');
    text = text.replace(/<\/div>/gi, '\n');
    text = text.replace(/<\/tr>/gi, '\n');
    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n\s*\n/g, '\n\n');
    return text.trim();
  }

  function decodeMimeContent(content) {
    if (!content) return '';
    let text = String(content);

    text = text.replace(/=\r?\n/g, '');
    text = text.replace(/=([0-9A-F]{2})/gi, (_, hex) => {
      try { return String.fromCharCode(parseInt(hex, 16)); } catch { return _; }
    });

    text = text.replace(/=\?[^?]+\?[BQbq]\?[^?]+\?=/g, (match) => {
      try {
        const parts = match.match(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/);
        if (!parts) return match;
        const [, , encoding, data] = parts;
        if (encoding.toUpperCase() === 'B') {
          const binary = atob(data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return new TextDecoder('utf-8').decode(bytes);
        } else {
          return data.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
        }
      } catch { return match; }
    });

    if (/<[a-z][\s\S]*>/i.test(text)) {
      text = stripHtml(text);
    }

    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return text;
  }

  async function openMessageDetail(msgId) {
    if (!msgId) return;
    Utils.showLoading('Membuka isi pesan...');
    try {
      const res = await apiFetch(`/api/web/message/${encodeURIComponent(msgId)}`);
      const msg = res.data;

      document.getElementById('modal-msg-subject').textContent = msg.subject || '(Tanpa Subjek)';
      document.getElementById('modal-msg-sender').textContent = msg.sender || '-';
      document.getElementById('modal-msg-date').textContent = Utils.formatDate(msg.received_at);
      document.getElementById('modal-msg-recipient').textContent = msg.mailbox_email || currentMailboxEmail;

      let displayBody = msg.body || '';
      if (msg.body_html && (!displayBody || displayBody.length < 20)) {
        displayBody = stripHtml(msg.body_html);
      } else {
        displayBody = decodeMimeContent(displayBody);
      }

      lastOpenedMessageBody = displayBody;
      document.getElementById('modal-msg-body').textContent = displayBody;

      const attWrap = document.getElementById('modal-msg-attachments-wrap');
      const attList = document.getElementById('modal-msg-attachments');
      if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
        attWrap.classList.remove('hidden');
        attList.innerHTML = msg.attachments
          .map(
            (a) => `
            <span class="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-medium">
              📎 ${Utils.escapeHtml(a.filename || a.name || 'Attachment')}
            </span>
          `
          )
          .join('');
      } else {
        attWrap.classList.add('hidden');
      }

      document.getElementById('message-modal').classList.remove('hidden');
    } catch (err) {
      Utils.showToast(err.message || 'Gagal memuat detail pesan.', 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  function showInfoModal() {
    if (!infoModal) return;
    
    document.getElementById('info-email').textContent = currentMailboxEmail;
    document.getElementById('info-created').textContent = currentMailboxCreatedAt ? Utils.formatDate(currentMailboxCreatedAt) : '-';
    
    const expDate = localStorage.getItem('mailbox_expires_at') || 0;
    if (expDate) {
       document.getElementById('info-expires').textContent = Utils.formatDate(expDate);
    } else {
       document.getElementById('info-expires').textContent = '-';
    }
    
    const totalMsg = document.getElementById('inbox-count-badge')?.textContent || '0';
    document.getElementById('info-total-msg').textContent = `${totalMsg} pesan`;
    
    infoModal.classList.remove('hidden');
  }

  async function handleDeleteMailbox() {
    if (!currentMailboxId) return;
    if (!confirm('Hapus mailbox ini beserta seluruh pesan di dalamnya?')) return;

    Utils.showLoading('Menghapus mailbox...');
    try {
      await apiFetch(`/api/web/user/my-mailboxes/${encodeURIComponent(currentMailboxId)}`, {
        method: 'DELETE'
      });
      localStorage.removeItem(STORAGE_KEYS.MAILBOX_ID);
      currentMailboxId = null;
      Utils.showToast('Mailbox berhasil dihapus.', 'success');
      showGenerateState();
      loadUserQuota();
    } catch (err) {
      Utils.showToast(err.message || 'Gagal menghapus mailbox.', 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  if (btnGenerate) btnGenerate.addEventListener('click', handleGenerateMailbox);

  const btnCopyEmail = document.getElementById('btn-copy-email');
  if (btnCopyEmail) {
    btnCopyEmail.addEventListener('click', () => {
      Utils.copyToClipboard(currentMailboxEmail, 'Alamat email berhasil disalin!');
    });
  }

  if (btnRefreshInbox) {
    btnRefreshInbox.addEventListener('click', () => {
      fetchInboxMessages(false);
    });
  }

  const btnNewMailbox = document.getElementById('btn-new-mailbox');
  if (btnNewMailbox) {
    btnNewMailbox.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEYS.MAILBOX_ID);
      currentMailboxId = null;
      showGenerateState();
    });
  }

  const btnDeleteMailbox = document.getElementById('btn-delete-mailbox');
  if (btnDeleteMailbox) {
    btnDeleteMailbox.addEventListener('click', handleDeleteMailbox);
  }

  const closeModal = () => document.getElementById('message-modal')?.classList.add('hidden');
  document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-close-modal-footer')?.addEventListener('click', closeModal);
  document.getElementById('btn-copy-msg')?.addEventListener('click', () => {
    Utils.copyToClipboard(lastOpenedMessageBody, 'Isi pesan berhasil disalin!');
  });

  if (btnShowInfo) {
    btnShowInfo.addEventListener('click', showInfoModal);
  }
  
  document.getElementById('btn-close-info')?.addEventListener('click', () => infoModal.classList.add('hidden'));
  document.getElementById('btn-close-info-footer')?.addEventListener('click', () => infoModal.classList.add('hidden'));

  document.getElementById('btn-home-logout')?.addEventListener('click', async () => {
    Utils.showLoading('Keluar dari sesi...');
    try {
      await apiFetch('/api/web/auth/logout', { method: 'POST', skipAuthRedirect: true });
    } catch (e) {
    } finally {
      clearToken();
      localStorage.removeItem(STORAGE_KEYS.MAILBOX_ID);
      Utils.hideLoading();
      window.location.replace('login.html');
    }
  });

  const sessionValid = await verifyUserSession();
  if (!sessionValid) return;

  loadUserQuota();
  if (currentMailboxId) {
    restoreMailbox(currentMailboxId);
  } else {
    loadUserMailboxes();
  }
});