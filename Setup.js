/*************************************************************
 * Setup.gs — Pembuatan sheet, akun default, cache & data dummy
 *************************************************************/

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('🎯 SPMB Assessment')
      .addItem('1. Setup / Perbaiki Struktur Sheet', 'setupSheets')
      .addItem('2. Isi Data Dummy untuk Testing', 'seedDummyData')
      .addItem('3. Bersihkan Cache (setelah edit sheet manual)', 'flushAppCache')
      .addToUi();
  } catch (e) {}
}

function setupSheets() {
  ensureSheets_();
  cacheDel_(['users', 'peserta', 'cfg', 'form_schema']);
  var pinAwal = '';
  try { pinAwal = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN_AWAL') || ''; } catch (e) {}
  try {
    SpreadsheetApp.getUi().alert(
      '✅ Struktur sheet siap: PESERTA, ASSESSMENT, HASIL, CONFIG, USERS, AUDIT\n\n' +
      (pinAwal
        ? '🔑 PIN AWAL akun admin: ' + pinAwal + '\n(Salin sekarang — tidak ditampilkan lagi. WAJIB diganti saat login pertama.)\n\n'
        : 'ℹ️ Akun admin sudah ada — PIN tidak diubah.\n\n') +
      'Akun yang masih memakai PIN default otomatis ditandai "Wajib Ganti PIN" ' +
      'dan hanya bisa membaca sampai PIN-nya diganti.\n\n' +
      'Buat akun Koordinator Assesmen: Pengguna → Baru → Peran: Koordinator.'
    );
  } catch (e) {}
}

function ensureSheets_() {
  withLock_(function () {
    var ss = getSS_();

    ensureSheetWithHeaders_(ss, APP_CONFIG.SHEET.PESERTA, PESERTA_HEADERS, [1, 2, 3]);
    ensureSheetWithHeaders_(ss, APP_CONFIG.SHEET.ASSESSMENT, assessmentHeaders_(), [1, 2, 4, 6, 14, 15, 16, 17]);
    var shHasilExisting = ss.getSheetByName(APP_CONFIG.SHEET.HASIL);
    if (!shHasilExisting || shHasilExisting.getLastRow() === 0) {
      ensureSheetWithHeaders_(ss, APP_CONFIG.SHEET.HASIL, hasilHeaders_(), [1, 2, 3, 4, 6]);
    }
    ensureSheetWithHeaders_(ss, APP_CONFIG.SHEET.CONFIG, CONFIG_HEADERS, [1, 2, 3]);
    ensureSheetWithHeaders_(ss, APP_CONFIG.SHEET.USERS, USERS_HEADERS, [1, 2, 4, 5, 9]);
    ensureSheetWithHeaders_(ss, APP_CONFIG.SHEET.AUDIT, AUDIT_HEADERS, [1, 2, 3, 4, 5]);

    /* Sheet lama → tambahkan kolom baru tanpa menimpa data */
    migrateUsersSheet_(ss);
    migrateAssessmentSheet_(ss);
    refactorHasilSheet_(ss);

    var shCfg = ss.getSheetByName(APP_CONFIG.SHEET.CONFIG);
    if (shCfg.getLastRow() < 2) {
      shCfg.getRange(2, 1, 5, 3).setValues([
        ['SEKOLAH', APP_CONFIG.SEKOLAH, 'Nama sekolah'],
        ['TAHUN_PELAJARAN', APP_CONFIG.TAHUN_PELAJARAN, 'Tahun pelajaran aktif'],
        ['KODE_A_MIN', 80, 'Nilai Calistung minimal untuk Kode A (Lancar)'],
        ['KODE_B_MIN', 60, 'Nilai Calistung minimal untuk Kode B (Cukup); di bawahnya = C'],
        ['KODE_INCLUDE_ENGLISH', 'FALSE', 'TRUE jika English ikut dihitung dalam Calistung']
      ]);
    }

    /* Akun admin pertama: PIN ACAK (bukan lagi 'admin123').
     * PIN disimpan di Script Properties agar bisa dilihat operator sekali saja.
     * Baris legacy yang PIN-nya masih 'admin123' ditandai wajib ganti oleh
     * migrateUsersSheet_ — PIN-nya TIDAK diubah agar tidak mengunci admin keluar. */
    var seedPin = randomPin_();
    if (ensureUser_('admin', 'Administrator', seedPin, 'ADMIN', [], true)) {
      PropertiesService.getScriptProperties().setProperty('ADMIN_PIN_AWAL', seedPin);
      try { console.log('=== PIN AWAL AKUN admin: ' + seedPin + ' (wajib diganti saat login pertama) ==='); } catch (e) {}
    }

    try {
      ss.getSheetByName(APP_CONFIG.SHEET.PESERTA).setColumnWidths(1, 6, 150);
      var shA = ss.getSheetByName(APP_CONFIG.SHEET.ASSESSMENT);
      shA.setColumnWidth(8, 320);
      shA.setColumnWidths(1, 7, 130);
    } catch (e) {}
  });

  PropertiesService.getScriptProperties().setProperty('SHEETS_READY', SHEET_SCHEMA_VERSION);
}

function ensureSheetWithHeaders_(ss, name, headers, textFormatCols) {
  var sh = ss.getSheetByName(name);
  var isNew = !sh;
  if (isNew) sh = ss.insertSheet(name);

  var needHeader = isNew || sh.getLastRow() === 0;
  if (!needHeader) {
    var lastCol = Math.max(sh.getLastColumn(), headers.length);
    var headRow = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    needHeader = headRow.length !== headers.length || !headers.every(function (h, i) { return headRow[i] === h; });
  }

  if (needHeader) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground('#0f766e')
      .setVerticalAlignment('middle');
    sh.setFrozenRows(1);
    sh.setRowHeight(1, 32);

    if (textFormatCols && textFormatCols.length) {
      var rows = Math.min(sh.getMaxRows(), Math.max(sh.getLastRow() + 500, 1000));
      textFormatCols.forEach(function (c) {
        sh.getRange(1, c, rows, 1).setNumberFormat('@');
      });
    }
  }
  return sh;
}

/* ════════════════ MIGRASI SHEET LAMA ════════════════
 * ensureSheetWithHeaders_ menulis ulang SELURUH baris header begitu ada satu
 * nama kolom yang berbeda. Untuk USERS itu berbahaya: header baru lebih panjang
 * dari data lama → kolom bergeser. Jadi migrasi dilakukan SEBELUM pemanggilan
 * itu: cukup tambahkan header + nilai kolom baru, data lama tidak disentuh. */

function migrateUsersSheet_(ss) {
  var sh = ss.getSheetByName(APP_CONFIG.SHEET.USERS);
  if (!sh) return;
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return;

  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = head.indexOf('Wajib Ganti PIN');
  if (idx < 0) {
    sh.getRange(1, lastCol + 1).setValue('Wajib Ganti PIN').setFontWeight('bold');
    idx = lastCol;
  }
  var col = idx + 1;
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  /* Akun lama yang masih memakai PIN default diberi tanda wajib ganti.
   * Nilainya sama untuk semua baris → satu kali tulis. */
  var rows = sh.getRange(2, 1, lastRow - 1, Math.min(col, sh.getLastColumn())).getValues();
  var flags = rows.map(function (r) {
    var uname = String(r[0] || '').trim().toLowerCase();
    var hash = String(r[2] || '');
    if (!uname) return [false];
    return [!!hash && hash === hashPin_(uname, 'admin123')];
  });
  sh.getRange(2, col, flags.length, 1).setValues(flags);
}

function migrateAssessmentSheet_(ss) {
  var sh = ss.getSheetByName(APP_CONFIG.SHEET.ASSESSMENT);
  if (!sh) return;
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return;

  /* 1) Pastikan header kolom baru ada, lalu tentukan indeksnya. */
  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var uIdx = head.indexOf('Username Assessor');
  if (uIdx < 0) {
    sh.getRange(1, lastCol + 1).setValue('Username Assessor').setFontWeight('bold');
    lastCol = lastCol + 1;
    uIdx = lastCol - 1;
  }
  var aIdx = head.indexOf('Assessor');
  var lastRow = sh.getLastRow();
  if (lastRow < 2 || aIdx < 0) return;

  /* 2) Backfill dari nama assessor → username, hanya bila namanya unik di USERS.
   * Tanpa backfill ini, penilaian lama tidak bisa dibuka assessor pembuatnya. */
  var users = readUsers_();
  var rows = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var changed = false;
  rows.forEach(function (r) {
    if (String(r[uIdx] || '').trim()) return;
    var assessor = String(r[aIdx] || '');
    var matches = users.filter(function (u) { return u.nama === assessor; });
    if (matches.length === 1) { r[uIdx] = matches[0].username; changed = true; }
  });
  if (changed) sh.getRange(2, 1, rows.length, lastCol).setValues(rows);
}

/* HASIL: kolom 'Username Assessor …' DISISIPKAN sebelum 'Koordinator'.
 * Tanpa remap, baris lama akan tampak bergeser (nilai Koordinator terbaca
 * sebagai Username Assessor). Karena itu header ditulis dulu, lalu tiap baris
 * dipindahkan berdasarkan NAMA kolom, bukan posisinya. */
function refactorHasilSheet_(ss) {
  var sh = ss.getSheetByName(APP_CONFIG.SHEET.HASIL);
  if (!sh) return;
  var lastRow = sh.getLastRow();
  if (lastRow === 0) return;

  var lastCol = Math.max(sh.getLastColumn(), 1);
  var oldHead = sh.getRange(1, 1, 1, lastCol).getValues()[0].filter(function (h) { return h !== '' && h != null; });
  var newHead = hasilHeaders_();

  if (oldHead.length === newHead.length && oldHead.every(function (h, i) { return h === newHead[i]; })) return;

  var rows = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];

  sh.getRange(1, 1, 1, newHead.length).setValues([newHead])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#0f766e')
    .setVerticalAlignment('middle');
  sh.setFrozenRows(1);

  if (!rows.length) return;

  /* Baris lama dipetakan lewat nama header lama; kolom yang belum ada → kosong. */
  var pos = {};
  oldHead.forEach(function (h, i) { pos[h] = i; });
  var remapped = rows.map(function (r) {
    return newHead.map(function (h) {
      var i = pos[h];
      return (i === undefined || i >= r.length) ? '' : r[i];
    });
  });
  sh.getRange(2, 1, remapped.length, newHead.length).setValues(remapped);
}

/* PIN acak 6 digit — pengganti default 'admin123' yang tidak lagi dipakai. */
function randomPin_() {
  var n = 0;
  while (n < 100000) n = Math.floor(Math.random() * 1000000);
  return String(n);
}

function ensureUser_(username, nama, pin, role, assignments, mustChange) {
  var sh = sheet_(APP_CONFIG.SHEET.USERS);
  if (findRowByValue_(sh, 1, username) > 0) return false;
  var now = nowStr_();
  sh.appendRow([username, nama, hashPin_(username, pin), role, JSON.stringify(assignments), true, now, now, mustChange !== false]);
  return true;
}

function flushAppCache() {
  cacheDel_(['users', 'peserta', 'cfg', 'form_schema']);
  try {
    SpreadsheetApp.getUi().alert('✅ Cache aplikasi dibersihkan.\nPerubahan manual pada sheet kini langsung terlihat di aplikasi.');
  } catch (e) {}
}

/* ════════════════ DATA DUMMY ════════════════ */

function seedDummyData() {
  ensureSheets_();
  cacheDel_(['users', 'peserta', 'cfg', 'form_schema']);

  withLock_(function () {
    var shP = sheet_(APP_CONFIG.SHEET.PESERTA);
    var shA = sheet_(APP_CONFIG.SHEET.ASSESSMENT);
    if (shP.getLastRow() > 1 || shA.getLastRow() > 1) {
      throw new Error('Data sudah ada. Untuk mengisi dummy, kosongkan dulu sheet PESERTA, ASSESSMENT, dan HASIL (biarkan baris header).');
    }

    var seed = [
      ['Ahmad Fauzan Ramadhan', 'PPDB-001', 'TK Anak Saleh 1'],
      ['Aisyah Nur Fadhilah', 'PPDB-002', 'TK Anak Saleh 2'],
      ['Muhammad Rizki Pratama', 'PPDB-003', 'RA Al-Ikhlas'],
      ['Khadijah Salsabila', 'PPDB-004', 'TK Islam Terpadu Ceria']
    ];
    var ids = seed.map(function (p) {
      return savePesertaImpl_({ nama: p[0], nomor: p[1], asal_tk: p[2] }).peserta.id_peserta;
    });

    /* mustChange=false: akun dummy/testing tetap bisa dipakai tanpa ganti PIN */
    ensureUser_('ustabdullah', 'Ust. Abdullah Hakim', '1234', 'ASSESSOR', ['ubudiyah'], false);
    ensureUser_('usthasan', 'Ust. Hasan Basri', '1234', 'ASSESSOR', ['ubudiyah'], false);
    ensureUser_('ustzhfatimah', 'Ustzh. Fatimah Hasan', '1234', 'ASSESSOR', ['persiapan', 'seni'], false);
    ensureUser_('koordinator', 'Ustzh. Aminah Zahra', '1234', 'KOORDINATOR', [], false);

    var uAbdullah = { username: 'ustabdullah', nama: 'Ust. Abdullah Hakim', role: 'ASSESSOR', assignments: ['ubudiyah'] };
    var uFatimah = { username: 'ustzhfatimah', nama: 'Ustzh. Fatimah Hasan', role: 'ASSESSOR', assignments: ['persiapan', 'seni'] };
    var uKoord = { username: 'koordinator', nama: 'Ustzh. Aminah Zahra', role: 'KOORDINATOR', assignments: [] };
    var tgl = todayIso_();

    /* P1 — alur lengkap → SUBMITTED (ditandatangani koordinator) */
    var d1 = dummyDataForProfile_('tinggi');
    var id1 = saveAssessmentImpl_(uAbdullah, { id_peserta: ids[0], creator: uAbdullah.nama, tanggal: tgl, data: d1 }).assessment.id;
    saveAssessmentImpl_(uFatimah, { id: id1, id_peserta: ids[0], data: d1 });
    finalizeSentraImpl_(uAbdullah, id1, 'ubudiyah');
    finalizeSentraImpl_(uFatimah, id1, 'persiapan');
    finalizeSentraImpl_(uFatimah, id1, 'seni');
    submitAssessmentImpl_(uKoord, id1);

    /* P2 — semua final → SIAP_REVIEW */
    var d2 = dummyDataForProfile_('sedang');
    var id2 = saveAssessmentImpl_(uFatimah, { id_peserta: ids[1], creator: uFatimah.nama, tanggal: tgl, data: d2 }).assessment.id;
    saveAssessmentImpl_(uAbdullah, { id: id2, id_peserta: ids[1], data: d2 });
    finalizeSentraImpl_(uFatimah, id2, 'persiapan');
    finalizeSentraImpl_(uFatimah, id2, 'seni');
    finalizeSentraImpl_(uAbdullah, id2, 'ubudiyah');

    /* P3 — Ubudiyah milik Abdullah → DRAFT */
    var d3 = dummyDataForProfile_('sedang');
    var id3 = saveAssessmentImpl_(uAbdullah, { id_peserta: ids[2], creator: uAbdullah.nama, tanggal: tgl, data: d3 }).assessment.id;
    finalizeSentraImpl_(uAbdullah, id3, 'ubudiyah');

    /* P4 — draft parsial oleh Fatimah */
    var d4 = dummyDataForProfile_('rendah');
    var finalSentra = getFormSchema_().sentra[2];
    if (finalSentra && finalSentra.materi.length) d4[finalSentra.materi[0].id] = { skor: {}, catatan: '' };
    saveAssessmentImpl_(uFatimah, { id_peserta: ids[3], creator: uFatimah.nama, tanggal: tgl, data: d4 });
  });

  cacheDel_(['users', 'peserta', 'cfg']);
  try {
    SpreadsheetApp.getUi().alert(
      '🌱 Data dummy dibuat:\n' +
      '• 4 peserta\n' +
      '• P0001: SUBMITTED (ttd koordinator) • P0002: SIAP REVIEW • P0003: DRAFT (Ubudiyah milik Ust. Abdullah) • P0004: DRAFT parsial\n\n' +
      'Akun testing (semua siap dipakai, tanpa wajib ganti PIN):\n' +
      '• admin — lihat PIN di menu Setup (PIN acak) atau ganti dari menu Pengguna\n' +
      '• koordinator / 1234 (KOORDINATOR — submit final & ttd laporan)\n' +
      '• ustabdullah / 1234 (BAB I)\n' +
      '• usthasan / 1234 (BAB I — uji klaim)\n' +
      '• ustzhfatimah / 1234 (BAB II + III)'
    );
  } catch (e) {}
}

function dummyDataForProfile_(profile) {
  function pick() {
    var r = Math.random();
    if (profile === 'tinggi') return r < 0.75 ? 3 : (r < 0.95 ? 2 : 1);
    if (profile === 'rendah') return r < 0.15 ? 3 : (r < 0.6 ? 2 : 1);
    return r < 0.4 ? 3 : (r < 0.85 ? 2 : 1);
  }
  var data = { catatanSentra: {} };
  FORM_SCHEMA.sentra.forEach(function (s) {
    data.catatanSentra[s.id] = 'Catatan assessment untuk ' + s.singkat + '.';
    s.materi.forEach(function (m) {
      var skor = {};
      m.items.forEach(function (it) {
        if (m.tipe === 'tunggal') skor[it.id] = pick();
        else {
          var o = {};
          (it.aspek || m.aspek).forEach(function (a) { o[a.id] = pick(); });
          skor[it.id] = o;
        }
      });
      data[m.id] = { skor: skor, catatan: 'Contoh catatan untuk ' + m.nama + '.' };
    });
  });
  return data;
}
