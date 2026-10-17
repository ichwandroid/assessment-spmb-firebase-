/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• HELPER DASAR â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const G = () => window.gsap || null;
const round1 = v => Math.round(v * 10) / 10;
const num = v => { const n = parseInt(v, 10); return (n >= 1 && n <= 3) ? n : 0; };

const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
function fmtTanggal(s) {
  if (!s) return '-';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(s);
  return parseInt(m[3], 10) + ' ' + BULAN[parseInt(m[2], 10) - 1] + ' ' + m[1];
}
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function inisial(nama) {
  return String(nama || '?').trim().split(/\s+/).slice(0, 2).map(x => (x[0] || '')).join('').toUpperCase() || '?';
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• IKON â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  /* Ikon sentra â€” nama harus sama dengan `ikon` di FORM_SCHEMA (Config.gs).
   * Sebelumnya 'moon'/'book'/'palette' tidak terdaftar sehingga SEMUA sentra
   * tampil dengan ikon fallback 'info'. */
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  palette: '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>'
};
const ic = (n, cls) => '<svg class="' + (cls || 'w-5 h-5') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[n] || ICONS.info) + '</svg>';
const SPIN_SVG = '<svg class="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>';

const ROLE_INFO = {
  ADMIN: ['Admin', 'bg-emerald-100 text-emerald-700'],
  KOORDINATOR: ['Koordinator', 'bg-blue-100 text-blue-700'],
  ASSESSOR: ['Assessor', 'bg-teal-100 text-teal-700']
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• AUTH & API â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const Auth = {
  token: null, user: null,
  save(t) { this.token = t; try { localStorage.setItem('ppdb_token', t); } catch (e) {} },
  clear() { this.token = null; this.user = null; try { localStorage.removeItem('ppdb_token'); } catch (e) {} },
  isAdmin() { return !!(this.user && this.user.role === 'ADMIN'); },
  isKoord() { return !!(this.user && this.user.role === 'KOORDINATOR'); },
  isStaff() { return !!(this.user && (this.user.role === 'ADMIN' || this.user.role === 'KOORDINATOR')); },
  canEditSentra(sid) { return this.isStaff() || !!(this.user && (this.user.assignments || []).indexOf(sid) >= 0); },
  editableSentras() { return (state.schema ? state.schema.sentra : []).filter(s => this.canEditSentra(s.id)); }
};

const state = { config: null, schema: null, peserta: [], riwayat: [], dashboard: null, users: [], reviewUsers: [], reviewUsersLoaded: false, view: null, rQuery: '', rFilter: 'ALL', rUser: 'ALL' };

function api(fn, ...args) {
  return window.api(fn, ...args);
}
function apiNoAuth(fn, ...args) {
  return window.apiNoAuth(fn, ...args);
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• LOGIN / LOGOUT â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
/* Akun dengan PIN default tidak boleh menulis apa pun (ditegakkan server lewat
 * requireWrite_). Sampai PIN diganti, aplikasi menahan semua aksi tulis. */
function pinPending() { return !!(Auth.user && Auth.user.pinHarusDiganti); }
function guardPin() {
  if (!pinPending()) return false;
  showPinGate();
  toast('Ganti PIN default Anda dulu.', 'error');
  return true;
}
function showLogin(note) {
  const b = $('#boot'); if (b) b.classList.add('hidden');
  const l = $('#login'); if (l) l.classList.remove('hidden');
  const n = $('#li-note'); if (n) n.textContent = note || '';
  const p = $('#li-pin'); if (p) p.value = '';
}
function forceLogin() {
  Auth.clear();
  try { if (typeof autosaveTimer !== 'undefined' && autosaveTimer) clearTimeout(autosaveTimer); } catch (e) {}
  if (typeof WZ !== 'undefined') WZ = null;
  document.body.classList.remove('in-wizard');
  const app = $('#app'); if (app) app.classList.add('hidden');
  showLogin('Silakan masuk untuk melanjutkan.');
}
async function doLogin() {
  const u = $('#li-user').value.trim();
  const p = $('#li-pin').value;
  const note = $('#li-note');
  if (!u || !p) { note.textContent = 'Isi username dan PIN.'; return; }
  const btn = $('#li-btn'); setBtnLoading(btn, true, 'Memeriksaâ€¦');
  try {
    const res = await apiNoAuth('login', u, p);
    Auth.save(res.token);
    Auth.user = res.init.user;
    state.config = res.init.config; state.schema = res.init.schema;
    state.peserta = res.init.peserta; state.riwayat = res.init.riwayat; state.dashboard = res.init.dashboard;
    setBtnLoading(btn, false);
    applyBranding();
    enterApp();
    if (pinPending()) showPinGate();
    else toast('Selamat datang, ' + Auth.user.nama + ' ðŸ‘‹', 'success');
  } catch (e) {
    setBtnLoading(btn, false);
    note.textContent = e.message;
  }
}
async function doLogout() {
  const ok = await confirmModal({ title: 'Keluar?', html: '<p class="text-sm">Tutup sesi Anda sekarang?</p>', confirmText: 'Keluar' });
  if (!ok) return;
  try { await api('logout'); } catch (e) {}
  forceLogin();
  toast('Anda telah keluar.', 'info');
}
function enterApp() {
  $('#boot').classList.add('hidden');
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  applyRoleNav();
  applyBranding();
  if (Auth.isStaff() && !state.dashboard) {
    loadDashboardData_().then(d => {
      state.dashboard = d;
      if (state.view === 'dashboard') renderDashboard();
    });
  }
  goView(Auth.isStaff() ? 'dashboard' : 'riwayat');
}
/* Identitas sekolah/tahun pelajaran selalu dari CONFIG sheet â€” jangan hardcode
 * di HTML, karena operator bisa mengubahnya tanpa deploy ulang. */
function applyBranding() {
  if (state.config) {
    $$('.brand-sekolah').forEach(el => { el.textContent = state.config.sekolah; });
    $$('.brand-tp').forEach(el => { el.textContent = state.config.tahunPelajaran; });
    const bt = $('#boot-tp');
    if (bt) bt.textContent = state.config.tahunPelajaran;
  }
}
function applyRoleNav() {
  if (!Auth.user) return;
  const admin = Auth.isAdmin();
  const staff = Auth.isStaff();
  $$('[data-role="admin"]').forEach(el => el.classList.toggle('hidden', !admin));
  $$('[data-role="staff"]').forEach(el => el.classList.toggle('hidden', !staff));
  /* Label nav disamakan ('Penilaian'); judul di dalam view yang membedakan
   * "Riwayat Assessment" (staff) dan "Penilaian Saya" (assessor). */
  const un = $('#uc-nama'), ur = $('#uc-role');
  if (un) un.textContent = Auth.user.nama;
  if (ur) {
    const ri = ROLE_INFO[Auth.user.role] || ROLE_INFO.ASSESSOR;
    ur.textContent = ri[0];
    ur.className = 'badge !px-2 !py-0.5 !text-[10px] ' + ri[1];
  }
}
async function refreshData() {
  try {
    const res = await api('getInitialData');
    Auth.user = res.user;
    state.peserta = res.peserta; state.riwayat = res.riwayat;
    /* Dashboard dihitung on-demand (getDashboardData), bukan ikut bootstrap â€”
     * sebelumnya getDashboardData tidak pernah dipanggil sehingga kartu
     * "Tugas Menunggu Penilaian" selalu kosong dan komentarnya dinonaktifkan. */
    state.dashboard = Auth.isStaff() ? await loadDashboardData_() : null;
    applyRoleNav();
    if (pinPending()) showPinGate();
    if (state.view === 'dashboard' && Auth.isStaff()) showDashboard();
    else if (state.view === 'riwayat') showRiwayat();
  } catch (e) { /* silent */ }
}
/* Ambil data dashboard; kegagalan tidak boleh menjatuhkan tampilan utama. */
async function loadDashboardData_() {
  try { const r = await api('getDashboardData'); return r.dashboard; }
  catch (e) { return state.dashboard; }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• TOAST & MODAL â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function toast(msg, type, dur) {
  const colors = { success: 'bg-emerald-500', error: 'bg-rose-500', info: 'bg-slate-800' };
  const icons = { success: 'check', error: 'alert', info: 'info' };
  const el = document.createElement('div');
  el.className = (colors[type] || colors.info) + ' text-white text-sm font-bold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 max-w-sm pointer-events-auto';
  el.innerHTML = ic(icons[type] || 'info', 'w-5 h-5 shrink-0') + '<span>' + esc(msg) + '</span>';
  $('#toast-root').appendChild(el);
  if (G()) gsap.fromTo(el, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: .3, ease: 'power3.out' });
  setTimeout(() => {
    if (G()) gsap.to(el, { opacity: 0, y: 8, duration: .3, onComplete: () => el.remove() });
    else el.remove();
  }, dur || 3800);
}
let lastFocusBeforeModal = null;
function modalOpen(inner, o) {
  o = o || {};
  const root = $('#modal-root');
  lastFocusBeforeModal = document.activeElement;
  root.innerHTML = '<div class="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">' +
    '<div class="modal-card bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true">' + inner + '</div></div>';
  const ov = root.firstElementChild;
  if (o.pinned) root.dataset.pinned = '1'; else delete root.dataset.pinned;
  ov.addEventListener('click', e => { if (e.target === ov) modalClose(); });
  /* Fokuskan elemen pertama agar keyboard & pembaca layar masuk ke dialog */
  const first = ov.querySelector('input:not([disabled]), select, textarea, button');
  if (first) { try { first.focus(); } catch (e) {} }
  if (G()) {
    gsap.fromTo(ov, { opacity: 0 }, { opacity: 1, duration: .18 });
    gsap.fromTo(ov.querySelector('.modal-card'), { y: 26, scale: .97, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: .3, ease: 'power3.out' });
  }
  return ov;
}
function modalClose() {
  const root = $('#modal-root');
  /* Modal terkunci (wajib ganti PIN) hanya bisa ditutup lewat alurnya sendiri. */
  if (root.dataset.pinned === '1') return;
  const back = lastFocusBeforeModal;
  if (G() && root.firstElementChild) gsap.to(root.firstElementChild, { opacity: 0, duration: .15, onComplete: () => root.innerHTML = '' });
  else root.innerHTML = '';
  if (back && typeof back.focus === 'function') { try { back.focus(); } catch (e) {} }
}
/* Esc menutup modal â€” sebelumnya hanya klik area gelap. */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const root = $('#modal-root');
  if (!root || !root.firstElementChild) return;
  if (root.dataset.pinned === '1') return;
  e.preventDefault();
  modalClose();
});

/* â”€â”€ Gate wajib ganti PIN â”€â”€
 * Server menolak semua endpoint tulis (requireWrite_) selama PIN default belum
 * diganti; modal ini adalah jalur keluarnya. */
function showPinGate() {
  if (!pinPending()) return;
  const root = $('#modal-root');
  if (root.dataset.pinned === '1' && $('#pg-new')) return; /* sudah tampil */
  const ov = modalOpen(
    '<div class="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 grid place-items-center mx-auto">' + ic('lock', 'w-7 h-7') + '</div>' +
    '<h3 class="mt-4 text-lg font-extrabold text-slate-800 text-center">Ganti PIN Anda</h3>' +
    '<p class="mt-2 text-sm text-slate-600 text-center">Akun <b>@' + esc(Auth.user.username) + '</b> masih memakai PIN default. ' +
    'Demi keamanan data peserta, <b>semua aksi tulis dikunci</b> sampai PIN diganti.</p>' +
    '<div class="mt-4 grid gap-3 text-left">' +
    '<div><label class="label" for="pg-old">PIN Lama</label><input id="pg-old" type="password" inputmode="numeric" autocomplete="current-password" class="input" placeholder="PIN yang Anda pakai tadi"></div>' +
    '<div><label class="label" for="pg-new">PIN Baru (4-12 digit)</label><input id="pg-new" type="password" inputmode="numeric" autocomplete="new-password" class="input" placeholder="cth: 6 digit angka"></div>' +
    '<div><label class="label" for="pg-conf">Ulangi PIN Baru</label><input id="pg-conf" type="password" inputmode="numeric" autocomplete="new-password" class="input" placeholder="ulangi PIN baru"></div>' +
    '</div>' +
    '<p id="pg-note" class="mt-3 text-xs font-bold text-rose-600 text-center min-h-[1rem]"></p>' +
    '<button id="pg-save" class="btn-primary w-full mt-2">Simpan PIN Baru</button>',
    { pinned: true });
  $('#pg-old', ov).focus();
  ov.querySelector('#pg-save').onclick = () => submitPinChange(ov);
  ['pg-old', 'pg-new', 'pg-conf'].forEach(id => {
    const el = $('#' + id, ov);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') submitPinChange(ov); });
  });
}
async function submitPinChange(ov) {
  const note = $('#pg-note', ov);
  const oldPin = $('#pg-old', ov).value.trim();
  const n1 = $('#pg-new', ov).value.trim();
  const n2 = $('#pg-conf', ov).value.trim();
  if (!/^\d{4,12}$/.test(oldPin)) { note.textContent = 'PIN lama wajib 4-12 digit angka.'; return; }
  if (!/^\d{4,12}$/.test(n1)) { note.textContent = 'PIN baru wajib 4-12 digit angka.'; return; }
  if (n1 !== n2) { note.textContent = 'Ulangi PIN baru dengan tepat.'; return; }
  if (n1 === oldPin) { note.textContent = 'PIN baru harus berbeda dari PIN lama.'; return; }
  const btn = ov.querySelector('#pg-save');
  setBtnLoading(btn, true, 'Menyimpanâ€¦');
  try {
    const res = await api('changeMyPin', oldPin, n1);
    Auth.user = res.user;
    delete $('#modal-root').dataset.pinned;
    modalClose();
    applyRoleNav();
    toast('PIN berhasil diganti. Aplikasi siap dipakai ðŸŽ‰', 'success');
  } catch (e) {
    setBtnLoading(btn, false);
    note.textContent = e.message;
  }
}
function confirmModal(o) {
  o = o || {};
  return new Promise(resolve => {
    const ov = modalOpen(
      '<div>' +
      '<div class="w-14 h-14 rounded-2xl ' + (o.danger ? 'bg-rose-50 text-rose-500' : 'bg-teal-50 text-teal-600') + ' grid place-items-center mx-auto">' + ic(o.icon || (o.danger ? 'alert' : 'check'), 'w-7 h-7') + '</div>' +
      '<h3 class="mt-4 text-lg font-extrabold text-slate-800 text-center">' + esc(o.title || 'Konfirmasi') + '</h3>' +
      '<div class="mt-2 text-sm text-slate-600 text-center">' + (o.html || '') + '</div>' +
      '<div class="mt-6 grid grid-cols-2 gap-3">' +
      '<button id="m-cancel" class="btn-soft">' + esc(o.cancelText || 'Batal') + '</button>' +
      '<button id="m-ok" class="' + (o.danger ? 'btn-danger' : 'btn-primary') + '">' + esc(o.confirmText || 'Ya, Lanjutkan') + '</button>' +
      '</div></div>');
    ov.querySelector('#m-cancel').onclick = () => { modalClose(); resolve(false); };
    ov.querySelector('#m-ok').onclick = () => { modalClose(); resolve(true); };
  });
}
function setBtnLoading(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = SPIN_SVG + ' ' + (label || 'Memprosesâ€¦'); }
  else { btn.disabled = false; if (btn.dataset.orig) btn.innerHTML = btn.dataset.orig; }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• NAVIGASI â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function setView(html) { $('#view').innerHTML = html; animateIn(); }
function animateIn() {
  if (G()) gsap.fromTo('#view .anim-in', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .35, stagger: .05, ease: 'power2.out', clearProps: 'all' });
}
function goView(name, param) {
  if (!Auth.user) return;
  if (name === 'dashboard' && !Auth.isStaff()) name = 'riwayat';
  if (name === 'pengguna' && !Auth.isAdmin()) name = 'riwayat';
  state.view = name;
  $$('.navlink, .botnav').forEach(b => { if (b.dataset.view) b.classList.toggle('on', b.dataset.view === name); });
  if (name === 'dashboard') showDashboard();
  else if (name === 'riwayat') showRiwayat();
  else if (name === 'pengguna') showPengguna();
  else if (name === 'soal') showSoal();
  else if (name === 'hasil') showHasil(param);
}
function showHasilById(id) {
  document.body.classList.remove('in-wizard');
  if (typeof WZ !== 'undefined') WZ = null;
  goView('hasil', id);
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• KALKULASI (mirror Calculation.gs) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function defaultMeta() {
  const m = { sentra: {}, koordinator: { username: '', nama: '', waktu: '' } };
  state.schema.sentra.forEach(s => m.sentra[s.id] = { status: 'DRAFT', assessor: '', waktu: '', owner: '', ownerName: '' });
  return m;
}
function calcMateri(m, d) {
  d = d || {}; const skor = d.skor || {};
  const r = { skor: 0, maks: 0, persen: 0, lengkap: true, terpilih: [], terisi: 0, jumlahSel: 0 };
  if (m.tipe === 'tunggal') {
    let total = 0;
    m.items.forEach(it => {
      r.jumlahSel++;
      const v = num(skor[it.id]);
      if (v) { total += v; r.terisi++; } else r.lengkap = false;
    });
    r.skor = total; r.maks = m.items.length * 3;
  } else {
    const totals = m.items.map(it => {
      const aspek = it.aspek || m.aspek;
      let t = 0, ok = true;
      aspek.forEach(a => {
        r.jumlahSel++;
        const cell = skor[it.id] || {};
        const v = num(cell[a.id]);
        if (v) { t += v; r.terisi++; } else ok = false;
      });
      if (!ok) r.lengkap = false;
      return { id: it.id, total: t, ok: ok };
    });
    if (m.pilihTerbaik) {
      totals.filter(x => x.ok).sort((a, b) => b.total - a.total).slice(0, m.pilihTerbaik).forEach(x => { r.terpilih.push(x.id); r.skor += x.total; });
      r.maks = m.pilihTerbaik * m.aspek.length * 3;
    } else {
      totals.forEach(x => { r.skor += x.total; });
      let c = 0; m.items.forEach(it => { c += (it.aspek || m.aspek).length; });
      r.maks = c * 3;
    }
  }
  r.persen = r.maks ? round1(r.skor / r.maks * 100) : 0;
  return r;
}
function calcHasil(data) {
  data = data || {};
  const cfg = state.config.kode;
  const r = { materi: {}, sentra: {}, calistung: null, nilaiAkhir: null, kode: null, kodeLabel: null, lengkap: true };
  state.schema.sentra.forEach(s => {
    const persens = [];
    s.materi.forEach(m => {
      const h = calcMateri(m, data[m.id]);
      r.materi[m.id] = h;
      if (h.lengkap) persens.push(h.persen); else r.lengkap = false;
    });
    r.sentra[s.id] = persens.length ? round1(persens.reduce((a, b) => a + b, 0) / persens.length) : null;
  });
  const sentraValues = state.schema.sentra.map(s => r.sentra[s.id]);
  const sr = sentraValues.filter(v => v !== null);
  r.nilaiAkhir = sr.length === state.schema.sentra.length && sr.length ? round1(sr.reduce((a, b) => a + b, 0) / sr.length) : null;
  const calIds = cfg.includeEnglish ? ['membaca', 'menulis', 'berhitung', 'english'] : ['membaca', 'menulis', 'berhitung'];
  const cp = calIds.map(id => (r.materi[id] && r.materi[id].lengkap) ? r.materi[id].persen : null);
  if (cp.every(v => v !== null)) {
    r.calistung = round1(cp.reduce((a, b) => a + b, 0) / cp.length);
    r.kode = r.calistung >= cfg.aMin ? 'A' : (r.calistung >= cfg.bMin ? 'B' : 'C');
    const k = state.config.kodeList.find(x => x.kode === r.kode);
    r.kodeLabel = k ? k.label : '';
  }
  return r;
}
function materiById(id) {
  for (const s of state.schema.sentra) { const m = s.materi.find(x => x.id === id); if (m) return m; }
  return null;
}
function sentraByMateriId(id) { return state.schema.sentra.find(s => s.materi.some(m => m.id === id)) || null; }
function sentraName(sid) { const s = state.schema.sentra.find(x => x.id === sid); return s ? s.singkat : sid; }

function sentraMineInView(sid, a) {
  if (!Auth.user) return false;
  if (Auth.isStaff()) return true;
  if ((Auth.user.assignments || []).indexOf(sid) < 0) return false;
  const own = a && a.sentraOwner && a.sentraOwner[sid];
  return !own || own.owner === Auth.user.username;
}
function missingDetail(h) {
  const out = [];
  state.schema.sentra.forEach(s => s.materi.forEach(m => {
    const r = h.materi[m.id];
    if (r && !r.lengkap) out.push({ id: m.id, no: m.no, nama: m.nama, kurang: r.jumlahSel - r.terisi });
  }));
  return out;
}
function barColor(r) {
  if (!r.lengkap) return 'bg-slate-300';
  return r.persen >= 80 ? 'bg-emerald-500' : (r.persen >= 60 ? 'bg-amber-400' : 'bg-rose-400');
}
function kodeRuleText() {
  const k = state.config.kode;
  return 'Dihitung dari rerata Calistung (2.1 Membaca, 2.2 Menulis/Dikte, 2.3 Berhitung' + (k.includeEnglish ? ', 2.4 English' : '') + ') â€” A â‰¥ ' + k.aMin + ' â€¢ B â‰¥ ' + k.bMin + ' â€¢ C < ' + k.bMin;
}
function statusBadge(st) {
  if (st === 'SUBMITTED') return '<span class="badge bg-emerald-50 text-emerald-600">' + ic('check', 'w-3.5 h-3.5') + ' Selesai</span>';
  if (st === 'SIAP_REVIEW') return '<span class="badge bg-blue-50 text-blue-600">' + ic('star', 'w-3.5 h-3.5') + ' Siap Review</span>';
  return '<span class="badge bg-amber-50 text-amber-600">' + ic('edit', 'w-3.5 h-3.5') + ' Draft</span>';
}
function kodeBadge(k) {
  const cls = { A: 'bg-emerald-100 text-emerald-700', B: 'bg-amber-100 text-amber-700', C: 'bg-rose-100 text-rose-600' }[k] || 'bg-slate-100 text-slate-500';
  return '<span class="badge ' + cls + '">Kode ' + esc(k) + '</span>';
}
function sentraChips(ss) {
  const map = state.schema.sentra.map(s => [s.id, (s.singkat || s.nama).charAt(0).toUpperCase(), s.nama]);
  return '<span class="flex gap-1 shrink-0">' + map.map(x =>
    '<span title="' + x[2] + (ss && ss[x[0]] === 'FINAL' ? ' â€” final' : '') + '" class="w-5 h-5 rounded-md grid place-items-center text-[10px] font-extrabold ' +
    (ss && ss[x[0]] === 'FINAL' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400') + '">' + x[1] + '</span>').join('') + '</span>';
}
function spinnerHtml(text) {
  return '<div class="py-20 text-center text-slate-400">' + SPIN_SVG.replace('class="animate-spin w-5 h-5"', 'class="animate-spin w-8 h-8 mx-auto text-teal-500"') + '<p class="mt-3 text-sm font-bold">' + esc(text || 'Memuatâ€¦') + '</p></div>';
}
function errorHtml(msg) {
  return '<div class="card p-6 text-center text-rose-500 anim-in">' + ic('alert', 'w-8 h-8 mx-auto') + '<p class="mt-2 font-bold text-sm">' + esc(msg) + '</p></div>';
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• VIEW: DASHBOARD (KOORDINATOR & ADMIN) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
/* Data dashboard dimuat on-demand dan dirender ulang saat tiba. Dipanggil
 * setiap kali dashboard dibuka (enterApp/refreshData/getDashboardDataImpl_
 * tidak lagi ikut bootstrap getInitialData). */
async function showDashboard() {
  if (!Auth.isStaff()) { goView('riwayat'); return; }
  if (!state.dashboard) {
    state.dashboard = await loadDashboardData_();
    if (state.view !== 'dashboard') return; /* pengguna sudah pindah view */
  }
  renderDashboard();
}
function renderDashboard() {
  const d = state.dashboard || {};
  const kc = d.kodeCount || { A: 0, B: 0, C: 0 };
  const kmax = Math.max(1, kc.A, kc.B, kc.C);
  const pb = d.pendingBySentra || {};

  setView(
    '<section class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 via-teal-500 to-emerald-400 p-6 sm:p-8 text-white shadow-card anim-in">' +
    '<div class="absolute -top-20 -right-16 w-64 h-64 rounded-full bg-white/10"></div>' +
    '<div class="absolute -bottom-24 -left-12 w-64 h-64 rounded-full bg-emerald-300/20"></div>' +
    '<div class="relative">' +
    '<p class="text-white/80 text-[11px] sm:text-xs font-extrabold uppercase tracking-widest">' + esc(state.config.sekolah) + ' â€¢ TP ' + esc(state.config.tahunPelajaran) + '</p>' +
    '<h2 class="mt-2 text-2xl sm:text-3xl font-extrabold leading-tight">Dashboard Koordinator</h2>' +
    '<p class="mt-2 text-white/85 text-sm max-w-xl leading-relaxed">Pantau progres assessment tiap sentra dan lakukan Submit Final â€” laporan ditandatangani atas nama Anda.</p>' +
    '<div class="mt-5 flex flex-wrap gap-3">' +
    '<button onclick="wizardStart()" class="btn-glass !bg-white !text-teal-700 !border-transparent hover:!bg-teal-50 font-extrabold">' + ic('plus', 'w-4 h-4') + ' Assessment Baru</button>' +
    (Auth.isAdmin() ? '<button onclick="goView(\'pengguna\')" class="btn-glass">' + ic('users', 'w-4 h-4') + ' Kelola Pengguna</button>' : '') +
    '</div></div></section>' +

    '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-4">' +
    statCard('Peserta Terdaftar', d.peserta == null ? 0 : d.peserta, 'users') +
    statCard('Draft Berjalan', d.draft == null ? 0 : d.draft, 'edit') +
    statCard('Siap Review', d.siapReview == null ? 0 : d.siapReview, 'star') +
    statCard('Selesai', d.submitted == null ? 0 : d.submitted, 'check') +
    '</div>' +

    '<div class="grid lg:grid-cols-2 gap-4 mt-4">' +
    '<div class="card p-4 sm:p-5 anim-in">' +
    '<h3 class="font-extrabold text-sm sm:text-base text-slate-800 flex items-center gap-2 leading-snug">' + ic('clock', 'w-5 h-5 text-amber-500 shrink-0') + ' Tugas Menunggu Penilaian</h3>' +
    '<p class="text-xs text-slate-400 mt-1">Assessment belum submit yang sentranya belum final</p>' +
    '<div class="mt-4 grid gap-2.5">' +
    state.schema.sentra.map(s => pendingRow(s.singkat || s.nama, pb[s.id])).join('') +
    '</div></div>' +
    '<div class="card p-4 sm:p-5 anim-in">' +
    '<h3 class="font-extrabold text-sm sm:text-base text-slate-800 flex items-center gap-2 leading-snug">' + ic('star', 'w-5 h-5 text-blue-500 shrink-0') + ' Siap Submit Final</h3>' +
    '<p class="text-xs text-slate-400 mt-1">Semua sentra sudah difinalisasi assessor</p>' +
    readyListHtml() +
    '</div></div>' +

    '<div class="grid lg:grid-cols-2 gap-4 mt-4">' +
    '<div class="card p-4 sm:p-5 anim-in">' +
    '<h3 class="font-extrabold text-sm sm:text-base text-slate-800 flex items-center gap-2 leading-snug">' + ic('star', 'w-5 h-5 text-amber-400 shrink-0') + ' Sebaran Kode Hasil</h3>' +
    '<div class="mt-4 grid gap-3">' + kodeBar('A', 'Lancar Calistung', kc.A, kmax, 'emerald') + kodeBar('B', 'Cukup Calistung', kc.B, kmax, 'amber') + kodeBar('C', 'Butuh Bimbingan', kc.C, kmax, 'rose') + '</div>' +
    (d.rerata != null ? '<p class="text-xs text-slate-400 mt-4">Rerata nilai akhir semua peserta selesai: <b class="text-teal-700">' + d.rerata + '</b></p>' : '') +
    '</div>' +
    '<div class="card p-4 sm:p-5 anim-in">' +
    '<h3 class="font-extrabold text-sm sm:text-base text-slate-800 flex items-center gap-2 leading-snug">' + ic('edit', 'w-5 h-5 text-teal-500 shrink-0') + ' Draft Belum Selesai</h3>' +
    draftListHtml() +
    '</div></div>' +

    '<div class="card p-4 sm:p-5 anim-in mt-4">' +
    '<div class="flex items-center justify-between gap-3 flex-wrap">' +
    '<h3 class="font-extrabold text-sm sm:text-base text-slate-800 flex items-center gap-2 leading-snug">' + ic('clock', 'w-5 h-5 text-teal-500 shrink-0') + ' Aktivitas Terbaru</h3>' +
    '<button class="text-xs font-extrabold text-teal-600 hover:underline shrink-0 !px-2.5 !py-1.5 -mr-1 rounded-lg hover:bg-teal-50 transition" onclick="goView(\'riwayat\')">Lihat semua â†’</button>' +
    '</div>' +
    '<div class="grid gap-2.5 mt-4">' + recentHtml() + '</div></div>'
  );
}

function statCard(label, val, iconName) {
  return '<div class="card p-3.5 sm:p-5 anim-in flex items-center gap-3">' +
    '<span class="w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-2xl bg-teal-50 text-teal-600 grid place-items-center">' + ic(iconName, 'w-5 h-5') + '</span>' +
    '<div class="min-w-0 flex-1">' +
    '<p class="text-lg sm:text-2xl font-extrabold text-slate-800 leading-none">' + val + '</p>' +
    '<p class="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wide mt-1 leading-tight line-clamp-2">' + esc(label) + '</p>' +
    '</div></div>';
}

function kodeBar(kode, label, n, max, color) {
  const colors = { emerald: 'bg-emerald-500', amber: 'bg-amber-400', rose: 'bg-rose-400' };
  return '<div class="flex items-center gap-3">' +
    '<span class="w-8 h-8 rounded-xl bg-slate-100 grid place-items-center font-extrabold text-slate-600 text-sm shrink-0">' + kode + '</span>' +
    '<div class="flex-1 min-w-0"><div class="flex justify-between text-xs font-bold text-slate-500"><span class="truncate">' + esc(label) + '</span><span class="shrink-0 ml-2">' + n + '</span></div>' +
    '<div class="bar-track mt-1.5"><div class="bar-fill ' + colors[color] + '" style="width:' + Math.round(n / max * 100) + '%"></div></div></div></div>';
}

function pendingRow(label, info) {
  info = info || { count: 0, assessor: '' };
  return '<div class="flex items-center gap-3 p-3 rounded-2xl border border-slate-200">' +
    '<span class="w-10 h-10 shrink-0 rounded-xl ' + (info.count ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400') + ' grid place-items-center font-extrabold text-sm">' + info.count + '</span>' +
    '<div class="flex-1 min-w-0">' +
    '<p class="font-bold text-sm text-slate-700 truncate">' + esc(label) + '</p>' +
    '<p class="text-[11px] text-slate-400 truncate mt-0.5">Penugas: ' + esc(info.assessor || 'â€” belum ada â€”') + '</p>' +
    '</div></div>';
}

function readyListHtml() {
  const rl = (state.dashboard || {}).readyList || [];
  if (!rl.length) return '<div class="py-8 text-center text-sm text-slate-400">Belum ada assessment siap submit.</div>';
  return '<div class="mt-4 grid gap-2">' + rl.map(r =>
    '<div class="flex items-center gap-3 p-3 rounded-2xl border border-blue-100 bg-blue-50/40 hover:border-blue-300 transition cursor-pointer" data-act="lihat" data-id="' + esc(r.id) + '" title="' + esc(r.nama) + '">' +
    '<span class="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 grid place-items-center shrink-0 font-extrabold text-xs">' + esc(inisial(r.nama)) + '</span>' +
    '<div class="flex-1 min-w-0">' +
    '<p class="font-bold text-sm text-slate-800 truncate">' + esc(r.nama) + '</p>' +
    '<p class="text-[11px] text-slate-400 truncate mt-0.5">' + esc(r.creator) + ' â€¢ ' + fmtTanggal(r.tanggal) + '</p>' +
    '</div>' +
    '<button class="btn-primary !px-3 !py-2 !text-xs shrink-0" data-act="submit" data-id="' + esc(r.id) + '" title="Submit Final">' + ic('check', 'w-4 h-4') + '<span class="hide-xs">Submit</span></button>' +
    '</div>').join('') + '</div>';
}

function draftListHtml() {
  const dl = (state.dashboard || {}).draftList || [];
  if (!dl.length) return '<div class="py-8 text-center text-sm text-slate-400 mt-4">Tidak ada draft berjalan.</div>';
  return '<div class="mt-4 grid gap-2">' + dl.map(d =>
    '<div class="flex items-center gap-3 p-3 rounded-2xl border border-slate-200 hover:border-teal-300 transition cursor-pointer" data-act="lanjut" data-id="' + esc(d.id) + '" title="' + esc(d.nama) + '">' +
    '<span class="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 grid place-items-center shrink-0">' + ic('edit', 'w-4 h-4') + '</span>' +
    '<div class="flex-1 min-w-0">' +
    '<p class="font-bold text-sm text-slate-800 truncate">' + esc(d.nama) + '</p>' +
    '<div class="flex items-center gap-2 mt-1 min-w-0">' +
    sentraChips(d.sentraStatus) +
    '<span class="text-[11px] text-slate-400 truncate min-w-0">' + esc(d.creator) + '</span>' +
    '</div></div>' +
    '<svg class="w-4 h-4 text-slate-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' +
    '</div>').join('') + '</div>';
}

function recentHtml() {
  const rc = (state.dashboard || {}).recent || [];
  if (!rc.length) return '<p class="text-sm text-slate-400 text-center py-6">Belum ada aktivitas assessment.</p>';
  return rc.map(r =>
    '<button class="w-full text-left flex items-center gap-3 p-3 rounded-2xl border border-slate-200 hover:border-teal-300 hover:bg-teal-50/30 transition anim-in" data-act="lihat" data-id="' + esc(r.id) + '" title="' + esc(r.nama) + '">' +
    '<span class="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 grid place-items-center shrink-0 font-extrabold text-xs">' + esc(inisial(r.nama)) + '</span>' +
    '<span class="flex-1 min-w-0">' +
    '<span class="block font-bold text-sm text-slate-800 truncate">' + esc(r.nama) + '</span>' +
    '<span class="block text-[11px] text-slate-400 truncate mt-0.5">' + esc(r.creator) + ' â€¢ ' + fmtTanggal(r.tanggal) + '</span>' +
    '</span>' +
    '<span class="flex flex-col items-end gap-1 shrink-0">' +
    statusBadge(r.status) + (r.kode ? kodeBadge(r.kode) : '') +
    '</span>' +
    '</button>').join('');
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• VIEW: RIWAYAT / PENILAIAN â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function showRiwayat() {
  const staff = Auth.isStaff();
  setView(
    '<div class="anim-in"><h2 class="text-xl font-extrabold text-slate-800">' + (staff ? 'Riwayat Assessment' : 'Penilaian Saya') + '</h2>' +
    '<p class="text-sm text-slate-500 mt-0.5">' + (staff ? 'Kelola semua assessment peserta' : 'Buka peserta untuk menilai BAB yang ditugaskan kepada Anda') + '</p></div>' +
    '<div class="card p-4 mt-4 anim-in">' +
    '<div class="relative">' + ic('search', 'w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400') +
    '<input id="rq" class="input pad-icon" placeholder="Cari nama / nomor / pembuat..." value="' + esc(state.rQuery) + '"></div>' +
    (Auth.isAdmin() ? '<div class="mt-3"><label for="r-user-filter" class="label">Lihat assessment berdasarkan pengguna</label><select id="r-user-filter" class="input"><option value="ALL">Semua pengguna</option>' + (state.reviewUsers || []).map(u => '<option value="' + esc(u.username) + '" ' + (state.rUser === u.username ? 'selected' : '') + '>' + esc(u.nama + ' Â· ' + u.username) + '</option>').join('') + '</select><p class="text-[11px] text-slate-400 mt-1">Termasuk assessment yang dibuat atau dikerjakan pengguna pada salah satu sentra.</p></div>' : '') +
    '<div class="flex gap-2 mt-3 flex-wrap">' +
    [['ALL', 'Semua'], ['DRAFT', 'Draft'], ['SIAP_REVIEW', 'Siap Review'], ['SUBMITTED', 'Selesai']].map(f =>
      '<button class="chip-filter ' + (state.rFilter === f[0] ? 'on' : '') + '" data-rf="' + f[0] + '">' + f[1] + '</button>').join('') +
    '</div></div>' +
    '<div id="rlist" class="mt-4 grid gap-3"></div>');
  renderRiwayatList();
  $('#rq').addEventListener('input', e => { state.rQuery = e.target.value; renderRiwayatList(); });
  const userFilter = $('#r-user-filter');
  if (userFilter) userFilter.addEventListener('change', e => { state.rUser = e.target.value; renderRiwayatList(); });
  if (Auth.isAdmin() && !state.reviewUsersLoaded) {
    api('getUsersLite').then(res => {
      state.reviewUsers = res.users || [];
      state.reviewUsersLoaded = true;
      if (state.view === 'riwayat') showRiwayat();
    }).catch(() => {});
  }
  $$('#view [data-rf]').forEach(b => b.addEventListener('click', () => {
    state.rFilter = b.dataset.rf;
    $$('#view [data-rf]').forEach(x => x.classList.toggle('on', x.dataset.rf === state.rFilter));
    renderRiwayatList();
  }));
}
function renderRiwayatList() {
  const box = $('#rlist'); if (!box) return;
  const q = (state.rQuery || '').toLowerCase();
  let items = state.riwayat || [];
  if (q) items = items.filter(r => (r.nama + ' ' + (r.nomor || '') + ' ' + r.creator).toLowerCase().indexOf(q) >= 0);
  if (Auth.isAdmin() && state.rUser !== 'ALL') items = items.filter(r => r.creatorUsername === state.rUser || Object.keys(r.sentraOwner || {}).some(sid => r.sentraOwner[sid] && r.sentraOwner[sid].owner === state.rUser));
  if (state.rFilter !== 'ALL') items = items.filter(r => r.status === state.rFilter);
  if (!items.length) {
    box.innerHTML = '<div class="card p-10 text-center text-slate-400 anim-in">' + ic('search', 'w-8 h-8 mx-auto opacity-40') + '<p class="mt-3 text-sm font-bold">Tidak ada data ditemukan</p></div>';
    animateIn(); return;
  }
  box.innerHTML = items.map(riwayatCard).join('');
  animateIn();
}
function riwayatCard(it) {
  const staff = Auth.isStaff();
  const mine = it.myPending || [];
  const mineTxt = mine.map(sid => sentraName(sid)).join(', ');
  const canOpen = it.status !== 'SUBMITTED' && (staff || mine.length);
  return '<div class="card p-4 anim-in flex flex-col sm:flex-row sm:items-center gap-3">' +
    '<div class="flex-1 min-w-0">' +
    '<div class="flex items-center gap-2 flex-wrap">' +
    '<p class="font-extrabold text-slate-800">' + esc(it.nama) + '</p>' + statusBadge(it.status) + (it.kode ? kodeBadge(it.kode) : '') + sentraChips(it.sentraStatus) + '</div>' +
    '<p class="text-xs text-slate-500 mt-0.5">No. ' + esc(it.nomor || '-') + ' â€¢ ' + esc(it.creator) + ' â€¢ ' + fmtTanggal(it.tanggal) +
    (it.status !== 'SUBMITTED' ? ' â€¢ diubah ' + esc(it.updated || '') : (it.nilai_akhir != null ? ' â€¢ Nilai akhir ' + it.nilai_akhir : '')) + '</p>' +
    (mine.length && !staff ? '<p class="mt-1"><span class="badge bg-amber-100 text-amber-700">' + ic('alert', 'w-3 h-3') + ' Menunggu Anda: ' + esc(mineTxt) + '</span></p>' : '') +
    ((it.handledByOther || []).length && !staff ? '<p class="mt-1"><span class="badge bg-slate-200 text-slate-600">' + ic('lock', 'w-3 h-3') + ' ' + esc(it.handledByOther.map(x => sentraName(x.sid) + ': ' + x.ownerName).join(', ')) + '</span></p>' : '') +
    '</div>' +
    '<div class="flex gap-2 flex-wrap">' +
    (canOpen ? '<button class="btn-primary !py-2.5 !text-xs" data-act="lanjut" data-id="' + esc(it.id) + '">' + ic('edit', 'w-4 h-4') + ' Buka</button>' : '') +
    (staff && it.status === 'SIAP_REVIEW' ? '<button class="btn-primary !py-2.5 !text-xs" data-act="submit" data-id="' + esc(it.id) + '">' + ic('check', 'w-4 h-4') + ' Submit Final</button>' : '') +
    '<button class="btn-soft !text-xs" data-act="lihat" data-id="' + esc(it.id) + '">' + ic('eye', 'w-4 h-4') + ' Lihat</button>' +
    '<button class="btn-soft !text-xs" data-act="cetak" data-id="' + esc(it.id) + '">' + ic('printer', 'w-4 h-4') + ' Cetak</button>' +
    (staff && it.status === 'SUBMITTED' ? '<button class="btn-soft !text-xs" data-act="unlock" data-id="' + esc(it.id) + '">' + ic('unlock', 'w-4 h-4') + ' Buka Kunci</button>' : '') +
    (staff && it.status === 'DRAFT' ? '<button class="btn-soft !text-xs !bg-rose-50 !text-rose-600 hover:!bg-rose-100" data-act="hapus" data-id="' + esc(it.id) + '" aria-label="Hapus draft" title="Hapus draft">' + ic('trash', 'w-4 h-4') + '</button>' : '') +
    '</div></div>';
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• VIEW: PENGGUNA (ADMIN) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
async function showPengguna() {
  if (!Auth.isAdmin()) { goView('riwayat'); return; }
  setView(spinnerHtml('Memuat daftar penggunaâ€¦'));
  try {
    const res = await api('getUsers');
    state.users = res.users;
    renderUsers();
  } catch (e) { setView(errorHtml(e.message)); }
}
function renderUsers() {
  setView(
    '<div class="anim-in flex items-center justify-between gap-3 flex-wrap">' +
    '<div><h2 class="text-xl font-extrabold text-slate-800">Pengguna & Penugasan</h2>' +
    '<p class="text-sm text-slate-500 mt-0.5">Assessor menilai sesuai penugasan; Koordinator submit final & menandatangani laporan</p></div>' +
    '<button class="btn-primary !py-2.5" onclick="userModal()">' + ic('plus', 'w-4 h-4') + ' Pengguna Baru</button></div>' +
    '<div class="mt-4 grid gap-3">' + (state.users.length ? state.users.map(userCard).join('') :
      '<div class="card p-10 text-center text-slate-400">Belum ada pengguna.</div>') + '</div>');
}
function userCard(u) {
  const asgChips = u.assignments.length
    ? u.assignments.map(sid => '<span class="badge bg-teal-50 text-teal-700">' + esc(sentraName(sid)) + '</span>').join(' ')
    : '<span class="badge bg-slate-100 text-slate-400">Tidak ada</span>';
  const isSelf = u.username === Auth.user.username;
  const ri = ROLE_INFO[u.role] || ROLE_INFO.ASSESSOR;
  return '<div class="card p-4 anim-in flex flex-col sm:flex-row sm:items-center gap-3">' +
    '<div class="flex-1 min-w-0">' +
    '<div class="flex items-center gap-2 flex-wrap">' +
    '<p class="font-extrabold text-slate-800">' + esc(u.nama) + '</p>' +
    '<span class="badge ' + ri[1] + '">' + ri[0] + '</span>' +
    (u.aktif ? '' : '<span class="badge bg-slate-200 text-slate-500">Nonaktif</span>') +
    (u.pinHarusDiganti ? '<span class="badge bg-amber-50 text-amber-700">' + ic('lock', 'w-3 h-3') + ' Wajib ganti PIN</span>' : '') +
    (u.pinDefault ? '<span class="badge bg-rose-50 text-rose-600">' + ic('alert', 'w-3 h-3') + ' PIN default â€” ganti!</span>' : '') +
    '</div>' +
    '<p class="text-xs text-slate-500 mt-0.5">@' + esc(u.username) + '</p>' +
    '<div class="mt-1.5 flex gap-1.5 flex-wrap">' + asgChips + '</div></div>' +
    '<div class="flex gap-2 shrink-0 flex-wrap">' +
    '<button class="btn-soft !text-xs" data-act="user-edit" data-username="' + esc(u.username) + '">' + ic('edit', 'w-4 h-4') + ' Edit</button>' +
    (isSelf ? '' :
      '<button class="btn-soft !text-xs ' + (u.aktif ? '!bg-rose-50 !text-rose-600 hover:!bg-rose-100' : '!bg-emerald-50 !text-emerald-600 hover:!bg-emerald-100') + '" data-act="user-toggle" data-username="' + esc(u.username) + '" data-active="' + (u.aktif ? '0' : '1') + '">' + (u.aktif ? 'Nonaktifkan' : 'Aktifkan') + '</button>' +
      '<button class="btn-soft !text-xs !bg-rose-50 !text-rose-600 hover:!bg-rose-100" data-act="user-del" data-username="' + esc(u.username) + '" title="Hapus permanen">' + ic('trash', 'w-4 h-4') + ' Hapus</button>') +
    '</div></div>';
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• VIEW: KELOLA SOAL ASSESSMENT (ADMIN) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
async function showSoal() {
  if (!Auth.isAdmin()) { goView('riwayat'); return; }
  setView(spinnerHtml('Memuat daftar soalâ€¦'));
  try {
    const res = await api('getInitialData');
    state.schema = res.schema;
    renderSoal();
  } catch (e) { setView(errorHtml(e.message)); }
}
function renderSoal() {
  if (!Auth.isAdmin()) return;
  const groups = state.schema.sentra.map(s =>
    '<section class="card p-4 sm:p-5"><div class="mb-3"><p class="text-[11px] font-extrabold uppercase tracking-widest text-teal-600">' + esc(s.bab) + '</p><h3 class="font-extrabold text-slate-800">' + esc(s.nama) + '</h3></div>' +
    s.materi.map(m => '<div class="border-t border-slate-100 py-3"><div class="flex justify-between gap-2 items-start"><div><p class="text-xs font-bold text-slate-500">' + esc(m.no) + '</p><p class="font-bold text-sm text-slate-800">' + esc(m.nama) + '</p></div><div class="flex gap-2 shrink-0"><button class="btn-soft !py-1.5 !px-2.5 !text-xs" data-act="rubric-edit" data-sid="' + esc(s.id) + '" data-mid="' + esc(m.id) + '">' + ic('edit', 'w-3.5 h-3.5') + ' Rubrik</button><button class="btn-soft !py-1.5 !px-2.5 !text-xs" data-act="question-add" data-sid="' + esc(s.id) + '" data-mid="' + esc(m.id) + '">' + ic('plus', 'w-3.5 h-3.5') + ' Soal</button></div></div>' +
    '<div class="mt-2 grid gap-2">' + m.items.map(it => '<div class="rounded-xl bg-slate-50 px-3 py-2.5 flex items-center gap-2"><span class="text-sm text-slate-700 flex-1">' + esc(it.nama) + '</span><button class="btn-soft !py-1 !px-2 !text-xs" data-act="question-edit" data-sid="' + esc(s.id) + '" data-mid="' + esc(m.id) + '" data-iid="' + esc(it.id) + '">' + ic('edit', 'w-3.5 h-3.5') + ' Edit</button><button class="btn-soft !py-1 !px-2 !text-xs !bg-rose-50 !text-rose-600" data-act="question-delete" data-sid="' + esc(s.id) + '" data-mid="' + esc(m.id) + '" data-iid="' + esc(it.id) + '" title="Hapus soal">' + ic('trash', 'w-3.5 h-3.5') + '</button></div>').join('') + '</div></div>').join('') + '</section>'
  ).join('');
  setView('<div class="anim-in"><div class="mb-4"><h2 class="text-xl font-extrabold text-slate-800">Soal Assessment</h2><p class="text-sm text-slate-500 mt-0.5">Tambah, ubah, atau hapus pertanyaan pada setiap materi.</p></div><div class="grid gap-4">' + groups + '</div><p class="text-[11px] text-slate-400 mt-4">Perubahan berlaku untuk assessment baru dan draft yang dibuka setelah perubahan. Assessment yang sudah tersimpan mempertahankan skor historisnya.</p></div>');
}
function questionModal(sid, mid, iid) {
  if (!Auth.isAdmin()) return;
  const s = state.schema.sentra.find(x => x.id === sid), m = s && s.materi.find(x => x.id === mid);
  const item = m && m.items.find(x => x.id === iid), edit = !!item;
  if (!m || (iid && !item)) return;
  const ov = modalOpen('<h3 class="text-lg font-extrabold text-slate-800">' + (edit ? 'Edit Soal' : 'Tambah Soal') + '</h3><p class="text-xs text-slate-500 mt-1">' + esc(m.no + ' ' + m.nama) + '</p><div class="mt-4"><label class="label">Teks soal / indikator</label><textarea id="qf-nama" class="input min-h-24" maxlength="180" placeholder="Tulis pertanyaan atau indikator penilaian">' + esc(item ? item.nama : '') + '</textarea></div><div class="mt-4 grid grid-cols-2 gap-3"><button id="qf-cancel" class="btn-soft">Batal</button><button id="qf-save" class="btn-primary">Simpan</button></div>');
  ov.querySelector('#qf-cancel').onclick = () => modalClose();
  ov.querySelector('#qf-save').onclick = async () => {
    const nama = ov.querySelector('#qf-nama').value.trim();
    if (!nama) { toast('Teks soal wajib diisi.', 'error'); return; }
    if (guardPin()) return;
    const btn = ov.querySelector('#qf-save'); setBtnLoading(btn, true, 'Menyimpanâ€¦');
    try {
      const res = await api('saveAssessmentQuestion', { action: edit ? 'edit' : 'add', sentraId: sid, materiId: mid, itemId: iid || '', nama: nama });
      state.schema = res.schema;
      modalClose(); toast(edit ? 'Soal diperbarui.' : 'Soal ditambahkan.', 'success'); renderSoal();
    } catch (e) { setBtnLoading(btn, false); toast(e.message, 'error'); }
  };
}
function rubricModal(sid, mid) {
  if (!Auth.isAdmin()) return;
  const s = state.schema.sentra.find(x => x.id === sid), m = s && s.materi.find(x => x.id === mid);
  if (!m) return;
  const labels = Object.assign({ '3': 'Baik / Mandiri', '2': 'Cukup', '1': 'Perlu Bimbingan' }, m.labelNilai || {});
  const rubric = m.rubrikNilai || {}, aspectRubric = m.rubrikAspek || {};
  const criteria = [];
  (m.items || []).forEach(it => (it.aspek || m.aspek || []).forEach(a => {
    const key = (it.aspek ? it.id + '__' : '') + a.id;
    if (!criteria.some(x => x.key === key)) criteria.push({ key: key, nama: a.nama, itemNama: it.aspek ? it.nama : '' });
  }));
  const scoreFields = ['3', '2', '1'].map(score => '<div class="rounded-xl border border-slate-100 p-3"><div class="grid grid-cols-[64px_1fr] gap-2 items-center"><span class="badge bg-teal-50 text-teal-700">Skor ' + score + '</span><input class="input !py-2" id="rf-label-' + score + '" maxlength="50" value="' + esc(labels[score]) + '" placeholder="Label skor"></div>' + (m.tipe === 'tunggal' ? '<textarea class="input mt-2 min-h-16" id="rf-desc-' + score + '" maxlength="500" placeholder="Deskripsi kriteria skor ' + score + '">' + esc(rubric[score] || '') + '</textarea>' : '') + '</div>').join('');
  const aspectFields = criteria.map((c, ci) => '<div class="rounded-xl border border-slate-200 p-3"><p class="text-xs font-extrabold text-slate-700 mb-2">' + (c.itemNama ? esc(c.itemNama) + ' Â· ' : '') + esc(c.nama) + '</p><div class="grid sm:grid-cols-3 gap-2">' + ['3', '2', '1'].map(score => '<label class="text-[10px] font-bold text-slate-500">Skor ' + score + '<textarea class="input mt-1 min-h-16 !text-xs" id="rf-a-' + ci + '-' + score + '" maxlength="500" placeholder="Kriteria skor ' + score + '">' + esc((aspectRubric[c.key] || {})[score] || '') + '</textarea></label>').join('') + '</div></div>').join('');
  const ov = modalOpen('<h3 class="text-lg font-extrabold text-slate-800">Rubrik Penilaian</h3><p class="text-xs text-slate-500 mt-1">' + esc(m.no + ' ' + m.nama) + '</p><div class="mt-4"><label class="label">Label tingkat skor</label><div class="grid gap-2">' + scoreFields + '</div></div>' + (criteria.length ? '<div class="mt-4"><label class="label">Kriteria per aspek</label><p class="text-[11px] text-slate-400 mb-2">Isi deskripsi untuk setiap skor. Kolom dikelompokkan per kriteria di tampilan assessor.</p><div class="grid gap-2">' + aspectFields + '</div></div>' : '') + '<div class="mt-3"><label class="label">Pedoman penilaian (satu pedoman per baris)</label><textarea id="rf-pedoman" class="input min-h-28" maxlength="6000" placeholder="Tuliskan panduan untuk assessor">' + esc((m.pedoman || []).join('\n')) + '</textarea></div><div class="mt-4 grid grid-cols-2 gap-3"><button id="rf-cancel" class="btn-soft">Batal</button><button id="rf-save" class="btn-primary">Simpan Rubrik</button></div>');
  ov.querySelector('#rf-cancel').onclick = () => modalClose();
  ov.querySelector('#rf-save').onclick = async () => {
    const labelNilai = {}, rubrikNilai = {};
    ['3', '2', '1'].forEach(score => { labelNilai[score] = ov.querySelector('#rf-label-' + score).value.trim(); rubrikNilai[score] = ov.querySelector('#rf-desc-' + score).value.trim(); });
    if (['3', '2', '1'].some(score => !labelNilai[score])) { toast('Label untuk skor 3, 2, dan 1 wajib diisi.', 'error'); return; }
    if (guardPin()) return;
    const btn = ov.querySelector('#rf-save'); setBtnLoading(btn, true, 'Menyimpanâ€¦');
    try {
      const rubrikAspek = {};
      criteria.forEach((c, ci) => { rubrikAspek[c.key] = {}; ['3', '2', '1'].forEach(score => { rubrikAspek[c.key][score] = ov.querySelector('#rf-a-' + ci + '-' + score).value.trim(); }); });
      const res = await api('saveAssessmentRubric', { sentraId: sid, materiId: mid, labelNilai: labelNilai, rubrikNilai: rubrikNilai, rubrikAspek: rubrikAspek, pedoman: ov.querySelector('#rf-pedoman').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean) });
      state.schema = res.schema; modalClose(); toast('Rubrik diperbarui.', 'success'); renderSoal();
    } catch (e) { setBtnLoading(btn, false); toast(e.message, 'error'); }
  };
}
function userModal(u) {
  const edit = !!u;
  const asg = edit ? u.assignments : [];
  const cbs = state.schema.sentra.map(s =>
    '<label class="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:border-teal-300 transition">' +
    '<input type="checkbox" class="uf-asg w-5 h-5 accent-teal-600" value="' + s.id + '" ' + (asg.indexOf(s.id) >= 0 ? 'checked' : '') + '>' +
    '<span class="text-sm font-bold text-slate-700">' + s.bab + ' â€” ' + esc(s.nama) + '</span></label>').join('');
  const ov = modalOpen(
    '<h3 class="text-lg font-extrabold text-slate-800 text-center">' + (edit ? 'Edit Pengguna' : 'Pengguna Baru') + '</h3>' +
    '<div class="mt-4 grid gap-3 text-left">' +
    '<div><label class="label">Username</label><input id="uf-username" class="input" ' + (edit ? 'disabled value="' + esc(u.username) + '"' : 'placeholder="huruf kecil, 3-20 karakter"') + '></div>' +
    '<div><label class="label">Nama Lengkap</label><input id="uf-nama" class="input" value="' + esc(edit ? u.nama : '') + '" placeholder="cth: Ust. Abdullah Hakim"></div>' +
    '<div><label class="label">PIN (4-12 digit)</label><input id="uf-pin" class="input" inputmode="numeric" placeholder="' + (edit ? 'Kosongkan jika tidak diganti' : 'PIN baru') + '"></div>' +
    '<div><label class="label">Peran</label><select id="uf-role" class="input">' +
    '<option value="ASSESSOR" ' + (edit && u.role === 'ASSESSOR' ? 'selected' : '') + '>Assessor â€” menilai sesuai penugasan</option>' +
    '<option value="KOORDINATOR" ' + (edit && u.role === 'KOORDINATOR' ? 'selected' : '') + '>Koordinator â€” review, submit final & ttd laporan</option>' +
    '<option value="ADMIN" ' + (edit && u.role === 'ADMIN' ? 'selected' : '') + '>Admin â€” akses penuh + kelola pengguna</option></select></div>' +
    '<div><label class="label">Penugasan Sentra (BAB)</label>' +
    '<p class="text-[11px] text-slate-400 mb-2">Wajib untuk Assessor; opsional untuk Koordinator/Admin.</p>' +
    '<div class="grid gap-2">' + cbs + '</div></div>' +
    (edit ? '<label class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 cursor-pointer"><input id="uf-aktif" type="checkbox" class="w-5 h-5 accent-teal-600" ' + (u.aktif ? 'checked' : '') + '><span class="text-sm font-bold text-slate-700">Akun aktif</span></label>' : '') +
    '</div>' +
    '<div class="mt-5 grid grid-cols-2 gap-3">' +
    '<button id="uf-cancel" class="btn-soft">Batal</button>' +
    '<button id="uf-save" class="btn-primary">Simpan</button></div>');
  ov.querySelector('#uf-cancel').onclick = () => modalClose();
  ov.querySelector('#uf-save').onclick = async () => {
    const payload = {
      username: $('#uf-username', ov).value.trim().toLowerCase(),
      nama: $('#uf-nama', ov).value.trim(),
      pin: $('#uf-pin', ov).value.trim(),
      role: $('#uf-role', ov).value,
      assignments: $$('.uf-asg', ov).filter(c => c.checked).map(c => c.value),
      aktif: $('#uf-aktif', ov) ? $('#uf-aktif', ov).checked : true
    };
    if (!payload.nama) { toast('Nama wajib diisi.', 'error'); return; }
    if (payload.pin && !/^\d{4,12}$/.test(payload.pin)) { toast('PIN harus 4-12 digit angka.', 'error'); return; }
    if (!edit && !/^\d{4,12}$/.test(payload.pin)) { toast('PIN wajib 4-12 digit angka.', 'error'); return; }
    if (payload.role === 'ASSESSOR' && !payload.assignments.length) { toast('Assessor minimal ditugaskan 1 sentra.', 'error'); return; }
    if (guardPin()) return;
    const btn = ov.querySelector('#uf-save');
    setBtnLoading(btn, true, 'Menyimpanâ€¦');
    try {
      const res = await api('saveUser', payload);
      state.users = res.users;
      modalClose();
      toast(edit ? 'Pengguna diperbarui.' : 'Pengguna dibuat.', 'success');
      renderUsers();
    } catch (e) { setBtnLoading(btn, false); toast(e.message, 'error'); }
  };
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• VIEW: HASIL DETAIL â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
async function showHasil(id) {
  setView(spinnerHtml('Memuat hasil assessmentâ€¦'));
  let res;
  try { res = await api('getAssessment', id); }
  catch (e) { setView(errorHtml(e.message)); return; }
  hasilCache = res; /* dipakai tombol Cetak agar tidak fetch dua kali */
  const a = res.assessment, h = res.hasil;
  const staff = Auth.isStaff();
  const ms = (a.data && a.data.meta && a.data.meta.sentra) || {};
  const sDone = sid => !!(ms[sid] && ms[sid].status === 'FINAL');
  const myPending = a.status !== 'SUBMITTED'
    ? state.schema.sentra.filter(s => sentraMineInView(s.id, a) && !sDone(s.id)).map(s => s.id)
    : [];

  let html =
    '<div class="card p-5 sm:p-6 anim-in relative overflow-hidden">' +
    '<div class="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-teal-50 to-emerald-50 rounded-bl-[80px] pointer-events-none"></div>' +
    '<div class="relative flex flex-wrap items-start justify-between gap-3">' +
    '<div><p class="text-[11px] font-extrabold uppercase tracking-widest text-teal-600">Assessment Report â€” SPMB ' + esc(state.config.tahunPelajaran) + '</p>' +
    '<h2 class="text-2xl font-extrabold text-slate-800 mt-1">' + esc(a.nama) + '</h2>' +
    (staff ? '<p class="text-sm text-slate-500 mt-1">Assessment dibuat oleh: <b class="text-slate-700">' + esc(a.creator || '-') + '</b>' + (a.creatorUsername ? ' (@' + esc(a.creatorUsername) + ')' : '') + ' Â· ' + fmtTanggal(a.tanggal) + '</p>' : '') +
    '<p class="text-sm text-slate-500 mt-1">No. ' + esc(a.nomor || a.id_peserta) + ' â€¢ Asal: ' + esc(a.asal_tk || '-') + '</p>' +
    // '<p class="text-sm text-slate-500">Dibuat oleh: ' + esc(a.creator) + ' â€¢ ' + fmtTanggal(a.tanggal) + '</p>' +
    (a.status === 'SUBMITTED' && a.koordinator ? '<p class="text-sm text-slate-500">Koordinator Assesmen: <b class="text-slate-700">' + esc(a.koordinator) + '</b></p>' : '') +
    '</div>' +
    '<div class="flex flex-col items-end gap-2">' + statusBadge(a.status) + (h.kode ? kodeBadge(h.kode) : '') + '</div></div></div>';

  if (a.status !== 'SUBMITTED') {
    const pendingTxt = myPending.length
      ? 'Bagian Anda yang belum final: <b>' + esc(myPending.map(sentraName).join(', ')) + '</b>.'
      : (staff ? '' : 'Sentra tugas Anda sedang dikerjakan rekan lain atau sudah final.');
    html += '<div class="card border-amber-200 bg-amber-50/70 p-5 anim-in mt-4 flex flex-col sm:flex-row sm:items-center gap-4">' +
      '<span class="text-amber-500 shrink-0">' + ic(a.status === 'SIAP_REVIEW' ? 'star' : 'alert', 'w-7 h-7') + '</span>' +
      '<div class="flex-1"><p class="font-extrabold text-amber-800">' + (a.status === 'SIAP_REVIEW' ? 'Semua sentra final â€” menunggu Submit Final oleh Koordinator' : 'Assessment belum selesai') + '</p>' +
      (pendingTxt ? '<p class="text-sm text-amber-700/90 mt-0.5">' + pendingTxt + '</p>' : '') + '</div>' +
      (myPending.length ? '<button class="btn-primary shrink-0" data-act="lanjut" data-id="' + esc(a.id) + '">' + ic('edit', 'w-4 h-4') + ' Lanjutkan Mengisi</button>' : '') +
      (staff ? '<button class="btn-primary shrink-0 ' + (h.lengkap ? '' : 'opacity-40 pointer-events-none') + '" data-act="submit" data-id="' + esc(a.id) + '">' + ic('check', 'w-4 h-4') + ' Submit Final</button>' : '') +
      '</div>';
  }

  state.schema.sentra.forEach(s => {
    const st = ms[s.id] || { status: 'DRAFT', assessor: '', owner: '', ownerName: '' };
    const ownTxt = st.owner ? (st.ownerName || st.owner) : '';
    html += '<div class="card p-5 anim-in mt-4">' +
      '<div class="flex items-center justify-between flex-wrap gap-2">' +
      '<h3 class="font-extrabold text-slate-800">' + s.bab + ' â€” ' + esc(s.nama) + '</h3>' +
      '<div class="flex items-center gap-2 flex-wrap">' +
      '<span class="badge ' + (st.status === 'FINAL' ? 'bg-emerald-50 text-emerald-600' : (ownTxt ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-400')) + '">' +
      (st.status === 'FINAL' ? 'âœ“ ' + esc(st.assessor) : (ownTxt ? ic('lock', 'w-3 h-3') + ' ' + esc(ownTxt) : 'Belum diklaim')) + '</span>' +
      '<span class="badge ' + (h.sentra[s.id] != null ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-400') + '">Rerata: ' + (h.sentra[s.id] != null ? h.sentra[s.id] : 'â€“') + '</span>' +
      (staff && a.status !== 'SUBMITTED' && st.status === 'FINAL' ? '<button class="btn-soft !px-3 !py-1.5 !text-xs" data-act="retract" data-id="' + esc(a.id) + '" data-sid="' + s.id + '">Tarik</button>' : '') +
      (staff && a.status !== 'SUBMITTED' && st.owner ? '<button class="btn-soft !px-3 !py-1.5 !text-xs" data-act="release" data-id="' + esc(a.id) + '" data-sid="' + s.id + '" title="Bebaskan agar assessor lain bisa mengambil alih">Lepaskan</button>' : '') +
      '</div></div>' +
      (staff && st.owner ? '<p class="text-[11px] text-slate-500 mt-1">Dikerjakan oleh: <b>' + esc(st.ownerName || st.owner) + '</b> (@' + esc(st.owner) + ')</p>' : '') +
      '<div class="mt-4 grid gap-4">' + s.materi.map(m => detailMateri(m, a.data[m.id] || {}, h.materi[m.id])).join('') + '</div></div>';
  });

  html += bab4Card(h, a);
  html += '<div class="grid sm:grid-cols-3 gap-3 mt-4 anim-in">' +
    '<button class="btn-primary" data-act="cetak" data-id="' + esc(a.id) + '">' + ic('printer', 'w-5 h-5') + ' Cetak Laporan</button>' +
    (a.status === 'SUBMITTED' && staff
      ? '<button class="btn-soft" data-act="unlock" data-id="' + esc(a.id) + '">' + ic('unlock', 'w-5 h-5') + ' Buka Kunci</button>'
      : '') +
    '<button class="btn-soft" onclick="goView(\'' + (staff ? 'dashboard' : 'riwayat') + '\')">Kembali</button></div>';

  setView(html);
}
function valChip(v) { return '<span class="val-chip v' + (v || 0) + '">' + (v || 'â€“') + '</span>'; }
function detailMateri(m, d, r) {
  const skor = d.skor || {};
  const itemsHtml = m.items.map(it => {
    let valHtml;
    if (m.tipe === 'tunggal') valHtml = valChip(skor[it.id]);
    else {
      const aspek = it.aspek || m.aspek; const cell = skor[it.id] || {};
      valHtml = aspek.map(a => '<span class="text-[11px] font-bold text-slate-500">' + esc(a.nama) + ' ' + valChip(cell[a.id]) + '</span>').join('');
    }
    const hit = m.pilihTerbaik && r.terpilih.indexOf(it.id) >= 0;
    return '<div class="flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-0">' +
      '<p class="text-sm font-semibold text-slate-700 flex-1">' + esc(it.nama) + (hit ? ' <span class="badge bg-emerald-100 text-emerald-700 ml-1">Dihitung</span>' : '') + '</p>' +
      '<div class="flex items-center gap-2.5 flex-wrap justify-end">' + valHtml + '</div></div>';
  }).join('');
  return '<div class="rounded-2xl border border-slate-200 p-4">' +
    '<div class="flex items-center justify-between gap-2 flex-wrap">' +
    '<p class="font-extrabold text-sm text-slate-800">' + m.no + ' ' + esc(m.nama) + '</p>' +
    '<span class="text-xs font-extrabold ' + (r.lengkap ? 'text-teal-700' : 'text-amber-600') + '">' + r.skor + '/' + r.maks + ' â€¢ ' + (r.lengkap ? r.persen + '%' : 'belum lengkap') + '</span></div>' +
    '<div class="bar-track mt-2"><div class="bar-fill ' + barColor(r) + '" style="width:' + (r.lengkap ? r.persen : 0) + '%"></div></div>' +
    '<div class="mt-2">' + itemsHtml + '</div>' +
    (d.catatan ? '<p class="mt-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3"><b>Catatan:</b> ' + esc(d.catatan) + '</p>' : '') +
    '</div>';
}
function bab4Card(h, a) {
  const cs = (a.data && a.data.catatanSentra) || {};
  const rows = state.schema.sentra.map((s, i) => ['4.' + (i + 1), s.nama, h.sentra[s.id], cs[s.id]]);
  return '<div class="card p-5 anim-in mt-4">' +
    '<h3 class="font-extrabold text-slate-800">BAB IV â€” Total Nilai</h3>' +
    '<div class="mt-3 overflow-x-auto"><table class="w-full text-sm min-w-[480px]">' +
    '<thead><tr class="text-left text-[11px] uppercase text-slate-400"><th class="pb-2">No</th><th class="pb-2">Materi</th><th class="pb-2 text-right">Rerata</th><th class="pb-2 pl-4">Informasi Tambahan</th></tr></thead>' +
    '<tbody class="divide-y divide-slate-100">' +
    rows.map(r => '<tr><td class="py-2.5 font-bold text-slate-400">' + r[0] + '</td><td class="py-2.5 font-bold">' + r[1] + '</td>' +
      '<td class="py-2.5 text-right font-extrabold ' + (r[2] == null ? 'text-slate-300' : 'text-teal-700') + '">' + (r[2] == null ? 'â€“' : r[2]) + '</td>' +
      '<td class="py-2.5 pl-4 text-slate-500 text-xs">' + esc(r[3] || '-') + '</td></tr>').join('') +
    '<tr class="bg-slate-50/70"><td></td><td class="py-3 font-extrabold">Rerata Umum (Nilai Akhir)</td>' +
    '<td class="py-3 text-right font-extrabold text-teal-700">' + (h.nilaiAkhir == null ? 'â€“' : h.nilaiAkhir) + '</td>' +
    '<td class="py-3 pl-4 text-xs text-slate-400">Calistung: ' + (h.calistung == null ? 'â€“' : h.calistung) + '</td></tr>' +
    '</tbody></table></div>' +
    '<div class="mt-4 p-4 rounded-2xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100 flex items-center gap-4 flex-wrap">' +
    '<div class="flex-1 min-w-[200px]"><p class="text-[11px] font-extrabold uppercase tracking-wider text-teal-700">Kode Hasil Asesmen</p>' +
    '<p class="text-xs text-slate-500 mt-1">' + esc(kodeRuleText()) + '</p></div>' +
    (h.kode ? '<span class="kode-badge kode-' + h.kode + '">' + h.kode + '</span>' : '<span class="badge bg-slate-100 text-slate-400">Belum ditentukan</span>') +
    '</div>' +
    (h.kode ? '<p class="text-sm font-bold text-slate-600 mt-2">' + esc(h.kodeLabel || '') + '</p>' : '') +
    '</div>';
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• CETAK â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
/* Cache satu assessment terakhir: showHasil sudah mengambil objek yang sama,
 * jadi tombol Cetak tidak perlu round-trip Apps Script kedua (1â€“3 detik). */
let hasilCache = null;
async function printAssessmentById(id) {
  if (hasilCache && hasilCache.assessment && String(hasilCache.assessment.id) === String(id)) {
    openPrintWindow(buildPrintHtml(hasilCache.assessment, hasilCache.hasil));
    return;
  }
  toast('Menyiapkan dokumenâ€¦', 'info', 2000);
  try {
    const res = await api('getAssessment', id);
    openPrintWindow(buildPrintHtml(res.assessment, res.hasil));
  } catch (e) { toast(e.message, 'error'); }
}
function openPrintWindow(html) {
  const w = window.open('', '_blank');
  if (!w) { toast('Popup diblokir browser. Izinkan popup untuk mencetak.', 'error'); return; }
  w.document.open(); w.document.write(html); w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (e) {} }, 700);
}

const PRINT_CSS = '@page{size:A4;margin:13mm 12mm}*{box-sizing:border-box}body{font-family:Roboto,"Segoe UI",Arial,sans-serif;color:#1e293b;font-size:10.5pt;margin:0}' +
'.doc-head{text-align:center;border-bottom:3px double #0f766e;padding-bottom:10px;margin-bottom:12px}' +
'.doc-head h1{font-size:12pt;margin:0;letter-spacing:.5px}.doc-head h2{font-size:15pt;margin:2px 0;color:#0f766e}' +
'.doc-head h3{font-size:10.5pt;margin:2px 0 8px;font-weight:700}' +
'table.ident{width:100%;border-collapse:collapse;margin-top:6px;font-size:9.5pt}table.ident td{border:none;padding:1.5px 4px;text-align:left}' +
'.bab{margin-top:14px}.bab-title{background:#0f766e;color:#fff;font-weight:800;font-size:10.5pt;padding:5px 10px;border-radius:6px 6px 0 0}' +
'.materi{margin-top:10px;page-break-inside:avoid}.materi h3{font-size:10.5pt;margin:0 0 5px}' +
'table{width:100%;border-collapse:collapse;font-size:9.5pt}th,td{border:1px solid #475569;padding:4px 6px;text-align:center;vertical-align:middle}' +
'th{background:#e6f5f3;font-size:9pt}.tal{text-align:left}.detail{font-size:8pt;color:#64748b;font-weight:400}' +
'.sub{font-size:8pt;font-weight:400;color:#475569}.sub-title{font-weight:800;font-size:9.5pt;margin:8px 0 3px}' +
'.calc{font-size:9.5pt;margin-top:4px}.cat{font-size:9pt;background:#f1f5f9;border-radius:6px;padding:6px 8px;margin-top:5px}' +
'.hit{color:#0f766e}.kode-box{margin-top:12px;font-size:11pt;border:2px solid #0f766e;border-radius:8px;padding:8px 12px;display:inline-block}' +
'.kode-box .kode{font-size:16pt;color:#0f766e}' +
'.ttd{display:flex;justify-content:center;margin-top:28px;text-align:center;font-size:10pt;page-break-inside:avoid}.ttd .space{height:52px}';

function printMateriTable(m, skor, r) {
  if (m.tipe === 'tunggal') {
    return '<table><thead><tr><th class="tal">Aspek Penilaian</th>' +
      '<th>' + esc(m.labelNilai['3']) + ' (3)</th><th>' + esc(m.labelNilai['2']) + ' (2)</th><th>' + esc(m.labelNilai['1']) + ' (1)</th>' +
      '<th style="width:80px">Hasil Akhir</th></tr></thead><tbody>' +
      m.items.map(it => {
        const v = skor[it.id];
        return '<tr><td class="tal">' + esc(it.nama) + (it.detail ? '<div class="detail">' + esc(it.detail) + '</div>' : '') + '</td>' +
          '<td>' + (v === 3 ? 'â—' : '') + '</td><td>' + (v === 2 ? 'â—' : '') + '</td><td>' + (v === 1 ? 'â—' : '') + '</td>' +
          '<td><b>' + (v != null ? v : '') + '</b></td></tr>';
      }).join('') + '</tbody></table>';
  }
  const sig = it => (it.aspek || m.aspek).map(x => x.id).join('|');
  const uniform = m.items.every(it => sig(it) === sig(m.items[0]));
  const headFor = asp => '<thead><tr><th class="tal">Aspek Penilaian</th>' + asp.map(x => '<th>' + esc(x.nama) + '</th>').join('') + '<th style="width:70px">Hasil Akhir</th></tr></thead>';
  const rowFor = (it, asp) => {
    const cell = skor[it.id] || {};
    const hit = m.pilihTerbaik && (r.terpilih || []).indexOf(it.id) >= 0;
    const tot = asp.reduce((t, x) => t + (cell[x.id] || 0), 0);
    return '<tr><td class="tal">' + esc(it.nama) + (hit ? ' <span class="hit">âœ“</span>' : '') + '</td>' +
      asp.map(x => '<td>' + (cell[x.id] != null ? cell[x.id] : '') + '</td>').join('') +
      '<td><b>' + (tot > 0 ? tot : '') + '</b></td></tr>';
  };
  if (uniform) {
    const asp = m.items[0].aspek || m.aspek;
    return '<table>' + headFor(asp) + '<tbody>' + m.items.map(it => rowFor(it, asp)).join('') + '</tbody></table>';
  }
  return m.items.map(it => {
    const asp = it.aspek || m.aspek;
    return '<div class="sub-title">' + esc(it.nama) + '</div><table>' + headFor(asp) + '<tbody>' + rowFor(it, asp) + '</tbody></table>';
  }).join('');
}

function buildPrintHtml(a, h) {
  const cs = (a.data && a.data.catatanSentra) || {};
  const ms = (a.data && a.data.meta && a.data.meta.sentra) || {};
  const penilai = state.schema.sentra.map(s => {
    const e = ms[s.id];
    return (e && e.status === 'FINAL' && e.assessor) ? s.singkat + ': ' + e.assessor : null;
  }).filter(Boolean).join(' â€¢ ');
  const totalRows = state.schema.sentra.map((s, i) =>
    '<tr><td>4.' + (i + 1) + '</td><td class="tal">' + esc(s.nama.toUpperCase()) + '</td><td>' + (h.sentra[s.id] == null ? '-' : h.sentra[s.id]) + '</td><td class="tal">' + esc(cs[s.id] || '-') + '</td></tr>'
  ).join('');
  let body = '';
  state.schema.sentra.forEach(s => {
    body += '<div class="bab"><div class="bab-title">' + s.bab + ' â€” OBSERVASI ' + esc(s.nama.toUpperCase()) + '</div>';
    s.materi.forEach(m => {
      const d = (a.data && a.data[m.id]) || {};
      const r = h.materi[m.id];
      body += '<div class="materi"><h3>' + m.no + '. ' + esc(m.nama) + (m.catatanKaki ? ' <span class="sub">(' + esc(m.catatanKaki) + ')</span>' : '') + '</h3>';
      body += printMateriTable(m, d.skor || {}, r);
      body += '<div class="calc">Jumlah perolehan skor: <b>' + r.skor + '</b> &nbsp;|&nbsp; Skor tertinggi: <b>' + r.maks + '</b> &nbsp;|&nbsp; <b>Nilai: ' + (r.lengkap ? r.persen + '%' : 'belum lengkap') + '</b></div>';
      if (d.catatan) body += '<div class="cat"><b>Informasi tambahan / komentar / catatan:</b> ' + esc(d.catatan) + '</div>';
      body += '</div>';
    });
    body += '</div>';
  });
  body += '<div class="bab"><div class="bab-title">BAB IV â€” TOTAL NILAI</div>' +
    '<table style="margin-top:8px"><thead><tr><th style="width:36px">No</th><th>Materi</th><th style="width:90px">Rerata Nilai</th><th>Informasi Tambahan</th></tr></thead><tbody>' +
    totalRows +
    '</tbody></table>' +
    '<div class="kode-box">Kode Hasil Asesmen: <b class="kode">' + (h.kode || '-') + '</b> &nbsp;â€” ' + esc(h.kodeLabel || '-') + '</div></div>' +
    '<div class="ttd"><div>Koordinator Assesmen,<div class="space"></div>( ' + (a.koordinator ? esc(a.koordinator) : '..................') + ' )</div></div>';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Laporan Assessment â€” ' + esc(a.nama) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap" rel="stylesheet">' +
    '<style>' + PRINT_CSS + '</style></head><body>' +
    '<div class="doc-head"><h1>PENERIMAAN PESERTA DIDIK BARU</h1><h2>ASSESSMENT REPORT</h2>' +
    '<h3>' + esc(state.config.sekolah).toUpperCase() + ' â€” TAHUN PELAJARAN ' + esc(state.config.tahunPelajaran) + '</h3>' +
    '<table class="ident">' +
    '<tr><td style="width:150px">Nama Peserta Didik</td><td>: <b>' + esc(a.nama) + '</b></td><td style="width:120px">Tanggal</td><td>: ' + fmtTanggal(a.tanggal) + '</td></tr>' +
    '<tr><td>Nomor / ID Peserta</td><td>: ' + esc(a.nomor || a.id_peserta) + '</td><td>ID Assessment</td><td>: ' + esc(a.id) + ' (' + esc(a.status) + ')</td></tr>' +
    '<tr><td>Asal TK/RA/PAUD</td><td>: ' + esc(a.asal_tk || '-') + '</td></tr>' +
    (penilai ? '<tr><td>Penilai per Sentra</td><td colspan="3">: ' + esc(penilai) + '</td></tr>' : '') +
    '</table></div>' + body + '</body></html>';
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• AKSI GLOBAL (data-act) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  if (act === 'rubric-edit') {
    if (!Auth.isAdmin()) { toast('Khusus Admin.', 'error'); return; }
    rubricModal(el.dataset.sid, el.dataset.mid);
  } else if (act === 'question-add' || act === 'question-edit') {
    if (!Auth.isAdmin()) { toast('Khusus Admin.', 'error'); return; }
    questionModal(el.dataset.sid, el.dataset.mid, el.dataset.iid || '');
  } else if (act === 'question-delete') {
    if (!Auth.isAdmin()) { toast('Khusus Admin.', 'error'); return; }
    const s = state.schema.sentra.find(x => x.id === el.dataset.sid), m = s && s.materi.find(x => x.id === el.dataset.mid), item = m && m.items.find(x => x.id === el.dataset.iid);
    if (!item) return;
    if (guardPin()) return;
    const ok = await confirmModal({ title: 'Hapus soal ini?', html: '<p class="text-sm">' + esc(item.nama) + '</p><p class="text-xs text-slate-500 mt-2">Skor yang sudah tersimpan pada assessment lama tidak dihapus.</p>', confirmText: 'Ya, Hapus', danger: true });
    if (!ok) return;
    try {
      const res = await api('saveAssessmentQuestion', { action: 'delete', sentraId: el.dataset.sid, materiId: el.dataset.mid, itemId: el.dataset.iid });
      state.schema = res.schema; toast('Soal dihapus.', 'success'); renderSoal();
    } catch (err) { toast(err.message, 'error'); }
  } else if (act === 'lanjut') {
    if (guardPin()) return;
    try {
      const res = await api('getAssessment', id);
      try { wizardStart(res.assessment); }
      catch (e2) { toast('Data assessment tidak dapat dibuka: ' + e2.message, 'error'); }
    }
    catch (err) { toast(err.message, 'error'); }
  } else if (act === 'lihat') { goView('hasil', id); }
  else if (act === 'cetak') { printAssessmentById(id); }
  else if (act === 'hapus') {
    if (guardPin()) return;
    const ok = await confirmModal({ title: 'Hapus Draft?', html: '<p class="text-sm">Draft yang dihapus tidak dapat dikembalikan.</p>', confirmText: 'Ya, Hapus', danger: true });
    if (!ok) return;
    try { await api('deleteDraft', id); toast('Draft dihapus.', 'success'); refreshData(); }
    catch (err) { toast(err.message, 'error'); }
  } else if (act === 'unlock') {
    if (!Auth.isStaff()) { toast('Khusus Koordinator/Admin.', 'error'); return; }
    if (guardPin()) return;
    const ok = await confirmModal({ title: 'Buka Kunci Assessment?', html: '<p class="text-sm">Status kembali seperti sebelum submit â€” baris HASIL akan dihapus.</p>', confirmText: 'Ya, Buka Kunci', danger: true });
    if (!ok) return;
    try {
      await api('unlockAssessment', id);
      toast('Assessment dibuka kunci.', 'success');
      refreshData();
      if (state.view === 'hasil') showHasil(id);
    } catch (err) { toast(err.message, 'error'); }
  } else if (act === 'submit') {
    if (!Auth.isStaff()) { toast('Khusus Koordinator/Admin.', 'error'); return; }
    if (guardPin()) return;
    let res;
    try { res = await api('getAssessment', id); }
    catch (err) { toast(err.message, 'error'); return; }
    const h = res.hasil;
    if (!h.lengkap) { toast('Penilaian belum lengkap â€” tidak bisa submit.', 'error'); return; }
    const ok = await confirmModal({
      title: 'Submit Assessment Final?',
      html: '<div class="text-left text-sm bg-slate-50 rounded-2xl p-4 grid gap-1.5">' +
        '<div class="flex justify-between"><span class="text-slate-500">Peserta</span><b>' + esc(res.assessment.nama) + '</b></div>' +
        '<div class="flex justify-between"><span class="text-slate-500">Nilai Akhir</span><b>' + h.nilaiAkhir + '</b></div>' +
        '<div class="flex justify-between"><span class="text-slate-500">Kode</span><b>' + h.kode + ' â€” ' + esc(h.kodeLabel) + '</b></div>' +
        '<div class="flex justify-between"><span class="text-slate-500">Ttd Koordinator</span><b>' + esc(Auth.user.nama) + '</b></div></div>' +
        '<p class="text-xs text-slate-400 mt-3">Setelah submit, data terkunci, tersimpan di sheet HASIL, dan laporan ditandatangani atas nama Anda.</p>',
      confirmText: 'Ya, Submit'
    });
    if (!ok) return;
    try {
      await api('submitAssessment', id);
      toast('Assessment berhasil disubmit ðŸŽ‰', 'success');
      refreshData();
      if (state.view === 'hasil') showHasil(id); else goView('hasil', id);
    } catch (err) { toast(err.message, 'error'); }
  } else if (act === 'retract') {
    if (!Auth.isStaff()) { toast('Khusus Koordinator/Admin.', 'error'); return; }
    if (guardPin()) return;
    const ok = await confirmModal({ title: 'Tarik Finalisasi?', html: '<p class="text-sm">Sentra ' + esc(sentraName(el.dataset.sid)) + ' akan dibuka kembali untuk diedit.</p>', confirmText: 'Ya, Tarik', danger: true });
    if (!ok) return;
    try {
      await api('retractSentra', id, el.dataset.sid);
      toast('Finalisasi ditarik.', 'success');
      refreshData();
      if (state.view === 'hasil') showHasil(id);
    } catch (err) { toast(err.message, 'error'); }
  } else if (act === 'release') {
    if (!Auth.isStaff()) { toast('Khusus Koordinator/Admin.', 'error'); return; }
    if (guardPin()) return;
    const ok = await confirmModal({
      title: 'Lepaskan klaim sentra?',
      html: '<p class="text-sm">Sentra <b>' + esc(sentraName(el.dataset.sid)) + '</b> dibuka â€” assessor lain (BAB sama) dapat mengambil alih. Skor yang sudah masuk <b>tetap tersimpan</b>.</p>',
      confirmText: 'Ya, Lepaskan', danger: true
    });
    if (!ok) return;
    try {
      await api('releaseSentra', id, el.dataset.sid);
      toast('Klaim dilepaskan.', 'success');
      refreshData();
      if (state.view === 'hasil') showHasil(id);
    } catch (err) { toast(err.message, 'error'); }
  } else if (act === 'user-edit') {
    const u = state.users.find(x => x.username === el.dataset.username);
    if (u) userModal(u);
  } else if (act === 'user-toggle') {
    if (guardPin()) return;
    try {
      const res = await api('setUserActive', el.dataset.username, el.dataset.active === '1');
      state.users = res.users;
      toast('Status pengguna diperbarui.', 'success');
      renderUsers();
    } catch (err) { toast(err.message, 'error'); }
  } else if (act === 'user-del') {
    if (guardPin()) return;
    const u = state.users.find(x => x.username === el.dataset.username);
    if (!u) return;
    const ok = await confirmModal({
      title: 'Hapus akun "' + u.nama + '"?',
      icon: 'trash',
      html: '<div class="text-left text-xs text-slate-600 bg-slate-50 rounded-2xl p-4 grid gap-1.5">' +
        '<p>â€¢ Username <b>@' + esc(u.username) + '</b> tidak akan bisa login lagi.</p>' +
        '<p>â€¢ Riwayat assessment & laporan yang sudah ada <b>tidak ikut terhapus</b> â€” nama tetap tercatat.</p>' +
        '<p>â€¢ Penilaian yang belum selesai di sentra tugasnya diambil alih Koordinator/Admin / assessor lain.</p>' +
        '<p class="text-rose-600 font-bold">â€¢ Tindakan permanen dan tidak bisa dibatalkan.</p>' +
        '</div>' +
        '<p class="text-[11px] text-slate-400 mt-3">Jika hanya ingin menstop akses sementara, <b>Nonaktifkan</b> adalah alternatif yang lebih aman.</p>',
      confirmText: 'Ya, Hapus Permanen',
      danger: true
    });
    if (!ok) return;
    try {
      const res = await api('deleteUser', u.username);
      state.users = res.users;
      toast('Akun "' + u.nama + '" dihapus.', 'success');
      renderUsers();
    } catch (err) { toast(err.message, 'error'); }
  }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• INIT â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const App = {
  init() {
    // Firebase web app environment ready
    let t = null;
    try { t = localStorage.getItem('ppdb_token'); } catch (e) {}
    /* Identitas sekolah di layar login/boot diambil dari CONFIG sheet, bukan
     * ditulis di HTML â€” supaya ganti tahun pelajaran tidak perlu deploy ulang. */
    apiNoAuth('getPublicBranding').then(b => {
      state.config = state.config || {};
      state.config.sekolah = b.sekolah;
      state.config.tahunPelajaran = b.tahunPelajaran;
      applyBranding();
    }).catch(() => {});
    if (!t) { showLogin(); return; }
    Auth.token = t;
    api('getInitialData').then(res => {
      Auth.user = res.user;
      state.config = res.config; state.schema = res.schema;
      state.peserta = res.peserta; state.riwayat = res.riwayat; state.dashboard = res.dashboard;
      applyBranding();
      enterApp();
      if (pinPending()) showPinGate();
    }).catch(() => { showLogin(); });
  }
};