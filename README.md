# RED/API

Portal Next.js untuk dokumentasi, playground, akun, dan admin. Node Express berada di `backend/` dan memakai Supabase untuk autentikasi API key, kuota, dan log.

## Menjalankan lokal

Salin `.env.example` ke `.env.local` dan `backend/.env.example` ke `backend/.env`. Isi URL Supabase dan publishable key pada frontend. Masukkan kredensial Supabase berhak tinggi hanya di environment backend. Tambahkan `http://localhost:3000/auth/callback` ke daftar redirect Supabase Auth jika menguji Google OAuth secara lokal.

```sh
npm ci
npm ci --prefix backend
npm run start --prefix backend
# Terminal lain
npm run dev
```

## Rollout

1. Siapkan `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable atau legacy anon), dan `API_BACKEND_URL` pada deployment Next.js. Gunakan origin HTTPS untuk node remote. Konfigurasi node Express memakai Node.js 22+, `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`. Masukkan URL callback produksi ke Supabase Auth.
2. Untuk database baru, jalankan `supabase/schema.sql` dulu. Untuk database yang sudah ada, jalankan `supabase/migrations/20261108000000_harden_api.sql` pada Supabase SQL Editor sebelum mengaktifkan node baru. Migrasi menjaga kompatibilitas RPC kuota dengan node lama.
3. Deploy direktori `backend/` ke node dan jalankan `npm ci --omit=dev` lalu `node index.js`. Build dan deploy frontend dengan `npm ci` dan `npm run build`.
4. Cabut kredensial Supabase lama yang terekspos setelah kredensial pengganti terpasang. Tinjau log Supabase dan rotasi API key pengguna yang terpapar.

Kuota dihitung menurut tanggal Asia/Jakarta saat request pertama pada hari baru. Untuk memperbarui saldo dashboard pada tengah malam sebelum request pertama, aktifkan Supabase Cron dan jadwalkan `SELECT public.reset_daily_limits();` pada pukul 17.00 UTC setiap hari (00.00 WIB).

Kirim API key melalui header `x-api-key`. Node masih menerima parameter `apikey` untuk klien lama. Endpoint AI, Instagram, Mobile Legends, dan WhatsApp mengembalikan data simulasi. TikTok dan screenshot bergantung pada layanan pihak ketiga.
