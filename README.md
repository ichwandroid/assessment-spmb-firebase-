# Assessment SPMB — SD Anak Saleh (Full Firebase)

Aplikasi penilaian (assessment) calon peserta didik baru berbasis **Full Firebase** (Firebase Hosting + Cloud Firestore). Assessor mengisi skor per sentra melalui wizard, Koordinator/Admin memfinalisasi dan menandatangani laporan, lalu laporan dicetak per peserta.

| | |
|---|---|
| Sekolah | Sekolah Dasar Anak Saleh |
| Tahun Pelajaran | 2026/2027 (dapat disesuaikan di Firestore `config/app`) |
| Platform | Full Firebase Serverless (Hosting + Cloud Firestore) |
| Hosting URL | [https://assessment-spmb.web.app](https://assessment-spmb.web.app) |
| Database Region | Cloud Firestore (`asia-southeast2` / Jakarta) |
| Basis Data | 6 Koleksi: `peserta`, `assessments`, `hasil`, `config`, `users`, `audit` |
| Version Control | Git Repository Lokal Aktif |

---

## Daftar Isi

- [Fitur](#fitur)
- [Arsitektur](#arsitektur)
- [Struktur File](#struktur-file)
- [Peran & Hak Akses](#peran--hak-akses)
- [Model Data Firestore](#model-data-firestore)
- [Cara Penilaian Dihitung](#cara-penilaian-dihitung)
- [Deployment](#deployment)

---

## Fitur

**Penilaian**
- Wizard 4 tahap: Data Peserta → Sentra (per BAB) → Review & Finalisasi → Selesai.
- Skor 1–3 per aspek dengan chip sentuh (ramah tablet/HP), pedoman penilaian tertanam di tiap materi.
- Perhitungan otomatis: persen per materi → rerata per sentra → **Nilai Akhir** → **Kode A/B/C** dari Calistung.
- Materi `pilihTerbaik` (hafalan doa & surat pendek): hanya N nilai terbaik yang dihitung.
- **Autosave** 2,5 detik + indikator status simpan; offline persistence aktif.

**Kolaborasi & Kontrol**
- Penugasan per sentra (BAB). Beberapa assessor dapat mengerjakan peserta yang sama tanpa saling menimpa.
- **Klaim kepemilikan sentra**: begitu seorang assessor mengisi skor, sentra itu miliknya sampai difinalisasi.
- Merge per sentra dengan transaksi Firestore — assessor A tidak merusak isian assessor B.
- Finalisasi per sentra, Submit Final (tanda tangan Koordinator), dan Buka Kunci bila perlu revisi.

**Pelaporan**
- Dashboard koordinator: statistik, sebaran kode, tugas menunggu penilaian, daftar siap submit.
- Laporan cetak A4 mandiri (window baru) lengkap dengan kolom tanda tangan.
- Koleksi `hasil` terdenormalisasi: satu dokumen per assessment, siap diolah lebih lanjut.

**Keamanan**
- Sesi login username + PIN di `localStorage` (SHA-256).
- Rate-limit 8 percobaan gagal per 10 menit.
- Aturan keamanan ketat via [firestore.rules](file:///k:/FILE%20MULTIMEDIA/assessment-spmb/firestore.rules).
- Jejak audit di koleksi `audit`.

---

## Arsitektur

```
Browser Klien (SPA) 
  ├── public/index.html
  ├── public/css/style.css
  └── public/js/
        ├── config.js          (Skema & Config SPMB)
        ├── calc.js            (Perhitungan & Validasi Skor)
        ├── firebase-config.js (Koneksi Firebase App & Firestore)
        ├── firebase-service.js(Layanan Auth & Firestore CRUD)
        ├── app.js             (Router UI, Dashboard, Pengguna, Cetak)
        └── wizard.js          (Formulir Wizard & Autosave)
            │
            ▼
    Cloud Firestore (asia-southeast2 / Jakarta)
    [peserta] [assessments] [hasil] [config] [users] [audit]
```

---

## Struktur File

```
assessment-spmb/
├── firebase.json              # Konfigurasi Firebase Hosting & Firestore
├── .firebaserc                # Target project Firebase (assessment-spmb)
├── firestore.rules            # Aturan keamanan database Firestore
├── firestore.indexes.json      # Konfigurasi indeks Firestore
├── README.md                  # Dokumentasi project
└── public/                    # Direktori Web Hosting
    ├── index.html             # Single Page App shell
    ├── 404.html               # Halaman fallback 404
    ├── css/
    │   └── style.css          # Styling chip skor, akordion, print A4
    └── js/
        ├── config.js          # Definisi FORM_SCHEMA & parameter ambang
        ├── calc.js            # Rumus skoring materi, sentra & calistung
        ├── firebase-config.js # Inisialisasi Firebase Web SDK
        ├── firebase-service.js# Operasi Firestore & Auth
        ├── app.js             # Navigasi, views, modals, dashboard
        └── wizard.js          # Wizard penilaian multi-step
```

---

## Peran & Hak Akses

| Kemampuan | ASSESSOR | KOORDINATOR SENTRA | KOORDINATOR | ADMIN |
|---|:--:|:--:|:--:|:--:|
| Menilai sentra yang ditugaskan | ✅ | — | ✅ (semua) | ✅ (semua) |
| Melihat aktivitas sentra tugas | hanya miliknya / sentra tugasnya | ✅ | ✅ | ✅ |
| Finalisasi sentra | ✅ | ✅ (sentra tugas) | ✅ | ✅ |
| Tarik finalisasi / pindah tugas | — | ✅ (sentra tugas) | ✅ | ✅ |
| Submit Final / buka kunci | — | — | ✅ | ✅ |
| Tambah/ubah data peserta | — | — | ✅ | ✅ |
| Kelola pengguna & soal | — | — | — | ✅ |

Penilaian dapat dimulai dari sentra mana pun. Setelah satu sentra mulai
dikerjakan, sentra tersebut harus berstatus **FINAL** sebelum tim berpindah ke
sentra lain, termasuk bila sentra berikutnya ditangani oleh guru yang berbeda.
Assessment yang seluruh sentranya telah **FINAL** hanya dapat diakses oleh
Koordinator dan Admin. Pemindahan tugas hanya dapat dilakukan saat sentra
masih berstatus **DRAFT**.

---

## Deployment

Deploy perubahan ke Firebase kapan saja dengan:
```bash
# Deploy Hosting (Frontend)
firebase deploy --only hosting

# Deploy Aturan Firestore (Rules)
firebase deploy --only firestore:rules

# Deploy Semua
firebase deploy
```
