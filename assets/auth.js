document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) window.lucide.createIcons();

  window.turnstileToken = '';

  window.onTurnstileSuccess = function(token) {
    window.turnstileToken = token;
  };

  window.onTurnstileError = function(errorCode) {
    console.error('Turnstile Error:', errorCode);
    window.turnstileToken = '';
  };

  window.onTurnstileExpired = function() {
    window.turnstileToken = '';
  };

  function getPostLoginRedirect(user) {
    if (!user) return 'dashboard.html';
    if (user.role === 'admin' || user.role === 'owner') return 'admin.html';
    return 'dashboard.html';
  }

  function currentPage() {
    var p = window.location.pathname.split('/').pop() || '';
    if (!p || p === '/' || p === 'index.html') return 'index';
    return p.replace('.html', '');
  }

  var page = currentPage();

  if (page === 'login' || page === 'register') {
    if (isLoggedIn()) {
      apiFetch('/api/web/auth/me', { skipAuthRedirect: true })
        .then(function(res) {
          if (res && res.success && res.data && res.data.user) {
            var user = res.data.user;
            setToken(getToken(), user);
            var dest = getPostLoginRedirect(user);
            if (page === 'login') {
              window.location.replace(dest);
            }
          }
        })
        .catch(function() { clearToken(); });
    }
  }

  const errorBox = document.getElementById('auth-error-box');
  function showAuthError(msg) {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
  }
  function clearAuthError() {
    if (!errorBox) return;
    errorBox.classList.add('hidden');
  }

  function setupPasswordToggle(btnId, inputId) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  }

  setupPasswordToggle('toggle-login-pwd', 'login-password');
  setupPasswordToggle('toggle-reg-pwd', 'reg-password');

  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    const regEmail = document.getElementById('reg-email');
    const regPassword = document.getElementById('reg-password');
    const emailFeedback = document.getElementById('email-check-feedback');

    regEmail.addEventListener('blur', async () => {
      const val = regEmail.value.trim();
      if (!val || !val.includes('@')) return;
      try {
        const res = await apiFetch(`/api/web/auth/check-email/${encodeURIComponent(val)}`, {
          skipAuthRedirect: true
        });
        const d = res?.data;
        if (!d) return;
        emailFeedback.classList.remove('hidden');
        if (!d.email_valid) {
          emailFeedback.className = 'text-[11px] mt-1 text-red-600 font-medium';
          emailFeedback.textContent = d.reason || 'Email tidak didukung. Gunakan Gmail, Yahoo, Outlook, atau iCloud.';
        } else if (d.registered) {
          emailFeedback.className = 'text-[11px] mt-1 text-amber-600 font-medium';
          emailFeedback.textContent = 'Email ini sudah terdaftar. Silakan gunakan halaman Login.';
        } else {
          emailFeedback.className = 'text-[11px] mt-1 text-emerald-600 font-medium';
          emailFeedback.textContent = '✓ Email provider terpercaya & tersedia.';
        }
      } catch (e) {}
    });

    regPassword.addEventListener('input', () => {
      const { checks } = Utils.validatePassword(regPassword.value);
      const setItem = (id, ok, text) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.className = ok ? 'flex items-center gap-1 text-emerald-600 font-semibold' : 'flex items-center gap-1 text-slate-400';
        el.innerHTML = `<span>${ok ? '✓' : '○'}</span> ${text}`;
      };
      setItem('chk-length', checks.length, 'Min. 8 karakter');
      setItem('chk-upper', checks.upper, 'Huruf besar (A-Z)');
      setItem('chk-lower', checks.lower, 'Huruf kecil (a-z)');
      setItem('chk-number', checks.number, 'Angka (0-9)');
    });

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAuthError();

      if (!window.turnstileToken) {
        showAuthError('Harap selesaikan verifikasi captcha terlebih dahulu.');
        return;
      }

      const displayName = document.getElementById('reg-name').value.trim();
      const email = regEmail.value.trim().toLowerCase();
      const password = regPassword.value;

      const emailValidation = Utils.validateEmail(email);
      if (!emailValidation.valid) {
        showAuthError(emailValidation.reason);
        return;
      }

      const pwdValidation = Utils.validatePassword(password);
      if (!pwdValidation.valid) {
        showAuthError('Password wajib minimal 8 karakter dan mengandung huruf besar, huruf kecil, serta angka.');
        return;
      }

      Utils.showLoading('Mendaftarkan akun & mengirim OTP...');
      try {
        const res = await apiFetch('/api/web/auth/register', {
          method: 'POST',
          body: {
            email,
            password,
            display_name: displayName || undefined,
            turnstile_token: window.turnstileToken
          },
          skipAuthRedirect: true
        });

        sessionStorage.setItem(STORAGE_KEYS.PENDING_EMAIL, email);
        Utils.showToast('Kode OTP telah dikirim ke email Anda!', 'success');

        setTimeout(() => {
          window.location.href = `verify.html?email=${encodeURIComponent(email)}`;
        }, 800);
      } catch (err) {
        showAuthError(err.message || 'Pendaftaran gagal.');
        if (window.turnstile) window.turnstile.reset();
        window.turnstileToken = '';
      } finally {
        Utils.hideLoading();
      }
    });
  }

  const verifyForm = document.getElementById('verify-form');
  if (verifyForm) {
    const params = new URLSearchParams(window.location.search);
    const email = (params.get('email') || sessionStorage.getItem(STORAGE_KEYS.PENDING_EMAIL) || '').trim();
    const emailDisplay = document.getElementById('verify-email-display');
    const otpInput = document.getElementById('otp-input');
    const otpCountdown = document.getElementById('otp-countdown');
    const btnResend = document.getElementById('btn-resend-otp');
    const btnVerify = document.getElementById('btn-verify-submit');

    if (!email) {
      window.location.href = 'register.html';
      return;
    }

    emailDisplay.textContent = email;
    sessionStorage.setItem(STORAGE_KEYS.PENDING_EMAIL, email);

    let otpTimer = Utils.countdown(
      600,
      ({ formatted }) => {
        otpCountdown.textContent = formatted;
      },
      () => {
        otpCountdown.textContent = 'Expired';
        Utils.showToast('Kode OTP telah kadaluarsa. Silakan klik Kirim Ulang OTP.', 'warning');
      }
    );

    otpInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });

    verifyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAuthError();

      const otpCode = otpInput.value.trim();
      if (!/^\d{6}$/.test(otpCode)) {
        showAuthError('Masukkan 6 digit angka kode OTP dengan benar.');
        return;
      }

      Utils.showLoading('Memverifikasi kode OTP...');
      try {
        const res = await apiFetch('/api/web/auth/verify-otp', {
          method: 'POST',
          body: { email, otp_code: otpCode },
          skipAuthRedirect: true
        });

        const { token, user } = res.data;
        setToken(token, user);
        sessionStorage.removeItem(STORAGE_KEYS.PENDING_EMAIL);
        Utils.showToast('Verifikasi berhasil! Mengalihkan...', 'success');

        setTimeout(() => {
          window.location.href = getPostLoginRedirect(user);
        }, 800);
      } catch (err) {
        const msg = err.message || 'Kode OTP salah atau kadaluarsa.';
        showAuthError(msg);
        if (err.status === 429 || msg.toLowerCase().includes('terlalu banyak') || msg.toLowerCase().includes('too many')) {
          otpInput.disabled = true;
          btnVerify.disabled = true;
        }
      } finally {
        Utils.hideLoading();
      }
    });

    btnResend.addEventListener('click', async () => {
      clearAuthError();
      Utils.showLoading('Mengirim ulang kode OTP...');
      try {
        const res = await apiFetch('/api/web/auth/resend-otp', {
          method: 'POST',
          body: { email },
          skipAuthRedirect: true
        });
        Utils.showToast(res.message || 'Kode OTP baru telah dikirim ke email Anda.', 'success');
        otpInput.disabled = false;
        btnVerify.disabled = false;
        otpInput.value = '';
        if (otpTimer) otpTimer.stop();
        otpTimer = Utils.countdown(600, ({ formatted }) => {
          otpCountdown.textContent = formatted;
        });
      } catch (err) {
        showAuthError(err.message || 'Gagal mengirim ulang OTP.');
      } finally {
        Utils.hideLoading();
      }
    });
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAuthError();

      if (!window.turnstileToken) {
        showAuthError('Harap selesaikan verifikasi captcha terlebih dahulu.');
        return;
      }

      const email = document.getElementById('login-email').value.trim().toLowerCase();
      const password = document.getElementById('login-password').value;

      if (!email || !password) {
        showAuthError('Harap isi email dan password Anda.');
        return;
      }

      Utils.showLoading('Memverifikasi kredensial login...');
      try {
        const res = await apiFetch('/api/web/auth/login', {
          method: 'POST',
          body: {
            email,
            password,
            turnstile_token: window.turnstileToken
          },
          skipAuthRedirect: true
        });

        const { token, user } = res.data;
        setToken(token, user);

        var dest = getPostLoginRedirect(user);
        Utils.showToast('Login berhasil! Mengalihkan...', 'success');

        setTimeout(() => {
          window.location.replace(dest);
        }, 600);
      } catch (err) {
        const msg = err.message || 'Email atau password salah.';
        showAuthError(msg);

        if (window.turnstile) window.turnstile.reset();
        window.turnstileToken = '';

        if (msg.toLowerCase().includes('verif') || msg.toLowerCase().includes('otp') || msg.toLowerCase().includes('belum diverifikasi')) {
          sessionStorage.setItem(STORAGE_KEYS.PENDING_EMAIL, email);
          Utils.showToast('Akun belum diverifikasi. Mengalihkan ke halaman OTP...', 'warning');
          setTimeout(() => {
            window.location.href = `verify.html?email=${encodeURIComponent(email)}`;
          }, 1200);
        }
      } finally {
        Utils.hideLoading();
      }
    });
  }

  // =================== FORGOT PASSWORD ===================
  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    const errBox = document.getElementById('auth-error-box');
    const okBox = document.getElementById('auth-success-box');
    const btnSubmit = document.getElementById('btn-forgot-submit');

    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errBox) errBox.classList.add('hidden');
      if (okBox) okBox.classList.add('hidden');

      if (!window.turnstileToken) {
        if (errBox) {
          errBox.textContent = 'Harap selesaikan captcha terlebih dahulu.';
          errBox.classList.remove('hidden');
        }
        return;
      }

      const email = document.getElementById('forgot-email').value.trim().toLowerCase();
      if (!email) return;

      if (btnSubmit) btnSubmit.disabled = true;
      Utils.showLoading('Mengirim kode reset...');
      try {
        const res = await apiFetch('/api/web/auth/forgot-password', {
          method: 'POST',
          body: { email, turnstile_token: window.turnstileToken },
          skipAuthRedirect: true
        });

        sessionStorage.setItem('reset_email', email);
        if (okBox) {
          okBox.textContent = res.message || 'Kode reset telah dikirim ke email kamu.';
          okBox.classList.remove('hidden');
        }
        Utils.showToast('Kode reset dikirim!', 'success');

        setTimeout(() => {
          window.location.href = `reset-password.html?email=${encodeURIComponent(email)}`;
        }, 1200);
      } catch (err) {
        if (errBox) {
          errBox.textContent = err.message || 'Gagal mengirim kode reset.';
          errBox.classList.remove('hidden');
        }
        if (window.turnstile) window.turnstile.reset();
        window.turnstileToken = '';
        if (btnSubmit) btnSubmit.disabled = false;
      } finally {
        Utils.hideLoading();
      }
    });
  }

  // =================== RESET PASSWORD ===================
  const resetForm = document.getElementById('reset-form');
  if (resetForm) {
    const params = new URLSearchParams(window.location.search);
    const email = (params.get('email') || sessionStorage.getItem('reset_email') || '').trim();
    const emailDisplay = document.getElementById('reset-email-display');
    const otpInput = document.getElementById('reset-otp');
    const newPwd = document.getElementById('reset-new-password');
    const countdownEl = document.getElementById('reset-countdown');
    const togglePwd = document.getElementById('toggle-reset-pwd');
    const btnSubmit = document.getElementById('btn-reset-submit');
    const errBox = document.getElementById('auth-error-box');
    const okBox = document.getElementById('auth-success-box');

    if (!email) {
      window.location.href = 'forgot-password.html';
      return;
    }

    if (emailDisplay) emailDisplay.textContent = email;
    sessionStorage.setItem('reset_email', email);

    Utils.countdown(600, ({ formatted }) => {
      if (countdownEl) countdownEl.textContent = formatted;
    });

    if (otpInput) {
      otpInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
      });
    }

    if (newPwd) {
      newPwd.addEventListener('input', () => {
        const { checks } = Utils.validatePassword(newPwd.value);
        const setItem = (id, ok, text) => {
          const el = document.getElementById(id);
          if (!el) return;
          el.className = ok
            ? 'flex items-center gap-1 text-emerald-600 font-semibold'
            : 'flex items-center gap-1 text-slate-400';
          el.innerHTML = `<span>${ok ? '✓' : '○'}</span> ${text}`;
        };
        setItem('rchk-length', checks.length, 'Min. 8 karakter');
        setItem('rchk-upper', checks.upper, 'Huruf besar (A-Z)');
        setItem('rchk-lower', checks.lower, 'Huruf kecil (a-z)');
        setItem('rchk-number', checks.number, 'Angka (0-9)');
      });
    }

    if (togglePwd && newPwd) {
      togglePwd.addEventListener('click', () => {
        newPwd.type = newPwd.type === 'password' ? 'text' : 'password';
      });
    }

    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errBox) errBox.classList.add('hidden');
      if (okBox) okBox.classList.add('hidden');

      const otpCode = otpInput.value.trim();
      const password = newPwd.value;

      if (!/^\d{6}$/.test(otpCode)) {
        if (errBox) {
          errBox.textContent = 'Masukkan 6 digit kode OTP dengan benar.';
          errBox.classList.remove('hidden');
        }
        return;
      }

      const pwdValidation = Utils.validatePassword(password);
      if (!pwdValidation.valid) {
        if (errBox) {
          errBox.textContent = 'Password minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka.';
          errBox.classList.remove('hidden');
        }
        return;
      }

      if (btnSubmit) btnSubmit.disabled = true;
      Utils.showLoading('Mereset password...');
      try {
        const res = await apiFetch('/api/web/auth/reset-password', {
          method: 'POST',
          body: {
            email,
            otp_code: otpCode,
            new_password: password
          },
          skipAuthRedirect: true
        });

        if (okBox) {
          okBox.textContent = res.message || 'Password berhasil direset.';
          okBox.classList.remove('hidden');
        }
        sessionStorage.removeItem('reset_email');
        Utils.showToast('Password direset! Silakan login.', 'success');

        setTimeout(() => {
          window.location.href = 'login.html';
        }, 1800);
      } catch (err) {
        if (errBox) {
          errBox.textContent = err.message || 'Gagal reset password.';
          errBox.classList.remove('hidden');
        }
        if (btnSubmit) btnSubmit.disabled = false;
      } finally {
        Utils.hideLoading();
      }
    });
  }
});
