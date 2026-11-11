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
2. Untuk database baru, jalankan `supabase/schema.sql` dulu. Setelah itu, untuk database baru maupun yang sudah ada, jalankan seluruh file di `supabase/migrations/` sesuai urutan nama pada Supabase SQL Editor sebelum mengaktifkan node baru. Migrasi `20261108010000_fix_panel_access.sql` memperbaiki policy admin lama yang bisa rekursif, menolak endpoint yang hilang dari registry, dan menghindari konflik username saat pendaftaran. Migrasi menjaga kompatibilitas RPC kuota dengan node lama.
3. Deploy direktori `backend/` ke node dan jalankan `npm ci --omit=dev` lalu `node index.js`. Build dan deploy frontend dengan `npm ci` dan `npm run build`.
4. Cabut kredensial Supabase lama yang terekspos setelah kredensial pengganti terpasang. Tinjau log Supabase dan rotasi API key pengguna yang terpapar.

Kuota dihitung menurut tanggal Asia/Jakarta saat request pertama pada hari baru. Untuk memperbarui saldo dashboard pada tengah malam sebelum request pertama, aktifkan Supabase Cron dan jadwalkan `SELECT public.reset_daily_limits();` pada pukul 17.00 UTC setiap hari (00.00 WIB).

Kirim API key melalui header `x-api-key`. Node masih menerima parameter `apikey` untuk klien lama. Ketujuh endpoint beta (AI chat/GPT, TikTok, Instagram, Mobile Legends, SSWeb, WhatsApp Channel) telah dihapus dari backend dan seed database. Migrasi `20261112000000_remove_beta_endpoints.sql` membersihkan registrasinya pada database yang sudah ada. Health, statistik, dan route administrasi tetap tersedia.


## Statistik panel dan penanganan loading

Widget membaca `/api/telemetry`. Tanpa pengaturan panel, route ini membaca `/api/system/stats` dari `API_BACKEND_URL` (HTTPS untuk node remote). Alokasi Pterodactyl yang hanya melayani HTTP tidak otomatis menjadi origin HTTPS.

Untuk mengambil statistik lewat API HTTPS Pterodactyl, pasang tiga environment variable **server-side di proyek Vercel/frontend**, lalu redeploy:

- `PTERODACTYL_URL`: origin HTTPS panel, misalnya `https://cloud.codeku.ai.id`.
- `PTERODACTYL_SERVER_ID`: identifier atau UUID server.
- `PTERODACTYL_CLIENT_API_KEY`: token client dari akun panel yang memiliki izin membaca resource server. Gunakan akun dengan izin minimum; jangan gunakan prefix `NEXT_PUBLIC_`.

Token tidak dikirim ke browser. Route hanya mengembalikan proyeksi statistik publik, menggabungkan request bersamaan, dan menyimpan hasil selama lima detik untuk mengurangi beban panel. Mode panel hanya memperbaiki jalur statistik; playground API tetap memerlukan `API_BACKEND_URL` yang berfungsi. Batas RAM yang tidak tersedia dari API panel ditampilkan sebagai tidak diketahui.

Widget dan konsol admin memiliki batas waktu, pesan error, tombol retry, serta penanda data lama jika refresh gagal. Polling berikutnya dimulai setelah permintaan sebelumnya selesai atau mencapai batas waktu. Konsol membatasi daftar pengguna ke 200 akun terbaru agar pemuatan tidak terus membesar; daftar log menampilkan 25 entri terbaru.

## Validasi

```sh
npm ci
npm run test:security
npm run build
```

Uji database memakai PostgreSQL embedded PGlite dengan pgcrypto dan mencakup migrasi berulang, RLS akun/admin, penolakan eskalasi role, endpoint hilang/maintenance, kuota, rotasi key, dan pendaftaran dengan prefix email yang sama. Pengujian ini tidak mengubah database produksi.

Untuk regresi browser, buat build khusus pengujian (jangan deploy konfigurasi dummy ini):

```sh
NEXT_PUBLIC_SUPABASE_URL=https://test-project.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_test npm run build
npm start
# Terminal lain; Chromium harus tersedia, atau set CHROMIUM_PATH.
npm run test:browser
```

Uji browser memakai data provider tiruan untuk memeriksa error, timeout, retry, data kedaluwarsa, konsol admin, callback OAuth tanpa sesi, dan overflow pada 320/360/768 piksel. Uji ini tidak membuktikan login Google atau migrasi produksi sudah aktif.
