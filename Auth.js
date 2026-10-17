/*************************************************************
 * Auth.gs — Login, sesi, dan otorisasi berbasis peran
 * Peran: ADMIN (kelola pengguna + semua), KOORDINATOR (review,
 * submit final, tanda tangan laporan), ASSESSOR (menilai BAB
 * yang ditugaskan).
 *
 * Identitas pemanggil selalu USERNAME — jangan pernah memakai
 * nama tampilan untuk keputusan izin (nama bisa kembar/berubah).
 * PIN default hanya boleh membaca (requireWrite_).
 *************************************************************/

var SESSION_TTL = 21600; // 6 jam

function hashPin_(username, pin) {
  var raw = String(username).trim().toLowerCase() + '::' + String(pin);
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function loginImpl_(username, pin) {
  username = String(username || '').trim().toLowerCase();
  pin = String(pin || '');
  if (!username || !pin) throw new Error('Username dan PIN wajib diisi.');

  var c = CacheService.getScriptCache();
  var k = 'loginfail_' + username;
  var fails = parseInt(c.get(k) || '0', 10);
  if (fails >= 8) throw new Error('Terlalu banyak percobaan gagal. Coba lagi dalam 10 menit.');

  var u = findUserByUsername_(username);
  if (!u || !u.aktif || hashPin_(username, pin) !== u.pinHash) {
    c.put(k, String(fails + 1), 600);
    throw new Error('Username atau PIN salah.');
  }
  c.remove(k);

  var token = Utilities.getUuid();
  c.put('sess_' + token, u.username, SESSION_TTL);
  return { token: token, user: publicUser_(u) };
}

function logoutImpl_(token) {
  try { CacheService.getScriptCache().remove('sess_' + String(token)); } catch (e) {}
}

function requireAuth_(token) {
  if (!token) throw new Error('SESSION_EXPIRED');
  var c = CacheService.getScriptCache();
  var username = c.get('sess_' + String(token));
  if (!username) throw new Error('SESSION_EXPIRED');
  var u = findUserByUsername_(username);
  if (!u || !u.aktif) throw new Error('SESSION_EXPIRED');
  c.put('sess_' + String(token), username, SESSION_TTL);
  return {
    username: u.username, nama: u.nama, role: u.role, assignments: u.assignments,
    pinHarusDiganti: !!u.pinHarusDiganti
  };
}

/* Staff = koordinator + admin: kuasa penuh atas assessment */
function isStaffRole_(role) {
  return role === 'ADMIN' || role === 'KOORDINATOR';
}

function requireStaff_(user) {
  if (!user || !isStaffRole_(user.role)) throw new Error('Akses ditolak — khusus Koordinator / Admin.');
  return user;
}

function requireAdmin_(user) {
  if (!user || user.role !== 'ADMIN') throw new Error('Akses ditolak — khusus Admin.');
  return user;
}

/* Gate wajib-ganti-PIN: akun dengan PIN default hanya boleh MEMBACA.
 * changeMyPin (dan logout) sengaja tidak memakai gate ini. */
function requireWrite_(user) {
  if (user && user.pinHarusDiganti) {
    throw new Error('PIN_DEFAULT: PIN Anda masih PIN default. Ganti PIN terlebih dahulu sebelum mengubah data.');
  }
  return user;
}

/* Ganti PIN sendiri — wajib menyertakan PIN lama, jadi token yang bocor saja
 * tidak cukup untuk mengambil alih akun. */
function changeMyPinImpl_(user, oldPin, newPin) {
  var u = findUserByUsername_(user.username);
  if (!u) throw new Error('Pengguna tidak ditemukan.');
  if (hashPin_(u.username, String(oldPin || '')) !== u.pinHash) {
    throw new Error('PIN lama tidak sesuai.');
  }
  newPin = String(newPin || '');
  if (!/^\d{4,12}$/.test(newPin)) throw new Error('PIN baru wajib 4-12 digit angka.');
  if (newPin === String(oldPin || '')) throw new Error('PIN baru harus berbeda dari PIN lama.');
  if (newPin === 'admin123') throw new Error('PIN terlalu mudah ditebak — pilih PIN lain.');
  applyUserPatch_(u.username, { pinHash: hashPin_(u.username, newPin), pinHarusDiganti: false });
  cacheDel_(['users']);
  audit_(user, 'PIN_GANTI', u.username, 'PIN diubah sendiri oleh pemilik akun');
  return publicUser_(findUserByUsername_(u.username));
}

function publicUser_(u) {
  return {
    username: u.username, nama: u.nama, role: u.role,
    assignments: u.assignments || [],
    pinHarusDiganti: !!u.pinHarusDiganti,
    isAdmin: u.role === 'ADMIN',
    isKoord: u.role === 'KOORDINATOR',
    isStaff: isStaffRole_(u.role)
  };
}