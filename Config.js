/*************************************************************
 * Config.gs — KONFIGURASI & SKEMA FORMULIR ASSESSMENT
 * PPDB SD Anak Saleh — Tahun Pelajaran 2026/2027
 *
 * File ini adalah SATU-SATUNYA tempat definisi struktur penilaian.
 * Jika materi/aspek berubah, cukup ubah di sini — aplikasi
 * (form, validasi, perhitungan, sheet HASIL) menyesuaikan otomatis.
 *************************************************************/

const APP_CONFIG = {
  // Kosongkan ('') jika script dibuat dari Spreadsheet (Extensions > Apps Script)
  SPREADSHEET_ID: '',

  SHEET: {
    PESERTA: 'PESERTA',
    ASSESSMENT: 'ASSESSMENT',
    HASIL: 'HASIL',
    CONFIG: 'CONFIG',
    USERS: 'USERS',
    AUDIT: 'AUDIT'
  },

  SEKOLAH: 'Sekolah Dasar Anak Saleh',
  TAHUN_PELAJARAN: '2026/2027',

  // Kode Hasil Asesmen dari rerata Calistung (2.1, 2.2, 2.3)
  KODE_A_MIN: 80,
  KODE_B_MIN: 60,
  KODE_INCLUDE_ENGLISH: false
};

/* Versi struktur sheet. Naikkan setiap kali ada kolom/sheet baru supaya
 * migrasi otomatis berjalan sekali pada deployment yang sudah terisi data. */
const SHEET_SCHEMA_VERSION = 'v3';
/* Naikkan saat struktur FORM_SCHEMA di Config.js diedit. Skema hasil kelola
 * Admin akan direbase ke struktur ini, sementara rubrik yang cocok dipertahankan. */
const FORM_SCHEMA_VERSION = 'v3';

const PESERTA_HEADERS = ['ID Peserta','Nama Peserta','Nomor Peserta','Asal TK/RA/PAUD','Waktu Dibuat','Waktu Diubah'];
function assessmentHeaders_() {
  var h = ['ID Assessment','ID Peserta','Nama Peserta','Nomor Peserta','Assessor','Tanggal','Status','Data Penilaian (JSON)'];
  FORM_SCHEMA.sentra.forEach(function (s) { h.push('Rerata ' + s.singkat); });
  return h.concat(['Nilai Akhir','Kode','Waktu Dibuat','Waktu Diubah','Waktu Submit','Log Edit','Username Assessor']);
}
const CONFIG_HEADERS = ['Kunci','Nilai','Keterangan'];
const USERS_HEADERS = ['Username','Nama','PIN Hash','Peran','Penugasan (JSON)','Aktif','Dibuat','Diubah','Wajib Ganti PIN'];
const AUDIT_HEADERS = ['Waktu','Oleh','Aksi','Target','Detail'];

/*************************************************************
 * FORM_SCHEMA — struktur formulir assessment (acuan PDF asli)
 * tipe 'tunggal': 1 item = 1 skor (3/2/1) → pakai labelNilai
 * tipe 'aspek'  : 1 item dinilai per aspek (masing-masing 3/2/1)
 *                aspek bisa di level materi, atau per-item (menulis)
 * pilihTerbaik  : hanya N item nilai terbaik yang dihitung
 *************************************************************/
var FORM_SCHEMA = {
  sentra: [
    {
      id: 'ubudiyah', bab: 'BAB I', nama: 'Sentra Ubudiyah', singkat: 'Ubudiyah', ikon: 'moon',
      materi: [
        {
          id: 'wudhu', no: '1.1', nama: 'Praktek Wudhu dan Sholat', tipe: 'tunggal',
          labelNilai: { '3': 'Mandiri', '2': 'Sedikit Bantuan', '1': 'Banyak Bantuan' },
          pedoman: [
            'Nilai 3 jika ananda mampu mempraktikkan sesuai aspek penilaian dengan benar (tanpa bimbingan)',
            'Nilai 2 jika ananda mampu mempraktikkan sesuai aspek penilaian dengan bimbingan',
            'Nilai 1 jika ananda belum mampu mempraktikkan sesuai aspek penilaian'
          ],
          items: [
            { id: 'niat', nama: 'Niat dan Gerakan dalam Berwudhu '},
            { id: 'gerakan', nama: 'Niat dan Gerakan Sholat' },
            { id: 'ketertiban', nama: 'Bacaan Sholat' }
          ]
        },
        {
          id: 'doa', no: '1.2', nama: 'Hafalan Doa Sehari-hari', tipe: 'aspek',
          aspek: [
            { id: 'kelancaran', nama: 'Kelancaran' },
            { id: 'ketepatan', nama: 'Ketepatan' },
            { id: 'sikap', nama: 'Sikap' }
          ],
          pilihTerbaik: 2,
          catatanKaki: 'Dihitung 2 doa yang dihafal dengan nilai terbaik',
          pedoman: [
            'Kelancaran — 3: sangat lancar; 2: cukup lancar; 1: membutuhkan bimbingan dalam melafalkan',
            'Ketepatan — 3: tepat makhrajnya; 2: mampu melafalkan, makhraj kurang tepat; 1: belum mampu melafalkan dengan tepat makhrajnya',
            'Sikap — 3: khusyu\u2019; 2: kurang khusyu\u2019; 1: membutuhkan bimbingan'
          ],
          items: [
            { id: 'doa_sebelum_makan', nama: 'Doa Sebelum Makan' },
            { id: 'doa_setelah_makan', nama: 'Doa Setelah Makan' }
          ]
        },
        {
          id: 'surat_pendek', no: '1.3', nama: 'Hafalan Surat-Surat Pendek', tipe: 'aspek',
          aspek: [
            { id: 'kelancaran', nama: 'Kelancaran' },
            { id: 'makhraj', nama: 'Makhraj' },
            { id: 'ketepatan', nama: 'Ketepatan' }
          ],
          pilihTerbaik: 2,
          catatanKaki: 'Surat dipilih secara acak; dihitung 2 surat dengan nilai terbaik',
          pedoman: [
            'Ananda membaca surat secara acak',
            'Nilai 3 jika mampu melafalkan dengan sangat baik sesuai ketentuan (tanpa bimbingan)',
            'Nilai 2 jika cukup baik sesuai ketentuan (dengan bimbingan)',
            'Nilai 1 jika belum mampu membaca dengan baik'
          ],
          items: [
            { id: 'alfatihah', nama: 'Al-Fatihah' },
            { id: 'alikhlas', nama: 'Al-Ikhlas' }
          ]
        }
      ]
    },
    {
      id: 'persiapan', bab: 'BAB II', nama: 'Sentra Persiapan', singkat: 'Persiapan', ikon: 'book',
      materi: [
        {
          id: 'membaca', no: '2.1', nama: 'Membaca (Pengenalan Huruf)', tipe: 'aspek',
          aspek: [
            { id: 'kelancaran', nama: 'Kelancaran' },
            { id: 'pengucapan', nama: 'Pengucapan' },
            { id: 'ketepatan', nama: 'Ketepatan' }
          ],
          pedoman: [
            'Nilai 3 jika mampu melafalkan dengan lancar (tanpa bimbingan)',
            'Nilai 2 jika mampu dengan sedikit bimbingan',
            'Nilai 1 jika belum mampu melafalkan dengan lancar (banyak bimbingan)'
          ],
          items: [
            { id: 'huruf_az', nama: 'Melafalkan huruf A-Z secara urut (klasikal)' },
            { id: 'suku_kata', nama: 'Membaca Suku Kata (individu)' },
            { id: 'per_kata', nama: 'Membaca per Kata (individu)' }
          ]
        },
        {
          id: 'menulis', no: '2.2', nama: 'Menulis / Dikte', tipe: 'aspek',
          pedoman: [
            'Nilai 3 jika mampu menulis sesuai ketentuan dengan benar (tanpa bimbingan)',
            'Nilai 2 jika mampu menulis sesuai ketentuan dengan sedikit bimbingan',
            'Nilai 1 jika belum mampu menulis sesuai ketentuan dengan benar (banyak bimbingan)'
          ],
          items: [
            {
              id: 'teknik_menulis', nama: 'Teknik Menulis',
              aspek: [
                { id: 'cara_memegang_pensil', nama: 'Cara Memegang Pensil' },
                { id: 'ketepatan_menulis_huruf', nama: 'Ketepatan Menulis Huruf' },
                { id: 'bentuk_huruf', nama: 'Bentuk Huruf' }
              ]
            },
            {
              id: 'menulis_nama_benda', nama: 'Menulis Nama Benda',
              aspek: [
                { id: 'kesesuaian_objek', nama: 'Kesesuaian dengan Objek yang Ditulis' },
                { id: 'kelengkapan_huruf', nama: 'Kelengkapan Huruf dalam Kata' },
                { id: 'ketepatan_ejaan', nama: 'Ketepatan Ejaan (penggunaan huruf kapital)' }
              ]
            }
          ]
        },
        {
          id: 'berhitung', no: '2.3', nama: 'Berhitung', tipe: 'aspek',
          aspek: [
            { id: 'kelancaran', nama: 'Kelancaran' },
            { id: 'ketepatan', nama: 'Ketepatan' }
          ],
          pedoman: [
            'Nilai 3 jika mampu berhitung sesuai ketentuan dengan benar (tanpa bimbingan)',
            'Nilai 2 jika mampu berhitung sesuai ketentuan dengan sedikit bimbingan',
            'Nilai 1 jika belum mampu berhitung sesuai ketentuan dengan benar (banyak bimbingan)'
          ],
          items: [
            { id: 'membilang_urut', nama: 'Membilang Urut Maju (1-10)' },
            { id: 'membilang_urut_mundur', nama: 'Membilang Urut Mundur (10-1)' },
            { id: 'lambang_bilangan', nama: 'Menuliskan Lambang Bilangan Secara Acak (1-10)' },
            { id: 'membilang_benda', nama: 'Membilang Banyak Benda' },
            { id: 'membandingkan', nama: 'Membandingkan Banyak dan Ukuran Benda' }
          ]
        },
        {
          id: 'english', no: '2.4', nama: 'English', tipe: 'tunggal',
          labelNilai: { '3': 'Baik', '2': 'Cukup', '1': 'Kurang' },
          pedoman: [
            'Nilai 3 (Baik) jika mampu sesuai ketentuan tanpa bimbingan',
            'Nilai 2 (Cukup) jika mampu dengan sedikit bimbingan',
            'Nilai 1 (Kurang) jika belum mampu / banyak bimbingan'
          ],
          items: [
            { id: 'listening', nama: 'Listening about Colour' },
            { id: 'colouring', nama: 'Speaking (Introduction and Greeting)' },
            { id: 'cutting', nama: 'Vocabulary About Fruits' },
            { id: 'tracing', nama: 'Vocabulary About Animals' }
          ]
        }
      ]
    },
    {
      id: 'seni', bab: 'BAB III', nama: 'Sentra Eksplorasi Diri', singkat: 'Eksplorasi Diri', ikon: 'palette',
      materi: [
        {
          id: 'motorik', no: '3.1', nama: 'Aspek Motorik', tipe: 'tunggal',
          labelNilai: { '3': 'Baik', '2': 'Cukup', '1': 'Kurang' },
          pedoman: [
            'Nilai 3 (Baik) jika mampu sesuai ketentuan tanpa bimbingan',
            'Nilai 2 (Cukup) jika mampu dengan sedikit bimbingan',
            'Nilai 1 (Kurang) jika belum mampu / banyak bimbingan'
          ],
          items: [
            { id: 'koordinasi', nama: 'Koordinasi mata dan tangan (meronce)' },
            { id: 'finger_painting', nama: 'Finger Painting '},
            { id: 'tracing_cuting', nama: 'Tracing dan Menggunting' },
            { id: 'mencocok_pola', nama: 'Mencocok Pola dengan Jarum' },
            { id: 'keseimbangan', nama: 'Keseimbangan (meniti papan titian)' },
            { id: 'lompat', nama: 'Melompat, meloncat, dan merayap' },
            { id: 'gerak_kombinasi', nama: 'Gerak kombinasi tangan dan kaki' },
            { id: 'meniup_balon', nama: 'Meniup mainan balon' },
            { id: 'duduk_tertib', nama: 'Duduk tertib dan tegap selama belajar' },
            { id: 'eye_contact', nama: 'Eye Contact' }
          ]
        },
        {
          id: 'sosial_emosional', no: '3.2', nama: 'Sosial Emosional', tipe: 'tunggal',
          labelNilai: { '3': 'Baik', '2': 'Cukup', '1': 'Kurang' },
          pedoman: [
            'Nilai 3 (Baik) jika mampu sesuai ketentuan tanpa bimbingan',
            'Nilai 2 (Cukup) jika mampu dengan sedikit bimbingan',
            'Nilai 1 (Kurang) jika belum mampu / banyak bimbingan'
          ],
          items: [
            { id: 'kemandirian_1', nama: 'Kalau pagi hari, apa saja yang biasanya kamu lakukan sendiri setelah bangun tidur sampai siap berangkat sekolah?', detail:'Kemandirian' },
            { id: 'kemandirian_2', nama: 'Kalau tiba-tiba di sekolah perutmu sakit dan ingin pup, apa yang akan kamu lakukan? ', detail:'Kemandirian' },
            { id: 'tanggung_jawab_1', nama: 'Kenapa ya mainan yang sudah selesai dipakai harus dirapikan lagi ke tempatnya? Apa yang terjadi kalau dibiarkan berantakan?', detail:'Tanggung Jawab' },
            { id: 'tanggung_jawab_2', nama: 'Kalau pulang sekolah, sepatu sebaiknya ditaruh di mana? Kenapa tidak boleh dilempar sembarangan?', detail:'Tanggung Jawab' },
            { id: 'pengelolaan_emosi_1', nama: 'Pernah tidak kamu ingin beli mainan/es krim tapi Mama bilang "tidak boleh"? Waktu itu kamu ngapain? Menangis atau bagaimana?', detail:'Pengelolaan Emosi' },
            { id: 'pengelolaan_emosi_2', nama: 'Kalau kamu sedang bermain dengan temanmu, lalu jatuh dan lututmu sakit, kamu bakal bagaimana?', detail:'Pengelolaan Emosi' },
            { id: 'meminta_bantuan_dan_sosialisasi_1', nama: 'Nanti di kelas, kalau kamu tidak bisa membuka tutup botol minummu, kamu mau minta tolong ke siapa? Bagaimana cara bilangnya? ', detail:'Meminta bantuan dan sosialisasi' },
            { id: 'meminta_bantuan_dan_sosialisasi_2', nama: 'Apakah kamu pernah bertengkar dengan teman atau saudara? Bagaimana caramu berbaikan jika sedang bertengkar dengan teman atau saudara?', detail:'Meminta bantuan dan sosialisasi' }
          ]
        }
      ]
    }
  ],
  kode: [
    { kode: 'A', label: 'Lancar dalam aspek Calistung' },
    { kode: 'B', label: 'Cukup dalam aspek Calistung' },
    { kode: 'C', label: 'Butuh bimbingan dalam aspek Calistung' }
  ]
};
