# 📧 Sigit TempMail — Web Frontend

Frontend statis modern bergaya **White-Blue Glassmorphism** untuk layanan email sementara **Sigit TempMail** (`https://tempmail.sigitc.my.id`). Terhubung langsung dengan backend Cloudflare Worker + D1 Database.

## ✨ Fitur Utama
- **Instant TempMail (IP-Based):** Buat email sementara gratis dengan opsi custom prefix, timer countdown real-time, dan auto-refresh inbox setiap 5 detik.
- **Autentikasi Lengkap + OTP:** Pendaftaran khusus email terpercaya (Gmail, Outlook, Yahoo, iCloud) dengan verifikasi 6 digit OTP dan proteksi Cloudflare Turnstile.
- **Dashboard User Modern:** Kelola banyak mailbox aktif, baca pesan langsung dari dashboard, pantau kuota harian, cabut sesi perangkat aktif, dan lihat riwayat login.
- **Desain Glassmorphism:** Efek kaca transparan (`backdrop-filter: blur`), animasi halus, skeleton loader, toast notification, dan slot banner sponsor yang bersih.

## 🚀 Cara Deploy ke Vercel
1. Pastikan seluruh 12 file berada di dalam folder `tempmail-web/` sesuai struktur.
2. Buka [vercel.com/new](https://vercel.com/new) lalu *drag & drop* atau hubungkan repositori GitHub.
3. Tambahkan custom domain `tempmail.sigitc.my.id` di menu **Settings → Domains**.
4. Arahkan CNAME `tempmail` di Cloudflare DNS ke target Vercel dengan status **Proxy OFF (Grey Cloud)**.
