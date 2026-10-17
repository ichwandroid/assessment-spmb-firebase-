/*************************************************************
 * Code.gs — Entry point Web App & endpoint API
 * Pola otorisasi setiap endpoint:
 *   requireAuth_          → cukup login
 *   requireStaff_         → KOORDINATOR / ADMIN
 *   requireAdmin_         → ADMIN
 *   requireWrite_         → menolak bila PIN masih PIN default
 * Data peserta & kelola pengguna → KOORDINATOR-ADMIN / ADMIN.
 * getAssessment → hanya pembuat (username), sentra tugasnya, atau staff.
 *************************************************************/

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Assessment PPDB — ' + APP_CONFIG.SEKOLAH)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ── Autentikasi ── */
function login(username, pin) {
  return guard_(function () {
    var r = loginImpl_(username, pin);
    var init = buildInitialData_(r.user);
    init.ok = true;
    return { token: r.token, init: init };
  });
}

/* Hanya dipakai halaman login untuk menampilkan identitas sekolah.
 * TIDAK membocorkan konfigurasi penilaian. Hapus fungsi ini bila tidak perlu. */
function getPublicBranding() {
  return guard_(function () {
    var c = getPublicConfig_();
    return { ok: true, sekolah: c.sekolah, tahunPelajaran: c.tahunPelajaran };
  });
}

function logout(token) {
  return guard_(function () { logoutImpl_(token); return { ok: true }; });
}

/* ── Data umum ── */
/* Migrasi ringan dijalankan sekali per versi skema, sehingga deployment yang
 * sudah berisi data ikut mendapat kolom/sheet baru tanpa langkah manual. */
function ensureSheetsReady_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHEETS_READY') === SHEET_SCHEMA_VERSION) return;
  ensureSheets_();
  props.setProperty('SHEETS_READY', SHEET_SCHEMA_VERSION);
}

function getInitialData(token) {
  return guard_(function () {
    var user = requireAuth_(token);
    ensureSheetsReady_();
    var out = buildInitialData_(user);
    out.ok = true;
    return out;
  });
}

function getPeserta(token, query) {
  return guard_(function () { requireAuth_(token); return { ok: true, peserta: getPesertaListImpl_(query) }; });
}

/* Data peserta = data induk PPDB → hanya Koordinator/Admin.
 * (Sebelumnya hanya requireAuth_, sehingga assessor bisa menambah/mengubah peserta.) */
function savePeserta(token, payload) {
  return guard_(function () { return withLock_(function () {
    var user = requireWrite_(requireStaff_(requireAuth_(token)));
    return { ok: true, peserta: savePesertaImpl_(payload, user).peserta };
  }); });
}

function getRiwayat(token) {
  return guard_(function () {
    var user = requireAuth_(token);
    return { ok: true, riwayat: getRiwayatImpl_(user) };
  });
}

/* Dashboard: KOORDINATOR & ADMIN */
function getDashboardData(token) {
  return guard_(function () {
    var user = requireStaff_(requireAuth_(token));
    return { ok: true, dashboard: getDashboardDataImpl_(user) };
  });
}

/* Kelola teks soal assessment — Admin saja. */
function saveAssessmentQuestion(token, payload) {
  return guard_(function () { return withLock_(function () {
    var user = requireWrite_(requireAdmin_(requireAuth_(token)));
    var res = saveAssessmentQuestionImpl_(user, payload);
    return { ok: true, schema: res.schema };
  }); });
}

function saveAssessmentRubric(token, payload) {
  return guard_(function () { return withLock_(function () {
    var user = requireWrite_(requireAdmin_(requireAuth_(token)));
    var res = saveAssessmentRubricImpl_(user, payload);
    return { ok: true, schema: res.schema };
  }); });
}

/* ── Assessment ── */
/* Akses dibatasi: staff bebas, assessor hanya assessment yang ia buat
 * atau yang memuat sentra tugasnya (lihat canAccessAssessment_). */
function getAssessment(token, id) {
  return guard_(function () {
    var user = requireAuth_(token);
    return getAssessmentImpl_(id, user);
  });
}

function saveAssessment(token, payload) {
  return guard_(function () { return withLock_(function () {
    var user = requireWrite_(requireAuth_(token));
    if (payload && payload.id) throw new Error('Gunakan updateAssessment untuk mengubah data.');
    return { ok: true, assessment: saveAssessmentImpl_(user, payload).assessment };
  }); });
}

function updateAssessment(token, payload) {
  return guard_(function () { return withLock_(function () {
    var user = requireWrite_(requireAuth_(token));
    if (!payload || !payload.id) throw new Error('ID assessment wajib untuk update.');
    return { ok: true, assessment: saveAssessmentImpl_(user, payload).assessment };
  }); });
}

/* Assessor (atau staff) mengunci sentra miliknya setelah selesai */
function finalizeSentra(token, id, sid) {
  return guard_(function () { return withLock_(function () {
    var user = requireWrite_(requireAuth_(token));
    return finalizeSentraImpl_(user, id, sid);
  }); });
}

/* Tarik finalisasi: KOORDINATOR & ADMIN */
function retractSentra(token, id, sid) {
  return guard_(function () { return withLock_(function () {
    var user = requireWrite_(requireStaff_(requireAuth_(token)));
    return retractSentraImpl_(user, id, sid);
  }); });
}

/* Lepas klaim sentra: KOORDINATOR & ADMIN */
function releaseSentra(token, id, sid) {
  return guard_(function () { return withLock_(function () {
    var user = requireWrite_(requireStaff_(requireAuth_(token)));
    return releaseSentraImpl_(user, id, sid);
  }); });
}

/* Submit final (menjadi tanda tangan Koordinator): KOORDINATOR & ADMIN */
function submitAssessment(token, id) {
  return guard_(function () { return withLock_(function () {
    var user = requireWrite_(requireStaff_(requireAuth_(token)));
    return submitAssessmentImpl_(user, id);
  }); });
}

/* Buka kunci SUBMITTED: KOORDINATOR & ADMIN */
function unlockAssessment(token, id) {
  return guard_(function () { return withLock_(function () {
    var user = requireWrite_(requireStaff_(requireAuth_(token)));
    return unlockAssessmentImpl_(user, id);
  }); });
}

function deleteDraft(token, id) {
  return guard_(function () { return withLock_(function () {
    var user = requireWrite_(requireAuth_(token));
    deleteDraftImpl_(user, id);
    return { ok: true };
  }); });
}

function calculateResult(token, data) {
  return guard_(function () {
    requireAuth_(token);
    return { ok: true, hasil: hitungHasil_(sanitizeData_(data)) };
  });
}

/* ── Manajemen pengguna ── */
/* Daftar lengkap (termasuk status PIN) → ADMIN saja */
function getUsers(token) {
  return guard_(function () {
    requireAdmin_(requireAuth_(token));
    return { ok: true, users: getUsersImpl_() };
  });
}

/* Daftar ringkas untuk staff: tanpa hash/PIN, hanya nama + penugasan.
 * Assessor tidak boleh menerimanya (bukan urusan dia). */
function getUsersLite(token) {
  return guard_(function () {
    requireStaff_(requireAuth_(token));
    return { ok: true, users: getUsersLiteImpl_() };
  });
}

/* Isi sendiri PIN baru (dipakai alur wajib ganti PIN). Boleh tanpa requireWrite_. */
function changeMyPin(token, oldPin, newPin) {
  return guard_(function () { return withLock_(function () {
    var user = requireAuth_(token);
    return { ok: true, user: changeMyPinImpl_(user, oldPin, newPin) };
  }); });
}

function saveUser(token, payload) {
  return guard_(function () { return withLock_(function () {
    var caller = requireWrite_(requireAdmin_(requireAuth_(token)));
    return { ok: true, users: saveUserImpl_(payload, caller) };
  }); });
}

function setUserActive(token, username, active) {
  return guard_(function () { return withLock_(function () {
    var caller = requireWrite_(requireAdmin_(requireAuth_(token)));
    return { ok: true, users: setUserActiveImpl_(caller, username, active) };
  }); });
}

function deleteUser(token, username) {
  return guard_(function () { return withLock_(function () {
    var caller = requireWrite_(requireAdmin_(requireAuth_(token)));
    return { ok: true, users: deleteUserImpl_(caller, username) };
  }); });
}
