document.addEventListener('DOMContentLoaded', () => {
  if (!isLoggedIn()) {
    window.location.href = 'login.html';
    return;
  }

  if (window.lucide) window.lucide.createIcons();

  let selectedMailbox = null;
  let showAllMailboxes = false;
  let currentSessionId = null;
  let currentMessageId = null;
  let currentMessageBody = '';
  let currentOtpCode = '';
  let isUserPremium = false;
  let currentMailboxInfo = null;

  async function initDashboard() {
    try {
      const meRes = await apiFetch('/api/web/auth/me');
      if (!meRes?.data?.user) {
        clearToken();
        window.location.href = 'login.html';
        return;
      }
      currentSessionId = meRes.data.session_id;
      isUserPremium = meRes.data.user.tier === 'premium';
      
      renderProfile(meRes.data.user);
      setupPrefixInput();

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

  function setupPrefixInput() {
    const prefixInput = document.getElementById('dash-custom-prefix');
    if (!prefixInput) return;
    
    if (!isUserPremium) {
      prefixInput.disabled = true;
      prefixInput.placeholder = "Khusus Premium";
      prefixInput.classList.add('bg-slate-100', 'cursor-not-allowed', 'text-slate-400');
      prefixInput.title = "Upgrade ke Premium untuk custom nama email";
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
    
    if (user.tier === 'premium') {
      document.getElementById('profile-tier-badge').className = 'px-2.5 py-1 rounded-full text-[11px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200';
      document.getElementById('nav-user-tier').className = 'ml-1.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700';
    } else {
      document.getElementById('profile-tier-badge').className = 'px-2.5 py-1 rounded-full text-[11px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200';
      document.getElementById('nav-user-tier').className = 'ml-1.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700';
    }
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
        const msgCount = m.message_count ?? 0;
        const hasUnread = msgCount > 0;
        const isPremiumMb = m.is_premium === 1;

        let sisaWaktu = m.expires_at;
        if (typeof m.remaining_seconds === 'number') {
          sisaWaktu = Date.now() + (m.remaining_seconds * 1000);
        } else if (m.expires_at) {
          if (typeof m.expires_at === 'number' && m.expires_at < 1e12) {
            sisaWaktu = m.expires_at * 1000;
          }
        }

        return `
          <div data-id="${Utils.escapeHtml(m.id)}" data-email="${Utils.escapeHtml(m.email)}" class="dash-mb-item p-3 rounded-2xl border ${
          isSelected ? 'bg-blue-50/90 border-blue-400' : 'bg-white/80 border-slate-200/80 hover:border-blue-300'
        } flex items-center justify-between gap-2 cursor-pointer transition">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                ${hasUnread ? '<span class="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0"></span>' : ''}
                <p class="font-mono-code text-[11px] font-bold text-slate-900 truncate">${Utils.escapeHtml(m.email)}</p>
                ${isPremiumMb ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">PRO</span>' : ''}
              </div>
              <p class="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                <span class="inline-flex items-center gap-1"><i data-lucide="mail" class="w-3 h-3"></i>${msgCount}</span>
                <span class="inline-flex items-center gap-1 text-amber-600 font-medium"><i data-lucide="clock" class="w-3 h-3"></i>${Utils.formatRelative(sisaWaktu)}</span>
              </p>
            </div>
            <button type="button" data-del-id="${Utils.escapeHtml(m.id)}" class="btn-del-mb p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition" title="Hapus Mailbox">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `;
      })
      .join('');

    if (window.lucide) window.lucide.createIcons();

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
            currentMailboxInfo = null;
            resetReader();
            resetMessagesList();
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
    resetReader();
    loadMailboxes();
    
    try {
      const res = await apiFetch(`/api/web/user/my-mailboxes/${encodeURIComponent(mb.id)}`);
      if (res?.data) {
        currentMailboxInfo = res.data;
      }
    } catch (e) {}

    await loadMailboxMessages(mb.id);
  }

  function resetMessagesList() {
    const list = document.getElementById('dash-messages-list');
    list.innerHTML = `
      <div class="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
        <i data-lucide="inbox" class="w-8 h-8 text-slate-300"></i>
        <p>Pilih mailbox untuk lihat pesan</p>
      </div>
    `;
    document.getElementById('dash-inbox-count').textContent = '0 pesan';
    if (window.lucide) window.lucide.createIcons();
  }

  function resetReader() {
    document.getElementById('dash-reader-empty').classList.remove('hidden');
    document.getElementById('dash-reader-panel').classList.add('hidden');
    currentMessageId = null;
    currentMessageBody = '';
    currentOtpCode = '';
  }

  async function loadMailboxMessages(mailboxId) {
    const list = document.getElementById('dash-messages-list');
    list.innerHTML = `
      <div class="p-3 space-y-2">
        <div class="skeleton h-12 w-full"></div>
        <div class="skeleton h-12 w-full"></div>
        <div class="skeleton h-12 w-full"></div>
      </div>
    `;

    try {
      const res = await apiFetch(`/api/web/mailbox/${encodeURIComponent(mailboxId)}/messages`);
      const messages = res?.data?.messages || [];
      const total = res?.data?.total ?? messages.length;

      document.getElementById('dash-inbox-count').textContent = `${total} pesan`;

      if (!messages.length) {
        list.innerHTML = `
          <div class="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <i data-lucide="mail-open" class="w-8 h-8 text-slate-300"></i>
            <p>Belum ada pesan masuk</p>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      list.innerHTML = `
        <div class="divide-y divide-slate-200/70">
          ${messages
            .map((m) => {
              const isActive = currentMessageId === m.id;
              const sender = m.sender || '-';
              const provider = detectProvider(sender);
              const providerColor = getProviderColor(provider);
              return `
                <div data-msg-id="${Utils.escapeHtml(m.id)}" class="dash-msg-row p-3 cursor-pointer transition flex items-start gap-2.5 ${
                isActive ? 'bg-blue-50/80' : 'hover:bg-blue-50/40'
              }">
                  <div class="w-8 h-8 rounded-xl ${providerColor.bg} ${providerColor.text} font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    ${Utils.escapeHtml((m.sender || 'M')[0].toUpperCase())}
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-xs font-bold text-slate-900 truncate">${Utils.escapeHtml(m.subject || '(Tanpa Subjek)')}</p>
                    <p class="text-[10px] text-slate-500 truncate mt-0.5">${Utils.escapeHtml(sender)}</p>
                    <p class="text-[10px] text-slate-400 mt-0.5">${Utils.formatRelative(m.received_at)}</p>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      `;

      list.querySelectorAll('.dash-msg-row').forEach((row) => {
        row.addEventListener('click', () => openMessage(row.getAttribute('data-msg-id')));
      });
    } catch (err) {
      list.innerHTML = `
        <div class="p-6 text-center text-xs text-red-500">
          ${Utils.escapeHtml(err.message)}
        </div>
      `;
    }
  }

  function detectProvider(sender) {
    const s = (sender || '').toLowerCase();
    if (s.includes('tokopedia')) return 'Tokopedia';
    if (s.includes('google') || s.includes('gmail')) return 'Google';
    if (s.includes('microsoft') || s.includes('outlook')) return 'Microsoft';
    if (s.includes('openai') || s.includes('chatgpt')) return 'OpenAI';
    if (s.includes('tiktok')) return 'TikTok';
    if (s.includes('facebook') || s.includes('meta')) return 'Meta';
    if (s.includes('apple') || s.includes('icloud')) return 'Apple';
    if (s.includes('shopee')) return 'Shopee';
    if (s.includes('grab')) return 'Grab';
    if (s.includes('gojek')) return 'Gojek';
    if (s.includes('dana')) return 'DANA';
    if (s.includes('ovo')) return 'OVO';
    if (s.includes('deepseek')) return 'DeepSeek';
    return 'Email';
  }

  function getProviderColor(provider) {
    const map = {
      'Tokopedia': { bg: 'bg-green-100', text: 'text-green-700' },
      'Google': { bg: 'bg-blue-100', text: 'text-blue-700' },
      'Microsoft': { bg: 'bg-sky-100', text: 'text-sky-700' },
      'OpenAI': { bg: 'bg-emerald-100', text: 'text-emerald-700' },
      'TikTok': { bg: 'bg-slate-100', text: 'text-slate-700' },
      'Meta': { bg: 'bg-indigo-100', text: 'text-indigo-700' },
      'Apple': { bg: 'bg-gray-100', text: 'text-gray-700' },
      'Shopee': { bg: 'bg-orange-100', text: 'text-orange-700' },
      'Grab': { bg: 'bg-green-100', text: 'text-green-700' },
      'Gojek': { bg: 'bg-emerald-100', text: 'text-emerald-700' },
      'DANA': { bg: 'bg-blue-100', text: 'text-blue-700' },
      'OVO': { bg: 'bg-purple-100', text: 'text-purple-700' },
      'DeepSeek': { bg: 'bg-cyan-100', text: 'text-cyan-700' },
      'Email': { bg: 'bg-slate-100', text: 'text-slate-600' }
    };
    return map[provider] || map['Email'];
  }

  function extractOtp(text) {
    if (!text) return null;
    const cleaned = String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    const patterns = [
      /(?:kode|code|otp|verifikasi|verification|pin)\s*(?:anda|kamu|you)?\s*[:=]?\s*(\d{4,8})/i,
      /(\d{4,8})\s*(?:adalah|is)\s*(?:kode|code|otp)/i,
      /\b(\d{6})\b/
    ];

    for (const p of patterns) {
      const m = cleaned.match(p);
      if (m && m[1]) return m[1];
    }
    return null;
  }

  function extractLinks(text) {
    if (!text) return [];
    const urlRegex = /https?:\/\/[^\s<>"')]+/gi;
    const matches = String(text).match(urlRegex) || [];
    const cleanUrls = matches
      .map(u => u.replace(/[.,;:!?]+$/, ''))
      .filter(u => !u.includes('unsubscribe') && !u.includes('tracking'))
      .filter((u, i, arr) => arr.indexOf(u) === i);
    return cleanUrls.slice(0, 5);
  }

  function showMailboxInfo() {
    if (!selectedMailbox || !currentMailboxInfo) return;
    
    const infoBox = document.getElementById('dash-reader-empty');
    infoBox.classList.remove('hidden');
    document.getElementById('dash-reader-panel').classList.add('hidden');

    const now = Math.floor(Date.now() / 1000);
    const expTimestamp = currentMailboxInfo.expires_at;
    const createdTimestamp = currentMailboxInfo.created_at;
    
    let sisaWaktuStr = '-';
    if (expTimestamp > now) {
      const sisaDetik = expTimestamp - now;
      const h = Math.floor(sisaDetik / 3600);
      const m = Math.floor((sisaDetik % 3600) / 60);
      sisaWaktuStr = `${h} jam ${m} menit lagi`;
    } else {
      sisaWaktuStr = 'Expired';
    }

    infoBox.innerHTML = `
      <div class="w-full max-w-sm glass-card rounded-2xl p-5 border border-blue-200 bg-white shadow-sm">
        <div class="flex items-center gap-3 border-b border-slate-100 pb-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
            <i data-lucide="info" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 text-sm">Informasi Mailbox</h3>
            <p class="text-[11px] text-slate-500">Detail alamat email aktif Anda</p>
          </div>
        </div>
        
        <div class="space-y-2.5 text-xs">
          <div class="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
            <span class="text-slate-500">Alamat Email</span>
            <span class="font-mono-code font-bold text-slate-900 select-all text-right break-all">${Utils.escapeHtml(selectedMailbox.email)}</span>
          </div>
          <div class="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
            <span class="text-slate-500">Waktu Dibuat</span>
            <span class="font-semibold text-slate-800">${Utils.formatDate(createdTimestamp)}</span>
          </div>
          <div class="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
            <span class="text-slate-500">Waktu Expired</span>
            <span class="font-semibold text-red-600">${Utils.formatDate(expTimestamp)}</span>
          </div>
          <div class="flex justify-between items-center bg-blue-50 p-2 rounded-lg border border-blue-100">
            <span class="text-blue-600 font-semibold">Sisa Waktu</span>
            <span class="font-bold text-blue-700">${sisaWaktuStr}</span>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  }

  async function openMessage(msgId) {
    if (!msgId) return;
    currentMessageId = msgId;

    document.querySelectorAll('.dash-msg-row').forEach(r => {
      if (r.getAttribute('data-msg-id') === msgId) {
        r.classList.add('bg-blue-50/80');
      } else {
        r.classList.remove('bg-blue-50/80');
      }
    });

    Utils.showLoading('Membuka pesan...');
    try {
      const res = await apiFetch(`/api/web/message/${encodeURIComponent(msgId)}`);
      const msg = res.data;

      document.getElementById('dash-reader-empty').classList.add('hidden');
      document.getElementById('dash-reader-panel').classList.remove('hidden');

      document.getElementById('reader-subject').textContent = msg.subject || '(Tanpa Subjek)';
      document.getElementById('reader-sender').textContent = msg.sender || '-';
      document.getElementById('reader-date').textContent = Utils.formatDate(msg.received_at);

      const body = msg.body || msg.body_html || '';
      currentMessageBody = body;

      let displayBody = body;
      if (msg.body_html && (!body || body.length < 20)) {
        displayBody = stripHtml(msg.body_html);
      } else {
        displayBody = decodeMimeContent(body);
      }

      document.getElementById('reader-body').textContent = displayBody;

      const otp = extractOtp(displayBody);
      const otpBox = document.getElementById('reader-otp-box');
      if (otp) {
        currentOtpCode = otp;
        document.getElementById('reader-otp-code').textContent = otp;
        otpBox.classList.remove('hidden');
      } else {
        currentOtpCode = '';
        otpBox.classList.add('hidden');
      }

      const links = extractLinks(body + ' ' + (msg.body_html || ''));
      const linksBox = document.getElementById('reader-links-box');
      const linksList = document.getElementById('reader-links-list');

      if (links.length > 0) {
        linksBox.classList.remove('hidden');
        linksList.innerHTML = links
          .map((url, i) => {
            const shortUrl = url.length > 40 ? url.slice(0, 40) + '...' : url;
            return `
              <a href="${Utils.escapeHtml(url)}" target="_blank" rel="noopener" class="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-medium border border-blue-200 truncate max-w-full inline-flex items-center gap-1">
                <i data-lucide="external-link" class="w-3 h-3 shrink-0"></i>
                <span class="truncate">${Utils.escapeHtml(shortUrl)}</span>
              </a>
            `;
          })
          .join('');
        if (window.lucide) window.lucide.createIcons();
      } else {
        linksBox.classList.add('hidden');
      }
    } catch (err) {
      Utils.showToast(err.message || 'Gagal memuat pesan.', 'error');
    } finally {
      Utils.hideLoading();
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
    const prefix = isUserPremium ? prefixInput.value.trim() : '';

    Utils.showLoading('Membuat mailbox baru...');
    try {
      const res = await apiFetch('/api/web/mailbox/create', {
        method: 'POST',
        body: prefix ? { prefix } : {}
      });
      
      if (isUserPremium && prefixInput) prefixInput.value = '';
      
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
    e.target.textContent = showAllMailboxes ? 'Hanya Aktif' : 'Semua';
    loadMailboxes();
  });

  document.getElementById('btn-refresh-inbox-list').addEventListener('click', () => {
    if (selectedMailbox) loadMailboxMessages(selectedMailbox.id);
  });

  document.getElementById('btn-reader-close').addEventListener('click', () => {
    if (currentMailboxInfo) {
      showMailboxInfo();
    } else {
      resetReader();
    }
  });

  document.getElementById('btn-reader-copy-body').addEventListener('click', () => {
    if (currentMessageBody) {
      Utils.copyToClipboard(currentMessageBody, 'Isi pesan disalin!');
    }
  });

  document.getElementById('btn-reader-copy-otp').addEventListener('click', () => {
    if (currentOtpCode) {
      Utils.copyToClipboard(currentOtpCode, `Kode OTP ${currentOtpCode} disalin!`);
    }
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