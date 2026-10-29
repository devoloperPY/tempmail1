(function () {
  'use strict';

  let currentMailboxId = null;
  let currentMailboxEmail = '';
  let countdownInstance = null;
  let lastOpenedMessageBody = '';
  let initialized = false;
  let currentMailboxesCache = [];
  let availableDomains = [];

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
    text = text.replace(/=([0-9A-F]{2})/gi, function (_, hex) {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch (e) {
        return _;
      }
    });
    text = text.replace(/=\?[^?]+\?[BQbq]\?[^?]+\?=/g, function (match) {
      try {
        const parts = match.match(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/);
        if (!parts) return match;
        const encoding = parts[2];
        const data = parts[3];
        if (encoding.toUpperCase() === 'B') {
          const binary = atob(data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          return new TextDecoder('utf-8').decode(bytes);
        } else {
          return data.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, function (_, h) {
            return String.fromCharCode(parseInt(h, 16));
          });
        }
      } catch (e) {
        return match;
      }
    });
    if (/<[a-z][\s\S]*>/i.test(text)) {
      text = stripHtml(text);
    }
    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return text;
  }

  function extractOtp(text) {
    if (!text) return null;
    const cleaned = String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const patterns = [
      /(?:kode|code|otp|verifikasi|verification|pin)\s*(?:anda|kamu|you)?\s*[:=]?\s*(\d{4,8})/i,
      /(\d{4,8})\s*(?:adalah|is)\s*(?:kode|code|otp)/i,
      /\b(\d{6})\b/
    ];
    for (let i = 0; i < patterns.length; i++) {
      const m = cleaned.match(patterns[i]);
      if (m && m[1]) return m[1];
    }
    return null;
  }

  function extractLinks(text) {
    if (!text) return [];
    const urlRegex = /https?:\/\/[^\s<>"')]+/gi;
    const matches = String(text).match(urlRegex) || [];
    const cleanUrls = matches
      .map(function (u) { return u.replace(/[.,;:!?]+$/, ''); })
      .filter(function (u) { return !u.includes('unsubscribe') && !u.includes('tracking'); })
      .filter(function (u, i, arr) { return arr.indexOf(u) === i; });
    return cleanUrls.slice(0, 5);
  }

  async function loadDomains() {
    const select = $('tm-domain-select');
    if (!select) return;
    
    try {
      const res = await apiFetch('/api/web/domains', { cache: 'no-store' });
      availableDomains = res?.data?.domains || [];
      
      select.innerHTML = availableDomains.map(d => 
        `<option value="${escapeHtml(d.domain)}">@${escapeHtml(d.domain)}</option>`
      ).join('');
      
      if (!availableDomains.length) {
        select.innerHTML = '<option value="">No domain</option>';
      }
    } catch (e) {
      select.innerHTML = '<option value="">Error</option>';
    }
  }

  async function updateStatusBar() {
    const statusBar = $('tm-status-bar');
    if (!statusBar) return;

    try {
      const res = await apiFetch('/api/web/user/quota', { cache: 'no-store' });
      const q = res?.data || {};

      const used = q.used_today || 0;
      const max = q.max_per_day || 5;
      const duration = q.mailbox_duration_minutes || 180;
      const isPremium = q.tier === 'premium';
      const isOwner = q.is_owner || q.tier === 'owner';

      const maxText = isOwner ? 'Unlimited' : max;
      const durationText = isOwner ? 'Unlimited' : duration + ' mnt';
      
      let tierIcon = 'user';
      let tierLabel = 'Free';
      let tierColor = 'text-slate-400';
      
      if (isOwner) {
        tierIcon = 'crown';
        tierLabel = 'Owner';
        tierColor = 'text-purple-500';
      } else if (isPremium) {
        tierIcon = 'crown';
        tierLabel = 'Premium';
        tierColor = 'text-amber-500';
      }

      statusBar.innerHTML =
        '<div class="tm-status-item">' +
          '<i data-lucide="inbox" class="w-3 h-3 text-blue-600"></i>' +
          'Kuota: ' + used + ' / ' + maxText +
        '</div>' +
        '<div class="tm-status-item">' +
          '<i data-lucide="' + tierIcon + '" class="w-3 h-3 ' + tierColor + '"></i>' +
          'Akun: ' + tierLabel +
        '</div>' +
        '<div class="tm-status-item">' +
          '<i data-lucide="clock" class="w-3 h-3 text-emerald-600"></i>' +
          'Durasi: ' + durationText +
        '</div>';

      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      statusBar.innerHTML = '<div class="tm-status-item">Gagal memuat status.</div>';
    }
  }

  function renderMailboxList(mailboxes) {
    const list = $('tm-mailboxes-list');
    if (!list) return;

    if (!mailboxes || !mailboxes.length) {
      list.innerHTML =
        '<div class="p-6 text-center text-xs text-slate-400">' +
          'Belum ada mailbox. Buat di atas.' +
        '</div>';
      return;
    }

    const html = mailboxes.map(function (m) {
      const isSelected = currentMailboxId === m.id;
      const expiresText = m.expires_at ? Utils.formatRelative(m.expires_at) : '-';
      const msgCount = m.message_count || 0;
      const premiumBadge = m.is_premium ? '<span class="dash-badge-type dash-badge-termux ml-1">PRO</span>' : '';

      return (
        '<div data-mb-id="' + escapeHtml(m.id) + '" data-mb-email="' + escapeHtml(m.email) + '" class="tm-mb-item p-2.5 rounded-lg border cursor-pointer transition ' +
          (isSelected ? 'bg-blue-50 border-blue-400' : 'bg-white border-slate-200 hover:border-blue-300') + '">' +
          '<div class="flex items-center justify-between gap-2">' +
            '<p class="font-mono-code text-[11px] font-bold text-slate-900 truncate">' + escapeHtml(m.email) + premiumBadge + '</p>' +
            '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">' + msgCount + '</span>' +
          '</div>' +
          '<p class="text-[10px] text-slate-500 mt-1 flex items-center gap-1">' +
            '<i data-lucide="clock" class="w-2.5 h-2.5"></i>' +
            escapeHtml(expiresText) +
          '</p>' +
        '</div>'
      );
    }).join('');

    list.innerHTML = html;

    list.querySelectorAll('.tm-mb-item').forEach(function (el) {
      el.addEventListener('click', function () {
        currentMailboxId = el.getAttribute('data-mb-id');
        currentMailboxEmail = el.getAttribute('data-mb-email');
        fetchInboxMessages(true);
        closeReader();
        renderMailboxList(currentMailboxesCache);
      });
    });

    if (window.lucide) window.lucide.createIcons();
  }

  async function loadMailboxes() {
    const list = $('tm-mailboxes-list');
    if (list) {
      list.innerHTML =
        '<div class="p-2 space-y-2">' +
          '<div class="skeleton h-14 w-full"></div>' +
          '<div class="skeleton h-14 w-full"></div>' +
        '</div>';
    }

    try {
      const res = await apiFetch('/api/web/user/my-mailboxes');
      const mailboxes = res?.data?.mailboxes || [];
      currentMailboxesCache = mailboxes;
      renderMailboxList(mailboxes);
    } catch (err) {
      if (list) {
        list.innerHTML = '<div class="p-4 text-center text-xs text-red-500">' + escapeHtml(err.message) + '</div>';
      }
    }
  }

  async function handleCreateMailbox(prefix, domainSelected) {
    if (!isLoggedIn()) {
      window.location.replace('login.html');
      return;
    }

    Utils.showLoading('Membuat alamat email sementara...');

    try {
      const body = {};
      if (prefix) body.prefix = prefix;
      if (domainSelected) body.domain_selected = domainSelected;

      const res = await apiFetch('/api/web/mailbox/create', {
        method: 'POST',
        body: body
      });

      const data = res.data;
      currentMailboxId = data.id;
      currentMailboxEmail = data.email;

      Utils.showToast('Mailbox ' + data.email + ' berhasil dibuat!', 'success');

      currentMailboxesCache.unshift(data);
      renderMailboxList(currentMailboxesCache);

      fetchInboxMessages(true);
      updateStatusBar();

      if (window.Dashboard && window.Dashboard.refreshSidebarBadges) {
        window.Dashboard.refreshSidebarBadges();
      }
    } catch (err) {
      Utils.showToast(err.message || 'Gagal membuat temp mail.', 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  async function fetchInboxMessages(showSkeleton) {
    if (!currentMailboxId) return;

    const refreshIcon = $('tm-btn-refresh-inbox')?.querySelector('i');
    if (refreshIcon) refreshIcon.classList.add('animate-spin');

    const list = $('tm-messages-list');

    if (showSkeleton && list) {
      list.innerHTML =
        '<div class="p-3 space-y-2">' +
          '<div class="skeleton h-12 w-full"></div>' +
          '<div class="skeleton h-12 w-full"></div>' +
          '<div class="skeleton h-12 w-full"></div>' +
        '</div>';
    }

    try {
      const res = await apiFetch('/api/web/mailbox/' + encodeURIComponent(currentMailboxId) + '/messages');
      const messages = res?.data?.messages || [];
      const total = res?.data?.total ?? messages.length;

      const countEl = $('tm-inbox-count');
      if (countEl) countEl.textContent = total + ' pesan';

      if (!messages.length) {
        if (list) {
          list.innerHTML =
            '<div class="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">' +
              '<i data-lucide="inbox" class="w-8 h-8 text-slate-300"></i>' +
              '<p>Belum ada pesan masuk</p>' +
            '</div>';
        }
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      if (list) {
        list.innerHTML = messages.map(function (m) {
          const senderInitial = (m.sender || 'M')[0].toUpperCase();
          return (
            '<div data-msg-id="' + escapeHtml(m.id) + '" class="tm-msg-row p-3 cursor-pointer transition flex items-start gap-2.5 hover:bg-blue-50/60 border-l-2 border-transparent">' +
              '<div class="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">' +
                escapeHtml(senderInitial) +
              '</div>' +
              '<div class="min-w-0 flex-1">' +
                '<p class="text-xs font-bold text-slate-900 truncate">' + escapeHtml(m.subject || '(Tanpa Subjek)') + '</p>' +
                '<p class="text-[10px] text-slate-500 truncate mt-0.5">' + escapeHtml(m.sender || '-') + '</p>' +
                '<p class="text-[10px] text-slate-400 mt-0.5">' + Utils.formatRelative(m.received_at) + '</p>' +
              '</div>' +
            '</div>'
          );
        }).join('');

        list.querySelectorAll('.tm-msg-row').forEach(function (row) {
          row.addEventListener('click', function () {
            openMessage(row.getAttribute('data-msg-id'));
          });
        });

        if (window.lucide) window.lucide.createIcons();
      }
    } catch (err) {
      if (list) {
        list.innerHTML = '<div class="p-6 text-center text-xs text-red-500">' + escapeHtml(err.message || 'Gagal memuat pesan') + '</div>';
      }
    } finally {
      if (refreshIcon) {
        setTimeout(function () {
          refreshIcon.classList.remove('animate-spin');
        }, 600);
      }
    }
  }

  async function openMessage(msgId) {
    if (!msgId) return;

    Utils.showLoading('Membuka pesan...');

    try {
      const res = await apiFetch('/api/web/message/' + encodeURIComponent(msgId));
      const msg = res.data;

      const emptyEl = $('tm-reader-empty');
      const panelEl = $('tm-reader-panel');
      if (emptyEl) emptyEl.classList.add('hidden');
      if (panelEl) panelEl.classList.remove('hidden');

      $('tm-reader-subject').textContent = msg.subject || '(Tanpa Subjek)';
      $('tm-reader-sender').textContent = msg.sender || '-';
      $('tm-reader-date').textContent = Utils.formatDate(msg.received_at);

      const body = msg.body || msg.body_html || '';
      let displayBody = body;

      if (msg.body_html && (!body || body.length < 20)) {
        displayBody = stripHtml(msg.body_html);
      } else {
        displayBody = decodeMimeContent(body);
      }

      lastOpenedMessageBody = displayBody;
      $('tm-reader-body').textContent = displayBody;

      const otp = extractOtp(displayBody);
      const otpBox = $('tm-reader-otp-box');

      if (otp) {
        $('tm-reader-otp-code').textContent = otp;
        otpBox.classList.remove('hidden');
      } else {
        otpBox.classList.add('hidden');
      }

      const links = extractLinks(body + ' ' + (msg.body_html || ''));
      const linksBox = $('tm-reader-links-box');
      const linksList = $('tm-reader-links-list');

      if (links.length > 0) {
        linksBox.classList.remove('hidden');
        linksList.innerHTML = links.map(function (url) {
          const shortUrl = url.length > 40 ? url.slice(0, 40) + '...' : url;
          return (
            '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener" class="px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-medium border border-blue-200 truncate max-w-full inline-flex items-center gap-1">' +
              '<i data-lucide="external-link" class="w-2.5 h-2.5 shrink-0"></i>' +
              '<span class="truncate">' + escapeHtml(shortUrl) + '</span>' +
            '</a>'
          );
        }).join('');
      } else {
        linksBox.classList.add('hidden');
      }

      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      Utils.showToast(err.message || 'Gagal memuat pesan.', 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  function closeReader() {
    const emptyEl = $('tm-reader-empty');
    const panelEl = $('tm-reader-panel');
    if (emptyEl) emptyEl.classList.remove('hidden');
    if (panelEl) panelEl.classList.add('hidden');
    lastOpenedMessageBody = '';
  }

  function bindEvents() {
    const createForm = $('tm-create-form');
    if (createForm && !createForm.dataset.bound) {
      createForm.dataset.bound = '1';
      createForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const prefix = $('tm-custom-prefix')?.value.trim() || '';
        const domain = $('tm-domain-select')?.value || '';
        handleCreateMailbox(prefix, domain);
      });
    }

    const btnNew = $('tm-btn-new-mailbox');
    if (btnNew && !btnNew.dataset.bound) {
      btnNew.dataset.bound = '1';
      btnNew.addEventListener('click', function () {
        currentMailboxId = null;
        currentMailboxEmail = '';
        loadMailboxes();
        closeReader();
        const prefixInput = $('tm-custom-prefix');
        if (prefixInput) prefixInput.focus();
      });
    }

    const btnRefreshMbs = $('tm-btn-refresh-mailboxes');
    if (btnRefreshMbs && !btnRefreshMbs.dataset.bound) {
      btnRefreshMbs.dataset.bound = '1';
      btnRefreshMbs.addEventListener('click', function () {
        loadMailboxes();
        updateStatusBar();
      });
    }

    const btnRefreshInbox = $('tm-btn-refresh-inbox');
    if (btnRefreshInbox && !btnRefreshInbox.dataset.bound) {
      btnRefreshInbox.dataset.bound = '1';
      btnRefreshInbox.addEventListener('click', function () {
        fetchInboxMessages(false);
      });
    }

    const btnCloseReader = $('tm-btn-reader-close');
    if (btnCloseReader && !btnCloseReader.dataset.bound) {
      btnCloseReader.dataset.bound = '1';
      btnCloseReader.addEventListener('click', closeReader);
    }

    const btnCopyBody = $('tm-btn-reader-copy');
    if (btnCopyBody && !btnCopyBody.dataset.bound) {
      btnCopyBody.dataset.bound = '1';
      btnCopyBody.addEventListener('click', function () {
        if (lastOpenedMessageBody) {
          Utils.copyToClipboard(lastOpenedMessageBody, 'Isi pesan disalin!');
        }
      });
    }

    const btnCopyOtp = $('tm-btn-reader-copy-otp');
    if (btnCopyOtp && !btnCopyOtp.dataset.bound) {
      btnCopyOtp.dataset.bound = '1';
      btnCopyOtp.addEventListener('click', function () {
        const otp = $('tm-reader-otp-code')?.textContent || '';
        if (otp && otp !== '------') {
          Utils.copyToClipboard(otp, 'Kode OTP ' + otp + ' disalin!');
        }
      });
    }
  }

  async function init() {
    if (!initialized) {
      bindEvents();
      initialized = true;
    }
    await Promise.all([
      loadMailboxes(),
      updateStatusBar(),
      loadDomains()
    ]);
    if (currentMailboxId) {
      fetchInboxMessages(true);
    }
  }

  window.TempMailModule = {
    init: init,
    loadMailboxes: loadMailboxes,
    fetchInboxMessages: fetchInboxMessages,
    closeReader: closeReader,
    updateStatusBar: updateStatusBar,
    reset: function () {
      currentMailboxId = null;
      currentMailboxEmail = '';
      closeReader();
    }
  };

})();