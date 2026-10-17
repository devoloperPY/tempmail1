const Utils = {
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  toMillis(input) {
    if (input === null || input === undefined || input === '') return null;
    if (typeof input === 'number') {
      return input > 1e12 ? input : input * 1000;
    }
    const asNum = Number(input);
    if (!isNaN(asNum) && String(input).match(/^\d+$/)) {
      return asNum > 1e12 ? asNum : asNum * 1000;
    }
    const parsed = new Date(input).getTime();
    return isNaN(parsed) ? null : parsed;
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const ms = this.toMillis(dateStr);
    if (!ms) return '-';
    const d = new Date(ms);
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  formatRelative(dateStr) {
    if (!dateStr) return '-';
    const ms = this.toMillis(dateStr);
    if (!ms) return '-';
    const diffSec = Math.floor((Date.now() - ms) / 1000);

    if (diffSec < 0) {
      const absSec = Math.abs(diffSec);
      if (absSec < 60) return `dalam ${absSec} dtk`;
      if (absSec < 3600) return `dalam ${Math.floor(absSec / 60)} mnt`;
      if (absSec < 86400) {
        const h = Math.floor(absSec / 3600);
        const m = Math.floor((absSec % 3600) / 60);
        return `dalam ${h} jam ${m} mnt`;
      }
      const d = Math.floor(absSec / 86400);
      const h = Math.floor((absSec % 86400) / 3600);
      return `dalam ${d} hari ${h} jam`;
    }

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

  countdown(targetOrSeconds, onTick, onExpire) {
    let endTime;
    if (typeof targetOrSeconds === 'number' && targetOrSeconds < 1e10) {
      endTime = Date.now() + targetOrSeconds * 1000;
    } else if (typeof targetOrSeconds === 'number') {
      endTime = targetOrSeconds;
    } else {
      const ms = this.toMillis(targetOrSeconds);
      endTime = ms || Date.now();
    }

    let isRunning = true;
    let lastSecond = -1;
    let animationId;

    const compute = () => {
      if (!isRunning) return;
      
      const now = Date.now();
      const remainingSeconds = Math.max(0, Math.floor((endTime - now) / 1000));

      if (remainingSeconds !== lastSecond) {
        lastSecond = remainingSeconds;
        
        const days = Math.floor(remainingSeconds / 86400);
        const hours = Math.floor((remainingSeconds % 86400) / 3600);
        const mins = Math.floor((remainingSeconds % 3600) / 60);
        const secs = remainingSeconds % 60;

        let formatted = '';

        if (remainingSeconds < 60) {
          formatted = `${String(secs).padStart(2, '0')} dtk`;
        } else if (days > 0) {
          formatted = `${days} hari ${hours} jam`;
        } else if (hours > 0) {
          formatted = `${hours} jam ${mins} mnt`;
        } else {
          formatted = `${mins} mnt`;
        }

        if (typeof onTick === 'function') {
          onTick({ formatted, remainingSeconds });
        }

        if (remainingSeconds <= 0) {
          isRunning = false;
          if (typeof onExpire === 'function') onExpire();
          return;
        }
      }

      animationId = requestAnimationFrame(compute);
    };

    compute();

    return {
      stop: () => {
        isRunning = false;
        cancelAnimationFrame(animationId);
      }
    };
  },

  async copyToClipboard(text, successMsg = 'Berhasil disalin ke clipboard!') {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      this.showToast(successMsg, 'success');
      return true;
    } catch (err) {
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

  hideLoading() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.classList.add('hidden');
  },

  validateEmail(email) {
    const clean = String(email || '').trim().toLowerCase();
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(clean)) {
      return { valid: false, reason: 'Format alamat email tidak valid.' };
    }
    return { valid: true, email: clean };
  },

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
window.validatePassword = Utils.validatePassword.bind(Utils);