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

### Pinterest Downloader (pindl)

`GET /api/download/pindl?url=...` tersedia dalam kategori **Downloader**, paket Free.
Kirim API key melalui header `x-api-key`. Parameter `url` menerima pin publik
`https://www.pinterest.com/pin/ID/` atau shortlink `https://pin.it/KODE`.

```sh
curl --get 'https://api.redapi.my.id/api/download/pindl' \
  -H 'x-api-key: YOUR_KEY' \
  --data-urlencode 'url=https://www.pinterest.com/pin/99360735500167749/'
```

Respons sukses mengikuti scraper referensi dengan `success: true` dan objek `data` yang
berisi `id`, `title`, `type`, `format`, `url`, serta `source`. `data.url` berisi link media; API tidak meneruskan
file media melalui server. Video dipilih dari pin yang sesuai, memprioritaskan MP4 lalu
resolusi terbesar; gambar memakai metadata Open Graph. Pin video yang tidak memiliki link
video menghasilkan error, bukan thumbnail yang dilaporkan sebagai video.

Redirect diperiksa per langkah, media dibatasi ke HTTPS `pinimg.com`, respons HTML maksimal
5 MB, dan keseluruhan pengambilan halaman dibatasi 20 detik. URL tidak valid ditolak sebelum
pengurangan kuota. Pin privat, pin yang dihapus, atau penolakan oleh Pinterest tidak dianggap
sebagai hasil sukses. Link CDN dapat berubah atau kedaluwarsa.

Metadata katalog tersimpan di `backend/catalog/pindl.json`; gunakan data tersebut saat
mendaftarkan endpoint pada tabel `endpoints` di instalasi baru. Parameter sengaja tidak
memiliki nilai default agar formulir tester tetap kosong sebelum pengguna mengisinya.

### YouTube Downloader (ytdl)

`GET /api/download/ytdl?url=...&quality=720` tersedia dalam kategori **Downloader**, paket
Free. Header `x-api-key` wajib diisi. URL menerima YouTube watch, Shorts, embed, live,
dan `youtu.be`, dengan satu ID video. Parameter `quality` opsional (default 720), angka
bulat 1–4320. Formulir yang mengirim quality kosong juga memakai default 720.

```sh
curl --get 'https://api.redapi.my.id/api/download/ytdl' \
  -H 'x-api-key: YOUR_KEY' \
  --data-urlencode 'url=https://www.youtube.com/watch?v=jNQXAC9IVRw' \
  --data-urlencode 'quality=720'
```

Scraper Tubdown mengambil metadata, memilih MP4 tertinggi yang tidak melebihi quality
(atau resolusi terendah jika seluruh pilihan lebih tinggi), lalu membuat dan menunggu
job video serta MP3 secara berurutan. Respons berisi `success: true` dan `data` dengan
`provider`, `id`, `title`, `author`, `duration_seconds`, `source`, serta `downloads.mp4`
dan `downloads.mp3`. Kedua objek unduhan memuat format, quality, size_bytes, filename,
dan URL file Tubdown. File tidak diteruskan melalui server RED API; link sementara dari
provider dapat kedaluwarsa. Video privat, live yang tidak bisa dikonversi, dan pembatasan
provider dapat menghasilkan error.

Konversi memiliki batas total 180 detik dan request provider maksimal 30 detik per panggilan.
Maksimal dua request ytdl diproses bersamaan; request yang ditolak karena kapasitas penuh
atau parameter salah tidak memotong kuota. Request yang sudah diterima memakai satu kuota,
termasuk jika provider kemudian gagal. Polling internal tidak memakai kuota tambahan.
Jika client terputus, polling dihentikan.

Untuk konversi panjang, backend mengirim whitespace JSON berkala agar koneksi tidak idle.
Client tetap membaca satu objek JSON dengan `response.json()`. Karena HTTP header mungkin
sudah dikirim, periksa field `success` dan `error.code` pada respons, termasuk HTTP 200.
Gateway khusus GET ytdl menunggu maksimal 220 detik, tester 230 detik, dan fungsi proxy
Vercel memakai maxDuration 240 detik. Endpoint lain mempertahankan timeout sebelumnya.

Metadata katalog untuk instalasi baru tersedia di `backend/catalog/ytdl.json`.

### Screenshot Web (ssweb)

`GET /api/tools/ssweb?url=...&mode=desktop` tersedia dalam kategori **Tools**, paket Free,
dengan header `x-api-key`. Tester menampilkan preview gambar serta tombol **Unduh PNG** dan
**Buka ukuran asli**. Pilihan perangkat memakai dropdown; URL tetap kosong sebelum diisi.

```sh
curl --get 'https://api.redapi.my.id/api/tools/ssweb' \
  -H 'x-api-key: YOUR_KEY' \
  --data-urlencode 'url=https://example.com' \
  --data-urlencode 'mode=hp' \
  --data-urlencode 'fullPage=false' \
  --data-urlencode 'waitMs=5000'
```

Mode: `desktop` 1440×900, `tablet` 768×1024, `hp` 390×844; skala 1. Alias `dekstop`,
`mobile`, dan `phone` juga diterima. `fullPage` menerima `true`/`false` (default false),
`waitMs` bilangan bulat 0–30000 (default 5000). Parameter opsional kosong memakai default.
Respons API mengikuti scraper: `success` dan objek `data` dengan URL, judul, mode, viewport,
serta `image` PNG dalam base64. Hanya tampilan tester yang mengubahnya menjadi preview Blob.
PNG dibatasi 3 MiB; halaman penuh maksimal 8000 piksel tinggi, 1920 piksel lebar, 12 juta
piksel. Gunakan area layar atau mode HP jika hasil terlalu besar. Waktu total capture
maksimal 75 detik; gateway 125 detik, tester 135 detik. JSON dapat diawali whitespace
keepalive, sehingga periksa `success` meski status HTTP 200 seperti pada ytdl.

Browser memakai konteks baru setiap request, tanpa session, cookie, atau kredensial aplikasi.
Akses jaringan dipaksa melalui proxy loopback khusus. Proxy memvalidasi seluruh jawaban DNS,
menolak alamat privat/reserved dan port nonstandar, serta menyambung ke IP publik yang sudah
diperiksa agar DNS rebinding tidak mengganti tujuan koneksi. Redirect dan subresource juga
melewati proxy. Service worker, WebSocket, QUIC, dan UDP WebRTC langsung dibatasi. Batas per
capture: 40 MiB unduhan, 8 MiB unggahan, 300 request/koneksi proxy, dan maksimal 48 socket aktif.
Satu screenshot diproses bersamaan. Parameter salah, target awal terlarang, runtime belum siap,
dan kapasitas penuh ditolak sebelum pemotongan kuota; capture yang sudah dimulai memakai satu
kuota termasuk ketika target kemudian gagal. Browser/proxy ditutup saat selesai atau client putus.

Runtime browser dipisahkan di `backend/ssweb-runtime` (lockfile dipin): Playwright Core,
Chromium serverless, dan ipaddr.js. Startup menyiapkannya di background melalui `npm ci
--ignore-scripts` tanpa mengganti dependency backend yang sudah ada, lalu menjalankan smoke
check Chromium. Status diagnostik privat ada di `backend/data/ssweb-runtime-status.json`.
File browser dan profile sementara memakai volume `backend/data/ssweb-work`, sehingga tidak
memenuhi tmpfs `/tmp` panel. Lokasi dapat dikonfigurasi operator melalui `SSWEB_WORK_DIR`.
Route screenshot baru menerima request setelah smoke check berhasil. Node 22.17+ atau 24+
dan container Linux x64 dibutuhkan untuk bundle Chromium ini. `CHROME_PATH` dapat menunjuk
Chromium kompatibel yang disediakan operator. Dependency browser tetap diperlukan.

Untuk development/tests: jalankan `npm ci --prefix backend/ssweb-runtime --ignore-scripts`
sebelum suite keamanan yang menjalankan capture Chromium pada fixture lokal. Metadata
katalog berada di `backend/catalog/ssweb.json`.

### Instagram Downloader (igdl)

`GET /api/download/igdl?url=...` memakai scraper TapDL di kategori **Downloader**, paket
Free. Header `x-api-key` wajib diisi. URL HTTPS Instagram mendukung `/p/`, `/reel/`,
`/reels/`, dan `/tv/`; tracking/query dibuang sebelum diteruskan ke provider.

```sh
curl --get 'https://api.redapi.my.id/api/download/igdl' \
  -H 'x-api-key: YOUR_KEY' \
  --data-urlencode 'url=https://www.instagram.com/reel/DfenBL6JaTk/'
```

Respons mengikuti scraper: `success: true` dan `data` dengan `provider`, `shortcode`,
`source`, serta array `items`. Setiap item berisi judul, uploader, durasi bila tersedia,
dan grup `downloads.mp4`, `downloads.mp3`, `downloads.image`. Tiap pilihan memuat format,
label, ukuran (atau null), dan URL. Foto saja, video saja, maupun audio saja diterima;
API tidak menjanjikan semua format tersedia untuk setiap postingan. File media tidak
diunduh atau dikonversi oleh server RED API. Link provider dapat kedaluwarsa.

Hanya satu origin tetap `https://www.tapdl.com/wp-json/svd/v1/fetch` yang dihubungi server;
redirect tidak diikuti. Link hasil dibatasi ke HTTPS tanpa kredensial, port nonstandar,
alamat IP literal, atau nama host lokal. URL masukan salah ditolak sebelum pemotongan kuota.
Batas respons provider 2 MiB dan timeout 60 detik. Seperti ytdl/ssweb, konversi/pengambilan
panjang dapat mengirim whitespace JSON; periksa `success` walaupun HTTP 200. Gateway
igdl menunggu maksimal 125 detik, tester 135 detik. Provider rate limit menghasilkan kode
`RATE_LIMITED`; postingan kosong/privat/tidak tersedia tidak menjadi respons sukses.

Metadata katalog untuk instalasi baru tersedia di `backend/catalog/igdl.json`.

### Image HD (hd)

`GET /api/tools/hd?url=...&scale=4` tersedia di kategori **Tools**, paket Free.
Kirim header `x-api-key`. `url` harus berupa URL HTTP/HTTPS gambar publik; file lokal
server tidak dapat diakses. `scale` menerima `2` atau `4` (default `4`). Tester
menampilkan preview dan tombol **Unduh PNG**, dengan URL input tetap kosong.

```sh
curl --get 'https://api.redapi.my.id/api/tools/hd' \
  -H 'x-api-key: YOUR_KEY' \
  --data-urlencode 'url=https://example.com/image.png' \
  --data-urlencode 'scale=2'
```

Scraper memakai FreeUpscaler melalui browser terisolasi. Input PNG/JPEG/WebP statis
maksimal 10 MiB, hasil maksimal 16.777.216 piksel dan sisi 8192 px; artinya input
maksimal sekitar 1 MP untuk 4x atau 4 MP untuk 2x. Ukuran dan isi gambar divalidasi
melalui Sharp sebelum browser dibuka. Input dan setiap redirect hanya boleh menuju
IP publik yang sudah diperiksa dan dipakai langsung untuk koneksi. Browser memakai
proxy egress publik seperti ssweb, tanpa kredensial server, dengan batas 180 MiB
unduhan dan 16 MiB unggahan. Satu proses HD berjalan bersamaan; timeout 180 detik.
Gateway menunggu 220 detik, tester 230 detik. Respons dapat berisi whitespace
keepalive; selalu periksa `success`, termasuk saat HTTP 200.

Hasil mengikuti scraper: `data.provider`, `scale_requested`, `scale_actual`, `input`,
`elapsed_seconds`, dan `image` dengan dimensi, ukuran, serta tipe PNG. Hasil sampai
3 MiB menyertakan `image.encoding: "base64"` dan `image.base64`. Hasil lebih besar
(maksimal 64 MiB) memakai `image.encoding: "url"`. Semua hasil memiliki `image.url`
dan `expires_at`; URL berlaku 10 menit. Unduh langsung melalui origin API dengan
header `x-api-key`, tanpa biaya kuota tambahan. Key harus aktif dan milik akun yang
membuat hasil; key dicabut, akun diblokir, atau akun lain tidak dapat mengambilnya.
Jangan menaruh API key dalam URL gambar. Tester memuat file besar langsung dari
origin API yang tetap, sehingga hasil tidak melewati batas payload Vercel.

URL/parameter/gambar tidak valid, runtime belum siap, kapasitas proses penuh, atau
penyimpanan penuh ditolak sebelum kuota dipotong. Proses yang diterima memakai satu
kuota, termasuk bila provider kemudian gagal. Pembatalan client menutup browser dan
melepaskan kapasitas setelah cleanup. File hasil berada di `backend/data/hd-results`
dan dibersihkan otomatis; batas penyimpanan 512 MiB/64 hasil. Dependency validasi
terpisah dalam `backend/hd-runtime` dan disiapkan di background saat startup, tanpa
mengganti dependency backend. Untuk tests jalankan `npm ci --prefix backend/hd-runtime
--ignore-scripts`. Metadata katalog tersedia di `backend/catalog/hd.json`.
