/**
 * Sigit TempMail - Utility Helpers
 */

const Utils = {
  /**
   * Escape HTML untuk mencegah XSS
   */
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Format tanggal lengkap (contoh: 15 Okt 2026, 14:30)
   */
  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  /**
   * Format waktu relatif (contoh: "Baru saja", "3 menit lalu")
   */
  formatRelative(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);

    if (diffSec < 15) return 'Baru saja';
    if (diffSec < 60) return `${diffSec} dtk lalu`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} mnt lalu`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} jam lalu`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay} hari lalu`;
    return this.formatDate(dateStr);
  },

  /**
   * Countdown helper: mengembalikan instance interval yang bisa di-stop
   * @param {string|number} targetOrSeconds - ISO timestamp atau jumlah detik
   * @param {Function} onTick - callback({ formatted, remainingSeconds })
   * @param {Function} onExpire - callback saat waktu habis
   */
  countdown(targetOrSeconds, onTick, onExpire) {
    let endTime;
    if (typeof targetOrSeconds === 'number') {
      endTime = Date.now() + targetOrSeconds * 1000;
    } else {
      endTime = new Date(targetOrSeconds).getTime();
    }

    const compute = () => {
      const remainingSeconds = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      const mins = Math.floor(remainingSeconds / 60);
      const secs = remainingSeconds % 60;
      const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      if (typeof onTick === 'function') {
        onTick({ formatted, remainingSeconds });
      }
      if (remainingSeconds <= 0) {
        clearInterval(timerId);
        if (typeof onExpire === 'function') onExpire();
      }
    };

    const timerId = setInterval(compute, 1000);
    compute();

    return {
      stop: () => clearInterval(timerId)
    };
  },

  /**
   * Copy teks ke clipboard + otomatis tampilkan Toast
   */
  async copyToClipboard(text, successMsg = 'Berhasil disalin ke clipboard!') {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      this.showToast(successMsg, 'success');
      return true;
    } catch (err) {
      // Fallback untuk browser lama
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        this.showToast(successMsg, 'success');
        return true;
      } catch (e) {
        this.showToast('Gagal menyalin teks', 'error');
        return false;
      } finally {
        document.body.removeChild(textarea);
      }
    }
  },

  /**
   * Tampilkan Toast Notification
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} type
   */
  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const styles = {
      success: {
        border: 'border-l-4 border-emerald-500',
        badge: 'bg-emerald-100 text-emerald-600',
        title: 'Berhasil'
      },
      error: {
        border: 'border-l-4 border-red-500',
        badge: 'bg-red-100 text-red-600',
        title: 'Error'
      },
      warning: {
        border: 'border-l-4 border-amber-500',
        badge: 'bg-amber-100 text-amber-600',
        title: 'Perhatian'
      },
      info: {
        border: 'border-l-4 border-blue-600',
        badge: 'bg-blue-100 text-blue-600',
        title: 'Info'
      }
    };

    const st = styles[type] || styles.info;
    const toast = document.createElement('div');
    toast.className = `toast-item p-4 flex items-start gap-3 ${st.border}`;
    toast.innerHTML = `
      <div class="w-7 h-7 rounded-lg ${st.badge} flex items-center justify-center shrink-0 font-bold text-xs">
        ${type === 'success' ? '✓' : type === 'error' ? '✕' : '!'}
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-xs font-bold text-slate-800">${st.title}</p>
        <p class="text-xs text-slate-600 mt-0.5 break-words">${this.escapeHtml(message)}</p>
      </div>
      <button class="text-slate-400 hover:text-slate-600 text-sm font-bold px-1" aria-label="Close">&times;</button>
    `;

    toast.querySelector('button').addEventListener('click', () => toast.remove());
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'all 0.2s ease';
        setTimeout(() => toast.remove(), 200);
      }
    }, 4200);
  },

  /**
   * Tampilkan Global Loading Overlay
   */
  showLoading(text = 'Memproses permintaan...') {
    let loader = document.getElementById('global-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'global-loader';
      loader.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
      loader.innerHTML = `
        <div class="glass-card rounded-2xl p-6 flex flex-col items-center gap-3 max-w-xs w-full text-center">
          <div class="spinner"></div>
          <p id="global-loader-text" class="text-sm font-medium text-slate-700"></p>
        </div>
      `;
      document.body.appendChild(loader);
    }
    const label = document.getElementById('global-loader-text');
    if (label) label.textContent = text;
    loader.classList.remove('hidden');
  },

  /**
   * Sembunyikan Global Loading Overlay
   */
  hideLoading() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.classList.add('hidden');
  },

  /**
   * Validasi format email & provider terpercaya
   */
  validateEmail(email) {
    const clean = String(email || '').trim().toLowerCase();
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(clean)) {
      return { valid: false, reason: 'Format alamat email tidak valid.' };
    }
    return { valid: true, email: clean };
  },

  /**
   * Validasi kekuatan password (min 8 karakter, huruf besar, huruf kecil, angka)
   */
  validatePassword(password) {
    const pwd = String(password || '');
    const checks = {
      length: pwd.length >= 8,
      upper: /[A-Z]/.test(pwd),
      lower: /[a-z]/.test(pwd),
      number: /[0-9]/.test(pwd)
    };
    const valid = checks.length && checks.upper && checks.lower && checks.number;
    return { valid, checks };
  }
};

window.Utils = Utils;
window.formatDate = Utils.formatDate.bind(Utils);
window.formatRelative = Utils.formatRelative.bind(Utils);
window.countdown = Utils.countdown.bind(Utils);
window.copyToClipboard = Utils.copyToClipboard.bind(Utils);
window.escapeHtml = Utils.escapeHtml.bind(Utils);
window.showToast = Utils.showToast.bind(Utils);
window.showLoading = Utils.showLoading.bind(Utils);
window.hideLoading = Utils.hideLoading.bind(Utils);
window.validateEmail = Utils.validateEmail.bind(Utils);
