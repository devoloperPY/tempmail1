(function () {
  'use strict';

  var MAX_INPUT = 200;
  var MAX_HISTORY_SEND = 50;
  var PLACEHOLDERS = ['Butuh bantuan?', 'Butuh bantuan..', 'Butuh bantuan...', 'Butuh bantuan..'];
  var placeholderIdx = 0;
  var placeholderTimer = null;

  var chatHistory = [];
  var isBusy = false;
  var isOpen = false;
  var hasWelcomed = false;

  function $(id) { return document.getElementById(id); }
  function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  function formatTimestamp(ms) {
    var d = new Date(ms);
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function formatDuration(ms) {
    if (ms < 1000) return Math.round(ms) + 'ms';
    return (ms / 1000).toFixed(2) + 's';
  }

  function formatMarkdown(text) {
    var out = String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;font-family:JetBrains Mono,monospace;font-size:11px;">$1</code>');
    out = out.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:#1a73e8;text-decoration:underline;">$1</a>');
    return out;
  }

  // FUNGSI BARU: Menyedot URL dari teks biasa dan mengubahnya jadi tombol
  function autoExtractUrls(text) {
    var buttons = [];
    // Cari URL http/https ATAU link telegram (yang mungkin tanpa https://)
    var urlRegex = /(https?:\/\/[^\s]+|t\.me\/[^\s]+)/gi;
    var match;
    
    // Looping semua URL yang ada di teks
    while ((match = urlRegex.exec(text)) !== null) {
      var rawUrl = match[0];
      var finalUrl = rawUrl;
      if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl;
      
      var label = 'Buka Link';
      if (finalUrl.includes('t.me')) label = 'Hubungi Owner';
      else if (finalUrl.includes('dashboard.html')) label = 'Buka Halaman';

      buttons.push(label + ' (' + finalUrl + ')');
      // Hapus URL dari teks aslinya
      text = text.replace(rawUrl, '');
    }
    return { clean: text.trim(), buttons: buttons };
  }

  function extractButtons(text) {
    if (!text) return { clean: '', buttons: [] };
    
    // 1. Cek apakah ada marker [BUTTONS: ...] dari AI
    var m = text.match(/\[BUTTONS:\s*([^\]]+)\]/i);
    var clean = text;
    var buttons = [];

    if (m) {
      var raw = m[1];
      var hasUrlInside = /https?:\/\/|\(\s*\//.test(raw);
      if (!hasUrlInside) {
        var after = text.slice(text.indexOf(m[0]) + m[0].length);
        var urlMatch = after.match(/\(\s*(https?:\/\/[^\s)]+|\/[^\s)]+)\s*\)/);
        if (urlMatch) {
          raw = raw.trim() + ' (' + urlMatch[1] + ')';
        }
      }
      buttons = raw.split('|').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 3);
      clean = text.replace(m[0], '').trim();
    }

    // 2. Cek apakah ada URL mentah yang "tumpah" di teks (seperti kasus di gambar)
    var auto = autoExtractUrls(clean);
    clean = auto.clean;
    
    // Gabungkan tombol dari marker AI dengan tombol dari URL yang tumpah
    buttons = buttons.concat(auto.buttons);

    // Buang duplikat dan batasi max 3 tombol
    buttons = [...new Set(buttons)].slice(0, 3);

    return { clean: clean, buttons: buttons };
  }

  function extractUrlFromText(text) {
    if (!text) return null;
    
    var m = text.match(/\(([^()]*?(?:https?:\/\/|\/)[^()]*)\)/);
    if (m && m[1]) return m[1].trim();

    var m2 = text.match(/(https?:\/\/[^\s)]+)/);
    if (m2) return m2[1];

    var lower = text.toLowerCase();
    if (lower.includes('telegram')) return 'https://t.me/sigitchan';
    if (lower.includes('tiktok')) return 'https://tiktok.com/@sigitchan';
    if (lower.includes('instagram')) return 'https://instagram.com/sigitchan';
    return null;
  }

  function avatarBotSvg() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>';
  }

  function avatarUserSvg() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  }

  function scrollToBottom() {
    var el = $('ai-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function createBubble(role) {
    var wrap = document.createElement('div');
    wrap.className = 'ai-msg ' + role;

    var avatar = document.createElement('div');
    avatar.className = 'ai-msg-avatar';
    avatar.innerHTML = role === 'bot' ? avatarBotSvg() : avatarUserSvg();

    var body = document.createElement('div');
    body.className = 'ai-msg-body';

    var bubble = document.createElement('div');
    bubble.className = 'ai-msg-bubble';

    var meta = document.createElement('div');
    meta.className = 'ai-msg-meta';

    body.appendChild(bubble);
    body.appendChild(meta);
    wrap.appendChild(avatar);
    wrap.appendChild(body);

    var container = $('ai-messages');
    if (container) container.appendChild(wrap);

    return { wrap: wrap, body: body, bubble: bubble, meta: meta };
  }

  function showTypingIndicator() {
    var wrap = document.createElement('div');
    wrap.className = 'ai-msg bot';
    wrap.id = 'ai-typing-bubble';
    wrap.innerHTML =
      '<div class="ai-msg-avatar">' + avatarBotSvg() + '</div>' +
      '<div class="ai-msg-body"><div class="ai-msg-bubble" style="display:flex;align-items:center;gap:8px;"><div class="ai-typing"><span></span><span></span><span></span></div></div></div>';
    var container = $('ai-messages');
    if (container) container.appendChild(wrap);
    scrollToBottom();
  }

  function updateTypingIndicator(text) {
    var el = $('ai-typing-bubble');
    if (!el) {
      showTypingIndicator();
      el = $('ai-typing-bubble');
    }
    var bubble = el.querySelector('.ai-msg-bubble');
    if (bubble) {
      bubble.innerHTML = '<div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border:2px solid #cbd5e1;border-top-color:#1a73e8;border-radius:50%;animation:spin 0.8s linear infinite;"></div><span class="ai-status-text" style="font-size:12px;color:#64748b;font-weight:500;">' + text + '</span></div>';
    }
  }

  function removeTypingIndicator() {
    var el = $('ai-typing-bubble');
    if (el) el.remove();
  }

  function renderInlineButtons(bodyEl, buttons, disabled) {
    if (!buttons || buttons.length === 0) return;

    var old = bodyEl.querySelector('.ai-inline-buttons');
    if (old) old.remove();

    var wrap = document.createElement('div');
    wrap.className = 'ai-inline-buttons';

    buttons.forEach(function (text) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-inline-btn';
      
      var urlTarget = extractUrlFromText(text);
      var displayText = text;
      
      var bracketMatch = text.match(/^(.+?)\s*\(([^()]*?(?:https?:\/\/|\/)[^()]*)\)\s*$/);
      if (bracketMatch) displayText = bracketMatch[1].trim();

      btn.textContent = displayText;
      if (disabled) btn.disabled = true;

      btn.addEventListener('click', function () {
        if (isBusy) return;
        if (urlTarget) {
          if (urlTarget.startsWith('/')) {
            window.location.href = urlTarget;
          } else {
            window.open(urlTarget, '_blank', 'noopener');
          }
        } else {
          sendMessage(text);
        }
      });
      wrap.appendChild(btn);
    });

    bodyEl.appendChild(wrap);
  }

  function appendUserMessage(text) {
    var now = Date.now();
    var b = createBubble('user');
    b.bubble.innerHTML = formatMarkdown(text);
    b.meta.textContent = formatTimestamp(now);
    scrollToBottom();
  }

  function appendBotMessage(text, buttons, durationMs, startTimeMs) {
    var now = Date.now();
    var parsed = extractButtons(text);
    var b = createBubble('bot');
    
    // Tampilkan teks yang sudah bersih (tanpa URL panjang)
    b.bubble.innerHTML = formatMarkdown(parsed.clean);

    var metaText = formatTimestamp(now);
    if (startTimeMs) metaText = formatTimestamp(startTimeMs) + ' · ';
    b.meta.innerHTML = metaText;

    if (durationMs !== undefined && durationMs !== null) {
      var dur = document.createElement('span');
      dur.className = 'meta-duration';
      dur.textContent = '⏱ ' + formatDuration(durationMs);
      b.meta.appendChild(dur);
    }

    var allButtons = (buttons && buttons.length > 0) ? buttons : parsed.buttons;
    if (allButtons && allButtons.length > 0) {
      renderInlineButtons(b.body, allButtons, false);
    }

    scrollToBottom();
  }

  function appendErrorMessage(text) {
    var now = Date.now();
    var b = createBubble('bot');
    b.bubble.innerHTML = '<span style="color:#dc2626;">' + formatMarkdown(text) + '</span>';
    b.meta.textContent = formatTimestamp(now);
    scrollToBottom();
  }

  function showQuickReplies(buttons) {
    var wrap = $('ai-quick-wrap');
    var list = $('ai-quick-list');
    if (!wrap || !list) return;

    if (!buttons || buttons.length === 0) {
      wrap.style.display = 'none';
      return;
    }

    wrap.style.display = '';
    list.innerHTML = '';
    buttons.forEach(function (text) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-quick-btn';
      btn.textContent = text;
      btn.addEventListener('click', function () {
        if (isBusy) return;
        sendMessage(text);
      });
      list.appendChild(btn);
    });
  }

  function hideQuickReplies() {
    var wrap = $('ai-quick-wrap');
    if (wrap) wrap.style.display = 'none';
  }

  function parseSseChunk(line) {
    if (!line || line.indexOf('data:') !== 0) return null;
    var payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return null;
    try {
      var obj = JSON.parse(payload);
      if (obj.type === 'status') return obj;
      if (obj.type === 'error') return obj;
      
      var choice = obj && obj.choices && obj.choices[0];
      if (!choice) return null;
      var delta = choice.delta || choice.message;
      if (delta && typeof delta.content === 'string') return { type: 'content', text: delta.content };
      return null;
    } catch (e) {
      return null;
    }
  }

  async function streamFromBackend(message, startTime) {
    var historyForApi = chatHistory.slice(-MAX_HISTORY_SEND).map(function (h) {
      return { role: h.role, content: h.content };
    });

    var token = (typeof getToken === 'function') ? getToken() : null;
    if (!token) {
      throw new Error('Sesi login tidak valid. Silakan login ulang.');
    }

    var url = (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '') + '/api/web/ai/chat';

    var res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        message: message,
        history: historyForApi
      })
    });

    if (!res.ok) {
      var errData = null;
      try { errData = await res.json(); } catch (e) {}
      var errMsg = (errData && errData.error) || ('Terjadi kesalahan (' + res.status + ')');
      var err = new Error(errMsg);
      err.status = res.status;
      throw err;
    }

    var contentType = res.headers.get('content-type') || '';

    if (contentType.indexOf('application/json') !== -1) {
      var data = await res.json();
      return {
        type: 'json',
        reply: data.reply || '',
        buttons: data.buttons || [],
        blocked: !!data.blocked,
        durationMs: data.duration_ms || (nowMs() - startTime)
      };
    }

    if (!res.body) {
      throw new Error('Respons AI kosong.');
    }

    return {
      type: 'stream',
      reader: res.body.getReader(),
      startTime: startTime
    };
  }

  async function consumeStream(streamData) {
    var reader = streamData.reader;
    var decoder = new TextDecoder('utf-8');
    var buffer = '';
    var fullText = '';
    var typingQueue = '';
    var isTyping = false;
    var isBubbleCreated = false;
    var created = null;

    removeTypingIndicator();

    function typeWriter() {
      if (!isBubbleCreated) {
        removeTypingIndicator();
        created = createBubble('bot');
        isBubbleCreated = true;
      }

      if (typingQueue.length > 0) {
        var chunk = typingQueue.substring(0, 2);
        typingQueue = typingQueue.substring(2);
        
        fullText += chunk;
        
        // Selama ngetik, kita panggil extractButtons agar URL langsung hilang dari layar
        // dan tombol langsung muncul (jika formatnya sudah valid di tengah jalan)
        var parsed = extractButtons(fullText);
        created.bubble.innerHTML = formatMarkdown(parsed.clean);
        
        // Render tombol secara live jika sudah terdeteksi
        if (parsed.buttons && parsed.buttons.length > 0) {
          renderInlineButtons(created.body, parsed.buttons, false);
        }

        scrollToBottom();
        setTimeout(typeWriter, 15);
      } else {
        isTyping = false;
      }
    }

    try {
      while (true) {
        var read = await reader.read();
        if (read.done) break;

        buffer += decoder.decode(read.value, { stream: true });

        var lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          var chunk = parseSseChunk(line);
          if (chunk) {
            if (chunk.type === 'status') {
              if (!isBubbleCreated) {
                updateTypingIndicator(chunk.text);
              }
            } else if (chunk.type === 'error') {
              removeTypingIndicator();
              appendErrorMessage(chunk.error);
            } else if (chunk.type === 'content') {
              typingQueue += chunk.text;
              if (!isTyping) {
                isTyping = true;
                typeWriter();
              }
            }
          }
        }
      }

      if (buffer.trim()) {
        var finalChunk = parseSseChunk(buffer.trim());
        if (finalChunk && finalChunk.type === 'content') {
          typingQueue += finalChunk.text;
          if (!isTyping) { isTyping = true; typeWriter(); }
        }
      }
      
      while (typingQueue.length > 0 || isTyping) {
        await new Promise(r => setTimeout(r, 30));
      }
      
    } catch (streamErr) {
      console.error('Stream read error:', streamErr);
    }

    var duration = nowMs() - streamData.startTime;
    var parsedEnd = extractButtons(fullText);

    if (created) {
      created.meta.innerHTML = formatTimestamp(Date.now());
      var dur = document.createElement('span');
      dur.className = 'meta-duration';
      dur.textContent = '⏱ ' + formatDuration(duration);
      created.meta.appendChild(dur);

      // Final render untuk memastikan tombol terpasang sempurna
      if (parsedEnd.buttons && parsedEnd.buttons.length > 0) {
        renderInlineButtons(created.body, parsedEnd.buttons, false);
      }
    }

    return {
      text: parsedEnd.clean,
      buttons: parsedEnd.buttons
    };
  }

  async function sendMessage(text) {
    var clean = String(text || '').trim();
    if (!clean || isBusy) return;

    if (clean.length > MAX_INPUT) {
      if (window.Utils && Utils.showToast) Utils.showToast('Pesan maksimal ' + MAX_INPUT + ' karakter.', 'warning');
      return;
    }

    hideQuickReplies();
    isBusy = true;
    setInputDisabled(true);

    var startTime = nowMs();

    appendUserMessage(clean);
    chatHistory.push({ role: 'user', content: clean });

    var inputEl = $('ai-input');
    if (inputEl) {
      inputEl.value = '';
      inputEl.style.height = 'auto';
      updateCharCount();
    }

    showTypingIndicator();

    try {
      var streamResult = await streamFromBackend(clean, startTime);

      if (streamResult.type === 'json') {
        removeTypingIndicator();
        appendBotMessage(streamResult.reply, streamResult.buttons, streamResult.durationMs, startTime);
        chatHistory.push({ role: 'assistant', content: streamResult.reply });
      } else {
        var consumed = await consumeStream(streamResult);
        if (consumed.text) {
          chatHistory.push({ role: 'assistant', content: consumed.text });
        }
      }
    } catch (err) {
      removeTypingIndicator();
      var msg = err.message || 'Gagal menghubungi Sigit AI.';
      if (err.status === 429) {
        msg = 'Terlalu banyak pesan. Tunggu 1 menit lagi ya.';
      } else if (err.status === 503) {
        msg = 'Sigit AI sedang tidak tersedia. Coba lagi nanti atau hubungi @sigitchan.';
      }
      appendErrorMessage(msg);
    } finally {
      isBusy = false;
      setInputDisabled(false);
      var inputFocus = $('ai-input');
      if (inputFocus && isOpen) inputFocus.focus();
      scrollToBottom();
    }
  }

  function setInputDisabled(disabled) {
    var input = $('ai-input');
    var btn = $('ai-send-btn');
    if (input) input.disabled = disabled;
    if (btn) btn.disabled = disabled;

    var quickBtns = document.querySelectorAll('.ai-quick-btn, .ai-inline-btn');
    for (var i = 0; i < quickBtns.length; i++) {
      quickBtns[i].disabled = disabled;
    }
  }

  function updateCharCount() {
    var input = $('ai-input');
    var count = $('ai-char-count');
    if (!input || !count) return;
    var len = input.value.length;
    count.textContent = len + '/' + MAX_INPUT;
    count.classList.remove('warn', 'danger');
    if (len >= MAX_INPUT) count.classList.add('danger');
    else if (len >= MAX_INPUT - 30) count.classList.add('warn');
  }

  function startPlaceholderAnimation() {
    var input = $('ai-input');
    if (!input) return;
    if (placeholderTimer) clearInterval(placeholderTimer);
    placeholderIdx = 0;
    input.placeholder = PLACEHOLDERS[0];
    placeholderTimer = setInterval(function () {
      placeholderIdx = (placeholderIdx + 1) % PLACEHOLDERS.length;
      if (!input.value) input.placeholder = PLACEHOLDERS[placeholderIdx];
    }, 700);
  }

  function showWelcome() {
    if (hasWelcomed) return;
    hasWelcomed = true;

    var displayName = 'Teman';
    if (window.Dashboard && Dashboard.user && Dashboard.user.display_name) {
      displayName = Dashboard.user.display_name.split(' ')[0];
    }

    var welcome = 'Halo **' + displayName + '**! Aku **Sigit AI**, asisten platform Sigit TempMail. Aku bisa bantu soal **TempMail**, **Subdomain**, **Poin**, dan **Akun**. Mau mulai dari mana?';
    var buttons = ['Cara bikin mailbox', 'Cara bikin subdomain', 'Cara topup poin'];

    appendBotMessage(welcome, buttons, 0);
    showQuickReplies(buttons);
  }

  function openPanel() {
    var panel = $('ai-panel');
    var launcher = $('ai-launcher');
    if (!panel || !launcher) return;
    panel.classList.add('is-open');
    launcher.classList.add('is-open');
    isOpen = true;
    scrollToBottom();
    setTimeout(function () {
      if (!hasWelcomed) showWelcome();
      var input = $('ai-input');
      if (input) input.focus();
    }, 250);
  }

  function closePanel() {
    var panel = $('ai-panel');
    var launcher = $('ai-launcher');
    if (!panel || !launcher) return;
    panel.classList.remove('is-open');
    launcher.classList.remove('is-open');
    isOpen = false;
  }

  function togglePanel() {
    if (isOpen) closePanel();
    else openPanel();
  }

  function bindEvents() {
    var launcher = $('ai-launcher');
    var closeBtn = $('ai-close-btn');
    var form = $('ai-input-form');
    var input = $('ai-input');

    if (launcher) launcher.addEventListener('click', togglePanel);
    if (closeBtn) closeBtn.addEventListener('click', closePanel);

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        sendMessage(input ? input.value : '');
      });
    }

    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage(input.value);
        }
      });

      input.addEventListener('input', function () {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 100) + 'px';
        updateCharCount();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) closePanel();
    });
  }

  function init() {
    bindEvents();
    startPlaceholderAnimation();

    if (window.lucide) window.lucide.createIcons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.SigitAI = {
    open: openPanel,
    close: closePanel,
    toggle: togglePanel,
    send: sendMessage,
    reset: function () {
      chatHistory = [];
      hasWelcomed = false;
      var el = $('ai-messages');
      if (el) el.innerHTML = '';
    }
  };
})();
