/*************************************************************
 * Services.gs — Sheets, CRUD, otorisasi, kepemilikan sentra,
 * koordinator penanda tangan, agregasi & cache layer.
 *************************************************************/

/* ════════════════ UTILITAS UMUM ════════════════ */

function guard_(fn) {
  try { return fn(); }
  catch (e) {
    var msg = (e && e.message) ? e.message : String(e);
    try { console.error('APP ERROR: ' + msg); } catch (ignored) {}
    return { ok: false, message: msg };
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function tz_() { return Session.getScriptTimeZone() || 'Asia/Jakarta'; }
function nowStr_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'); }
function todayIso_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }

function getSS_() {
  if (APP_CONFIG.SPREADSHEET_ID) return SpreadsheetApp.openById(APP_CONFIG.SPREADSHEET_ID);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Spreadsheet database tidak ditemukan. Ikat script ke Spreadsheet atau isi APP_CONFIG.SPREADSHEET_ID.');
  return ss;
}

function sheet_(name) {
  var sh = getSS_().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" belum ada. Jalankan setupSheets terlebih dahulu.');
  return sh;
}

/* Baris yang hanya menyisakan format (nilai sudah dihapus manual) tetap
 * dihitung getLastRow(), sehingga reads mengembalikan objek dengan semua kolom
 * kosong — inilah penyebab entri "hantu" di daftar. Pangkas bila beruntun. */
function trimEmptyTail_(sh) {
  try {
    var last = sh.getLastRow();
    if (last < 2) return;
    var lastCol = Math.max(sh.getLastColumn(), 1);
    var from = Math.max(2, last - 200);
    var rows = sh.getRange(from, 1, last - from + 1, lastCol).getValues();
    var kosong = 0;
    for (var i = rows.length - 1; i >= 0; i--) {
      var isi = false;
      for (var j = 0; j < rows[i].length; j++) {
        if (rows[i][j] !== '' && rows[i][j] != null) { isi = true; break; }
      }
      if (isi) break;
      kosong++;
    }
    if (kosong >= 3) sh.deleteRows(last - kosong + 1, kosong);
  } catch (e) { /* pembersihan bersifat opsional */ }
}

function readAll_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var lastCol = sh.getLastColumn();
  var vals = sh.getRange(1, 1, last, lastCol).getValues();
  var head = vals[0];
  /* Header bisa lebih pendek dari data (kolom baru ditambahkan manual ke data
   * tanpa header). Isi nama kolom yang hilang agar tidak jadi key "undefined". */
  for (var c = 0; c < lastCol; c++) {
    if (head[c] === '' || head[c] == null) head[c] = 'Kolom ' + (c + 1);
  }
  return vals.slice(1).map(function (row) {
    var o = {};
    head.forEach(function (h, i) { o[h] = row[i]; });
    return o;
  });
}

function rowToObj_(sh, rowIdx) {
  var lastCol = sh.getLastColumn();
  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var row = sh.getRange(rowIdx, 1, 1, lastCol).getValues()[0];
  var o = {};
  head.forEach(function (h, i) { o[h] = row[i]; });
  return o;
}

function findRowByValue_(sh, col, val) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var vals = sh.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(val)) return i + 2;
  }
  return -1;
}

function generateId_(sh, prefix, col) {
  var last = sh.getLastRow();
  var max = 0;
  if (last > 1) {
    var ids = sh.getRange(2, col, last - 1, 1).getValues();
    ids.forEach(function (row) {
      var m = String(row[0]).match(new RegExp('^' + prefix + '(\\d+)$'));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
  }
  return prefix + ('0000' + (max + 1)).slice(-4);
}

function safeParse_(json) {
  try { var v = JSON.parse(json); return (v && typeof v === 'object') ? v : {}; } catch (e) { return {}; }
}

function pushLog_(old, entry) {
  var arr = safeParse_(old);
  if (!Array.isArray(arr)) arr = [];
  arr.push(entry);
  return JSON.stringify(arr.slice(-20));
}

/* Jejak audit perubahan data induk & akun. Sengaja tidak pernah melempar error:
 * kegagalan menulis audit tidak boleh membatalkan operasi utama. */
function audit_(user, action, target, detail) {
  try {
    var sh = getSS_().getSheetByName(APP_CONFIG.SHEET.AUDIT);
    if (!sh) return;
    sh.appendRow([
      nowStr_(),
      (user && user.username ? user.username : 'sistem') + (user && user.nama ? ' (' + user.nama + ')' : ''),
      String(action || ''),
      clampStr_(target, 120),
      clampStr_(detail, 500)
    ]);
  } catch (e) {
    try { console.log('AUDIT GAGAL: ' + action + ' → ' + target + ' | ' + (e && e.message)); } catch (ignored) {}
  }
}

function normalizeTanggal_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s) {
    var d = new Date(s);
    if (!isNaN(d)) return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd');
  }
  return '';
}

/* ════════════════ CACHE LAYER ════════════════ */

var CACHE_TTL_SHORT = 120;
var CACHE_TTL_MED = 300;

function cacheGet_(key) {
  try {
    var v = CacheService.getScriptCache().get(key);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}

function cachePut_(key, val, ttl) {
  try { CacheService.getScriptCache().put(key, JSON.stringify(val), ttl || CACHE_TTL_MED); }
  catch (e) { /* >100KB → skip */ }
}

function cacheDel_(keys) {
  try { CacheService.getScriptCache().removeAll(keys); } catch (e) {}
}

function getUsersCached_() {
  var u = cacheGet_('users');
  if (!u) { u = readUsers_(); cachePut_('users', u, CACHE_TTL_MED); }
  return u;
}
function getPesertaRowsCached_() {
  var rows = cacheGet_('peserta');
  if (!rows) {
    rows = readAll_(sheet_(APP_CONFIG.SHEET.PESERTA));
    cachePut_('peserta', rows, CACHE_TTL_MED);
  }
  return rows;
}

/* ════════════════ CONFIG ════════════════ */

function getConfigMap_() {
  var cached = cacheGet_('cfg');
  if (cached) return cached;
  var map = {
    SEKOLAH: APP_CONFIG.SEKOLAH,
    TAHUN_PELAJARAN: APP_CONFIG.TAHUN_PELAJARAN,
    KODE_A_MIN: APP_CONFIG.KODE_A_MIN,
    KODE_B_MIN: APP_CONFIG.KODE_B_MIN,
    KODE_INCLUDE_ENGLISH: APP_CONFIG.KODE_INCLUDE_ENGLISH
  };
  try {
    var sh = getSS_().getSheetByName(APP_CONFIG.SHEET.CONFIG);
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
        var key = String(r[0] || '').trim();
        if (key && key !== 'FORM_SCHEMA_JSON') map[key] = r[1];
      });
    }
  } catch (e) {}
  cachePut_('cfg', map, CACHE_TTL_SHORT);
  return map;
}

/* Skema aktif dapat dioverride dari CONFIG oleh Admin. FORM_SCHEMA tetap
 * menjadi fallback awal agar instalasi lama tidak memerlukan migrasi manual. */
function getFormSchema_() {
  var cached = cacheGet_('form_schema');
  if (cached && cached.sentra && cached._version === FORM_SCHEMA_VERSION) return cached;
  var schema = JSON.parse(JSON.stringify(FORM_SCHEMA));
  try {
    var sh = sheet_(APP_CONFIG.SHEET.CONFIG);
    var row = findRowByValue_(sh, 1, 'FORM_SCHEMA_JSON');
    if (row > 0) {
      var raw = sh.getRange(row, 2).getValue();
      var parsed = JSON.parse(String(raw || ''));
      if (parsed && Array.isArray(parsed.sentra)) {
        schema = parsed._version === FORM_SCHEMA_VERSION ? parsed : rebaseAdminSchema_(schema, parsed);
      }
    }
  } catch (e) {}
  schema._version = FORM_SCHEMA_VERSION;
  cachePut_('form_schema', schema, CACHE_TTL_MED);
  return schema;
}

function rebaseAdminSchema_(base, previous) {
  var oldSentra = {};
  (previous.sentra || []).forEach(function (s) { oldSentra[s.id] = s; });
  base.sentra.forEach(function (s) {
    var old = oldSentra[s.id];
    if (!old) return;
    var oldMateri = {};
    (old.materi || []).forEach(function (m) { oldMateri[m.id] = m; });
    s.materi.forEach(function (m) {
      var prior = oldMateri[m.id];
      if (!prior) return;
      ['labelNilai', 'rubrikNilai', 'rubrikAspek', 'pedoman'].forEach(function (key) {
        if (prior[key] !== undefined) m[key] = prior[key];
      });
    });
  });
  return base;
}

function saveAssessmentQuestionImpl_(user, payload) {
  if (!payload || !['add', 'edit', 'delete'].includes(payload.action)) throw new Error('Aksi soal tidak valid.');
  var schema = getFormSchema_();
  schema._version = FORM_SCHEMA_VERSION;
  var sentra = schema.sentra.find(function (s) { return s.id === String(payload.sentraId || ''); });
  var materi = sentra && sentra.materi.find(function (m) { return m.id === String(payload.materiId || ''); });
  if (!materi) throw new Error('Materi tidak ditemukan.');
  var itemId = String(payload.itemId || '');
  var item = itemId && materi.items.find(function (x) { return x.id === itemId; });
  if (payload.action !== 'add' && !item) throw new Error('Soal tidak ditemukan. Muat ulang halaman.');
  if (payload.action === 'delete') {
    if (materi.items.length <= 1) throw new Error('Setiap materi harus memiliki minimal satu soal.');
    materi.items = materi.items.filter(function (x) { return x.id !== itemId; });
  } else {
    var nama = String(payload.nama || '').trim();
    if (!nama || nama.length > 180) throw new Error('Teks soal wajib diisi (maksimal 180 karakter).');
    if (payload.action === 'add') {
      var base = nama.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) || 'soal';
      var id = base, suffix = 2;
      while (materi.items.some(function (x) { return x.id === id; })) id = base + '_' + suffix++;
      var newItem = { id: id, nama: nama };
      if (materi.tipe === 'aspek' && !materi.aspek && materi.items.length && materi.items[0].aspek) {
        newItem.aspek = JSON.parse(JSON.stringify(materi.items[0].aspek));
        newItem.aspek.forEach(function (a) {
          var aspectBase = a.id;
          a.id = aspectBase + '_' + id;
        });
      }
      materi.items.push(newItem);
      itemId = id;
    } else item.nama = nama;
  }
  var sh = sheet_(APP_CONFIG.SHEET.CONFIG);
  var row = findRowByValue_(sh, 1, 'FORM_SCHEMA_JSON');
  var json = JSON.stringify(schema);
  if (row > 0) sh.getRange(row, 2).setValue(json);
  else sh.appendRow(['FORM_SCHEMA_JSON', json, 'Skema soal aktif; dikelola dari aplikasi Admin']);
  cacheDel_(['form_schema']);
  audit_(user, 'SOAL_' + payload.action.toUpperCase(), sentra.id + '/' + materi.id + '/' + itemId,
    payload.action === 'delete' ? 'Soal dihapus' : String(payload.nama || '').trim());
  return { schema: schema };
}

function saveAssessmentRubricImpl_(user, payload) {
  if (!payload) throw new Error('Data rubrik wajib diisi.');
  var schema = getFormSchema_();
  schema._version = FORM_SCHEMA_VERSION;
  var sentra = schema.sentra.find(function (s) { return s.id === String(payload.sentraId || ''); });
  var materi = sentra && sentra.materi.find(function (m) { return m.id === String(payload.materiId || ''); });
  if (!materi) throw new Error('Materi tidak ditemukan.');
  var labels = {}, desc = {}, aspectRubric = Object.assign({}, materi.rubrikAspek || {});
  ['3', '2', '1'].forEach(function (score) {
    labels[score] = String((payload.labelNilai || {})[score] || '').trim();
    desc[score] = String((payload.rubrikNilai || {})[score] || '').trim();
    if (!labels[score] || labels[score].length > 50) throw new Error('Label skor 3, 2, dan 1 wajib diisi (maksimal 50 karakter).');
    if (desc[score].length > 500) throw new Error('Deskripsi tiap skor maksimal 500 karakter.');
  });
  rubricCriteria_(materi).forEach(function (criterion) {
    var incoming = (payload.rubrikAspek || {})[criterion.key] || {};
    aspectRubric[criterion.key] = aspectRubric[criterion.key] || {};
    ['3', '2', '1'].forEach(function (score) {
      var value = String(incoming[score] || '').trim();
      if (value.length > 500) throw new Error('Deskripsi tiap sel rubrik maksimal 500 karakter.');
      aspectRubric[criterion.key][score] = value;
    });
  });
  var pedoman = Array.isArray(payload.pedoman) ? payload.pedoman.map(function (p) { return String(p || '').trim(); }).filter(Boolean) : [];
  if (pedoman.length > 12 || pedoman.some(function (p) { return p.length > 500; })) throw new Error('Pedoman maksimal 12 baris, masing-masing 500 karakter.');
  materi.labelNilai = labels;
  materi.rubrikNilai = desc;
  materi.rubrikAspek = aspectRubric;
  materi.pedoman = pedoman;
  var sh = sheet_(APP_CONFIG.SHEET.CONFIG);
  var row = findRowByValue_(sh, 1, 'FORM_SCHEMA_JSON');
  var json = JSON.stringify(schema);
  if (row > 0) sh.getRange(row, 2).setValue(json);
  else sh.appendRow(['FORM_SCHEMA_JSON', json, 'Skema soal dan rubrik aktif; dikelola dari aplikasi Admin']);
  cacheDel_(['form_schema']);
  audit_(user, 'RUBRIK_UBAH', sentra.id + '/' + materi.id, 'Rubrik skor 3/2/1 diperbarui');
  return { schema: schema };
}

function rubricCriteria_(materi) {
  var groups = [], seen = {};
  (materi.items || []).forEach(function (item) {
    (item.aspek || materi.aspek || []).forEach(function (aspek) {
      var key = (item.aspek ? item.id + '__' : '') + aspek.id;
      if (seen[key]) return;
      seen[key] = true;
      groups.push({ key: key, nama: aspek.nama, itemNama: item.aspek ? item.nama : '' });
    });
  });
  return groups;
}

function getPublicConfig_() {
  var map = getConfigMap_();
  return {
    sekolah: String(map.SEKOLAH || APP_CONFIG.SEKOLAH),
    tahunPelajaran: String(map.TAHUN_PELAJARAN || APP_CONFIG.TAHUN_PELAJARAN),
    kode: {
      aMin: toNum_(map.KODE_A_MIN, 80),
      bMin: toNum_(map.KODE_B_MIN, 60),
      includeEnglish: String(map.KODE_INCLUDE_ENGLISH).toUpperCase() === 'TRUE'
    },
    kodeList: getFormSchema_().kode
  };
}

/* ════════════════ USERS ════════════════ */

function readUsers_() {
  return readAll_(sheet_(APP_CONFIG.SHEET.USERS)).map(function (r) {
    var asg = [];
    try { asg = JSON.parse(r['Penugasan (JSON)'] || '[]'); if (!Array.isArray(asg)) asg = []; } catch (e) {}
    var roleRaw = String(r['Peran'] || 'ASSESSOR').toUpperCase();
    var role = (roleRaw === 'ADMIN' || roleRaw === 'KOORDINATOR') ? roleRaw : 'ASSESSOR';
    var mustRaw = r['Wajib Ganti PIN'];
    return {
      username: String(r['Username'] || '').trim().toLowerCase(),
      nama: String(r['Nama'] || ''),
      pinHash: String(r['PIN Hash'] || ''),
      role: role,
      assignments: asg,
      aktif: !(r['Aktif'] === false || String(r['Aktif']).toUpperCase() === 'FALSE'),
      pinHarusDiganti: mustRaw === true || String(mustRaw).toUpperCase() === 'TRUE',
      dibuat: String(r['Dibuat'] || ''),
      diubah: String(r['Diubah'] || '')
    };
  });
}

function findUserByUsername_(username) {
  var users = getUsersCached_();
  username = String(username || '').trim().toLowerCase();
  for (var i = 0; i < users.length; i++) if (users[i].username === username) return users[i];
  return null;
}

function userRowIndex_(username) {
  var sh = sheet_(APP_CONFIG.SHEET.USERS);
  return findRowByValue_(sh, 1, String(username || '').trim().toLowerCase());
}

/* Perubahan parsial pada satu sel/kolom USERS tanpa menyentuh kolom lain.
 * Dipakai changeMyPinImpl_ (ganti PIN sendiri) dan setUserActiveImpl_. */
function applyUserPatch_(username, patch) {
  var sh = sheet_(APP_CONFIG.SHEET.USERS);
  var idx = userRowIndex_(username);
  if (idx < 0) throw new Error('Pengguna tidak ditemukan: ' + username);
  var row = sh.getRange(idx, 1, 1, USERS_HEADERS.length).getValues()[0];
  var i;
  for (i = 0; i < USERS_HEADERS.length; i++) {
    var key = USERS_HEADERS[i];
    if (Object.prototype.hasOwnProperty.call(patch, key)) row[i] = patch[key];
  }
  if (!Object.prototype.hasOwnProperty.call(patch, 'Diubah')) {
    row[USERS_HEADERS.indexOf('Diubah')] = nowStr_();
  }
  sh.getRange(idx, 1, 1, USERS_HEADERS.length).setValues([row]);
}

function getUsersImpl_() {
  return getUsersCached_().map(function (u) {
    return {
      username: u.username, nama: u.nama, role: u.role, assignments: u.assignments,
      aktif: u.aktif,
      pinDefault: u.pinHash === hashPin_(u.username, 'admin123'),
      pinHarusDiganti: !!u.pinHarusDiganti,
      diubah: u.diubah
    };
  });
}

/* Daftar ringkas untuk staff non-admin: tanpa hash/PIN, hanya untuk menampilkan
 * siapa penanggung jawab tiap sentra. Tidak ada data sensitif. */
function getUsersLiteImpl_() {
  return getUsersCached_().filter(function (u) { return u.aktif; }).map(function (u) {
    return { username: u.username, nama: u.nama, role: u.role, assignments: u.assignments };
  });
}

function saveUserImpl_(payload, caller) {
  payload = payload || {};
  var sh = sheet_(APP_CONFIG.SHEET.USERS);
  var username = String(payload.username || '').trim().toLowerCase();
  var nama = String(payload.nama || '').trim();
  var roleRaw = String(payload.role || 'ASSESSOR').toUpperCase();
  var role = (roleRaw === 'ADMIN' || roleRaw === 'KOORDINATOR') ? roleRaw : 'ASSESSOR';
  var validIds = getFormSchema_().sentra.map(function (s) { return s.id; });
  var seen = {};
  var asg = (payload.assignments || []).filter(function (sid) {
    return validIds.indexOf(sid) >= 0 && !seen[sid] && (seen[sid] = true);
  });
  var aktif = payload.aktif !== false;
  var pin = String(payload.pin || '');
  var now = nowStr_();

  if (!/^[a-z0-9._]{3,20}$/.test(username)) throw new Error('Username 3-20 karakter: huruf kecil, angka, titik, atau underscore.');
  if (!nama) throw new Error('Nama wajib diisi.');
  if (role === 'ASSESSOR' && asg.length === 0) throw new Error('Assessor minimal ditugaskan ke 1 sentra (BAB).');
  if (pin && !/^\d{4,12}$/.test(pin)) throw new Error('PIN wajib 4-12 digit angka.');
  if (pin === 'admin123') throw new Error('PIN terlalu mudah ditebak — pilih PIN lain.');

  var users = readUsers_(); /* fresh untuk validasi */
  var idx = -1;
  for (var i = 0; i < users.length; i++) if (users[i].username === username) idx = i;

  if (idx < 0) {
    if (!/^\d{4,12}$/.test(pin)) throw new Error('PIN wajib 4-12 digit angka.');
    /* Akun baru: admin yang membuat → PIN dianggap sudah diketahui bersama,
     * jadi tidak dipaksa ganti (admin tetap bisa ubah PIN kapan saja). */
    sh.appendRow([username, nama, hashPin_(username, pin), role, JSON.stringify(asg), aktif, now, now, false]);
  } else {
    var cur = users[idx];
    if (cur.role === 'ADMIN') {
      var activeAdmins = users.filter(function (u) { return u.role === 'ADMIN' && u.aktif; });
      if (activeAdmins.length <= 1 && (role !== 'ADMIN' || !aktif)) {
        throw new Error('Tidak boleh menurunkan peran / menonaktifkan admin aktif terakhir.');
      }
    }
    /* Ganti PIN = bukti PIN default sudah tidak dipakai → cabut tanda wajib ganti. */
    var newHash = pin ? hashPin_(username, pin) : cur.pinHash;
    var mustChange = cur.pinHarusDiganti;
    if (pin) mustChange = false;
    sh.getRange(idx + 2, 1, 1, USERS_HEADERS.length)
      .setValues([[username, nama, newHash, role, JSON.stringify(asg), aktif, cur.dibuat || now, now, mustChange]]);
  }

  cacheDel_(['users']);
  audit_(caller, 'USER_SIMPAN', username,
    (idx < 0 ? 'BARU | ' : 'UBAH | ') + 'Peran: ' + role + ' | Aktif: ' + aktif +
    ' | Sentra: ' + (asg.join(',') || '-') + (pin ? ' | PIN diganti' : ''));
  return getUsersImpl_();
}

function setUserActiveImpl_(caller, username, active) {
  var users = readUsers_();
  var u = null;
  for (var i = 0; i < users.length; i++) if (users[i].username === String(username).toLowerCase()) u = users[i];
  if (!u) throw new Error('Pengguna tidak ditemukan: ' + username);
  if (u.username === caller.username && !active) throw new Error('Tidak boleh menonaktifkan akun sendiri.');
  if (u.role === 'ADMIN' && !active) {
    var activeAdmins = users.filter(function (x) { return x.role === 'ADMIN' && x.aktif; });
    if (activeAdmins.length <= 1) throw new Error('Tidak boleh menonaktifkan admin aktif terakhir.');
  }
  applyUserPatch_(username, { Aktif: !!active });
  cacheDel_(['users']);
  audit_(caller, active ? 'USER_AKTIF' : 'USER_NONAKTIF', u.username, 'Nama: ' + u.nama);
  return getUsersImpl_();
}

function deleteUserImpl_(caller, username) {
  var sh = sheet_(APP_CONFIG.SHEET.USERS);
  var users = readUsers_();
  username = String(username || '').trim().toLowerCase();
  var u = null, idx = -1;
  for (var i = 0; i < users.length; i++) if (users[i].username === username) { u = users[i]; idx = i; }
  if (!u) throw new Error('Pengguna tidak ditemukan: ' + username);
  if (u.username === caller.username) throw new Error('Tidak boleh menghapus akun sendiri. Nonaktifkan saja jika tidak dipakai.');
  if (u.role === 'ADMIN') {
    var otherActiveAdmins = users.filter(function (x) {
      return x.role === 'ADMIN' && x.aktif && x.username !== u.username;
    });
    if (otherActiveAdmins.length === 0) throw new Error('Tidak boleh menghapus admin aktif terakhir.');
  }
  sh.deleteRow(idx + 2);
  cacheDel_(['users']);
  audit_(caller, 'USER_HAPUS', u.username, 'Nama: ' + u.nama + ' | Peran: ' + u.role);
  return getUsersImpl_();
}

/* ════════════════ PESERTA ════════════════ */

function findPesertaImpl_(id, soft) {
  var rows = getPesertaRowsCached_();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['ID Peserta']) === String(id)) {
      return {
        id_peserta: String(rows[i]['ID Peserta']),
        nama: String(rows[i]['Nama Peserta'] || ''),
        nomor_peserta: String(rows[i]['Nomor Peserta'] || ''),
        asal_tk: String(rows[i]['Asal TK/RA/PAUD'] || '')
      };
    }
  }
  if (soft) return null;
  throw new Error('Peserta tidak ditemukan: ' + id);
}

/* payload + user pemanggil (untuk log audit) */
function savePesertaImpl_(payload, user) {
  payload = payload || {};
  user = user || { nama: 'sistem', username: '' };
  var sh = sheet_(APP_CONFIG.SHEET.PESERTA);
  var nama = String(payload.nama || '').trim();
  if (!nama) throw new Error('Nama peserta wajib diisi.');
  var nomor = String(payload.nomor || '').trim();
  var asal = String(payload.asal_tk || '').trim();
  var now = nowStr_();
  var rows = readAll_(sh);

  if (payload.id) {
    var idx = -1;
    for (var i = 0; i < rows.length; i++) if (String(rows[i]['ID Peserta']) === String(payload.id)) idx = i;
    if (idx < 0) throw new Error('Peserta tidak ditemukan: ' + payload.id);
    if (nomor) {
      for (var j = 0; j < rows.length; j++) {
        if (j !== idx && String(rows[j]['Nomor Peserta']).trim() === nomor) {
          throw new Error('Nomor peserta "' + nomor + '" sudah dipakai peserta lain.');
        }
      }
    }
    sh.getRange(idx + 2, 2, 1, 3).setValues([[nama, nomor, asal]]);
    sh.getRange(idx + 2, 6).setValue(now);
    cacheDel_(['peserta']);
    audit_(user, 'PESERTA_UBAH', String(payload.id), 'Nama: ' + nama + ' | Nomor: ' + nomor + ' | Asal: ' + asal);
    return { peserta: { id_peserta: String(payload.id), nama: nama, nomor_peserta: nomor, asal_tk: asal } };
  }

  if (nomor) {
    for (var k = 0; k < rows.length; k++) {
      if (String(rows[k]['Nomor Peserta']).trim() === nomor) {
        throw new Error('Nomor peserta "' + nomor + '" sudah terdaftar untuk ' + rows[k]['Nama Peserta'] + '.');
      }
    }
  }
  var id = generateId_(sh, 'P', 1);
  sh.appendRow([id, nama, nomor, asal, now, now]);
  cacheDel_(['peserta']);
  audit_(user, 'PESERTA_BARU', id, 'Nama: ' + nama + ' | Nomor: ' + nomor + ' | Asal: ' + asal);
  return { peserta: { id_peserta: id, nama: nama, nomor_peserta: nomor, asal_tk: asal } };
}

/* ════════════════ HELPER AGREGASI BERSAMA ════════════════ */

function pesertaListFromRows_(rows, asmRows) {
  var count = {};
  (asmRows || []).forEach(function (a) {
    var k = String(a['ID Peserta']);
    count[k] = (count[k] || 0) + 1;
  });
  var list = rows.map(function (r) {
    return {
      id_peserta: String(r['ID Peserta']),
      nama: String(r['Nama Peserta'] || ''),
      nomor_peserta: String(r['Nomor Peserta'] || ''),
      asal_tk: String(r['Asal TK/RA/PAUD'] || ''),
      jumlah_assessment: count[String(r['ID Peserta'])] || 0
    };
  });
  list.sort(function (a, b) { return a.nama.localeCompare(b.nama); });
  return list;
}

/* Status & pemilik sentra untuk SATU baris riwayat.
 * sanitizeMeta_ membangun objek meta lengkap (defaultMeta_ + validasi field
 * assessor/waktu) untuk setiap baris — mahal dan tidak perlu, karena riwayat
 * hanya membaca `status` dan `owner`. Fungsi ini melakukan hal yang sama
 * secara langsung, hasilnya identik tapi jauh lebih ringan. */
function rowSentraMeta_(data) {
  var st = {}, ow = {};
  var raw = (data && data.meta && data.meta.sentra) || {};
  getFormSchema_().sentra.forEach(function (s) {
    var e = raw[s.id];
    var fin = !!(e && e.status === 'FINAL');
    st[s.id] = fin ? 'FINAL' : 'DRAFT';
    var owner = clampStr_(e && e.owner, 30).toLowerCase();
    ow[s.id] = owner ? { owner: owner, ownerName: clampStr_(e && e.ownerName, 80) } : null;
  });
  return { status: st, owners: ow };
}

function riwayatFromRows_(rows, user) {
  return rows.map(function (o) {
    function n(v) { return (v === '' || v == null) ? null : v; }
    var data = safeParse_(o['Data Penilaian (JSON)']);
    var rm = rowSentraMeta_(data);
    var ss = rm.status;
    var owners = rm.owners;
    var status = String(o['Status'] || 'DRAFT');
    var myPending = [], handledByOther = [];
    if (status !== 'SUBMITTED') {
      getFormSchema_().sentra.forEach(function (s) {
        if ((user.assignments || []).indexOf(s.id) < 0) return;
        if (ss[s.id] === 'FINAL') return;
        var own = owners[s.id];
        if (!own || own.owner === user.username) myPending.push(s.id);
        else handledByOther.push({ sid: s.id, ownerName: own.ownerName || own.owner });
      });
    }
    var rerataSentra = {};
    getFormSchema_().sentra.forEach(function (s) {
      var value = n(o['Rerata ' + s.singkat]);
      if (value == null && s.id === 'seni') value = n(o['Rerata Seni & Olah Tubuh']);
      rerataSentra[s.id] = value;
    });
    return {
      id: String(o['ID Assessment']),
      id_peserta: String(o['ID Peserta']),
      nama: String(o['Nama Peserta'] || ''),
      nomor: String(o['Nomor Peserta'] || ''),
      creator: String(o['Assessor'] || ''),
      creatorUsername: String(o['Username Assessor'] || '').toLowerCase(),
      tanggal: normalizeTanggal_(o['Tanggal']),
      status: status,
      sentraStatus: ss,
      sentraOwner: owners,
      myPending: myPending,
      handledByOther: handledByOther,
      kode: String(o['Kode'] || ''),
      nilai_akhir: n(o['Nilai Akhir']),
      rerataSentra: rerataSentra,
      updated: String(o['Waktu Diubah'] || '')
    };
  }).sort(function (a, b) { return b.updated.localeCompare(a.updated); });
}

function dashboardFromData_(riwayat, peserta) {
  var submitted = riwayat.filter(function (r) { return r.status === 'SUBMITTED'; });
  var siap = riwayat.filter(function (r) { return r.status === 'SIAP_REVIEW'; });
  var draft = riwayat.filter(function (r) { return r.status === 'DRAFT'; });
  var kodeCount = { A: 0, B: 0, C: 0 };
  submitted.forEach(function (r) { if (kodeCount[r.kode] != null) kodeCount[r.kode]++; });
  var rerata = null;
  if (submitted.length) {
    var sum = 0, c = 0;
    submitted.forEach(function (r) { if (r.nilai_akhir != null) { sum += r.nilai_akhir; c++; } });
    if (c) rerata = round1_(sum / c);
  }
  var activeUsers = getUsersCached_().filter(function (u) { return u.aktif; });
  var pendingBySentra = {};
  getFormSchema_().sentra.forEach(function (s) {
    pendingBySentra[s.id] = {
      count: riwayat.filter(function (r) { return r.status !== 'SUBMITTED' && r.sentraStatus[s.id] !== 'FINAL'; }).length,
      assessor: activeUsers.filter(function (u) { return u.assignments.indexOf(s.id) >= 0; })
        .map(function (u) { return u.nama; }).join(', ')
    };
  });
  return {
    peserta: peserta.length, draft: draft.length, siapReview: siap.length, submitted: submitted.length,
    rerata: rerata, kodeCount: kodeCount, pendingBySentra: pendingBySentra,
    readyList: siap.slice(0, 5), draftList: draft.slice(0, 5), recent: riwayat.slice(0, 5)
  };
}

function buildInitialData_(user) {
  var shAsm = sheet_(APP_CONFIG.SHEET.ASSESSMENT);
  trimEmptyTail_(shAsm);
  var asm = readAll_(shAsm);
  var riwayat = riwayatFromRows_(asm, user);
  var peserta = pesertaListFromRows_(getPesertaRowsCached_(), asm);
  var out = { user: publicUser_(user), config: getPublicConfig_(), schema: getFormSchema_(), peserta: peserta, riwayat: riwayat };
  /* Dashboard sengaja TIDAK ikut di sini: klien memanggil getDashboardData
   * sendiri (hanya untuk staff), sehingga login assessor tidak membayar
   * agregasi yang tidak dipakainya. */
  return out;
}

function getPesertaListImpl_(query) {
  var list = pesertaListFromRows_(getPesertaRowsCached_(), readAll_(sheet_(APP_CONFIG.SHEET.ASSESSMENT)));
  if (query) {
    var q = String(query).toLowerCase();
    list = list.filter(function (p) {
      return p.nama.toLowerCase().indexOf(q) >= 0 || p.nomor_peserta.toLowerCase().indexOf(q) >= 0 || p.id_peserta.toLowerCase().indexOf(q) >= 0;
    });
  }
  return list;
}

function getRiwayatImpl_(user) {
  return riwayatFromRows_(readAll_(sheet_(APP_CONFIG.SHEET.ASSESSMENT)), user);
}

function getDashboardDataImpl_(user) {
  var asm = readAll_(sheet_(APP_CONFIG.SHEET.ASSESSMENT));
  var riwayat = riwayatFromRows_(asm, user);
  var peserta = pesertaListFromRows_(getPesertaRowsCached_(), asm);
  return dashboardFromData_(riwayat, peserta);
}

/* ════════════════ ASSESSMENT ════════════════ */

function sentraDef_(sid) {
  for (var i = 0; i < getFormSchema_().sentra.length; i++) {
    if (getFormSchema_().sentra[i].id === sid) return getFormSchema_().sentra[i];
  }
  throw new Error('Sentra tidak dikenal: ' + sid);
}

/* Staff (Koordinator/Admin) selalu boleh; assessor jika ditugaskan,
 * belum FINAL, dan belum diklaim orang lain. */
function canEditSentra_(user, sid, entry) {
  if (isStaffRole_(user.role)) return true;
  if ((user.assignments || []).indexOf(sid) < 0) return false;
  if (entry && entry.status === 'FINAL') return false;
  if (entry && entry.owner && entry.owner !== user.username) return false;
  return true;
}

/* Boleh MEMBACA assessment? Staff bebas; assessor hanya bila ia pembuatnya
 * (berdasarkan USERNAME, bukan nama) atau ditugaskan pada salah satu sentra
 * yang termuat di assessment itu. Mencegah assessor BAB I membaca penilaian
 * peserta milik assessor BAB II. */
function canAccessAssessment_(user, o) {
  if (!user) return false;
  if (isStaffRole_(user.role)) return true;
  var creator = String(o['Username Assessor'] || '').trim().toLowerCase();
  if (creator) return creator === user.username;
  /* Baris lama yang belum punya username pembuat → fallback ke penugasan sentra */
  var data = safeParse_(o['Data Penilaian (JSON)']);
  var hasWork = getFormSchema_().sentra.some(function (s) {
    return (user.assignments || []).indexOf(s.id) >= 0 &&
      sentraPartHasScores_(sentraPartFromData_(s, data));
  });
  if (hasWork) return true;
  /* Terakhir: cocokkan nama pembuat, dan hanya bila nama itu unik di USERS. */
  var nm = String(o['Assessor'] || '');
  if (!nm) return false;
  var sameName = getUsersCached_().filter(function (u) { return u.nama === nm; });
  return sameName.length === 1 && sameName[0].username === user.username;
}

function sentraOwnersMap_(meta) {
  var m = {};
  getFormSchema_().sentra.forEach(function (s) {
    var e = meta && meta.sentra && meta.sentra[s.id];
    m[s.id] = (e && e.owner) ? { owner: e.owner, ownerName: e.ownerName || '' } : null;
  });
  return m;
}

function sentraPartHasScores_(part) {
  if (!part || !part.materi) return false;
  return Object.keys(part.materi).some(function (mid) {
    var d = part.materi[mid];
    return d && d.skor && Object.keys(d.skor).length > 0;
  });
}

function deriveStatus_(data) {
  var all = getFormSchema_().sentra.every(function (s) {
    return data.meta && data.meta.sentra[s.id] && data.meta.sentra[s.id].status === 'FINAL';
  });
  return all ? 'SIAP_REVIEW' : 'DRAFT';
}

function sentraStatusMap_(meta) {
  var m = {};
  getFormSchema_().sentra.forEach(function (s) {
    var e = meta && meta.sentra && meta.sentra[s.id];
    m[s.id] = (e && e.status === 'FINAL') ? 'FINAL' : 'DRAFT';
  });
  return m;
}

function findAssessmentByPeserta_(idPeserta) {
  var sh = sheet_(APP_CONFIG.SHEET.ASSESSMENT);
  var r = findRowByValue_(sh, 2, idPeserta);
  return r > 0 ? String(sh.getRange(r, 1).getValue()) : null;
}

function assessmentById_(sh, id) {
  var r = findRowByValue_(sh, 1, id);
  if (r < 0) throw new Error('Assessment tidak ditemukan: ' + id);
  return { rowIdx: r, o: rowToObj_(sh, r) };
}

function writeAssessment_(sh, rowIdx, prev, data, status, user, action, submitTime) {
  var hasil = hitungHasil_(data);
  var now = nowStr_();
  var vals = [
    String(prev['ID Assessment']),
    String(prev['ID Peserta']),
    String(prev['Nama Peserta'] || ''),
    String(prev['Nomor Peserta'] || ''),
    String(prev['Assessor'] || ''),
    normalizeTanggal_(prev['Tanggal']),
    status,
    JSON.stringify(data)
  ];
  getFormSchema_().sentra.forEach(function (s) {
    vals.push(hasil.sentra[s.id] == null ? '' : hasil.sentra[s.id]);
  });
  vals = vals.concat([
    hasil.nilaiAkhir == null ? '' : hasil.nilaiAkhir,
    hasil.kode || '',
    String(prev['Waktu Dibuat'] || now),
    now,
    submitTime,
    pushLog_(prev['Log Edit'], { t: now, a: action, oleh: user.nama + ' (' + user.username + ')' }),
    /* Username pembuat — dasar otorisasi. Jangan pernah diubah setelah dibuat. */
    String(prev['Username Assessor'] || user.username).toLowerCase()
  ]);
  if (rowIdx > 0) sh.getRange(rowIdx, 1, 1, vals.length).setValues([vals]);
  else sh.appendRow(vals);
  return hasil;
}

function buildResult_(o) {
  var data = safeParse_(o['Data Penilaian (JSON)']);
  data.meta = sanitizeMeta_(data.meta);
  var peserta = findPesertaImpl_(o['ID Peserta'], true) ||
    { id_peserta: String(o['ID Peserta']), nama: String(o['Nama Peserta'] || ''), nomor_peserta: String(o['Nomor Peserta'] || ''), asal_tk: '' };
  return {
    assessment: {
      id: String(o['ID Assessment']), id_peserta: peserta.id_peserta, nama: peserta.nama,
      nomor: peserta.nomor_peserta, asal_tk: peserta.asal_tk,
      creator: String(o['Assessor'] || ''),
      creatorUsername: String(o['Username Assessor'] || '').toLowerCase(),
      tanggal: normalizeTanggal_(o['Tanggal']),
      status: String(o['Status'] || 'DRAFT'),
      data: data,
      sentraStatus: sentraStatusMap_(data.meta),
      sentraOwner: sentraOwnersMap_(data.meta),
      koordinator: (data.meta.koordinator && data.meta.koordinator.nama) || '',
      dibuat: String(o['Waktu Dibuat'] || ''), diubah: String(o['Waktu Diubah'] || ''), disubmit: String(o['Waktu Submit'] || '')
    },
    hasil: hitungHasil_(data)
  };
}

function saveAssessmentImpl_(user, payload) {
  payload = payload || {};
  var sh = sheet_(APP_CONFIG.SHEET.ASSESSMENT);
  var isUpdate = !!payload.id;
  var rowIdx = isUpdate ? findRowByValue_(sh, 1, payload.id) : -1;
  if (isUpdate && rowIdx < 0) throw new Error('Assessment tidak ditemukan: ' + payload.id);

  var cur = null, storedData = null;
  if (isUpdate) {
    cur = rowToObj_(sh, rowIdx);
    if (String(cur['Status']) === 'SUBMITTED') throw new Error('Assessment sudah SUBMITTED dan terkunci. Koordinator dapat membuka kunci terlebih dahulu.');
    storedData = safeParse_(cur['Data Penilaian (JSON)']);
  } else {
    var ex = findAssessmentByPeserta_(payload.id_peserta);
    if (ex) throw new Error('ASSESSMENT_EXISTS:' + ex + '|Peserta ini sudah memiliki assessment ' + ex + '. Buka dari daftar Penilaian.');
  }

  var peserta = findPesertaImpl_(payload.id_peserta);

  var creator, tanggal;
  if (!isUpdate) {
    creator = String(payload.creator || '').trim();
    tanggal = normalizeTanggal_(payload.tanggal);
    if (!creator) throw new Error('Nama assessor (pembuat) wajib diisi.');
    if (!tanggal) throw new Error('Tanggal assessment wajib diisi.');
  } else {
    /* Pembuat = username (bukan nama). Fallback nama hanya untuk baris lama
     * yang belum punya kolom Username Assessor. */
    var storedUser = String(cur['Username Assessor'] || '').trim().toLowerCase();
    var mayEditFields = isStaffRole_(user.role) ||
      (storedUser ? storedUser === user.username : String(cur['Assessor']) === user.nama);
    if (String(payload.id_peserta) !== String(cur['ID Peserta']) && !isStaffRole_(user.role)) {
      throw new Error('Peserta tidak dapat diganti — hanya Koordinator/Admin.');
    }
    creator = mayEditFields ? (String(payload.creator || '').trim() || String(cur['Assessor'] || '')) : String(cur['Assessor'] || '');
    tanggal = mayEditFields ? (normalizeTanggal_(payload.tanggal) || normalizeTanggal_(cur['Tanggal'])) : normalizeTanggal_(cur['Tanggal']);
  }

  /* MERGE PER SENTRA — penugasan + kepemilikan */
  var meta = isUpdate ? sanitizeMeta_(storedData.meta) : defaultMeta_();
  var incoming = payload.data || {};
  var merged = { meta: meta, catatanSentra: {} };
  /* Preserve archived values from removed questions/materials during edits. */
  if (isUpdate) {
    Object.keys(storedData || {}).forEach(function (k) {
      if (k !== 'meta' && k !== 'catatanSentra') merged[k] = storedData[k];
    });
  }
  getFormSchema_().sentra.forEach(function (s) {
    var st = merged.meta.sentra[s.id];
    var assigned = (user.assignments || []).indexOf(s.id) >= 0;
    var editable = canEditSentra_(user, s.id, st);
    var part;
    if (editable) {
      part = sanitizeSentraPartial_(s, incoming);
      if (!isStaffRole_(user.role) && !st.owner && sentraPartHasScores_(part)) {
        st.owner = user.username;
        st.ownerName = user.nama;
      }
    } else {
      if (!isStaffRole_(user.role) && assigned && st.status !== 'FINAL' && st.owner && st.owner !== user.username) {
        var incPart = sanitizeSentraPartial_(s, incoming);
        var storedPart = sentraPartFromData_(s, storedData);
        if (JSON.stringify(incPart) !== JSON.stringify(storedPart)) {
          throw new Error('HANDLED_BY_OTHER:' + s.singkat + ' atas ' + peserta.nama + ' sedang dikerjakan oleh ' + (st.ownerName || st.owner) + '. Muat ulang data.');
        }
      }
      part = sentraPartFromData_(s, storedData);
    }
    merged.catatanSentra[s.id] = part.catatanSentra;
    s.materi.forEach(function (m) { merged[m.id] = part.materi[m.id]; });
  });

  var status = deriveStatus_(merged);

  if (!isUpdate) {
    var id = generateId_(sh, 'A', 1);
    var now = nowStr_();
    var prev = {
      'ID Assessment': id, 'ID Peserta': peserta.id_peserta, 'Nama Peserta': peserta.nama,
      'Nomor Peserta': peserta.nomor_peserta, 'Assessor': creator, 'Tanggal': tanggal, 'Waktu Dibuat': now,
      'Username Assessor': user.username
    };
    var hasil = writeAssessment_(sh, 0, prev, merged, status, user, 'CREATE', '');
    return {
      assessment: {
        id: id, id_peserta: peserta.id_peserta, nama: peserta.nama, nomor: peserta.nomor_peserta,
        asal_tk: peserta.asal_tk, creator: creator, tanggal: tanggal, status: status, data: merged,
        sentraStatus: sentraStatusMap_(merged.meta), sentraOwner: sentraOwnersMap_(merged.meta),
        koordinator: '', dibuat: now, diubah: now, disubmit: ''
      },
      hasil: hasil
    };
  }

  cur['ID Peserta'] = peserta.id_peserta;
  cur['Nama Peserta'] = peserta.nama;
  cur['Nomor Peserta'] = peserta.nomor_peserta;

  var hasilNow = writeAssessment_(sh, rowIdx, cur, merged, status, user, 'SAVE', String(cur['Waktu Submit'] || ''));
  return {
    assessment: {
      id: String(cur['ID Assessment']), id_peserta: peserta.id_peserta, nama: peserta.nama,
      nomor: peserta.nomor_peserta, asal_tk: peserta.asal_tk,
      creator: creator, tanggal: tanggal, status: status, data: merged,
      sentraStatus: sentraStatusMap_(merged.meta), sentraOwner: sentraOwnersMap_(merged.meta),
      koordinator: (merged.meta.koordinator && merged.meta.koordinator.nama) || '',
      dibuat: String(cur['Waktu Dibuat'] || ''), diubah: nowStr_(), disubmit: String(cur['Waktu Submit'] || '')
    },
    hasil: hasilNow
  };
}

function finalizeSentraImpl_(user, id, sid) {
  var sh = sheet_(APP_CONFIG.SHEET.ASSESSMENT);
  var f = assessmentById_(sh, id);
  if (String(f.o['Status']) === 'SUBMITTED') throw new Error('Assessment sudah SUBMITTED.');
  if (!isStaffRole_(user.role) && (user.assignments || []).indexOf(sid) < 0) {
    throw new Error('Anda tidak ditugaskan pada sentra/BAB ini.');
  }
  var s = sentraDef_(sid);
  var data = safeParse_(f.o['Data Penilaian (JSON)']);
  data.meta = sanitizeMeta_(data.meta);
  var entry = data.meta.sentra[sid];
  if (entry.status === 'FINAL') throw new Error('Sentra ini sudah difinalisasi.');
  if (!isStaffRole_(user.role) && entry.owner && entry.owner !== user.username) {
    throw new Error('Sentra ini sedang dikerjakan oleh ' + (entry.ownerName || entry.owner) + '.');
  }
  var miss = sentraMissing_(data, s);
  if (miss.length) throw new Error('Penilaian sentra belum lengkap — ' + miss.join('; '));
  data.meta.sentra[sid] = {
    status: 'FINAL', assessor: user.nama, waktu: nowStr_(),
    owner: entry.owner || (isStaffRole_(user.role) ? '' : user.username),
    ownerName: entry.ownerName || (isStaffRole_(user.role) ? '' : user.nama)
  };
  writeAssessment_(sh, f.rowIdx, f.o, data, deriveStatus_(data), user, 'FINALIZE ' + sid, String(f.o['Waktu Submit'] || ''));
  return buildResult_(rowToObj_(sh, f.rowIdx));
}

function retractSentraImpl_(user, id, sid) {
  var sh = sheet_(APP_CONFIG.SHEET.ASSESSMENT);
  var f = assessmentById_(sh, id);
  if (String(f.o['Status']) === 'SUBMITTED') throw new Error('Tarik finalisasi tidak berlaku untuk assessment SUBMITTED. Gunakan Buka Kunci.');
  var data = safeParse_(f.o['Data Penilaian (JSON)']);
  data.meta = sanitizeMeta_(data.meta);
  var entry = data.meta.sentra[sid];
  if (entry.status !== 'FINAL') throw new Error('Sentra ini belum difinalisasi.');
  data.meta.sentra[sid] = { status: 'DRAFT', assessor: '', waktu: '', owner: entry.owner, ownerName: entry.ownerName };
  writeAssessment_(sh, f.rowIdx, f.o, data, deriveStatus_(data), user, 'RETRACT ' + sid, String(f.o['Waktu Submit'] || ''));
  return buildResult_(rowToObj_(sh, f.rowIdx));
}

function releaseSentraImpl_(user, id, sid) {
  var sh = sheet_(APP_CONFIG.SHEET.ASSESSMENT);
  var f = assessmentById_(sh, id);
  if (String(f.o['Status']) === 'SUBMITTED') throw new Error('Assessment SUBMITTED terkunci — buka kunci terlebih dahulu.');
  var data = safeParse_(f.o['Data Penilaian (JSON)']);
  data.meta = sanitizeMeta_(data.meta);
  var entry = data.meta.sentra[sid];
  if (!entry.owner) throw new Error('Sentra ini tidak sedang diklaim siapa pun.');
  data.meta.sentra[sid] = { status: entry.status, assessor: entry.assessor, waktu: entry.waktu, owner: '', ownerName: '' };
  writeAssessment_(sh, f.rowIdx, f.o, data, deriveStatus_(data), user, 'RELEASE ' + sid, String(f.o['Waktu Submit'] || ''));
  return buildResult_(rowToObj_(sh, f.rowIdx));
}

function submitAssessmentImpl_(user, id) {
  var sh = sheet_(APP_CONFIG.SHEET.ASSESSMENT);
  var f = assessmentById_(sh, id);
  if (String(f.o['Status']) === 'SUBMITTED') throw new Error('Assessment sudah pernah di-submit.');
  var data = safeParse_(f.o['Data Penilaian (JSON)']);
  data.meta = sanitizeMeta_(data.meta);
  var miss = missingList_(data);
  if (miss.length) throw new Error('Penilaian belum lengkap — ' + miss.join('; '));
  var now = nowStr_();
  getFormSchema_().sentra.forEach(function (s) {
    var e = data.meta.sentra[s.id];
    if (e.status !== 'FINAL') {
      data.meta.sentra[s.id] = { status: 'FINAL', assessor: user.nama, waktu: now, owner: e.owner, ownerName: e.ownerName };
    }
  });
  /* Penanda tangan laporan = yang melakukan Submit Final */
  data.meta.koordinator = { username: user.username, nama: user.nama, waktu: now };
  writeAssessment_(sh, f.rowIdx, f.o, data, 'SUBMITTED', user, 'SUBMIT', now);
  var res = buildResult_(rowToObj_(sh, f.rowIdx));
  var p = {
    id_peserta: res.assessment.id_peserta, nama: res.assessment.nama,
    nomor_peserta: res.assessment.nomor, asal_tk: res.assessment.asal_tk
  };
  upsertHasil_(id, p, res.assessment.creator, res.assessment.tanggal, data, res.hasil, now);
  return res;
}

function unlockAssessmentImpl_(user, id) {
  var sh = sheet_(APP_CONFIG.SHEET.ASSESSMENT);
  var f = assessmentById_(sh, id);
  if (String(f.o['Status']) !== 'SUBMITTED') throw new Error('Assessment ini tidak terkunci.');
  var data = safeParse_(f.o['Data Penilaian (JSON)']);
  data.meta = sanitizeMeta_(data.meta);
  data.meta.koordinator = { username: '', nama: '', waktu: '' };
  /* B2: lepaskan juga KLAIM sentra. Kalau tidak, status kembali DRAFT tetapi
   * owner masih terisi → assessor yang sama tetap terkunci dari kerjanya
   * sendiri dan harus di-Release oleh Koordinator lebih dulu. */
  getFormSchema_().sentra.forEach(function (s) {
    var e = data.meta.sentra[s.id];
    if (e) { e.owner = ''; e.ownerName = ''; }
  });
  var newStatus = deriveStatus_(data);
  writeAssessment_(sh, f.rowIdx, f.o, data, newStatus, user, 'UNLOCK', '');
  removeHasilRow_(id);
  return buildResult_(rowToObj_(sh, f.rowIdx));
}

function deleteDraftImpl_(user, id) {
  var sh = sheet_(APP_CONFIG.SHEET.ASSESSMENT);
  var f = assessmentById_(sh, id);
  var st = String(f.o['Status']);
  if (st === 'SUBMITTED') throw new Error('Assessment SUBMITTED tidak dapat dihapus.');
  if (st === 'SIAP_REVIEW') throw new Error('Assessment sudah difinalisasi — tarik finalisasi tiap sentra terlebih dahulu.');
  var data = safeParse_(f.o['Data Penilaian (JSON)']);
  var meta = sanitizeMeta_(data.meta);
  var anyFinal = getFormSchema_().sentra.some(function (s) { return meta.sentra[s.id].status === 'FINAL'; });
  var ownedByOthers = getFormSchema_().sentra.some(function (s) {
    var e = meta.sentra[s.id];
    return e.owner && e.owner !== user.username;
  });
  /* Berbasis username; fallback nama hanya untuk baris lama tanpa kolom itu. */
  var storedUser = String(f.o['Username Assessor'] || '').trim().toLowerCase();
  var isCreator = storedUser ? storedUser === user.username : String(f.o['Assessor']) === user.nama;
  if (!(isStaffRole_(user.role) || (isCreator && !anyFinal && !ownedByOthers))) {
    throw new Error('Draft ini memuat pekerjaan assessor lain — hanya Koordinator/Admin yang dapat menghapus.');
  }
  sh.deleteRow(f.rowIdx);
  removeHasilRow_(id);
}

/* S2: assessor hanya boleh membuka assessment yang ia buat atau yang memuat
 * sentra tugasnya. Sebelumnya siapa pun yang login bisa membaca semua. */
function getAssessmentImpl_(id, user) {
  var sh = sheet_(APP_CONFIG.SHEET.ASSESSMENT);
  var f = assessmentById_(sh, id);
  if (user && !canAccessAssessment_(user, f.o)) {
    throw new Error('Akses ditolak — assessment ini bukan milik Anda atau di luar penugasan Anda.');
  }
  return buildResult_(f.o);
}

/* ════════════════ HASIL ════════════════ */

function hasilHeaders_() {
  var h = ['ID Assessment', 'ID Peserta', 'Nama Peserta', 'Nomor Peserta', 'Assessor', 'Tanggal'];
  getFormSchema_().sentra.forEach(function (s) {
    s.materi.forEach(function (m) {
      h.push('Skor ' + m.no + ' ' + m.nama);
      h.push('Nilai ' + m.no + ' ' + m.nama + ' (%)');
    });
    h.push('Rerata ' + s.singkat);
  });
  getFormSchema_().sentra.forEach(function (s) { h.push('Info Tambahan ' + s.singkat); });
  h.push('Nilai Calistung', 'Nilai Akhir', 'Kode', 'Keterangan Kode', 'Status', 'Waktu Submit');
  getFormSchema_().sentra.forEach(function (s) { h.push('Assessor ' + s.singkat); });
  getFormSchema_().sentra.forEach(function (s) { h.push('Username Assessor ' + s.singkat); });
  h.push('Koordinator');
  return h;
}

function upsertHasil_(idAssessment, peserta, creator, tanggal, data, hasil, now) {
  var sh = sheet_(APP_CONFIG.SHEET.HASIL);
  var headers = hasilHeaders_();
  var lastCol = Math.max(sh.getLastColumn(), headers.length);
  var headRow = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var same = headRow.length === headers.length && headers.every(function (h, i) { return headRow[i] === h; });
  if (!same) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground('#0f766e');
    sh.setFrozenRows(1);
  }
  var meta = sanitizeMeta_(data.meta);
  var v = {};
  v['ID Assessment'] = idAssessment;
  v['ID Peserta'] = peserta.id_peserta;
  v['Nama Peserta'] = peserta.nama;
  v['Nomor Peserta'] = peserta.nomor_peserta;
  v['Assessor'] = creator;
  v['Tanggal'] = tanggal;
  getFormSchema_().sentra.forEach(function (s) {
    s.materi.forEach(function (m) {
      var hh = hasil.materi[m.id];
      v['Skor ' + m.no + ' ' + m.nama] = hh.skor;
      v['Nilai ' + m.no + ' ' + m.nama + ' (%)'] = hh.lengkap ? hh.persen : '';
    });
    v['Rerata ' + s.singkat] = hasil.sentra[s.id] == null ? '' : hasil.sentra[s.id];
    v['Assessor ' + s.singkat] = meta.sentra[s.id].assessor || '';
    v['Username Assessor ' + s.singkat] = String(meta.sentra[s.id].owner || '').toLowerCase();
  });
  getFormSchema_().sentra.forEach(function (s) {
    v['Info Tambahan ' + s.singkat] = (data.catatanSentra || {})[s.id] || '';
  });
  v['Nilai Calistung'] = hasil.calistung == null ? '' : hasil.calistung;
  v['Nilai Akhir'] = hasil.nilaiAkhir == null ? '' : hasil.nilaiAkhir;
  v['Kode'] = hasil.kode || '';
  v['Keterangan Kode'] = hasil.kodeLabel || '';
  v['Status'] = 'SUBMITTED';
  v['Waktu Submit'] = now;
  v['Koordinator'] = (meta.koordinator && meta.koordinator.nama) || '';

  var rowArr = headers.map(function (h) { return v[h] !== undefined ? v[h] : ''; });
  var rowIdx = findRowByValue_(sh, 1, idAssessment);
  if (rowIdx > 0) sh.getRange(rowIdx, 1, 1, headers.length).setValues([rowArr]);
  else sh.appendRow(rowArr);
}

function removeHasilRow_(idAssessment) {
  try {
    var sh = sheet_(APP_CONFIG.SHEET.HASIL);
    var rowIdx = findRowByValue_(sh, 1, idAssessment);
    if (rowIdx > 0) sh.deleteRow(rowIdx);
  } catch (e) {}
}
