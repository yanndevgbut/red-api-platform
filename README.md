# RED API

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
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_test npm run build
npm start
# Terminal lain; Chromium harus tersedia, atau set CHROMIUM_PATH.
npm run test:browser
```

Uji browser memakai data provider tiruan untuk memeriksa error, timeout, retry, data kedaluwarsa, konsol admin, callback OAuth tanpa sesi, dan overflow pada 320/360/768 piksel. Uji ini tidak membuktikan login Google atau migrasi produksi sudah aktif.


## Halaman admin

Admin menggunakan URL terpisah: `/admin/endpoints` (registry), `/admin/new-endpoint` (form pendaftaran), `/admin/users`, `/admin/logs`, dan `/admin/settings` (maintenance). `/admin` serta navigasi admin lama diarahkan ke registry. Gunakan menu hamburger di judul halaman untuk berpindah fitur. Setiap halaman tetap memerlukan profil administrator aktif; akses data dan perubahan tetap dibatasi policy Supabase. Sidebar menggunakan dialog modal, animasi slide, dukungan Escape/fokus keyboard, serta preferensi reduced motion.


## Kategori katalog

Kategori beta bawaan dihapus. DOCS & TESTER selalu memiliki filter `ALL`; kategori tambahan dibuat melalui `/admin/categories` oleh akun administrator aktif, lalu dapat dipilih pada form endpoint. Nama `ALL` dicadangkan, panjang nama dibatasi 60 karakter, dan duplikat tidak membedakan huruf besar/kecil.

Frontend memakai `/api/categories`, yang meneruskan request ke `API_BACKEND_URL`: backend menyediakan `GET /api/system/categories` dan `POST /api/admin/categories`. Penambahan kategori memakai Bearer token sesi Supabase dan memverifikasi role serta status banned pada backend; tidak memakai API key pengguna sebagai pengganti sesi.

Daftar kategori disimpan secara atomik di `backend/data/categories.json` (direktori `data/` pada panel). File dibuat saat kategori pertama ditambahkan. Pertahankan dan backup direktori ini saat redeploy backend; jangan menimpanya dengan data kosong dari Git. Jika perlu, tentukan lokasi persisten lain melalui `CATEGORIES_FILE`. Deploy `backend/routes/categories.js` dan mounting router di `backend/server.js` sebelum frontend baru.

Saat sesi atau profil masih diperiksa, halaman menampilkan indikator loading. Timeout dan kegagalan pemeriksaan akun memiliki tampilan error/retry tersendiri sehingga pengguna tidak ditampilkan sebagai belum login sebelum statusnya diketahui.


## TikTok Downloader (TikTokio)

Endpoint `GET /api/download/tiktok?url=...` kini aktif menggunakan TikTokio. Header `x-api-key` wajib diisi. URL harus HTTPS dan berasal dari domain TikTok; input tidak valid ditolak sebelum middleware kuota. Scraper mengambil sesi, meneruskan cookie tanpa atribut `Set-Cookie`, lalu mengirim JSON `vid` dan `prefix` seperti scraper referensi. Implementasi memakai `fetch` bawaan Node.js dan Cheerio yang sudah terpasang sehingga tidak memerlukan Axios.

Respons `result` berisi `status`, `title`, `thumbnail`, serta `links` berupa pasangan `type` dan `link`. Link bersifat sementara dan bergantung pada ketersediaan video serta layanan TikTokio. Respons tanpa tautan unduhan tidak dianggap sukses; kegagalan provider menghasilkan `502`, timeout menghasilkan `504`. Timeout provider 15 detik dan ukuran HTML maksimum 2 MiB.

Jalankan `npm ci --omit=dev` di backend untuk memastikan Cheerio 1.2.0 terpasang. Deploy `backend/lib/tiktokio.js`, `backend/routes/downloader.js`, dan mounting router download pada server. Terapkan `supabase/migrations/20261112030000_add_tiktokio_endpoint.sql` untuk pendaftaran katalog, serta tambahkan kategori `Downloader` melalui admin jika memakai instalasi baru. Hanya TikTok yang diaktifkan kembali; endpoint beta lain tetap dihapus.

```sh
curl -H "x-api-key: YOUR_KEY" --get \
  --data-urlencode "url=https://vt.tiktok.com/ZS9ChQ9WD/" \
  "https://red-api-platform.vercel.app/api/proxy/api/download/tiktok"
```


## Keamanan admin

Menu admin hanya tampil untuk profil ber-role `admin` dengan `banned=false`. Server memverifikasi token Supabase dan role terbaru sebelum merender setiap halaman `/admin`; tamu/member diarahkan ke `/`. Cookie admin dibuat otomatis setelah sesi admin diverifikasi dan saat menu admin dibuka. Cookie menggunakan `HttpOnly`, `Secure`, `SameSite=Strict`, path `/admin`, dan masa hidup maksimal satu jam. Membuka URL admin tanpa cookie yang valid akan kembali ke landing; masuk melalui menu setelah login admin.

Operasi admin memakai `/api/admin/*` dengan Bearer token sesi, diteruskan ke backend yang memverifikasi identitas dan role pada setiap request. API key layanan umum tidak dapat dipakai untuk administrasi. Cookie bukan otorisasi untuk API mutasi. Read/write admin memakai field yang ditentukan server, validasi ID dan enum, limit daftar, serta error generik. Halaman admin tidak diindeks dan responsnya tidak disimpan pada cache publik.

CSP memakai nonce baru setiap request dan menolak script inline tanpa nonce. API memiliki batas body dan rate limit per peer jaringan (satu proses, bukan pengganti proteksi WAF/distributed rate limiting). `X-Forwarded-For` dari pemanggil tidak dipercaya. Header keamanan menonaktifkan sniffing, framing, dan fitur perangkat yang tidak dipakai.

Sebelum menyatakan rollout keamanan lengkap, terapkan `supabase/migrations/20261112040000_security_permissions.sql` di Supabase SQL Editor dan rotasi semua credential berhak tinggi yang pernah terekspos. Migrasi membatasi mutasi kuota hanya ke `service_role` dan memastikan helper RLS admin memeriksa banned. Kunci yang sudah ada di riwayat Git tetap perlu dicabut meskipun source saat ini bersih. Penggantinya hanya dipasang pada environment backend; jangan memakai `NEXT_PUBLIC_`. Endpoint admin baru membutuhkan `backend/middleware/admin-session.js` serta router admin/categories terbaru.

Uji browser memakai fixture Supabase lokal pada port 54321 (dijalankan otomatis oleh script). Build dengan konfigurasi dummy lokal seperti contoh validasi, jalankan frontend pada terminal lain, lalu `npm run test:browser`. Pengujian mencakup redirect tamu/member, cookie palsu, role terbaru, CSP, IDOR akun, dan escaping XSS. Jangan deploy konfigurasi dummy pengujian.


## Free Fire Stalker

`GET /api/stalk/ff?uid=12345678` memakai scraper profil publik dari `adenpedia.my.id/update01/info.php`. Endpoint berada di kategori `Stalk`, tersedia untuk paket free, dan membutuhkan API key pada header `x-api-key`. UID wajib berupa 8–11 digit; validasi dilakukan sebelum pemotongan kuota. Kolom UID di tester tetap kosong sampai diisi pengguna.

Respons `result` memuat `uid`, `nickname`, `rankBR`, `rankCS`, `primeLevel`, `bio`, `likes`, `playerLevel`, `serverRegion`, `booyahPass`, `estimatedTopUpIDR`, dan `topUpEstimateNote`. Label rank dan estimasi top-up mengikuti rumus scraper referensi. Nilai top-up adalah estimasi, bukan riwayat transaksi resmi; untuk Prime 8+ disajikan sebagai rentang.

Request provider memakai origin tetap, timeout 15 detik, tanpa meneruskan API key, dan batas JSON 512 KiB. Profil kosong menghasilkan `404`, kegagalan provider `502`, timeout `504`. Deploy `backend/lib/stalk-ff.js`, `backend/routes/stalker.js`, dan mounting router stalk pada server, terapkan `supabase/migrations/20261113000000_add_free_fire_endpoint.sql` untuk katalog, lalu tambahkan kategori `Stalk` pada admin jika memakai instalasi baru.

```sh
curl -H "x-api-key: YOUR_KEY" \
  "https://api.redapi.my.id/api/stalk/ff?uid=12345678"
```


## Revoke / regenerasi API key pengguna

Dashboard memakai `POST /api/user/api-key/rotate`, diteruskan ke backend dengan Bearer token sesi. User ID tidak diterima dari pemanggil: identitas diverifikasi lewat Supabase Auth, profil harus aktif, dan request bersamaan untuk akun yang sama ditolak dengan `409`. Key baru langsung diterapkan ke state dashboard lalu akun disinkronkan kembali. Respons berisi key hanya untuk pemilik akun dan memakai `private, no-store`.

Backend memprioritaskan RPC `rotate_my_api_key()` yang berjalan dalam transaksi dengan row lock. Jika RPC belum terpasang (`PGRST202`), deployment panel satu proses dapat memakai compatibility mode: seluruh key aktif milik akun dinonaktifkan dan satu key baru ditambahkan melalui **satu bulk upsert PostgREST**, sehingga kegagalan statement tidak meninggalkan perubahan sebagian. Tidak ada request revoke dan insert yang terpisah. Akun dengan nol key juga bisa membuat key pengganti. Error otorisasi RPC tidak memicu fallback.

Pasang `backend/lib/user-client.js`, `backend/lib/rotate-api-key.js`, `backend/routes/user.js`, serta mounting router user sebelum maintenance pada `backend/server.js`. Untuk deployment beberapa proses/instance atau pemanggil RPC langsung, terapkan `supabase/migrations/20261113010000_restore_key_rotation.sql` melalui SQL Editor agar serialisasi lintas-instance dijamin database. Migrasi ini tidak membutuhkan pgcrypto untuk pembuatan key. Compatibility mode dibatasi maksimal 100 key aktif per akun dan menolak snapshot yang terpotong.

### Pengumuman dan pembayaran QRIS manual

Admin memiliki halaman **Pengumuman** (terbitkan, kedaluwarsa, riwayat, hapus) dan
**Pembayaran** (unggah QRIS PNG/JPEG, tinjau bukti, setujui/tolak pesanan).
Pembelian dinonaktifkan sampai QRIS asli tersimpan. Harga Basic Rp25.000,
VIP Rp50.000, Enterprise Rp150.000; masa aktif 30 hari sejak persetujuan.
Harga/kuota/durasi ditentukan server di `backend/lib/billing.js`, bukan dari input browser.
Perpanjangan paket yang sama menambah masa aktif; perubahan paket memulai 30 hari baru.
Paket yang kedaluwarsa kembali ke Free, melalui pemeriksaan request dan rekonsiliasi setiap menit.
Perubahan plan langsung di Manajemen Pengguna merupakan override admin tanpa masa aktif otomatis.

Data pengumuman, pesanan, dan masa aktif tersimpan atomik di `backend/data/operations.json`.
Gambar tersimpan privat di `backend/data/uploads/`, hanya disajikan setelah verifikasi sesi dan
kepemilikan/admin. Backup kedua lokasi bersama-sama; jangan timpa direktori `data` saat deploy.
Implementasi ini untuk satu proses backend pada volume persisten. Untuk beberapa instance,
pindahkan store/lock dan file ke database/object storage bersama sebelum menambah replika.
Tidak diperlukan migrasi SQL baru untuk fitur ini.

Maintenance memblokir API bisnis dengan HTTP 503, termasuk ketika status layanan tidak dapat
diverifikasi. Admin tetap dapat mematikan maintenance. Browser memeriksa status berkala;
menghapus dialog melalui developer tools tidak membuka konten halaman atau akses API.
Konfirmasi tindakan destruktif meliputi ban, perubahan role/plan, penghapusan endpoint/akun,
maintenance, pengumuman, QRIS, dan keputusan pembayaran. Menghapus akun memerlukan ketik
ulang email; akun sendiri dan akun ber-role admin dilindungi dari penghapusan.

Pembelian paket mengikuti urutan Free → Basic → VIP → Enterprise. Paket yang lebih
rendah dari paket aktif ditolak saat checkout, akses QRIS, unggah bukti, dan persetujuan
admin, termasuk pemulihan persetujuan pesanan lama. Perpanjangan dan upgrade tetap tersedia.
Admin dapat menolak pesanan lama yang tertahan dalam persetujuan setelah pelanggan naik paket,
kemudian menindaklanjuti dana yang sudah diterima secara manual.

Pesan pop up maintenance dapat disimpan melalui **Pengaturan Sistem → Pesan pop up maintenance**
(maksimal 500 karakter). Menyimpan pesan mempertahankan status maintenance, dan mengubah status
mempertahankan pesan terakhir. Pesan ditampilkan sebagai teks biasa dengan dukungan baris baru.
