const API_BASE_URL = 'https://sigit-tunnel.sigit-temp-api-v1.workers.dev';

const STORAGE_KEYS = {
  TOKEN: 'session_token',
  USER: 'user_data',
  MAILBOX_ID: 'current_mailbox_id',
  PENDING_EMAIL: 'pending_email'
};

function getToken() { return localStorage.getItem(STORAGE_KEYS.TOKEN); }
function setToken(token, user = null) {
  if (token) localStorage.setItem(STORAGE_KEYS.TOKEN, token);
  if (user) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
}
function clearToken() {
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
}
function isLoggedIn() { return Boolean(getToken()); }
function getCurrentUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function showBannedModal(reason) {
  let modal = document.getElementById('banned-alert-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'banned-alert-modal';
    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="glass-card rounded-2xl p-6 max-w-md w-full border-t-4 border-red-500 text-center animate-fade-in bg-white">
      <div class="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4 font-bold text-2xl">!</div>
      <h3 class="text-lg font-bold text-slate-900">Akses Dibatasi (Banned)</h3>
      <p class="text-sm text-slate-600 mt-2">${Utils.escapeHtml(reason || 'Akun atau alamat IP Anda telah dibatasi.')}</p>
      <div class="mt-5 flex justify-center gap-3">
        <a href="https://t.me/sigitchan" target="_blank" rel="noopener" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Hubungi @sigitchan</a>
        <button onclick="document.getElementById('banned-alert-modal').remove()" class="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold">Tutup</button>
      </div>
    </div>
  `;
}

function showKillSwitchBanner(message) {
  const banner = document.getElementById('global-banner');
  
  // Kalau kita sedang di halaman login/register, pakai banner atas
  if (banner) {
    banner.innerHTML = `
      <div class="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium shadow-sm flex items-start gap-2.5">
        <i data-lucide="alert-triangle" class="w-4 h-4 shrink-0 mt-0.5"></i>
        <div>
          <strong class="block text-sm font-bold text-red-800 mb-0.5">Server Dinonaktifkan</strong>
          <span>${Utils.escapeHtml(message || 'Maaf, layanan sedang dimatikan sementara oleh Admin.')}</span>
        </div>
      </div>
    `;
    banner.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  } else {
    // Fallback jika di dashboard
    let wrap = document.getElementById('kill-switch-banner-top');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'kill-switch-banner-top';
      wrap.className = 'fixed top-0 left-0 right-0 z-[99999] bg-red-600 text-white text-center text-xs font-bold py-2 shadow-md';
      document.body.prepend(wrap);
    }
    wrap.innerText = message || 'Server sedang dinonaktifkan sementara.';
  }
}

async function apiFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const headers = { 'Accept': 'application/json', ...(options.headers || {}) };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const token = getToken();
  if (token && !headers['Authorization']) headers['Authorization'] = `Bearer ${token}`;

  try {
    const response = await fetch(url, { ...options, headers });

    let payload = null;
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      const text = await response.text();
      payload = { success: response.ok, error: text || response.statusText };
    }

    // KHUSUS 503, tampilkan banner di atas aja tanpa Toast/Error merah di form
    if (response.status === 503) {
      showKillSwitchBanner(payload?.error || 'Layanan sedang dinonaktifkan sementara.');
      
      const error = new Error('Server nonaktif');
      error.status = 503;
      error.data = payload;
      throw error;
    }

    if (!response.ok || (payload && payload.success === false)) {
      const errMsg = (payload && (payload.error || payload.message)) || `Terjadi kesalahan (${response.status})`;
      const isMeEndpoint = url.includes('/api/web/auth/me');

      if (response.status === 401) {
        if (!isMeEndpoint) clearToken();
        if (!options.skipAuthRedirect && !isMeEndpoint) {
          const path = window.location.pathname;
          if (!path.includes('login') && !path.includes('register')) {
            Utils.showToast('Sesi berakhir. Silakan login kembali.', 'warning');
            setTimeout(() => { window.location.href = 'login.html'; }, 900);
          }
        }
      } else if (response.status === 403) {
        if (errMsg.toLowerCase().includes('ban')) showBannedModal(errMsg);
        else Utils.showToast(errMsg, 'error');
      } else if (response.status === 429) {
        Utils.showToast(errMsg || 'Terlalu banyak permintaan.', 'warning');
      }

      const error = new Error(errMsg);
      error.status = response.status;
      error.data = payload;
      throw error;
    }

    return payload;
  } catch (err) {
    // Biar error 503 tidak muncul sebagai "Failed to fetch" di console
    if (err.status === 503 || err.message === 'Server nonaktif') {
      throw err;
    }
    
    if (!err.status) {
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        showKillSwitchBanner('Koneksi ke server terputus. Kemungkinan server sedang offline.');
      } else {
        err.message = err.message || 'Gagal terhubung ke server.';
      }
    }
    throw err;
  }
}

window.API_BASE_URL = API_BASE_URL;
window.STORAGE_KEYS = STORAGE_KEYS;
window.apiFetch = apiFetch;
window.getToken = getToken;
window.setToken = setToken;
window.clearToken = clearToken;
window.isLoggedIn = isLoggedIn;
window.getCurrentUser = getCurrentUser;
window.showKillSwitchBanner = showKillSwitchBanner;
