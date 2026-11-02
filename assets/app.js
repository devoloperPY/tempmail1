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
  if (window.lucide) {
    window.lucide.createIcons();
  }

  function showMaintenanceOverlay(message) {
    if (document.getElementById('maintenance-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'maintenance-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#f4f7f9;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center;font-family:Inter,sans-serif;flex-direction:column;';
    
    overlay.innerHTML = `
      <div style="background:#ffffff;padding:40px 30px;border-radius:20px;box-shadow:0 10px 40px rgba(0,0,0,0.08);max-width:400px;width:100%;border:1px solid #e2e8f0;">
        <div style="width:64px;height:64px;background:#fef2f2;color:#ef4444;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        </div>
        <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 10px 0;">Server Maintenance</h2>
        <p style="font-size:13px;color:#64748b;line-height:1.6;margin:0 0 24px 0;">${Utils.escapeHtml(message || 'Sistem sedang dimatikan sementara untuk pemeliharaan. Silakan coba lagi nanti.')}</p>
        <button onclick="window.location.reload()" style="background:#1e293b;color:#ffffff;border:none;padding:12px 24px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;width:100%;">Coba Lagi</button>
      </div>
    `;
    
    document.body.appendChild(overlay);
  }

  window.addEventListener('maintenance-active', function (e) {
    const msg = (e.detail && e.detail.message) ? e.detail.message : '';
    showMaintenanceOverlay(msg);
  });

  try {
    const res = await apiFetch('/api/web/stats', { skipAuthRedirect: true });
    const d = res?.data;

    if (d) {
      if (d.enabled === false || d.maintenance === true) {
        showMaintenanceOverlay(d.banner || 'Sistem sedang dalam perbaikan.');
      }

      const format = (n) => Number(n || 0).toLocaleString('id-ID');
      
      if (document.getElementById('stat-total-users')) {
        document.getElementById('stat-total-users').textContent = format(d.total_visitors);
      }
      if (document.getElementById('stat-active-mailboxes')) {
        document.getElementById('stat-active-mailboxes').textContent = format(d.active_mailboxes);
      }
      if (document.getElementById('stat-total-messages')) {
        document.getElementById('stat-total-messages').textContent = format(d.total_messages);
      }
    }
  } catch (e) {}

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
      } else {
        entry.target.classList.remove('active');
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

  const tosModal = document.getElementById('tos-modal');
  const tosContent = document.getElementById('tos-modal-content');
  const btnOpenTos = document.getElementById('btn-open-tos');
  const btnCloseTos = document.getElementById('btn-close-tos');
  const btnCloseTosFooter = document.getElementById('btn-close-tos-footer');

  function openTos() {
    if (!tosModal) return;
    tosModal.classList.remove('hidden');
    setTimeout(() => {
      tosModal.classList.remove('opacity-0');
      if (tosContent) {
        tosContent.classList.remove('scale-95');
        tosContent.classList.add('scale-100');
      }
    }, 10);
  }

  function closeTos() {
    if (!tosModal) return;
    tosModal.classList.add('opacity-0');
    if (tosContent) {
      tosContent.classList.remove('scale-100');
      tosContent.classList.add('scale-95');
    }
    setTimeout(() => {
      tosModal.classList.add('hidden');
    }, 300);
  }

  if (btnOpenTos) btnOpenTos.addEventListener('click', openTos);
  if (btnCloseTos) btnCloseTos.addEventListener('click', closeTos);
  if (btnCloseTosFooter) btnCloseTosFooter.addEventListener('click', closeTos);
  
  if (tosModal) {
    tosModal.addEventListener('click', (e) => {
      if (e.target === tosModal) closeTos();
    });
  }
});
