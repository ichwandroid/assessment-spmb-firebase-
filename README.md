# Assessment SPMB — SD Anak Saleh

Aplikasi penilaian (assessment) calon peserta didik baru berbasis **Google Apps Script Web App** dengan **Google Sheets** sebagai basis data. Assessor mengisi skor per sentra melalui wizard, Koordinator/Admin memfinalisasi dan menandatangani laporan, lalu laporan dicetak per peserta.

| | |
|---|---|
| Sekolah | Sekolah Dasar Anak Saleh |
| Tahun pelajaran | 2026/2027 (dapat diubah tanpa deploy — lihat [Konfigurasi](#konfigurasi)) |
| Runtime | Apps Script V8 · zona waktu `Asia/Jakarta` |
| Deployment | Web App · `executeAs: USER_DEPLOYING` |
| Basis data | 6 sheet: `PESERTA`, `ASSESSMENT`, `HASIL`, `CONFIG`, `USERS`, `AUDIT` |
| Version control | **Belum ada** — lihat [Sebelum deploy](#sebelum-deploy) |

---

## Daftar isi

- [Fitur](#fitur)
- [Arsitektur](#arsitektur)
- [Peran & hak akses](#peran--hak-akses)
- [Model data](#model-data)
- [Cara penilaian dihitung](#cara-penilaian-dihitung)
- [Alur kerja](#alur-kerja)
- [Pemasangan](#pemasangan)
- [Konfigurasi](#konfigurasi)
- [Sebelum deploy](#sebelum-deploy)
- [Catatan pengembangan](#catatan-pengembangan)
- [Batasan yang diketahui](#batasan-yang-diketahui)
- [Pemecahan masalah](#pemecahan-masalah)

---

## Fitur

**Penilaian**
- Wizard 4 tahap: Data Peserta → Sentra (per BAB) → Review & Finalisasi → Selesai.
- Skor 1–3 per aspek dengan chip sentuh (ramah tablet/HP), pedoman penilaian tertanam di tiap materi.
- Perhitungan otomatis: persen per materi → rerata per sentra → **Nilai Akhir** → **Kode A/B/C** dari Calistung.
- Materi `pilihTerbaik` (hafalan doa & surat pendek): hanya N nilai terbaik yang dihitung.
- **Autosave** 2,5 detik + indikator status simpan; draft aman kalau koneksi putus.

**Kolaborasi & kontrol**
- Penugasan per sentra (BAB). Tiga assessor dapat mengerjakan peserta yang sama tanpa saling menimpa.
- **Klaim kepemilikan sentra**: begitu seorang assessor mengisi skor, sentra itu miliknya sampai difinalisasi.
- Merge per sentra di server — assessor A tidak bisa merusak isian assessor B, walaupun menyimpan bersamaan.
- Finalisasi per sentra, Submit Final (tanda tangan Koordinator), dan Buka Kunci bila perlu revisi.

**Pelaporan**
- Dashboard koordinator: statistik, sebaran kode, tugas menunggu penilaian, daftar siap submit.
- Laporan cetak A4 mandiri (window baru) lengkap dengan kolom tanda tangan.
- Sheet `HASIL` terdenormalisasi: satu baris per assessment, siap diolah lebih lanjut.

**Keamanan**
- Sesi token 6 jam (sliding) di `CacheService`.
- PIN di-hash SHA-256, rate-limit 8 percobaan gagal per 10 menit.
- Otorisasi berbasis **username** (bukan nama tampilan) + jejak audit di sheet `AUDIT`.

---

## Arsitektur

```
Index.html ──include──▶ CSS.html + JS_Core.html + JS_Wizard.html
     │
     └─ google.script.run ──▶ Kode.js   (entry point + 23 endpoint API)
                                  │
                                  ├─ Auth.js        hash PIN, sesi, guard peran
                                  ├─ Services.js    Sheets, CRUD, cache, merge sentra
                                  ├─ Calculation.js sanitasi, validasi, perhitungan
                                  ├─ Setup.js       buat sheet, migrasi, data dummy
                                  └─ Config.js      APP_CONFIG + FORM_SCHEMA
                                        │
                                  Google Sheets ×6
```

**Prinsip utama:** `Config.js` adalah satu-satunya tempat definisi struktur penilaian (`FORM_SCHEMA`). Menambah materi, aspek, atau sentra cukup diubah di sana — formulir, validasi, perhitungan, dan kolom sheet `HASIL` menyesuaikan otomatis.

### Peta file

| File | Isi |
|---|---|
| `Config.js` | `APP_CONFIG`, `SHEET_SCHEMA_VERSION`, header kolom, `FORM_SCHEMA`, `AUDIT_HEADERS` |
| `Auth.js` | `hashPin_`, `loginImpl_`, `requireAuth_`, `requireStaff_`, `requireAdmin_`, `requireWrite_`, `changeMyPinImpl_` |
| `Calculation.js` | `hitungHasil_`, `hitungMateri_`, `missingList_`, `sanitizeData_`, `sanitizeMeta_` |
| `Services.js` | Cache, CRUD peserta/user, merge per sentra, otorisasi assessment, tulis `HASIL`, audit |
| `Setup.js` | `ensureSheets_` + migrasi (`v2`), menu Spreadsheet, `seedDummyData` |
| `Kode.js` | `doGet`, `include`, semua endpoint API |
| `Index.html` | Shell UI: boot → login → app (header, bottom-nav, modal, toast) |
| `CSS.html` | `tailwind.config`, komponen `@apply`, `.score-chip`, accordion, utilitas aksesibilitas |
| `JS_Core.html` | Klien: auth, `api()`, dashboard, riwayat, hasil, pengguna, cetak |
| `JS_Wizard.html` | Wizard penilaian, autosave, finalisasi, submit |

---

## Peran & hak akses

| Kemampuan | ASSESSOR | KOORDINATOR | ADMIN |
|---|:--:|:--:|:--:|
| Menilai sentra yang ditugaskan | ✅ | ✅ (semua) | ✅ (semua) |
| Melihat assessment | hanya miliknya / sentra tugasnya | semua | semua |
| Filter & lihat assessment per pengguna dari menu Penilaian | — | — | ✅ |
| Finalisasi sentra | ✅ | ✅ | ✅ |
| Tarik finalisasi / Lepas klaim | — | ✅ | ✅ |
| Submit Final (tanda tangan) | — | ✅ | ✅ |
| Buka kunci assessment | — | ✅ | ✅ |
| Menambah/mengubah **data peserta** | — | ✅ | ✅ |
| Hapus draft | draft sendiri | semua | semua |
| Kelola pengguna | — | — | ✅ |

**Gate tambahan — `requireWrite_`:** akun yang PIN-nya masih PIN default **hanya bisa membaca**. Seluruh endpoint tulis ditolak sampai PIN diganti dari modal "Ganti PIN Anda". PIN lama wajib dimasukkan, sehingga token yang bocor saja tidak cukup untuk mengambil alih akun.

---

## Model data

### `PESERTA`
`ID Peserta` · `Nama Peserta` · `Nomor Peserta` · `Asal TK/RA/PAUD` · `Waktu Dibuat` · `Waktu Diubah`

ID dibuat otomatis: `P0001`, `P0002`, …

### `ASSESSMENT`
`ID Assessment` · `ID Peserta` · `Nama Peserta` · `Nomor Peserta` · `Assessor` · `Tanggal` · `Status` · **`Data Penilaian (JSON)`** · satu kolom `Rerata <nama sentra>` untuk setiap sentra aktif · `Nilai Akhir` · `Kode` · `Waktu Dibuat` · `Waktu Diubah` · `Waktu Submit` · `Log Edit` · `Username Assessor`

- Satu peserta = satu assessment (dijaga di server).
- Kolom JSON menyimpan seluruh penilaian **termasuk `meta`**: status & pemilik tiap sentra, serta Koordinator penanda tangan.
- `Log Edit` menyimpan 20 aksi terakhir (CREATE/SAVE/FINALIZE/RETRACT/RELEASE/SUBMIT/UNLOCK).
- `Status`: `DRAFT` → `SIAP_REVIEW` (semua sentra FINAL) → `SUBMITTED`.

### `HASIL`
Dibuat otomatis dari `FORM_SCHEMA` (2 kolom per materi: skor & persen). Baris ditulis saat Submit Final dan **dihapus** saat Buka Kunci. Termasuk `Username Assessor <sentra>` untuk ketertelusuran.

### `CONFIG`
`Kunci` · `Nilai` · `Keterangan` — override `APP_CONFIG` tanpa deploy ulang.

### `USERS`
`Username` · `Nama` · `PIN Hash` · `Peran` · `Penugasan (JSON)` · `Aktif` · `Dibuat` · `Diubah` · `Wajib Ganti PIN`

### `AUDIT`
`Waktu` · `Oleh` · `Aksi` · `Target` · `Detail` — jejak `PESERTA_BARU`, `PESERTA_UBAH`, `USER_SIMPAN`, `USER_AKTIF`, `USER_NONAKTIF`, `USER_HAPUS`, `PIN_GANTI`. Kegagalan menulis audit tidak pernah membatalkan operasi utama.

---

## Cara penilaian dihitung

Skor tiap sel: **1 / 2 / 3** (sel kosong = belum dinilai).

```
persen materi  = skor / maks × 100
rerata sentra  = rata-rata persen materi yang SUDAH LENGKAP
Nilai Akhir    = rata-rata 3 sentra   (bobot tiap sentra 1/3)
Nilai Calistung= rata-rata materi 2.1 Membaca, 2.2 Menulis/Dikte, 2.3 Berhitung
                 (+ 2.4 English bila KODE_INCLUDE_ENGLISH = TRUE)
Kode           = A bila Calistung ≥ KODE_A_MIN
                 B bila Calistung ≥ KODE_B_MIN
                 C bila di bawahnya
```

Ketentuan khusus:
- **`pilihTerbaik: 2`** (materi 1.2 Doa & 1.3 Surat Pendek): hanya **2 item dengan nilai terbaik** yang dihitung, dan hanya item yang sudah lengkap.
- **`tipe: 'aspek'`**: satu item dinilai per aspek. Materi 2.2 Menulis punya aspek **per item** (bukan per materi).
- Bobot tiap sentra sama (1/3) meskipun jumlah materinya berbeda.

> **Penting:** satu sentra hanya bisa difinalisasi bila **semua** selnya sudah terisi. Tidak ada mekanisme "lewat/N.A." — assessor wajib memberi nilai 1 bila anak belum mampu.

---

## Alur kerja

```
1. Koordinator/Admin        →  tambah peserta (wizard, tab "Peserta Baru")
2. Assessor sentra Ubudiyah →  isi BAB I   →  Finalisasi sentra
3. Assessor sentra Persiapan/Seni → isi BAB II & III  →  Finalisasi
4. Status otomatis jadi SIAP_REVIEW
5. Koordinator              →  Submit Final (nama Anda = penanda tangan laporan)
6. Baris masuk ke sheet HASIL, laporan siap dicetak
```

Bila ada revisi setelah submit: **Buka Kunci** (Koordinator/Admin) → baris `HASIL` dihapus, klaim sentra dilepas, status kembali seperti sebelumnya.

---

## Pemasangan

### 1. Prasyarat
- Akun Google dengan akses Spreadsheet tujuan.
- [Node.js](https://nodejs.org) + `clasp`: `npm install -g @google/clasp`

### 2. Hubungkan project
```bash
clasp login
```
`.clasp.json` sudah memuat `scriptId`. Untuk membuat project baru:
```bash
clasp create --type sheets --title "Assessment SPMB"
```

### 3. Push kode
```bash
clasp push
```

### 4. Inisialisasi sheet
1. Buka Spreadsheet → **Extensions → Apps Script** (atau buka project terkait).
2. Muat ulang Spreadsheet → muncul menu **🎯 SPMB Assessment**.
3. Klik **1. Setup / Perbaiki Struktur Sheet**.
4. **Catat PIN admin** yang muncul di dialog — hanya ditampilkan sekali. Tersimpan juga di *Project Settings → Script Properties* dengan nama `ADMIN_PIN_AWAL`.
5. Login sebagai `admin` + PIN tersebut, lalu **ganti PIN** saat diminta.

> Jika script berdiri sendiri (bukan terikat Spreadsheet), isi `APP_CONFIG.SPREADSHEET_ID` di `Config.js`.

### 5. Deploy Web App
**Deploy → New deployment → Web app**
- *Execute as*: **Me (email Anda)**
- *Who has access*: lihat tabel di bawah.

### 6. Data uji (opsional)
Menu **🎯 SPMB Assessment → 2. Isi Data Dummy untuk Testing** — membuat 4 peserta dan 5 akun (`admin`, `koordinator`, `ustabdullah`, `usthasan`, `ustzhfatimah` — PIN `1234`).

---

## Konfigurasi

### Ubah tahun pelajaran / ambang kode — tanpa deploy
Edit sheet `CONFIG`:

| Kunci | Contoh | Keterangan |
|---|---|---|
| `SEKOLAH` | `Sekolah Dasar Anak Saleh` | tampil di UI & laporan |
| `TAHUN_PELAJARAN` | `2026/2027` | tampil di boot, login, header, laporan |
| `KODE_A_MIN` | `80` | ambang Kode A |
| `KODE_B_MIN` | `60` | ambang Kode B |
| `KODE_INCLUDE_ENGLISH` | `FALSE` | `TRUE` = 2.4 English ikut Calistung |

Setelah mengubah manual: menu **🎯 SPMB Assessment → 3. Bersihkan Cache**.

### Kelola soal dan rubrik dari aplikasi
Admin dapat membuka **Soal Assessment** melalui navigasi aplikasi untuk menambah, mengubah, atau menghapus soal dan mengubah rubrik tiap materi. Rubrik skor tunggal menggunakan label untuk nilai 3/2/1. Pada materi dengan aspek, setiap aspek menjadi grup kolom dengan nilai 3/2/1 dan deskripsi kriteria masing-masing—seperti tabel rubrik bertingkat. Jumlah grup mengikuti aspek yang sudah didefinisikan pada materi. Pedoman penilaian dapat diatur sebagai daftar baris. Rubrik dan soal disimpan pada baris `FORM_SCHEMA_JSON` di sheet `CONFIG`; assessor melihat tabelnya di wizard. Admin dengan PIN default yang belum diganti tetap harus mengganti PIN sebelum menyimpan perubahan.

Menghapus soal tidak menghapus nilai yang tersimpan di JSON assessment lama. Namun, struktur aktif dipakai untuk menghitung penilaian yang dibuka kembali; karena jumlah soal dapat mengubah rerata, tinjau dampaknya pada data lama. Setiap materi harus tetap memiliki minimal satu soal.

### Ubah struktur penilaian
Edit `FORM_SCHEMA` di `Config.js`, lalu:
1. `clasp push`
2. Jalankan **Setup / Perbaiki Struktur Sheet** (struktur `HASIL` menyesuaikan otomatis)

### Naikkan versi skema
Setiap kali ada **kolom atau sheet baru**, naikkan `SHEET_SCHEMA_VERSION` di `Config.js` (mis. `'v2'` → `'v3'`). Migrasi akan berjalan otomatis sekali pada login berikutnya, termasuk pada deployment yang sudah berisi data.

---

## Sebelum deploy

Periksa daftar ini setiap kali merilis perubahan.

**1. Tingkat akses Web App**

| Kondisi | Setelan | Alasan |
|---|---|---|
| Assessor punya akun **Google Workspace** sekolah | **`DOMAIN`** | Paling aman: halaman login pun tidak bisa dibuka dari luar domain. |
| Assessor memakai **Gmail pribadi** | `ANYONE_ANONYMOUS` | **Jangan pakai `DOMAIN`** — aplikasi akan mati total bagi mereka. |

`ANYONE_ANONYMOUS` hanya membuka *halaman login*, bukan data: semua endpoint butuh token, dan `login` butuh kredensial + dibatasi rate-limit. Namun `DOMAIN` tetap lebih baik bila memungkinkan.

**2. Version control**
Project ini belum memakai git, sedangkan `clasp push` menimpa versi cloud **tanpa jejak**. Sebelum perubahan besar:
```bash
git init && git add -A && git commit -m "baseline"
```
Jangan lupa `.claspignore` bila perlu mengecualikan berkas.

**3. Bila sudah ada data asli**
Uji perubahan struktur di **salinan Spreadsheet** terlebih dahulu. Migrasi dirancang tidak destruktif (kolom baru ditambahkan lewat header + nilai, baris `HASIL` dipetakan ulang berdasarkan nama kolom), tetapi data siswa tidak boleh jadi bahan percobaan.

**4. Setelah push**
- Jalankan Setup / Perbaiki Struktur Sheet.
- Login sebagai admin, pastikan diminta ganti PIN.
- Uji satu alur penuh: tambah peserta → nilai → finalisasi → submit → cetak.

---

## Catatan pengembangan

### Menambah sentra atau materi
Cukup edit `FORM_SCHEMA`. Yang menyesuaikan otomatis: formulir wizard, validasi kelengkapan, perhitungan, kolom sheet `HASIL`, dan preview BAB IV.

Perhitungan nilai akhir, daftar sentra, ringkasan dashboard, kolom ringkasan sheet, serta preview dan laporan cetak BAB IV mengikuti sentra yang aktif di `FORM_SCHEMA`.

Saat struktur `FORM_SCHEMA` di `Config.js` berubah, naikkan `FORM_SCHEMA_VERSION`. Skema lama yang pernah disimpan dari fitur Admin akan diselaraskan dengan struktur Config; rubrik untuk ID materi yang masih cocok akan dipertahankan.

### Dua implementasi perhitungan
Perhitungan ada di **dua tempat** dan harus dijaga sinkron:
- Server: `hitungMateri_` / `hitungHasil_` di `Calculation.js` — **inilah yang tersimpan**.
- Klien: `calcMateri` / `calcHasil` di `JS_Core.html` — untuk tampilan langsung tanpa round-trip.

Bila salah satu diubah, ubah yang lain. Endpoint `calculateResult` tersedia di server bila ingin memakai satu sumber saja (belum dipakai klien).

### Ikon
Nama ikon di `FORM_SCHEMA` (`ikon: 'moon'`) harus ada sebagai key di objek `ICONS` (`JS_Core.html`). Nama yang tidak dikenal akan **diam-diam tampil sebagai ikon `info`**, bukan error.

### Audit
Setiap penulisan data induk/akun memanggil `audit_()`. Kegagalan menulis audit hanya dicatat ke `console.log` dan tidak pernah menggagalkan operasi utama — jadi sheet `AUDIT` absen pun aplikasi tetap jalan.

---

## Batasan yang diketahui

1. **Lockout login dapat dipakai DoS.** Pembatasan 8 percobaan gagal bersifat *per-username*, sehingga pihak lain bisa mengunci akun asli selama 10 menit. Apps Script tidak menyediakan rate-limit per-IP untuk mengatasinya.
2. **PIN di-hash tanpa salt** (SHA-256 dari `username::pin`). Ruang PIN hanya 10⁴–10¹², jadi bila sheet `USERS` bocor, PIN bisa dipecahkan. Mitigasi: rate-limit + wajib ganti PIN default.
3. **Tidak ada proteksi sheet.** Siapa pun dengan akses edit Spreadsheet bisa mengubah skor langsung; aplikasi tidak mendeteksi perubahan di luar aplikasi (hanya ada jejak `AUDIT` untuk operasi lewat aplikasi).
4. **`Tailwind CSS` dimuat dari CDN** (`cdn.tailwindcss.com`, build JIT browser — bukan untuk produksi). Bila CDN diblokir jaringan sekolah, tampilan rusak total. GSAP sudah aman karena opsional (`G()` mengembalikan `null` bila gagal).
5. **Sesi tidak dapat dicabut paksa.** Token berlaku sampai 6 jam; menonaktifkan akun memang langsung memutus akses (diperiksa tiap request), tetapi tidak ada daftar sesi aktif.
6. **Tidak ada test otomatis.** `seedDummyData` adalah satu-satunya jalur verifikasi.
7. **Dua endpoint belum dipakai klien:** `getPeserta` (pencarian peserta di wizard masih filter sisi klien — cukup untuk skala ratusan peserta) dan `getUsersLite` (daftar pengguna ringkas untuk staff non-admin). Keduanya tersedia bila suatu saat dibutuhkan.
8. **Skor tidak dapat dikosongkan kembali.** Klik ulang chip yang sama tidak menghapus nilai (perilaku lama, belum diubah).
9. **Skrip `include()` untuk CSS/JS tidak punya cache-busting.** Setelah `clasp push`, pengguna mungkin masih memakai berkas lama sampai hard refresh.

---

## Pemecahan masalah

| Gejala | Penyebab & solusi |
|---|---|
| Sesi berakhir terus | Token di `localStorage` hilang/kedaluwarsa (TTL 6 jam). Login ulang. |
| "Ganti PIN default Anda dulu" | Akun masih memakai PIN default. Modal Ganti PIN wajib diselesaikan — semua tulis diblokir sampai itu. |
| Lupa PIN admin | Hapus baris admin di sheet `USERS`, jalankan Setup → PIN acak baru muncul di dialog & `ADMIN_PIN_AWAL`. |
| Kolom baru tidak muncul | Buka aplikasi sekali (login) agar migrasi `v2` berjalan, atau jalankan Setup manual. |
| Perubahan di sheet `CONFIG` tidak terbaca | Menu **3. Bersihkan Cache** (TTL cache config = 120 detik). |
| Perubahan di sheet `USERS`/`PESERTA` tidak terbaca | TTL cache 300 detik, atau Bersihkan Cache. |
| "Penilaian sentra belum lengkap — 2.1 Membaca (2 belum dinilai)" | Masih ada sel kosong di sentra tersebut. Isi semua aspek sebelum finalisasi. |
| Skor masuk ke BAB yang salah | Sudah diperbaiki: posisi langkah kini dijaga saat daftar langkah berubah. Pastikan versi terbaru sudah di-push. |
| "Spreadsheet database tidak ditemukan" | Script tidak terikat Spreadsheet. Isi `APP_CONFIG.SPREADSHEET_ID`. |
| Tampilan rusak / tanpa gaya | CDN Tailwind diblokir jaringan. Lihat [Batasan](#batasan-yang-diketahui) poin 4. |
| Entri kosong di daftar assessment | Baris "hantu" dari nilai yang dihapus manual. Kini dipangkas otomatis saat data dimuat. |

### Melihat log
Apps Script editor → **Executions** (error runtime) atau **Project Settings → Script Properties** untuk `ADMIN_PIN_AWAL` dan `SHEETS_READY`.

---

## Lisensi & kepemilikan

Aplikasi internal Sekolah Dasar Anak Saleh untuk keperluan PPDB/SPMB. Berisi data pribadi anak — perlakukan Spreadsheet dan laporan cetak sebagai dokumen terbatas.
