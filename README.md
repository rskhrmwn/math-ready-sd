# MATH READY SD (Fase 1, versi 0.1)

Platform latihan matematika SD/MI kelas 4 sampai 6 dengan login siswa (NISN + PIN), guru, dan admin.
Dibuat untuk Riski Hermawan, S.Pd., Wali Kelas 6A, SD Negeri Sapuro 05 Kota Pekalongan.
**Bukan platform resmi TKA.** Skor adalah indikator latihan.

## Status yang jujur
- Sudah diuji otomatis: alur API (`npm test`, 28 pemeriksaan) dan antarmuka (`node test-ui.js`), pada PostgreSQL 16 asli maupun database tertanam.
- **Belum** ditinjau oleh ahli keamanan, belum diuji beban, belum dilihat di banyak jenis HP. Jangan memasukkan data siswa sungguhan sebelum izin sekolah, persetujuan orang tua, dan tinjauan keamanan.
- Semua 68 soal masih berstatus **draf** sampai guru memeriksanya.
- Belum ada: diagnostic adaptif, materi mikro, remedial, Buku Kesalahanku, dashboard orang tua, gamifikasi, AI Coach, PWA, editor soal. Lihat Brief Programmer.

## Menjalankan di komputer (uji coba)
Butuh Node.js 20 atau lebih baru.
```
npm install
npm start
```
Pertama kali berjalan, layar menampilkan **kata sandi admin** (hanya sekali). Buka http://localhost:3000.
Database tertanam tersimpan di `data/pgdata` (cukup untuk uji coba satu kelas). Cadangkan dengan menyalin folder itu saat server mati.

Akses dari HP di jaringan yang sama: `http://ALAMAT-IP-KOMPUTER:3000`. **Peringatan:** tanpa HTTPS, PIN terkirim tanpa enkripsi.
Pakai hanya di jaringan tepercaya dan hanya untuk uji coba. Untuk penggunaan sungguhan, pasang HTTPS (hosting di bawah).

## Penggunaan sungguhan (PostgreSQL + HTTPS)
1. Siapkan PostgreSQL terkelola (mis. Neon, Supabase, Railway, Render, atau milik sendiri). Pilih lokasi server dan jadwal cadangan; catat.
2. Deploy aplikasi ini (mis. Render, Railway, Fly.io) memakai `Dockerfile` atau perintah `npm start`.
3. Isi variabel lingkungan: `DATABASE_URL`, `PGSSL=1` (bila perlu), `COOKIE_SECURE=1`, `TRUST_PROXY=1`, dan opsional `ADMIN_PASSWORD`.
4. Pastikan situs hanya dapat diakses lewat HTTPS. Pasang domain bila ada.
5. Cadangan: `pg_dump` terjadwal. Uji pemulihannya.

## Alur pemakaian pertama
1. Masuk sebagai `admin`. Buka **Akun saya** dan ganti kata sandi.
2. **Pengguna**: buat akun guru (kata sandi acak tampil sekali).
3. Masuk sebagai guru. **Siswa**: impor CSV (`nama_lengkap,nama_panggilan,nisn,kelas,rombel,tahun_ajaran`). Cetak kartu login (NISN + PIN 6 angka, tampil sekali).
4. **Soal**: periksa soal. **Tugas**: tekan "Tandai sudah diperiksa" bila Anda sudah memeriksa paket, lalu buat tugas untuk kelas.
5. Siswa masuk dan mengerjakan. Guru melihat **Hasil kelas** dan **Kesehatan soal**.

## Pemasangan gratis (GitHub + Render + Neon)
Biaya Rp0, tanpa kartu kredit (per Oktober 2026; syarat paket gratis bisa berubah). Lihat dokumen "Panduan Pemasangan Gratis".
- **GitHub** (repositori *private*): menyimpan kode dan memicu pemasangan otomatis. `.github/workflows/test.yml` menjalankan uji otomatis.
- **Neon** (PostgreSQL gratis, wilayah Singapore): menyimpan data. Gunakan ini, **bukan** database gratis Render (kedaluwarsa 30 hari dan tanpa cadangan).
- **Render** (paket web service gratis, wilayah Singapore): menjalankan `server.js` lewat `render.yaml`. Tertidur setelah 15 menit tanpa kunjungan dan butuh sekitar 1 menit untuk bangun; buka situs 2 menit sebelum kelas.
- Sistem berkas Render gratis tidak permanen. Jangan memakai database tertanam di sana: wajib `DATABASE_URL` dari Neon.

## Cadangan (wajib, karena paket gratis hanya punya pemulihan singkat)
```
DATABASE_URL="alamat-neon" node backup.js        # menulis backup/backup-TANGGAL.json
DATABASE_URL="alamat-neon-baru" node restore.js backup/backup-xxxx.json   # ke database KOSONG
```
Berkas cadangan berisi data siswa: simpan di tempat aman dan jangan di-commit (folder `backup/` sudah diabaikan git). Jalankan setiap minggu dan sebelum perubahan besar. Uji pemulihannya sesekali.
Guru juga dapat mengunduh hasil tiap tugas (CSV, tanpa NISN) di tab Hasil kelas.

## Keamanan yang sudah ada
Kata sandi dan PIN di-hash (scrypt, bergaram). Sesi lewat cookie HttpOnly + SameSite=Strict. Header anti-CSRF. Pembatasan percobaan masuk
(5 kali gagal per akun dalam 15 menit). Otorisasi di server per peran dan per kelas. Kunci jawaban tidak dikirim ke siswa sebelum dikumpulkan.
Penilaian di server dan batas waktu ditegakkan di server. NISN hanya tampil sebagian di daftar. Kolom NIK, alamat, dan telepon ditolak saat impor.
Log aktivitas (tanpa PIN). Kueri berparameter. Header keamanan dasar (CSP).

## Yang masih perlu (sebelum data sungguhan)
Tinjauan keamanan independen, enkripsi data saat disimpan (aktifkan di penyedia database), pembatasan percobaan yang bertahan saat server restart,
kebijakan privasi dan persetujuan orang tua, rencana masa simpan dan penghapusan data, pemantauan, dan uji beban.

## Struktur
`server.js` API dan penilaian. `db.js` adaptor database. `schema.sql` skema. `bootstrap.js` data awal (68 soal, paket tryout 1, akun admin).
`public/` antarmuka. `data/` bank soal CSV dan gambar SVG. `test.js` dan `test-ui.js` pengujian.
Aturan penskoran PGK di sini: benar penuh (semua bagian tepat). Aturan resmi tidak ditemukan; ubah di `isCorrect` di `server.js` bila perlu.
