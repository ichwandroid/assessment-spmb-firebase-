/* ════════════════════════════════════════════════════════════════
* JS_Wizard.html  Wizard Assessment (role & ownership aware)
* Staff (Koordinator/Admin): semua sentra + Submit Final.
* Assessor: sentra tugas yang belum diklaim rekan lain.
* ════════════════════════════════════════════════════════════════ */

(function injectWizardStyle() {
  const s = document.createElement('style');
  s.textContent =
    'body.in-wizard #app > header nav{display:none!important}' +
    '.locked .score-chip,.locked textarea{pointer-events:none;opacity:.55}';
  document.head.appendChild(s);
})();

const SENTRA_SHORT = {};
let WZ = null;
let autosaveTimer = null;
let lastAutoErr = 0;

const ARROW_R = '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
const ARROW_L = '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';

function wizSteps() {
  const steps = [{ type: 'data', short: 'Data', full: 'Data Peserta' }];
  const asg = (Auth.user && Auth.user.assignments) || [];
  state.schema.sentra.forEach(s => {
    if (Auth.isStaff() || Auth.isKoordSentra() || asg.length === 0) {
      const e = WZ && WZ.data && WZ.data.meta && WZ.data.meta.sentra[s.id];
      if (!Auth.isStaff() && !Auth.isKoordSentra() && e && e.owner && e.owner !== Auth.user.username) return;
      if (Auth.isKoordSentra() && asg.indexOf(s.id) < 0) return;
      steps.push({ type: 'sentra', sid: s.id, short: SENTRA_SHORT[s.id] || s.singkat, full: s.nama });
      return;
    }
    if (asg.indexOf(s.id) < 0) return;
    const e = WZ && WZ.data && WZ.data.meta && WZ.data.meta.sentra[s.id];
    if (e && e.owner && e.owner !== Auth.user.username) return;
    steps.push({ type: 'sentra', sid: s.id, short: SENTRA_SHORT[s.id] || s.singkat, full: s.nama });
  });
  steps.push({ type: 'review', short: 'Review', full: 'Review & Finalisasi' });
  steps.push({ type: 'done', short: 'Selesai', full: 'Selesai' });
  return steps;
}

function emptyWizardData() {
  const d = { meta: defaultMeta(), catatanSentra: {} };
  state.schema.sentra.forEach(s => {
    d.catatanSentra[s.id] = '';
    s.materi.forEach(m => { d[m.id] = { skor: {}, catatan: '' }; });
  });
  return d;
}
function normalizeWizardData(raw) {
  const out = emptyWizardData();
  if (!raw || typeof raw !== 'object') return out;
  if (raw.catatanSentra && typeof raw.catatanSentra === 'object') {
    state.schema.sentra.forEach(s => {
      if (typeof raw.catatanSentra[s.id] === 'string') out.catatanSentra[s.id] = raw.catatanSentra[s.id];
    });
  }
  if (raw.meta && raw.meta.sentra) {
    state.schema.sentra.forEach(s => {
      const e = raw.meta.sentra[s.id];
      if (!e) return;
      if (e.status === 'FINAL') {
        out.meta.sentra[s.id] = { status: 'FINAL', assessor: e.assessor || '', waktu: e.waktu || '', owner: e.owner || '', ownerName: e.ownerName || '' };
      } else if (e.owner) {
        out.meta.sentra[s.id].owner = e.owner;
        out.meta.sentra[s.id].ownerName = e.ownerName || '';
      }
    });
  }
  if (raw.meta && raw.meta.koordinator && raw.meta.koordinator.nama) {
    out.meta.koordinator = { username: raw.meta.koordinator.username || '', nama: raw.meta.koordinator.nama, waktu: raw.meta.koordinator.waktu || '' };
  }
  state.schema.sentra.forEach(s => s.materi.forEach(m => {
    const src = raw[m.id]; if (!src) return;
    if (typeof src.catatan === 'string') out[m.id].catatan = src.catatan;
    const sk = src.skor || {};
    m.items.forEach(it => {
      if (m.tipe === 'tunggal') {
        if (num(sk[it.id])) out[m.id].skor[it.id] = num(sk[it.id]);
      } else {
        const aspek = it.aspek || m.aspek;
        const cell = sk[it.id] || {};
        const o = {};
        aspek.forEach(a => { if (num(cell[a.id])) o[a.id] = num(cell[a.id]); });
        if (Object.keys(o).length) out[m.id].skor[it.id] = o;
      }
    });
  }));
  return out;
}
function wizPayload() {
  const step = WZ.steps && WZ.steps[WZ.step];
  return { id: WZ.id || null, id_peserta: WZ.id_peserta, creator: WZ.creator || '', tanggal: WZ.tanggal || '', active_sentra: step && step.type === 'sentra' ? step.sid : '', data: WZ.data };
}
function wizPriorUnfinalizedSentra(sid) {
  if (!WZ || !Auth.user || Auth.user.role !== 'ASSESSOR') return null;
  const current = WZ.data.meta.sentra[sid] || {};
  if (current.owner && current.status !== 'FINAL') return null;
  return state.schema.sentra.find(s => {
    const st = WZ.data.meta.sentra[s.id] || {};
    return s.id !== sid && st.owner && st.status !== 'FINAL';
  }) || null;
}
function wizLocked(sid) {
  if (!WZ) return true;
  if (Auth.isStaff()) return false;
  if (Auth.isKoordSentra()) return true;
  const st = WZ.data.meta.sentra[sid] || {};
  if (st.status === 'FINAL') return true;
  if (st.owner && st.owner !== Auth.user.username) return true;
  const asg = (Auth.user && Auth.user.assignments) || [];
  if (asg.length > 0 && asg.indexOf(sid) < 0) return true;
  if (wizPriorUnfinalizedSentra(sid)) return true;
  return false;
}
function sentraMineInWiz(sid) {
  if (!Auth.user) return false;
  if (Auth.isStaff()) return true;
  const asg = Auth.user.assignments || [];
  if (asg.length > 0 && asg.indexOf(sid) < 0) return false;
  const e = WZ && WZ.data && WZ.data.meta && WZ.data.meta.sentra[sid];
  return !e || !e.owner || e.owner === Auth.user.username;
}

function wizardStart(existing) {
  clearTimeout(autosaveTimer);
  if (typeof pinPending === 'function' && pinPending()) { showPinGate(); return; }
  if (existing && existing.status === 'SUBMITTED') {
    document.body.classList.remove('in-wizard');
    showHasilById(existing.id);
    return;
  }
  const userNama = (Auth.user && Auth.user.nama) || 'Assessor';
  if (existing) {
    WZ = {
      id: existing.id || null,
      id_peserta: existing.id_peserta || null,
      nama: existing.nama || '', nomor: existing.nomor || '', asal_tk: existing.asal_tk || '',
      creator: existing.creator || userNama,
      tanggal: existing.tanggal || todayStr(),
      data: normalizeWizardData(existing.data),
      step: 0, dirty: false, submitted: false, saving: false, done: false,
      mode: 'lama', pesertaBaru: null, jumpTarget: null, ui: { open: {} }, hasilFinal: null,
      isCreator: existing.creator === userNama || Auth.isStaff(),
      autoFails: 0, autoDelay: 1500
    };
  } else {
    WZ = {
      id: null, id_peserta: null, nama: '', nomor: '', asal_tk: '',
      creator: userNama, tanggal: todayStr(),
      data: emptyWizardData(),
      step: 0, dirty: false, submitted: false, saving: false, done: false,
      mode: 'lama', pesertaBaru: { nama: '', nomor: '', asal_tk: '' },
      jumpTarget: null, ui: { open: {} }, hasilFinal: null,
      isCreator: true, autoFails: 0, autoDelay: 1500
    };
  }
  WZ.steps = wizSteps();
  document.body.classList.add('in-wizard');
  state.view = 'wizard';
  renderWizard();
  window.scrollTo({ top: 0 });
}

/* Dipakai khusus oleh pemilih siswa cepat. Assessment yang sudah ada langsung
 * dibuka pada sentra yang bisa dinilai, bukan kembali ke halaman data peserta. */
function wizardStartAssessmentForm(existing) {
  wizardStart(existing);
  if (!WZ || WZ.submitted) return;
  let target = WZ.steps.findIndex(step => step.type === 'sentra' &&
    WZ.data.meta.sentra[step.sid].status !== 'FINAL' && !wizLocked(step.sid));
  if (target < 0) target = WZ.steps.findIndex(step => step.type === 'sentra' && !wizLocked(step.sid));
  if (target < 0) target = WZ.steps.findIndex(step => step.type === 'review');
  if (target >= 0) goStep(target);
}

function renderWizard() {
  setView(
    '<div>' +
    // Bar sticky: py-2.5 → py-3, dan pills: mt-2.5 gap-1.5 → mt-3 gap-2
    '<div class="sticky top-16 z-30 -mx-4 px-4 py-3 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/70">' +
    '<div class="flex items-center gap-2">' +
    '<button type="button" onclick="wizExit()" title="Keluar wizard" aria-label="Keluar dari wizard" class="w-9 h-9 rounded-xl bg-white border border-slate-200 grid place-items-center text-slate-500 hover:text-rose-500 hover:border-rose-200 active:scale-95 transition shrink-0">' + ic('x', 'w-4 h-4') + '</button>' +
    '<button type="button" onclick="wizOpenSwitcher()" title="Ganti siswa" aria-label="Ganti ke form siswa lain" class="h-9 px-2.5 rounded-xl bg-white border border-slate-200 inline-flex items-center gap-1.5 text-teal-700 hover:border-teal-300 hover:bg-teal-50 active:scale-95 transition shrink-0">' + ic('users', 'w-4 h-4') + '<span class="hidden sm:inline text-[11px] font-extrabold">Ganti siswa</span></button>' +
    '<div class="min-w-0 flex-1">' +
    '<p id="wiz-mode-tag" class="text-[10px] font-extrabold uppercase tracking-widest text-teal-600 leading-none"></p>' +
    '<p id="wiz-title" class="font-extrabold text-sm text-slate-800 truncate mt-0.5"></p>' +
    '</div>' +
    '<div id="wiz-save-ind" class="shrink-0"></div>' +
    '</div>' +
    '<div id="wiz-pills" class="mt-3 flex gap-2 overflow-x-auto no-scrollbar"></div>' +
    '</div>' +
    // Dan kontainer langkah: pt-4 → pt-5
    '<div id="wiz-step" class="pt-5 pb-36"></div>' +
    '</div>' +
    '<div id="wiz-bar" class="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200/70" style="padding-bottom:env(safe-area-inset-bottom)"></div>');
  wizUpdateTitle();
  renderPills();
  renderStep();
  renderBar();
  wizSaveIndicator('hidden');
}
function wizUpdateTitle() {
  const st = WZ.steps[WZ.step];
  const tag = $('#wiz-mode-tag'), t = $('#wiz-title');
  if (tag) tag.textContent = WZ.submitted ? 'Assessment Selesai'
    : (WZ.id ? (st.type === 'sentra' && wizLocked(st.sid) ? 'Sentra Terkunci' : 'Melanjutkan ' + WZ.id) : 'Assessment Baru');
  if (t) t.textContent = (WZ.nama ? WZ.nama + '  ' : '') + st.full;
}
function renderPills() {
  const el = $('#wiz-pills'); if (!el || !WZ) return;
  el.innerHTML = WZ.steps.map((st, i) => {
    let done = false, clickable = true;
    if (st.type === 'data') done = !!(WZ.id_peserta && WZ.creator && WZ.tanggal);
    else if (st.type === 'sentra') done = WZ.data.meta.sentra[st.sid].status === 'FINAL';
    else if (st.type === 'review') {
      const mySids = WZ.steps.filter(x => x.type === 'sentra').map(x => x.sid);
      done = Auth.isStaff() ? WZ.submitted : mySids.every(sid => WZ.data.meta.sentra[sid].status === 'FINAL');
    }
    else { done = true; clickable = WZ.done || WZ.submitted; }
    if (st.type !== 'data' && !WZ.id_peserta) clickable = false;
    const active = WZ.step === i;
    return '<button type="button" ' + (clickable ? '' : 'disabled ') + 'onclick="goStep(' + i + ')" ' +
      'class="step-pill ' + (active ? 'active' : (done && !active ? 'done' : '')) + (!clickable ? ' opacity-40' : '') + '">' +
      (done && !active ? ic('check', 'w-3 h-3') : '<span class="step-num w-4 h-4 rounded-full bg-black/10 grid place-items-center text-[9px]">' + (i + 1) + '</span>') +
      '<span>' + esc(st.short) + '</span></button>';
  }).join('');
}
function renderBar() {
  const bar = $('#wiz-bar'); if (!bar || !WZ) return;
  const st = WZ.steps[WZ.step];
  let html = '';
  if (st.type === 'data') {
    html = '<div class="max-w-5xl mx-auto px-4 py-3 flex gap-3">' +
      '<button class="btn-soft flex-1" onclick="wizExit()">' + (WZ.id ? 'Keluar' : 'Batal') + '</button>' +
      '<button id="wiz-next-btn" class="btn-primary flex-[2]" onclick="wizNext()">Lanjutkan ' + ARROW_R + '</button></div>';
  } else if (st.type === 'sentra') {
    const next = WZ.steps[WZ.step + 1];
    html = '<div class="max-w-5xl mx-auto px-4 py-3 flex gap-3">' +
      '<button class="btn-soft flex-1" onclick="wizBack()">' + ARROW_L + ' Kembali</button>' +
      '<button id="wiz-next-btn" class="btn-primary flex-[2]" onclick="wizNext()">' + (next.type === 'review' ? 'Review & Finalisasi' : 'Lanjutkan') + ' ' + ARROW_R + '</button></div>';
  } else if (st.type === 'review') {
    const mySids = WZ.steps.filter(step => step.type === 'sentra').map(step => step.sid);
    const canFinish = Auth.isStaff() || mySids.every(sid => WZ.data.meta.sentra[sid].status === 'FINAL');
    html = '<div class="max-w-5xl mx-auto px-4 py-3 flex gap-3">' +
      '<button class="btn-soft flex-1" onclick="wizBack()">' + ARROW_L + ' Kembali</button>' +
      '<button id="wiz-draft-btn" class="btn-soft flex-1" onclick="wizSaveDraftManual()">' + ic('save', 'w-4 h-4') + ' Draft</button>' +
      (Auth.isStaff()
        ? '<button id="wiz-submit-btn" class="btn-primary flex-[2]" onclick="wizSubmitFinal()">' + ic('check', 'w-4 h-4') + ' Submit Final</button>'
        : '<button id="wiz-finish-btn" class="btn-primary flex-[2]" ' + (canFinish ? '' : 'disabled title="Finalisasi semua sentra Anda terlebih dahulu" ') + 'onclick="wizFinish()">' + ic('check', 'w-4 h-4') + ' Selesai</button>') +
      '</div>';
  } else { bar.style.display = 'none'; return; }
  bar.style.display = '';
  bar.innerHTML = html;
}
function renderStep() {
  const el = $('#wiz-step'); if (!el || !WZ) return;
  const st = WZ.steps[WZ.step];
  let html = '';
  if (st.type === 'data') html = stepDataHtml();
  else if (st.type === 'sentra') html = stepSentraHtml(st.sid);
  else if (st.type === 'review') html = stepReviewHtml();
  else html = stepDoneHtml();
  el.innerHTML = html;
  wizUpdateTitle();
  renderPills();
  animateIn();
  if (WZ.jumpTarget) {
    const jt = WZ.jumpTarget; WZ.jumpTarget = null;
    setTimeout(() => wizScrollToMateri(jt), 120);
  }
  if (st.type === 'done' && WZ.submitted) setTimeout(wizDoneAnim, 80);
}
function wizSaveIndicator(st) {
  const el = $('#wiz-save-ind'); if (!el) return;
  if (st === 'saving') el.innerHTML = '<span class="badge bg-slate-100 text-slate-500">' + SPIN_SVG.replace('w-5 h-5', 'w-3 h-3') + ' Menyimpan</span>';
  else if (st === 'saved') {
    const jam = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    el.innerHTML = '<span class="badge bg-emerald-50 text-emerald-600">' + ic('check', 'w-3 h-3') + ' Tersimpan ' + jam + '</span>';
  } else if (st === 'unsaved') el.innerHTML = '<span class="badge bg-amber-50 text-amber-600"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Belum tersimpan</span>';
  else el.innerHTML = '';
}

/* ══════════ STEP: DATA PESERTA ══════════ */
function modeChip(mode, label) {
  const on = WZ.mode === mode;
  return '<button type="button" class="py-2.5 rounded-xl text-xs font-extrabold transition ' +
    (on ? 'bg-white text-teal-700 shadow-soft' : 'text-slate-500 hover:text-slate-700') + '" onclick="wizSetMode(\'' + mode + '\')">' + label + '</button>';
}
function shortStudentName(name, maxLength) {
  const full = String(name || '').trim();
  // Daftar pada modal sempit; 20 karakter menjaga ruang untuk badge status.
  const limit = maxLength || 20;
  return full.length > limit ? full.slice(0, limit).replace(/\s+$/, '') + '...' : full;
}
function pesertaListHtml(q) {
  const ql = String(q || '').toLowerCase().trim();
  let list = state.peserta.slice();
  if (ql) list = list.filter(p => (p.nama + ' ' + (p.nomor_peserta || '') + ' ' + (p.asal_tk || '') + ' ' + p.id_peserta).toLowerCase().indexOf(ql) >= 0);
  if (!list.length) return '<p class="text-sm text-slate-400 text-center py-8 leading-relaxed">Peserta tidak ditemukan.<br>Gunakan tab <b>Peserta Baru</b> untuk mendaftarkan.</p>';
  return list.slice(0, 40).map(p =>
    '<button type="button" role="option" class="participant-option" aria-label="Pilih ' + esc(p.nama) + '" onclick="wizPilihPeserta(\'' + esc(p.id_peserta) + '\')">' +
    '<span class="participant-avatar">' + esc(inisial(p.nama)) + '</span>' +
    '<span class="participant-copy">' +
    '<span class="participant-name" title="' + esc(p.nama) + '">' + esc(shortStudentName(p.nama)) + '</span>' +
    '<span class="participant-meta" title="' + esc((p.nomor_peserta || '-') + (p.asal_tk ? ' • ' + p.asal_tk : '')) + '"><b>No.</b> ' + esc(p.nomor_peserta || '-') + (p.asal_tk ? '<i>•</i>' + esc(p.asal_tk) : '') + '</span>' +
    '</span>' +
    (p.jumlah_assessment ? '<span class="badge bg-blue-50 text-blue-600 shrink-0">' + p.jumlah_assessment + ' Penilai</span>' : '') +
    '<span class="participant-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>' +
    '</button>').join('');
}
function stepDataHtml() {
  const hasP = !!WZ.id_peserta;
  let html = '';
  if (WZ.id) {
    const infoTxt = Auth.isStaff()
      ? 'Melanjutkan assessment <b>' + esc(WZ.id) + '</b>. Sebagai Koordinator/Admin Anda dapat mengisi semua sentra. Perubahan tersimpan otomatis.'
      : 'Melanjutkan assessment <b>' + esc(WZ.id) + '</b>. Anda hanya dapat mengisi sentra yang ditugaskan dan belum diklaim rekan lain. Perubahan tersimpan otomatis.';
    html += '<div class="card border-amber-200 bg-amber-50/70 p-4 anim-in mb-3 flex items-center gap-3">' +
      '<span class="text-amber-500 shrink-0">' + ic('edit', 'w-5 h-5') + '</span>' +
      '<p class="text-xs font-bold text-amber-800 flex-1">' + infoTxt + '</p></div>';
  }
  html += '<div class="card p-5 anim-in">' +
    '<h3 class="font-extrabold text-slate-800 flex items-center gap-2">' + ic('users', 'w-5 h-5 text-teal-500') + ' Data Peserta Didik</h3>';
  if (hasP) {
    html += '<div class="mt-4 p-4 rounded-2xl bg-teal-50/70 border border-teal-100 flex items-center gap-3">' +
      '<span class="w-11 h-11 rounded-2xl bg-teal-500 text-white grid place-items-center font-extrabold text-sm shrink-0">' + esc(inisial(WZ.nama)) + '</span>' +
      '<div class="flex-1 min-w-0">' +
      '<p class="font-extrabold text-slate-800 truncate">' + esc(WZ.nama) + '</p>' +
      '<p class="text-xs text-slate-500 truncate">No. ' + esc(WZ.nomor || '-') + (WZ.asal_tk ? ' | ' + esc(WZ.asal_tk) : '') + '</p></div>' +
      '<span class="badge bg-teal-600 text-white shrink-0">' + ic('check', 'w-3 h-3') + ' Terpilih</span>' +
      (!WZ.id ? '<button class="btn-soft !px-3 !py-2 !text-xs shrink-0" onclick="wizGantiPeserta()">Ganti</button>' : '') +
      '</div>' +
      '<div class="mt-4"><button type="button" class="btn-primary w-full !py-3.5 flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-teal-600/25 active:scale-[0.99] transition" onclick="wizNext()">' +
      'Buka Form Penilaian & Soal ' + ARROW_R + '</button></div>' +
      (WZ.id ? '<p class="text-[11px] text-slate-400 mt-2">Peserta tidak dapat diganti setelah assessment dibuat (1 assessment per peserta).</p>' : '');
  } else {
    html += '<div class="grid grid-cols-2 gap-2 mt-4 bg-slate-100 rounded-2xl p-1.5">' +
      modeChip('lama', 'Peserta Terdaftar') + modeChip('baru', 'Peserta Baru') + '</div>';
    if (WZ.mode === 'baru') {
      const pb = WZ.pesertaBaru || { nama: '', nomor: '', asal_tk: '' };
      html += '<div class="mt-4 grid gap-3">' +
        '<div><label class="label">Nama Peserta Didik *</label>' +
        '<input id="f-nama" class="input" value="' + esc(pb.nama) + '" oninput="wizField(\'nb_nama\', this.value)" placeholder="Nama lengkap ananda" readonly></div>' +
        '<div class="grid sm:grid-cols-2 gap-3">' +
        '<div><label class="label">Nomor Peserta</label><input class="input" value="' + esc(pb.nomor) + '" oninput="wizField(\'nb_nomor\', this.value)" placeholder="Opsional  cth: PPDB-007" readonly></div>' +
        '<div><label class="label">Asal TK / RA / PAUD</label><input class="input" value="' + esc(pb.asal_tk) + '" oninput="wizField(\'nb_asal_tk\', this.value)" placeholder="Opsional" readonly></div>' +
        '</div></div>';
    } else {
      html += '<div class="relative mt-4">' + ic('search', 'w-5 h-5 absolute left-5 top-1/2 -translate-y-1/2 text-slate-400') +
        '<label class="sr-only" for="peserta-q">Cari peserta terdaftar</label>' +
        '<input id="peserta-q" class="input pad-icon" placeholder="Cari nama / nomor peserta..." aria-label="Cari peserta terdaftar" oninput="wizSearchPeserta(this.value)"></div>' +
        '<div id="peserta-list" role="listbox" aria-label="Daftar peserta" class="peserta-picker-list mt-3 grid gap-2.5 pr-1">' + pesertaListHtml('') + '</div>';
    }
  }
  html += '</div>';

  html += '<div class="card p-5 anim-in mt-3">' +
    '<h3 class="font-extrabold text-slate-800 flex items-center gap-2">' + ic('star', 'w-5 h-5 text-teal-500') + ' Assessor & Waktu</h3>';
  if (WZ.id && !WZ.isCreator) {
    html += '<div class="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-1.5">' +
      '<div class="flex justify-between gap-3"><span class="text-xs font-bold text-slate-400">Pembuat</span><span class="text-sm font-bold text-slate-700">' + esc(WZ.creator || '-') + '</span></div>' +
      '<div class="flex justify-between gap-3"><span class="text-xs font-bold text-slate-400">Tanggal</span><span class="text-sm font-bold text-slate-700">' + fmtTanggal(WZ.tanggal) + '</span></div>' +
      '</div><p class="text-[11px] text-slate-400 mt-3">Data peserta & assessor diatur oleh pembuat assessment / Koordinator/Admin.</p>';
  } else {
    html += '<div class="mt-4 grid sm:grid-cols-2 gap-3">' +
      '<div><label class="label">Assessor (Pembuat) *</label><input class="input" value="' + esc(WZ.creator) + '" oninput="wizField(\'creator\', this.value)" placeholder="Ust./Ustzh. ..." readonly></div>' +
      '<div><label class="label">Tanggal Assessment *</label><input type="date" class="input" value="' + esc(WZ.tanggal) + '" oninput="wizField(\'tanggal\', this.value)" readonly></div>' +
      '</div><p class="text-[11px] text-slate-400 mt-3">Kolom * wajib sebelum menyimpan.</p>';
  }
  html += '</div>';
  return html;
}
function wizSetMode(mode) {
  if (!WZ) return;
  WZ.mode = mode;
  if (mode === 'baru' && !WZ.pesertaBaru) WZ.pesertaBaru = { nama: '', nomor: '', asal_tk: '' };
  renderStep();
}
function wizSearchPeserta(q) {
  const el = $('#peserta-list'); if (el) el.innerHTML = pesertaListHtml(q);
}
async function wizPilihPeserta(id) {
  const p = state.peserta.find(x => x.id_peserta === id); if (!p) return;
  if (p.jumlah_assessment > 0) {
    const ex = (state.riwayat || []).find(r => r.id_peserta === p.id_peserta);
    if (ex) {
      const buka = await confirmModal({
        title: 'Lanjutkan penilaian Anda?',
        html: '<p class="text-sm">Anda sedang memiliki draft penilaian untuk <b>' + esc(p.nama) + '</b>.</p><p class="text-xs text-slate-500 mt-2">Pilih <b>Lanjutkan</b> untuk meneruskan isian yang sebelumnya tersimpan.</p>',
        confirmText: 'Ya, Lanjutkan',
        cancelText: 'Nanti'
      });
      if (buka) {
        try { const res = await api('getAssessment', ex.id); wizardStart(res.assessment); } catch (err) { toast(err.message, 'error'); }
        return;
      }
      return;
    }
    if (p.id_assessment && Auth.user.role === 'ASSESSOR') {
      try {
        const claim = await api('claimNextSentra', p.id_assessment);
        const res = await api('getAssessment', p.id_assessment);
        wizardStart(res.assessment);
        const label = SENTRA_SHORT[claim.sentraId] || sentraName(claim.sentraId);
        toast('Siswa dipilih. Giliran ' + label + ' berhasil diklaim.', 'success', 3000);
      } catch (err) { toast(err.message, 'error', 5000); }
      return;
    }
    toast('Penilaian peserta ini sedang diproses dan belum menjadi giliran Anda.', 'info');
    return;
  }
  WZ.id_peserta = p.id_peserta;
  WZ.nama = p.nama; WZ.nomor = p.nomor_peserta; WZ.asal_tk = p.asal_tk;
  WZ.mode = 'lama'; WZ.pesertaBaru = null;
  markDirty();
  WZ.steps = wizSteps();

  if (WZ.steps.length > 1 && WZ.steps[1].type === 'sentra') {
    goStep(1);
    toast('Memulai penilaian: ' + p.nama, 'success', 2200);
  } else {
    renderStep();
    renderBar();
    toast('Peserta dipilih: ' + p.nama, 'success', 1800);
  }
}
function wizGantiPeserta() {
  WZ.id_peserta = null; WZ.nama = ''; WZ.nomor = ''; WZ.asal_tk = '';
  WZ.mode = 'lama'; WZ.pesertaBaru = { nama: '', nomor: '', asal_tk: '' };
  markDirty(); renderStep(); renderBar();
}
function wizField(key, val) {
  if (!WZ) return;
  if (key === 'creator') WZ.creator = val;
  else if (key === 'tanggal') WZ.tanggal = val;
  else if (key.indexOf('nb_') === 0 && WZ.pesertaBaru) WZ.pesertaBaru[key.slice(3)] = val;
  markDirty(); renderPills();
}
async function wizEnsurePeserta() {
  if (typeof pinPending === 'function' && pinPending()) { showPinGate(); return false; }
  if (WZ.id_peserta) return true;
  if (WZ.mode === 'baru') {
    const pb = WZ.pesertaBaru || {};
    if (!pb.nama || !pb.nama.trim()) {
      toast('Nama peserta wajib diisi.', 'error');
      const f = $('#f-nama');
      if (f) { f.focus(); f.classList.add('!border-rose-400', '!ring-2', '!ring-rose-200'); }
      return false;
    }
    const btn = $('#wiz-next-btn'); setBtnLoading(btn, true, 'Menyimpan peserta...');
    try {
      const res = await api('savePeserta', { nama: pb.nama, nomor: pb.nomor, asal_tk: pb.asal_tk });
      const p = res.peserta;
      WZ.id_peserta = p.id_peserta; WZ.nama = p.nama; WZ.nomor = p.nomor_peserta; WZ.asal_tk = p.asal_tk;
      state.peserta.push({ id_peserta: p.id_peserta, nama: p.nama, nomor_peserta: p.nomor, asal_tk: p.asal_tk, jumlah_assessment: 0 });
      markDirty();
      toast('Peserta "' + p.nama + '" terdaftar.', 'success');
      return true;
    } catch (e) { toast(e.message, 'error'); return false; }
    finally { setBtnLoading(btn, false); }
  }
  toast('Pilih peserta terdaftar atau isi data peserta baru.', 'info');
  return false;
}

/* ══════════ STEP: SENTRA ══════════ */
function stepSentraHtml(sid) {
  const s = state.schema.sentra.find(x => x.id === sid);
  const h = calcHasil(WZ.data);
  const st = WZ.data.meta.sentra[sid];
  const terisi = s.materi.reduce((t, m) => t + h.materi[m.id].terisi, 0);
  const total = s.materi.reduce((t, m) => t + h.materi[m.id].jumlahSel, 0);
  const rv = h.sentra[sid];
  let html =
    '<section class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 via-teal-500 to-emerald-400 p-6 sm:p-7 text-white shadow-card anim-in">' +
    '<div class="absolute -top-16 -right-10 w-48 h-48 rounded-full bg-white/10"></div>' +
    '<div class="relative flex items-center gap-4">' +
    '<span class="w-12 h-12 rounded-2xl bg-white/15 grid place-items-center shrink-0">' + ic(s.ikon, 'w-6 h-6') + '</span>' +
    '<div class="flex-1 min-w-0">' +
    '<p class="text-[10px] font-extrabold uppercase tracking-widest text-white/75">' + s.bab + '  Observasi</p>' +
    '<h2 class="text-lg sm:text-xl font-extrabold leading-tight truncate mt-0.5">' + esc(s.nama) + '</h2>' +
    '</div>' +
    '<span id="wiz-hero-rerata" class="badge bg-white/20 text-white shrink-0 !px-3 !py-1.5">Rerata: ' + (rv != null ? rv : '–') + '</span>' +
    '</div>' +
    '<div class="relative mt-5">' +
    '<div class="h-2 rounded-full bg-white/25 overflow-hidden"><div id="wiz-hero-bar" class="h-full rounded-full bg-white transition-all duration-500" style="width:' + (total ? Math.round(terisi / total * 100) : 0) + '%"></div></div>' +
    '<p id="wiz-hero-prog" class="text-[11px] font-bold text-white/85 mt-2">' + terisi + ' / ' + total + ' aspek dinilai</p>' +
    '</div></section>';

  if (st.status === 'FINAL') {
    html += Auth.isStaff()
      ? '<div class="card border-amber-200 bg-amber-50/70 p-4 anim-in mt-4 flex items-start gap-3.5"><span class="text-amber-500 shrink-0 mt-0.5">' + ic('info', 'w-5 h-5') + '</span><p class="text-xs font-bold text-amber-800 leading-relaxed">Sentra ini sudah difinalisasi oleh <b>' + esc(st.assessor) + '</b>. Sebagai Koordinator/Admin Anda tetap dapat mengubah.</p></div>'
      : '<div class="card border-emerald-200 bg-emerald-50/70 p-4 anim-in mt-4 flex items-start gap-3.5"><span class="text-emerald-500 shrink-0 mt-0.5">' + ic('lock', 'w-5 h-5') + '</span><p class="text-xs font-bold text-emerald-800 leading-relaxed">✓ Difinalisasi oleh <b>' + esc(st.assessor) + '</b>' + (st.waktu ? ' | ' + esc(st.waktu) : '') + '  terkunci. Hubungi Koordinator untuk membuka.</p></div>';
  } else if (wizPriorUnfinalizedSentra(sid)) {
    const prior = wizPriorUnfinalizedSentra(sid);
    html += '<div class="card border-amber-200 bg-amber-50/70 p-4 anim-in mt-4 flex items-start gap-3.5"><span class="text-amber-500 shrink-0 mt-0.5">' + ic('lock', 'w-5 h-5') + '</span><p class="text-xs font-bold text-amber-800 leading-relaxed">Finalisasi <b>' + esc(prior.singkat || prior.nama) + '</b> terlebih dahulu sebelum mengisi sentra ini.</p></div>';
  } else if (st.owner) {
    if (Auth.isStaff()) {
      html += '<div class="card border-amber-200 bg-amber-50/70 p-4 anim-in mt-4 flex items-start gap-3.5"><span class="text-amber-500 shrink-0 mt-0.5">' + ic('lock', 'w-5 h-5') + '</span><p class="text-xs font-bold text-amber-800 flex-1 leading-relaxed">Sentra ini diklaim oleh <b>' + esc(st.ownerName || st.owner) + '</b>. Sebagai Koordinator/Admin Anda tetap dapat mengubah.</p></div>';
    } else if (st.owner === Auth.user.username) {
      html += '<div class="card border-teal-200 bg-teal-50/60 p-4 anim-in mt-4 flex items-start gap-3.5"><span class="text-teal-500 shrink-0 mt-0.5">' + ic('check', 'w-5 h-5') + '</span><p class="text-xs font-bold text-teal-800 flex-1 leading-relaxed">Sentra ini dikerjakan oleh <b>Anda</b>.</p></div>';
    }
  }

  const completedMateri = s.materi.filter(m => calcMateri(m, WZ.data[m.id]).lengkap).length;
  html += '<div class="flex items-center justify-between gap-2 mt-5 mb-2 px-1">' +
    '<p class="text-xs font-extrabold uppercase tracking-wider text-slate-500">' +
    'Materi Observasi <span class="text-teal-600 font-bold ml-1">(' + completedMateri + '/' + s.materi.length + ' Selesai)</span>' +
    '</p>' +
    '<div class="flex items-center gap-1.5">' +
    '<button type="button" class="btn-soft !py-1 !px-2.5 !text-[11px] font-bold text-slate-600 hover:text-slate-800" onclick="wizCollapseAllMateri()">' +
    'Minimalkan Semua</button>' +
    '<button type="button" class="btn-soft !py-1 !px-2.5 !text-[11px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100" onclick="wizExpandAllMateri()">' +
    'Buka Semua</button>' +
    '</div></div>';

  s.materi.forEach((m, mi) => { html += materiCardHtml(m, mi, sid, s.materi); });
  html += sentraCatatanHtml(s, sid);
  return html;
}

function pedomanHtml(m) {
  if (!m.pedoman || !m.pedoman.length) return '';
  return '<details class="rounded-xl bg-slate-50 border border-slate-100">' +
    '<summary class="text-[11px] font-extrabold text-slate-500 px-3.5 py-2.5 cursor-pointer select-none flex items-center gap-1.5">' + ic('info', 'w-3.5 h-3.5') + ' Pedoman penilaian</summary>' +
    '<ul class="px-4 pb-3 pt-1 list-disc text-[11px] text-slate-500 leading-relaxed space-y-1">' +
    m.pedoman.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul></details>';
}

function scoreLabel(m, score) {
  const defaults = { '3': 'Baik / Mandiri', '2': 'Cukup', '1': 'Perlu Bimbingan' };
  return (m.labelNilai && m.labelNilai[String(score)]) || defaults[String(score)];
}
function scoreDescription(m, item, aspectId, score) {
  if (m.tipe === 'tunggal') return (m.rubrikNilai || {})[String(score)] || '';
  const key = (item.aspek ? item.id + '__' : '') + aspectId;
  return ((m.rubrikAspek || {})[key] || {})[String(score)] || '';
}

function materiItemsHtml(m, d, r) {
  return m.items.map(it => {
    if (m.tipe === 'tunggal') {
      const v = num(d.skor[it.id]);
      return '<div class="py-3.5 border-t border-slate-100">' +
        '<div class="flex items-start justify-between gap-4">' +
        '<div class="flex-1 min-w-0 pt-1">' +
        '<p class="text-sm font-bold text-slate-700 leading-snug">' + esc(it.nama) + '</p>' +
        (it.detail ? '<p class="text-[11px] text-slate-400 mt-1 leading-snug">' + esc(it.detail) + '</p>' : '') +
        '</div>' +
        '<div class="grid grid-cols-3 gap-1.5 w-[68%] max-w-[280px] shrink-0" role="radiogroup" aria-label="' + esc(it.nama) + '" data-scg="' + m.id + '|' + it.id + '|">' +
        [3, 2, 1].map(val =>
          '<button type="button" class="score-chip score-chip-rubric ' + (v === val ? 'on' : '') + '" data-val="' + val + '" ' +
          'aria-pressed="' + (v === val ? 'true' : 'false') + '" ' +
          'aria-label="' + esc(it.nama + '  ' + val + ' ' + scoreLabel(m, val) + (scoreDescription(m, it, '', val) ? '. ' + scoreDescription(m, it, '', val) : '')) + '" ' +
          'onclick="wizScore(\'' + m.id + '\',\'' + it.id + '\',\'\',' + val + ',this)">' +
          '<span>' + val + '</span><span class="lbl">' + esc(scoreLabel(m, val)) + '</span>' +
          (scoreDescription(m, it, '', val) ? '<span class="rubric-desc" title="' + esc(scoreDescription(m, it, '', val)) + '">' + esc(scoreDescription(m, it, '', val)) + '</span>' : '') + '</button>').join('') +
        '</div></div></div>';
    }
    const aspek = it.aspek || m.aspek;
    const cell = d.skor[it.id] || {};
    const hit = m.pilihTerbaik && r.terpilih.indexOf(it.id) >= 0;
    return '<div class="py-3.5 border-t border-slate-100">' +
      '<div class="flex items-center gap-2 flex-wrap">' +
      '<p class="text-sm font-bold text-slate-700 flex-1 min-w-[150px] leading-snug">' + esc(it.nama) + '</p>' +
      (m.pilihTerbaik ? '<span class="hit-badge badge ' + (hit ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400') + '" data-hitmark="' + it.id + '">' + (hit ? '✔ Dihitung' : 'Belum terpilih') + '</span>' : '') +
      '</div>' +
      '<div class="mt-2.5 grid gap-2">' +
      aspek.map(a => {
        const v = num(cell[a.id]);
        return '<div class="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3.5 py-2.5">' +
          '<span class="text-xs font-bold text-slate-600">' + esc(a.nama) + '</span>' +
          '<div class="grid grid-cols-3 gap-1.5 w-[68%] max-w-[280px] shrink-0" role="radiogroup" aria-label="' + esc(it.nama + '  ' + a.nama) + '" data-scg="' + m.id + '|' + it.id + '|' + a.id + '">' +
          [3, 2, 1].map(val =>
            '<button type="button" class="score-chip mini score-chip-rubric ' + (v === val ? 'on' : '') + '" data-val="' + val + '" ' +
            'aria-pressed="' + (v === val ? 'true' : 'false') + '" ' +
            'aria-label="' + esc(a.nama + '  ' + val + ' ' + scoreLabel(m, val) + (scoreDescription(m, it, a.id, val) ? '. ' + scoreDescription(m, it, a.id, val) : '')) + '" ' +
            'onclick="wizScore(\'' + m.id + '\',\'' + it.id + '\',\'' + a.id + '\',' + val + ',this)"><span>' + val + '</span><span class="lbl">' + esc(scoreLabel(m, val)) + '</span>' +
            (scoreDescription(m, it, a.id, val) ? '<span class="rubric-desc" title="' + esc(scoreDescription(m, it, a.id, val)) + '">' + esc(scoreDescription(m, it, a.id, val)) + '</span>' : '') + '</button>').join('') +
          '</div></div>';
      }).join('') +
      '</div></div>';
  }).join('');
}

function materiCardHtml(m, mi, sid, allMateri) {
  const d = WZ.data[m.id];
  const r = calcMateri(m, d);
  const locked = wizLocked(sid);

  // Tab form assessment terminimise saat tidak dinilai:
  // - Jika sentra terkunci -> semua tertutup (false)
  // - Jika pengguna sudah eksplisit membuka/menutup -> pakai WZ.ui.open[m.id]
  // - Default: hanya materi yang sedang dinilai (materi pertama yang belum lengkap) yang terbuka!
  let isOpen = false;
  if (!locked) {
    if (WZ.ui.open && WZ.ui.open[m.id] !== undefined) {
      isOpen = !!WZ.ui.open[m.id];
    } else {
      const list = allMateri || (state.schema.sentra.find(x => x.id === sid) || {}).materi || [];
      const firstIncomplete = list.find(mat => !calcMateri(mat, WZ.data[mat.id]).lengkap);
      if (firstIncomplete) {
        isOpen = (firstIncomplete.id === m.id);
      } else {
        isOpen = false;
      }
    }
  }

  const width = r.maks ? Math.round(r.skor / r.maks * 100) : 0;

  let badgeHtml = '';
  if (r.lengkap) {
    badgeHtml = '<span class="badge shrink-0 !px-2.5 !py-1 bg-emerald-50 text-emerald-700 font-bold flex items-center gap-1">' +
      ic('check', 'w-3 h-3') + ' Selesai (' + r.persen + '%)</span>';
  } else if (r.terisi > 0) {
    badgeHtml = '<span class="badge shrink-0 !px-2.5 !py-1 bg-amber-50 text-amber-700 font-bold">' +
      'Sedang Dinilai (' + r.terisi + '/' + r.jumlahSel + ')</span>';
  } else {
    badgeHtml = '<span class="badge shrink-0 !px-2.5 !py-1 bg-slate-100 text-slate-500 font-bold">' +
      'Belum Dinilai</span>';
  }

  const nextMateri = allMateri && allMateri[mi + 1];
  const nextBtnHtml = nextMateri && !locked
    ? '<div class="mt-4 pt-3 border-t border-slate-100 flex justify-end">' +
      '<button type="button" class="btn-soft !py-1.5 !px-3 !text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 flex items-center gap-1.5" onclick="wizGoNextMateri(\'' + m.id + '\',\'' + nextMateri.id + '\')">' +
      'Lanjut ke: ' + esc(nextMateri.no + ' ' + nextMateri.nama) + ' ' + ARROW_R + '</button></div>'
    : '';

  return '<div class="materi-card card ' + (mi === 0 ? 'mt-2 ' : '') + 'mb-4 anim-in ' + (isOpen ? 'open ' : '') + (locked ? 'locked' : '') + '" id="mc-' + m.id + '" style="scroll-margin-top:140px">' +
    '<button type="button" class="w-full flex items-center gap-3.5 px-4 py-4 sm:px-5 text-left hover:bg-slate-50/70 transition rounded-3xl" onclick="wizToggle(\'' + m.id + '\')">' +
    '<div class="flex-1 min-w-0">' +
    '<p class="font-extrabold text-sm sm:text-[15px] text-slate-800 leading-snug">' + m.no + '  ' + esc(m.nama) + '</p>' +
    (m.catatanKaki ? '<p class="text-[11px] text-slate-400 mt-1 leading-snug pr-2">' + esc(m.catatanKaki) + '</p>' : '') +
    '</div>' +
    '<div class="shrink-0 flex items-center gap-2" id="mprog-' + m.id + '">' + badgeHtml + '</div>' +
    '<svg class="materi-chev w-5 h-5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
    '</button>' +
    /* 3 tingkat: grid → overflow-hidden (polos) → .m-inner (padding) */
    '<div class="materi-body ' + (isOpen ? '' : 'closed') + '"><div><div class="m-inner px-4 py-4 sm:px-5">' +
    pedomanHtml(m) +
    '<div class="bar-track mt-4"><div id="mbar-' + m.id + '" class="bar-fill ' + barColor(r) + '" style="width:' + width + '%"></div></div>' +
    '<div class="flex items-center justify-between gap-3 mt-2">' +
    '<span class="text-[10px] font-bold text-slate-400">' + (m.pilihTerbaik ? 'Skor = ' + m.pilihTerbaik + ' item terbaik' : 'Skor perolehan') + '</span>' +
    '<span id="mpersen-' + m.id + '" class="text-[11px] font-extrabold text-right ' + (r.lengkap ? 'text-teal-700' : 'text-amber-600') + '">' +
    r.skor + '/' + r.maks + (r.lengkap ? '  Nilai ' + r.persen + '%' : '  (' + r.terisi + '/' + r.jumlahSel + ' aspek terisi)') + '</span>' +
    '</div>' +
    (m.tipe !== 'tunggal' ? '<p class="text-[10px] font-bold text-slate-400 mt-2.5">Skor: 3 = ' + esc(scoreLabel(m, 3)) + '  2 = ' + esc(scoreLabel(m, 2)) + '  1 = ' + esc(scoreLabel(m, 1)) + '</p>' : '') +
    '<div class="mt-3">' + materiItemsHtml(m, d, r) + '</div>' +
    '<div class="mt-4">' +
    '<label class="label">Informasi Tambahan / Komentar / Catatan <span class="text-rose-500">*</span></label>' +
    '<textarea rows="2" required aria-required="true" class="input resize-none" placeholder="Catatan untuk ' + esc(m.nama) + ' (wajib diisi)..." oninput="wizCatatan(\'' + m.id + '\', this.value)">' + esc(d.catatan || '') + '</textarea>' +
    '</div>' +
    nextBtnHtml +
    '</div></div></div></div>';
}

function sentraCatatanHtml(s, sid) {
  const v = (WZ.data.catatanSentra || {})[sid] || '';
  return '<div class="card p-5 sm:p-6 anim-in ' + (wizLocked(sid) ? 'locked' : '') + '">' +
    '<label class="label !mb-1">Informasi Tambahan  ' + esc(s.nama) + ' <span class="text-rose-500">*</span></label>' +
    '<p class="text-[11px] text-slate-400 leading-relaxed">Wajib diisi dan akan muncul pada kolom "Informasi Tambahan" di BAB IV (Total Nilai).</p>' +
    '<textarea rows="3" required aria-required="true" class="input resize-none mt-3" placeholder="Ringkasan observasi sentra ini (wajib diisi)..." oninput="wizCatatanSentra(\'' + sid + '\', this.value)">' + esc(v) + '</textarea>' +
    '</div>';
}

/* ══════════ STEP: REVIEW ══════════ */
function reviewRow(l, v) {
  return '<div class="flex justify-between gap-3 py-0.5"><span class="text-xs font-bold text-slate-400">' + esc(l) + '</span><span class="text-sm font-bold text-slate-700 text-right">' + esc(v) + '</span></div>';
}
function sentraReviewCard(s) {
  const st = WZ.data.meta.sentra[s.id];
  const h = calcHasil(WZ.data);
  const kurang = s.materi.reduce((t, m) => t + (h.materi[m.id].jumlahSel - h.materi[m.id].terisi), 0);
  const missing = sentraMissing_(WZ.data, s);
  let topHtml;
  if (st.status === 'FINAL') {
    topHtml = '<div class="flex items-center gap-2 flex-wrap">' +
      '<span class="badge bg-emerald-50 text-emerald-600">' + ic('check', 'w-3.5 h-3.5') + ' Difinalisasi oleh ' + esc(st.assessor) + '</span>' +
      (Auth.canManageSentra(s.id) ? '<button class="btn-soft !px-3 !py-2 !text-xs" onclick="wizRetract(\'' + s.id + '\')">Tarik</button>' : '') +
      '</div>';
  } else {
    const claimTxt = st.owner
      ? (st.owner === Auth.user.username ? 'Dikerjakan oleh Anda' : 'Dikerjakan oleh ' + (st.ownerName || st.owner))
      : 'Belum diklaim  mengisi skor otomatis menjadikannya milik Anda';
    topHtml = '<div class="flex items-center gap-2 flex-wrap">' +
      '<span class="badge ' + (st.owner === Auth.user.username ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500') + '">' + esc(claimTxt) + '</span>' +
      (Auth.canFinalizeSentra(s.id) && !wizPriorUnfinalizedSentra(s.id) ? '<button class="btn-primary !py-2.5 !text-xs ' + (missing.length ? 'opacity-40 pointer-events-none' : '') + '" onclick="wizFinalize(\'' + s.id + '\')">' + ic('check', 'w-4 h-4') + ' Finalisasi ' + esc(SENTRA_SHORT[s.id] || s.singkat || s.nama) + '</button>' : '') +
      (missing.length ? '<span class="text-[11px] font-bold text-amber-600">' + (kurang ? kurang + ' aspek belum dinilai · ' : '') + missing.length + ' isian wajib belum lengkap</span>' : '') +
      '</div>';
  }
  return '<div class="card p-5 anim-in mt-3">' +
    '<div class="flex items-center justify-between gap-2 flex-wrap">' +
    '<h3 class="font-extrabold text-slate-800">' + s.bab + '  ' + esc(s.nama) + '</h3>' +
    '<span class="badge ' + (h.sentra[s.id] != null ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-400') + '">Rerata ' + (h.sentra[s.id] != null ? h.sentra[s.id] : '–') + '</span></div>' +
    '<div class="mt-2 divide-y divide-slate-100">' + s.materi.map(m => {
      const r = h.materi[m.id];
      return '<button type="button" class="w-full flex items-center gap-3 py-2.5 text-left" onclick="wizGoMateri(\'' + m.id + '\')">' +
        '<span class="w-1.5 h-8 rounded-full shrink-0 ' + (r.lengkap ? 'bg-emerald-400' : 'bg-amber-400') + '"></span>' +
        '<span class="flex-1 min-w-0"><span class="block text-sm font-bold text-slate-700 truncate">' + m.no + '  ' + esc(m.nama) + '</span>' +
        '<span class="block text-[11px] text-slate-400">Skor ' + r.skor + '/' + r.maks + (r.lengkap ? ' | Nilai ' + r.persen + '%' : ' | belum lengkap') + '</span></span>' +
        '<svg class="w-4 h-4 text-slate-300 shrink-0 -rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
        '</button>';
    }).join('') + '</div>' +
    '<div class="mt-3 pt-3 border-t border-slate-100">' + topHtml + '</div></div>';
}
function otherSentraCard(s) {
  const st = (WZ.data.meta.sentra[s.id]) || {};
  const assignedToMe = (Auth.user.assignments || []).indexOf(s.id) >= 0;
  let desc;
  if (st.status === 'FINAL') desc = '✓ Difinalisasi oleh ' + (st.assessor || '');
  else if (assignedToMe && st.owner) desc = ic('lock', 'w-3 h-3') + ' Sedang dikerjakan oleh ' + esc(st.ownerName || st.owner) + '  tidak dapat Anda handle';
  else desc = 'Belum final  dinilai assessor lain';
  return '<div class="card p-4 anim-in mt-3 flex items-center gap-3 bg-slate-50/60">' +
    '<span class="w-9 h-9 rounded-xl bg-slate-200 text-slate-500 grid place-items-center shrink-0">' + ic('lock', 'w-4 h-4') + '</span>' +
    '<div class="flex-1 min-w-0">' +
    '<p class="text-sm font-bold text-slate-600">' + s.bab + '  ' + esc(s.nama) + '</p>' +
    '<p class="text-[11px] text-slate-400">' + desc + '</p>' +
    '</div></div>';
}
function bab4Preview(h) {
  const staff = Auth.isStaff();
  const cs = WZ.data.catatanSentra || {};
  const rows = state.schema.sentra.map((s, i) => ['4.' + (i + 1), s.nama, h.sentra[s.id], cs[s.id], s.id]);
  return '<div class="card p-5 anim-in mt-3">' +
    '<h3 class="font-extrabold text-slate-800">BAB IV  Total Nilai (Preview)</h3>' +
    '<div class="mt-3 overflow-x-auto"><table class="w-full text-sm min-w-[420px]">' +
    '<thead><tr class="text-left text-[10px] uppercase tracking-wide text-slate-400"><th class="pb-2">No</th><th class="pb-2">Materi</th><th class="pb-2 text-right">Rerata</th><th class="pb-2 pl-4">Info Tambahan</th></tr></thead>' +
    '<tbody class="divide-y divide-slate-100">' +
    rows.map(r => {
      const show = staff || sentraMineInWiz(r[4]);
      const st = WZ.data.meta.sentra[r[4]];
      const val = show ? (r[2] == null ? '–' : r[2]) : (st.status === 'FINAL' ? '✓ Final' : '|');
      return '<tr><td class="py-2 font-bold text-slate-400">' + r[0] + '</td><td class="py-2 font-bold text-slate-700">' + esc(r[1]) + '</td>' +
        '<td class="py-2 text-right font-extrabold ' + (show && r[2] != null ? 'text-teal-700' : 'text-slate-300') + '">' + val + '</td>' +
        '<td class="py-2 pl-4 text-xs text-slate-500 max-w-[220px] truncate">' + (show ? esc(r[3] || '-') : '') + '</td></tr>';
    }).join('') +
    '<tr class="bg-slate-50/70"><td></td><td class="py-2.5 font-extrabold text-slate-800">Rerata Umum (Nilai Akhir)</td>' +
    '<td class="py-2.5 text-right font-extrabold text-teal-700">' + (staff && h.nilaiAkhir != null ? h.nilaiAkhir : '|') + '</td>' +
    '<td class="py-2.5 pl-4 text-xs text-slate-400">' + (staff ? 'Calistung: ' + (h.calistung == null ? '–' : h.calistung) : 'Dihitung saat submit final') + '</td></tr>' +
    '</tbody></table></div>' +
    (staff
      ? '<div class="mt-4 p-4 rounded-2xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100 flex items-center gap-4 flex-wrap">' +
      '<div class="flex-1 min-w-[180px]"><p class="text-[10px] font-extrabold uppercase tracking-widest text-teal-700">Kode Hasil Asesmen</p>' +
      '<p class="text-[11px] text-slate-500 mt-1">' + esc(kodeRuleText()) + '</p></div>' +
      (h.kode ? '<span class="kode-badge kode-' + h.kode + '">' + h.kode + '</span>' : '<span class="badge bg-slate-100 text-slate-400">Belum ditentukan</span>') +
      '</div>'
      : '') +
    '</div>';
}
function stepReviewHtml() {
  const staff = Auth.isStaff();
  const h = calcHasil(WZ.data);
  let html = '<div class="anim-in"><h2 class="text-xl font-extrabold text-slate-800">Review & Finalisasi</h2>' +
    '<p class="text-sm text-slate-500 mt-0.5">' + (staff ? 'Periksa, finalisasi tiap sentra, lalu Submit Final atas nama Anda' : 'Periksa penilaian Anda, lalu finalisasi sentra Anda') + '</p></div>';

  html += '<div class="card p-5 anim-in mt-4">' +
    '<div class="flex items-center justify-between gap-3">' +
    '<h3 class="font-extrabold text-slate-800">Data Peserta & Assessor</h3>' +
    '<button class="btn-soft !px-3 !py-1.5 !text-xs" onclick="goStep(0)">Ubah</button></div>' +
    '<div class="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1.5">' +
    reviewRow('Nama', WZ.nama || '-') +
    reviewRow('Nomor/ID', WZ.nomor || WZ.id_peserta || '-') +
    reviewRow('Asal TK/RA/PAUD', WZ.asal_tk || '-') +
    reviewRow('Pembuat', WZ.creator || '-') +
    reviewRow('Tanggal', fmtTanggal(WZ.tanggal)) +
    reviewRow('Status', WZ.id ? (WZ.id + '  ' + (WZ.data.meta && Object.values(WZ.data.meta.sentra).every(x => x.status === 'FINAL') ? 'Siap Review' : 'Draft')) : 'Baru') +
    '</div></div>';

  const mySentras = WZ.steps.filter(x => x.type === 'sentra').map(x => state.schema.sentra.find(s => s.id === x.sid));
  mySentras.forEach(s => { html += sentraReviewCard(s); });
  if (!staff) {
    state.schema.sentra.filter(s => !mySentras.some(m => m.id === s.id)).forEach(s => { html += otherSentraCard(s); });
  }

  const allFin = state.schema.sentra.every(s => WZ.data.meta.sentra[s.id].status === 'FINAL');
  if (staff && h.lengkap && !allFin) {
    html += '<p class="text-[11px] text-slate-400 mt-3 px-1">' + ic('info', 'w-3.5 h-3.5 inline -mt-0.5') + ' Sentra yang belum difinalisasi akan otomatis ditandai final atas nama Anda saat Submit Final.</p>';
  }
  html += bab4Preview(h);
  return html;
}

/* ══════════ STEP: SELESAI ══════════ */
function stepDoneHtml() {
  if (WZ.submitted) {
    const h = WZ.hasilFinal || calcHasil(WZ.data);
    const statMini = (l, v) =>
      '<div class="done-stat bg-slate-50 rounded-2xl p-3.5"><p class="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">' + esc(l) + '</p>' +
      '<p class="text-xl font-extrabold text-slate-800 mt-0.5">' + v + '</p></div>';
    return '<div class="max-w-lg mx-auto text-center">' +
      '<div class="card p-7 anim-in relative overflow-hidden">' +
      '<div id="done-burst" class="absolute inset-0 pointer-events-none"></div>' +
      '<div id="done-check-wrap" class="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 grid place-items-center text-white shadow-xl shadow-emerald-500/30">' + ic('check', 'w-10 h-10') + '</div>' +
      '<h2 class="mt-4 text-xl font-extrabold text-slate-800">Assessment Berhasil Disimpan</h2>' +
      '<p class="text-sm text-slate-500 mt-1">' + esc(WZ.nama) + ' | No. ' + esc(WZ.nomor || WZ.id_peserta) + '</p>' +
      '<div class="mt-4 flex flex-col items-center gap-1">' +
      '<span class="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Kode Hasil Asesmen</span>' +
      (h.kode ? '<span id="done-kode" class="kode-badge kode-' + h.kode + '">' + h.kode + '</span>' : '<span id="done-kode" class="badge bg-slate-100 text-slate-400">–</span>') +
      '<p class="text-xs font-bold text-slate-500">' + esc(h.kodeLabel || '') + '</p>' +
      '</div>' +
      '<div class="mt-5 grid grid-cols-2 gap-2.5 text-left">' +
      '<div class="done-stat col-span-2 bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-100"><p class="text-[10px] font-extrabold uppercase tracking-wide text-teal-700">Nilai Akhir (Rerata ' + state.schema.sentra.length + ' Sentra)</p><p class="text-2xl font-extrabold text-teal-700 mt-0.5">' + (h.nilaiAkhir != null ? h.nilaiAkhir : '–') + '</p></div>' +
      state.schema.sentra.map(s => statMini(s.singkat || s.nama, h.sentra[s.id] != null ? h.sentra[s.id] : '-')).join('') +
      statMini('Calistung', h.calistung != null ? h.calistung : '–') +
      '</div>' +
      '<p class="text-[11px] text-slate-400 mt-4">ID: ' + esc(WZ.id) + ' | Pembuat: ' + esc(WZ.creator) + ' | ' + fmtTanggal(WZ.tanggal) + '</p>' +
      '</div>' +
      '<div class="grid gap-2.5 mt-4">' +
      '<button class="btn-primary done-btn" onclick="showHasilById(\'' + esc(WZ.id) + '\')">' + ic('eye', 'w-5 h-5') + ' Lihat Hasil Lengkap</button>' +
      '<button class="btn-soft done-btn" onclick="printAssessmentById(\'' + esc(WZ.id) + '\')">' + ic('printer', 'w-5 h-5') + ' Cetak Laporan</button>' +
      '<div class="grid grid-cols-2 gap-2.5">' +
      '<button class="btn-soft done-btn" onclick="wizardStart()">Assessment Baru</button>' +
      '<button class="btn-soft done-btn" onclick="wizExit()">' + (Auth.isStaff() ? 'Dashboard' : 'Daftar Penilaian') + '</button>' +
      '</div></div></div>';
  }
  const mine = WZ.steps.filter(x => x.type === 'sentra')
    .map(x => state.schema.sentra.find(s => s.id === x.sid))
    .map(s => {
      const st = WZ.data.meta.sentra[s.id];
      return '<div class="flex items-center gap-3 p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100">' +
        '<span class="w-9 h-9 rounded-xl bg-emerald-500 text-white grid place-items-center shrink-0">' + ic('check', 'w-4 h-4') + '</span>' +
        '<div class="flex-1 min-w-0"><p class="font-bold text-sm text-slate-700">' + esc(s.nama) + '</p>' +
        '<p class="text-[11px] text-slate-400">Difinalisasi' + (st.waktu ? ' | ' + esc(st.waktu) : '') + '</p></div></div>';
    }).join('');
  return '<div class="max-w-lg mx-auto text-center">' +
    '<div class="card p-7 anim-in">' +
    '<div class="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 grid place-items-center text-white shadow-xl shadow-teal-500/30">' + ic('check', 'w-10 h-10') + '</div>' +
    '<h2 class="mt-4 text-xl font-extrabold text-slate-800">Penilaian Anda Sudah Difinalisasi</h2>' +
    '<p class="text-sm text-slate-500 mt-1">' + esc(WZ.nama) + ' | No. ' + esc(WZ.nomor || WZ.id_peserta) + '</p>' +
    '<div class="mt-4 grid gap-2 text-left">' + mine + '</div>' +
    '<div class="mt-4 p-4 rounded-2xl bg-slate-50 text-xs text-slate-500 leading-relaxed text-left">' +
    ic('info', 'w-4 h-4 inline -mt-0.5') + ' Terima kasih! Setelah semua sentra final, <b>Koordinator Assesmen</b> akan melakukan <b>Submit Final</b> dan mencetak laporan.</div>' +
    '</div>' +
    '<div class="grid grid-cols-2 gap-2.5 mt-4">' +
    '<button class="btn-soft done-btn" onclick="wizardStart()">Assessment Baru</button>' +
    '<button class="btn-primary done-btn" onclick="wizExit()">Kembali ke Daftar</button>' +
    '</div></div>';
}
function wizDoneAnim() {
  if (!G()) return;
  const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
  const check = $('#done-check-wrap');
  if (check) tl.from(check, { scale: 0, rotation: -25, duration: .55, ease: 'back.out(2.2)' });
  const kode = $('#done-kode');
  if (kode) tl.from(kode, { scale: 0, duration: .55, ease: 'elastic.out(1, 0.45)' }, '-=0.25');
  tl.from('.done-stat', { y: 18, opacity: 0, stagger: .07, duration: .35 }, '-=0.25');
  tl.from('.done-btn', { y: 12, opacity: 0, stagger: .07, duration: .3 }, '-=0.15');
  const burst = $('#done-burst');
  if (burst) {
    const colors = ['#10b981', '#34d399', '#f59e0b', '#14b8a6', '#fbbf24', '#f43f5e'];
    for (let i = 0; i < 12; i++) {
      const d = document.createElement('span');
      d.style.cssText = 'position:absolute;left:50%;top:46px;width:8px;height:8px;border-radius:9999px;pointer-events:none;';
      d.style.background = colors[i % colors.length];
      burst.appendChild(d);
      gsap.fromTo(d, { x: 0, y: 0, opacity: 1, scale: 1 },
        {
          x: (Math.random() - .5) * 260, y: (Math.random() - .75) * 200, opacity: 0, scale: .3,
          duration: .9 + Math.random() * .6, delay: .2 + Math.random() * .15, ease: 'power2.out'
        });
    }
  }
}

/* ══════════ INTERAKSI SKOR & CATATAN ══════════ */
function wizToggle(mid) {
  const card = $('#mc-' + mid); if (!card) return;
  const body = card.querySelector('.materi-body');
  if (!body) return;
  const willOpen = body.classList.contains('closed');
  if (!WZ.ui.open) WZ.ui.open = {};

  if (willOpen) {
    // Accordion: jika satu materi dibuka, minimize materi lain agar layar tetap rapi & fokus
    $$('.materi-card').forEach(c => {
      if (c !== card) {
        c.classList.remove('open');
        const b = c.querySelector('.materi-body');
        if (b) b.classList.add('closed');
        const otherMid = c.id.replace('mc-', '');
        WZ.ui.open[otherMid] = false;
      }
    });
  }

  body.classList.toggle('closed', !willOpen);
  card.classList.toggle('open', willOpen);
  WZ.ui.open[mid] = willOpen;

  if (willOpen) {
    setTimeout(() => {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }
}

function wizCollapseAllMateri() {
  if (!WZ) return;
  if (!WZ.ui.open) WZ.ui.open = {};
  $$('.materi-card').forEach(c => {
    c.classList.remove('open');
    const b = c.querySelector('.materi-body');
    if (b) b.classList.add('closed');
    const mid = c.id.replace('mc-', '');
    WZ.ui.open[mid] = false;
  });
}

function wizExpandAllMateri() {
  if (!WZ) return;
  if (!WZ.ui.open) WZ.ui.open = {};
  $$('.materi-card').forEach(c => {
    c.classList.add('open');
    const b = c.querySelector('.materi-body');
    if (b) b.classList.remove('closed');
    const mid = c.id.replace('mc-', '');
    WZ.ui.open[mid] = true;
  });
}

function wizGoNextMateri(currentMid, nextMid) {
  if (!WZ) return;
  const currCard = $('#mc-' + currentMid);
  if (currCard) {
    currCard.classList.remove('open');
    const b = currCard.querySelector('.materi-body');
    if (b) b.classList.add('closed');
    if (WZ.ui && WZ.ui.open) WZ.ui.open[currentMid] = false;
  }
  wizToggle(nextMid);
}

function wizScore(mid, iid, aid, val, btn) {
  if (!WZ || WZ.submitted) return;
  if (typeof pinPending === 'function' && pinPending()) { showPinGate(); return; }
  const sentra = sentraByMateriId(mid);
  if (sentra && wizLocked(sentra.id)) return;
  const m = materiById(mid); if (!m) return;
  const md = WZ.data[mid]; if (!md) return;
  if (m.tipe === 'tunggal') {
    if (num(md.skor[iid]) === val) return;
    md.skor[iid] = val;
  } else {
    if (!md.skor[iid]) md.skor[iid] = {};
    if (num(md.skor[iid][aid]) === val) return;
    md.skor[iid][aid] = val;
  }
  if (btn) {
    const grp = btn.closest('[data-scg]');
    if (grp) $$('.score-chip', grp).forEach(c => { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('on');
    btn.setAttribute('aria-pressed', 'true');
  }
  markDirty();
  wizUpdateMateriUi(mid);
}
function wizCatatan(mid, v) {
  if (!WZ || !WZ.data[mid]) return;
  if (typeof pinPending === 'function' && pinPending()) { showPinGate(); return; }
  const sentra = sentraByMateriId(mid);
  if (sentra && wizLocked(sentra.id)) return;
  WZ.data[mid].catatan = v;
  markDirty();
}
function wizCatatanSentra(sid, v) {
  if (!WZ || !WZ.data.catatanSentra || wizLocked(sid)) return;
  if (typeof pinPending === 'function' && pinPending()) { showPinGate(); return; }
  WZ.data.catatanSentra[sid] = v;
  markDirty();
}

function wizUpdateMateriUi(mid) {
  const m = materiById(mid); if (!m) return;
  const r = calcMateri(m, WZ.data[mid]);
  const prog = $('#mprog-' + mid);
  if (prog) {
    if (r.lengkap) {
      prog.innerHTML = '<span class="badge shrink-0 !px-2.5 !py-1 bg-emerald-50 text-emerald-700 font-bold flex items-center gap-1">' +
        ic('check', 'w-3 h-3') + ' Selesai (' + r.persen + '%)</span>';
    } else if (r.terisi > 0) {
      prog.innerHTML = '<span class="badge shrink-0 !px-2.5 !py-1 bg-amber-50 text-amber-700 font-bold">' +
        'Sedang Dinilai (' + r.terisi + '/' + r.jumlahSel + ')</span>';
    } else {
      prog.innerHTML = '<span class="badge shrink-0 !px-2.5 !py-1 bg-slate-100 text-slate-500 font-medium">Belum Dinilai</span>';
    }
  }
  const bar = $('#mbar-' + mid);
  if (bar) {
    bar.className = 'bar-fill ' + barColor(r);
    bar.style.width = (r.maks ? Math.round(r.skor / r.maks * 100) : 0) + '%';
  }
  const pct = $('#mpersen-' + mid);
  if (pct) {
    pct.textContent = r.skor + '/' + r.maks + (r.lengkap ? '  Nilai ' + r.persen + '%' : '  (' + r.terisi + '/' + r.jumlahSel + ' aspek terisi)');
    pct.className = 'text-[11px] font-extrabold text-right ' + (r.lengkap ? 'text-teal-700' : 'text-amber-600');
  }
  if (m.pilihTerbaik) {
    $$('#mc-' + mid + ' [data-hitmark]').forEach(el => {
      const on = r.terpilih.indexOf(el.dataset.hitmark) >= 0;
      el.className = 'hit-badge badge ' + (on ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400');
      el.textContent = on ? '✓ Dihitung' : 'Belum terpilih';
    });
  }
  wizUpdateHero();
  renderPills();
  if (G()) {
    if (bar) gsap.fromTo(bar, { opacity: .55 }, { opacity: 1, duration: .45, ease: 'power1.out' });
    if (r.lengkap && prog) gsap.fromTo(prog, { scale: 1.15 }, { scale: 1, duration: .35, ease: 'back.out(2)' });
  }
}
function wizUpdateHero() {
  if (!WZ) return;
  const st = WZ.steps[WZ.step];
  if (!st || st.type !== 'sentra') return;
  const s = state.schema.sentra.find(x => x.id === st.sid);
  const h = calcHasil(WZ.data);
  const terisi = s.materi.reduce((t, m) => t + h.materi[m.id].terisi, 0);
  const total = s.materi.reduce((t, m) => t + h.materi[m.id].jumlahSel, 0);
  const te = $('#wiz-hero-prog'); if (te) te.textContent = terisi + ' / ' + total + ' aspek dinilai';
  const tb = $('#wiz-hero-bar'); if (tb) tb.style.width = (total ? Math.round(terisi / total * 100) : 0) + '%';
  const tr = $('#wiz-hero-rerata'); if (tr) tr.textContent = 'Rerata: ' + (h.sentra[s.id] != null ? h.sentra[s.id] : '–');
}

/* ══════════ AUTOSAVE ══════════ */
function markDirty() {
  if (!WZ || WZ.submitted) return;
  WZ.dirty = true;
  wizSaveIndicator('unsaved');
  clearTimeout(autosaveTimer);
  if (!WZ.saving) autosaveTimer = setTimeout(() => wizAutosave(false), 2500);
}
async function wizAutosave(force) {
  if (!WZ || WZ.submitted) return false;
  if (WZ.saving) return false;
  if (!force && !WZ.dirty) return true;
  if (!WZ.id_peserta) return false;
  WZ.saving = true;
  wizSaveIndicator('saving');
  let ok = false, terminal = false;
  try {
    const payload = wizPayload();
    const res = WZ.id ? await api('updateAssessment', payload) : await api('saveAssessment', payload);
    WZ.id = res.assessment.id;
    if (res.assessment.data && res.assessment.data.meta) WZ.data.meta = res.assessment.data.meta;
    wizRefreshSteps();
    WZ.autoFails = 0; WZ.autoDelay = 1500;
    WZ.dirty = false;
    wizSaveIndicator('saved');
    renderPills();
    ok = true;
  } catch (e) {
    WZ.dirty = true;
    wizSaveIndicator('unsaved');
    const msg = String(e && e.message || '');
    /* Error yang tidak akan sembuh dengan dicoba ulang: hentikan retry. */
    if (msg === 'SESSION_EXPIRED' || msg === 'PIN_DEFAULT' ||
      msg.indexOf('Akses ditolak') >= 0 || msg.indexOf('tidak ditugaskan') >= 0) {
      terminal = true;
      if (msg === 'PIN_DEFAULT') { toast('Ganti PIN default Anda dulu  perubahan belum tersimpan.', 'error'); if (typeof showPinGate === 'function') showPinGate(); }
      else if (msg === 'SESSION_EXPIRED') { /* forceLogin sudah menangani */ }
      else toast(msg, 'error');
    } else if (msg.indexOf('ASSESSMENT_EXISTS:') === 0) {
      terminal = true;
      const mid = msg.split('|')[0].split(':')[1];
      const buka = await confirmModal({
        title: 'Penilaian peserta sudah dibuat',
        html: '<p class="text-sm">Sistem menemukan penilaian yang sudah ada untuk peserta ini.</p><p class="text-xs text-slate-500 mt-2">Pilih <b>Periksa</b> untuk memastikan apakah draft tersebut merupakan giliran Anda.</p>',
        confirmText: 'Periksa',
        cancelText: 'Kembali'
      });
      if (buka) {
        try { const r2 = await api('getAssessment', mid); wizardStart(r2.assessment); } catch (err) { toast(err.message, 'error'); }
      }
    } else if (msg.indexOf('HANDLED_BY_OTHER:') === 0) {
      terminal = true;
      const ulang = await confirmModal({
        title: 'Sentra sedang dikerjakan rekan lain',
        html: '<p class="text-sm">' + esc(msg.slice('HANDLED_BY_OTHER:'.length)) + '</p><p class="text-xs text-slate-400 mt-2">Data terbaru akan dimuat ulang.</p>',
        confirmText: 'Muat Ulang'
      });
      if (ulang && WZ && WZ.id) {
        try { const r2 = await api('getAssessment', WZ.id); wizardStart(r2.assessment); } catch (err) { toast(err.message, 'error'); }
      }
    } else {
      /* B13: retry dibatasi + backoff. Sebelumnya retry 1,5 detik tanpa batas,
         termasuk saat sesi sudah mati → request menumpuk tanpa henti. */
      WZ.autoFails = (WZ.autoFails || 0) + 1;
      const now = Date.now();
      const pesan = 'Autosave gagal (' + WZ.autoFails + '/3): ' + msg;
      if (WZ.autoFails >= 3) {
        terminal = true;
        toast(pesan + '  simpan manual untuk mencoba lagi.', 'error');
      } else if (now - lastAutoErr > 10000) {
        lastAutoErr = now;
        toast(pesan, 'error');
      }
    }
  } finally {
    if (WZ) WZ.saving = false;
    if (!terminal && WZ && WZ.dirty && !WZ.submitted && WZ.id_peserta) {
      clearTimeout(autosaveTimer);
      WZ.autoDelay = Math.min((WZ.autoDelay || 1500) * 2, 15000);
      autosaveTimer = setTimeout(() => wizAutosave(false), WZ.autoDelay);
    }
  }
  return ok;
}
async function wizSaveDraftManual() {
  if (!WZ.id_peserta) { toast('Lengkapi data peserta dulu.', 'info'); return; }
  const btn = $('#wiz-draft-btn'); setBtnLoading(btn, true, 'Menyimpan...');
  const ok = await wizAutosave(true);
  setBtnLoading(btn, false);
  toast(ok ? 'Draft tersimpan.' : 'Gagal menyimpan draft.', ok ? 'success' : 'error');
}

function wizSwitcherPesertaHtml(q) {
  const needle = String(q || '').toLowerCase().trim();
  const assessments = state.riwayat || [];
  const list = (state.peserta || []).filter(p => {
    const text = [p.nama, p.nomor_peserta, p.asal_tk].join(' ').toLowerCase();
    if (needle && text.indexOf(needle) < 0) return false;
    const existing = assessments.find(a => a.id_peserta === p.id_peserta);
    /* Pertahanan tambahan untuk data lama/cache: bila siswa sudah memiliki
     * assessment tetapi draftnya tidak ada di daftar guru ini, berarti bukan
     * giliran guru ini. Jangan tawarkan sebagai penilaian baru. */
    if (!existing && Number(p.jumlah_assessment || 0) > 0) return false;
    return !existing || existing.status !== 'SUBMITTED';
  }).slice(0, 40);
  if (!list.length) return '<p class="py-5 text-center text-sm text-slate-400">Siswa yang dapat dinilai tidak ditemukan.</p>';
  return list.map(p => {
    const existing = assessments.find(a => a.id_peserta === p.id_peserta && a.status !== 'SUBMITTED');
    const active = WZ && existing && existing.id === WZ.id;
    return '<button type="button" data-wiz-peserta-id="' + esc(p.id_peserta) + '" class="w-full text-left flex items-center gap-3 p-3 rounded-2xl border ' +
      (active ? 'border-teal-300 bg-teal-50/60' : 'border-slate-200 hover:border-teal-300 hover:bg-teal-50/40') + ' transition">' +
      '<span class="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 grid place-items-center font-extrabold text-xs shrink-0">' + esc(inisial(p.nama)) + '</span>' +
      '<span class="flex-1 min-w-0"><span class="block font-bold text-sm text-slate-800 truncate" title="' + esc(p.nama) + '">' + esc(shortStudentName(p.nama)) + '</span>' +
      '<span class="block text-[11px] text-slate-400 truncate mt-0.5">No. ' + esc(p.nomor_peserta || '-') + '</span></span>' +
      '<span class="badge shrink-0 ' + (active ? 'bg-teal-600 text-white' : existing ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500') + '">' + (active ? 'Aktif' : existing ? 'Lanjutkan' : 'Nilai') + '</span>' +
    '</button>';
  }).join('');
}

/* Draft aktif disimpan sebelum form siswa lain dimuat, sehingga guru dapat
 * bergantian menilai beberapa siswa dalam satu sesi tanpa kehilangan isian. */
async function wizOpenSwitcher() {
  if (!WZ || WZ.saving) { toast('Tunggu proses penyimpanan selesai.', 'info'); return; }
  if (WZ.dirty) {
    if (!WZ.id_peserta) { toast('Pilih peserta terlebih dahulu atau batalkan form baru ini.', 'info'); return; }
    const saved = await wizAutosave(true);
    if (!saved) { toast('Draft aktif gagal disimpan. Perpindahan dibatalkan.', 'error'); return; }
  }

  /* Ambil daftar terbaru saat pemilih dibuka. Ini memastikan draft siswa yang
   * baru saja dibuat dalam sesi yang sama juga langsung muncul di daftar. */
  try {
    const res = await api('getInitialData');
    Auth.user = res.user || Auth.user;
    state.peserta = res.peserta || state.peserta;
    state.riwayat = res.riwayat || state.riwayat;
  } catch (e) { /* gunakan daftar lokal bila penyegaran tidak tersedia */ }

  const canOpen = item => item.status !== 'SUBMITTED' && (Auth.isController() || (item.myPending || []).length);
  const items = (state.riwayat || []).filter(canOpen);
  if (WZ.id && !items.some(item => item.id === WZ.id)) items.unshift({ id: WZ.id, nama: WZ.nama, nomor: WZ.nomor, status: 'DRAFT', updated: '', myPending: [] });
  items.sort((a, b) => (a.id === WZ.id ? -1 : b.id === WZ.id ? 1 : String(b.updated || '').localeCompare(String(a.updated || ''))));

  const list = items.map(item =>
    '<button type="button" data-wiz-switch-id="' + esc(item.id) + '" class="w-full text-left flex items-center gap-3 p-3 rounded-2xl border ' +
      (item.id === WZ.id ? 'border-teal-300 bg-teal-50/60' : 'border-slate-200 hover:border-teal-300 hover:bg-teal-50/40') + ' transition">' +
      '<span class="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 grid place-items-center font-extrabold text-xs shrink-0">' + esc(inisial(item.nama)) + '</span>' +
      '<span class="flex-1 min-w-0"><span class="block font-bold text-sm text-slate-800 truncate" title="' + esc(item.nama) + '">' + esc(shortStudentName(item.nama)) + '</span>' +
      '<span class="block text-[11px] text-slate-400 truncate mt-0.5">No. ' + esc(item.nomor || '-') + (item.id === WZ.id ? ' · Sedang dibuka' : '') + '</span></span>' +
      (item.id === WZ.id ? '<span class="badge shrink-0 bg-teal-600 text-white">Aktif</span>' : '<span class="badge shrink-0 bg-slate-100 text-slate-500">Buka</span>') +
    '</button>'
  ).join('');
  const ov = modalOpen(
    '<div class="flex items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">' +
      '<div class="min-w-0"><h3 class="text-lg font-extrabold text-slate-800">Ganti siswa</h3>' +
      '<p class="text-xs text-slate-500 mt-1 leading-relaxed">Penilaian siswa yang sedang dibuka telah disimpan. Pilih siswa lain untuk melanjutkan penilaian.</p></div>' +
      '<button type="button" data-wiz-switch-close class="w-9 h-9 shrink-0 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 grid place-items-center" aria-label="Tutup">' + ic('x', 'w-4 h-4') + '</button>' +
    '</div>' +
    '<div class="wiz-switcher-body grid gap-5 p-4 pt-5 sm:grid-cols-2 sm:gap-6 sm:px-6 sm:pb-6">' +
      '<section class="min-w-0 flex flex-col"><p class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Draft berjalan</p>' +
      '<div class="wiz-switcher-list mt-2 grid gap-2">' +
        (list || '<p class="py-3 text-center text-sm text-slate-400">Belum ada draft lain.</p>') +
      '</div></section>' +
      '<section class="min-w-0 flex flex-col"><label for="wiz-switch-q" class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Pilih siswa untuk dinilai</label>' +
      '<input id="wiz-switch-q" class="input mt-2 !py-2.5" placeholder="Cari nama atau nomor peserta..." autocomplete="off">' +
      '<div id="wiz-switch-peserta" class="wiz-switcher-list mt-2 grid gap-2">' + wizSwitcherPesertaHtml('') + '</div></section>' +
    '</div>',
    { cardClass: 'modal-switcher !max-w-2xl !p-0 !overflow-hidden' }
  );
  ov.querySelector('[data-wiz-switch-close]').addEventListener('click', modalClose);
  ov.querySelectorAll('[data-wiz-switch-id]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.wizSwitchId;
    if (id === WZ.id) { modalClose(); return; }
    ov.querySelectorAll('button').forEach(x => { x.disabled = true; });
    btn.innerHTML = SPIN_SVG.replace('w-5 h-5', 'w-4 h-4') + ' Membuka…';
    try {
      const res = await api('getAssessment', id);
      modalClose();
      wizardStartAssessmentForm(res.assessment);
    } catch (e) {
      toast('Assessment tidak dapat dibuka: ' + e.message, 'error');
      ov.querySelectorAll('button').forEach(x => { x.disabled = false; });
    }
  }));
  const search = ov.querySelector('#wiz-switch-q');
  const pesertaBox = ov.querySelector('#wiz-switch-peserta');
  const bindPeserta = () => ov.querySelectorAll('[data-wiz-peserta-id]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.wizPesertaId;
    const existing = (state.riwayat || []).find(item => item.id_peserta === id && item.status !== 'SUBMITTED');
    if (existing) {
      if (existing.id === WZ.id) { modalClose(); return; }
      ov.querySelectorAll('button').forEach(x => { x.disabled = true; });
      try {
        const res = await api('getAssessment', existing.id);
        modalClose(); wizardStartAssessmentForm(res.assessment);
      } catch (e) { toast('Assessment tidak dapat dibuka: ' + e.message, 'error'); ov.querySelectorAll('button').forEach(x => { x.disabled = false; }); }
      return;
    }
    const p = (state.peserta || []).find(item => item.id_peserta === id); if (!p) return;
    modalClose(); wizardStart();
    WZ.id_peserta = p.id_peserta; WZ.nama = p.nama; WZ.nomor = p.nomor_peserta; WZ.asal_tk = p.asal_tk;
    WZ.mode = 'lama'; WZ.pesertaBaru = null; WZ.steps = wizSteps(); markDirty();
    goStep(1);
    toast('Form penilaian dibuka: ' + p.nama, 'success', 2200);
  }));
  bindPeserta();
  search.addEventListener('input', () => { pesertaBox.innerHTML = wizSwitcherPesertaHtml(search.value); bindPeserta(); });
}

/* ══════════ NAVIGASI & AKSI ══════════ */
function goStep(i) {
  if (!WZ) return;
  const steps = WZ.steps;
  if (i < 0) i = 0;
  if (i >= steps.length) i = steps.length - 1;
  if (i === WZ.step) return;
  const st = steps[i];
  if (st.type !== 'data' && !WZ.id_peserta) { toast('Lengkapi Data Peserta terlebih dahulu.', 'info'); return; }
  if (st.type === 'sentra') {
    const prior = wizPriorUnfinalizedSentra(st.sid);
    if (prior) { toast('Finalisasi ' + (prior.singkat || prior.nama) + ' terlebih dahulu sebelum pindah sentra.', 'info'); return; }
  }
  if (st.type === 'done' && !WZ.done && !WZ.submitted) { toast('Selesaikan finalisasi terlebih dahulu.', 'info'); return; }
  if (WZ.dirty && !WZ.submitted && WZ.id_peserta && !WZ.saving) wizAutosave(true);
  WZ.step = i;
  renderStep();
  renderBar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function wizNext() {
  if (!WZ) return;
  const st = WZ.steps[WZ.step];
  if (st.type === 'data') {
    const ok = await wizEnsurePeserta();
    if (ok) goStep(WZ.step + 1);
  } else if (st.type === 'sentra') goStep(WZ.step + 1);
}
function wizBack() { if (WZ) goStep(WZ.step - 1); }
function wizGoMateri(mid) {
  const s = sentraByMateriId(mid); if (!s) return;
  const target = WZ.steps.findIndex(x => x.type === 'sentra' && x.sid === s.id);
  if (target < 0) { toast('Sentra ini tidak dapat Anda kerjakan (bukan penugasan Anda / sedang dikerjakan rekan lain).', 'info'); return; }
  WZ.ui.open[mid] = true;
  if (WZ.step === target) wizScrollToMateri(mid);
  else { WZ.jumpTarget = mid; goStep(target); }
}
function wizScrollToMateri(mid) {
  const card = $('#mc-' + mid);
  if (!card) return;
  const body = card.querySelector('.materi-body');
  if (body) body.classList.remove('closed');
  card.classList.add('open');
  WZ.ui.open[mid] = true;
  setTimeout(() => {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.add('ring-2', 'ring-teal-400');
    setTimeout(() => card.classList.remove('ring-2', 'ring-teal-400'), 1400);
  }, 60);
}

/* Susun ulang daftar langkah tanpa kehilangan posisi.
 * BUG LAMA: WZ.steps di-refresh tanpa menyesuaikan WZ.step. Kalau sentra yang
 * sedang dibuka hilang dari daftar (diklaim rekan / di-release Koordinator),
 * indeks yang sama menunjuk sentra BERBEDA tanpa peringatan  skor bisa
 * terketik ke BAB yang salah. */
function wizRefreshSteps() {
  const activeSid = (WZ.steps && WZ.steps[WZ.step] && WZ.steps[WZ.step].type === 'sentra')
    ? WZ.steps[WZ.step].sid : null;
  WZ.steps = wizSteps();
  if (!activeSid) return;
  const ni = WZ.steps.findIndex(s => s.type === 'sentra' && s.sid === activeSid);
  if (ni >= 0) { WZ.step = ni; return; }
  /* Sentra hilang → jangan diam-diam pindah ke sentra lain. */
  WZ.step = Math.min(WZ.step, WZ.steps.length - 1);
  toast('Sentra ' + (SENTRA_SHORT[activeSid] || activeSid) + ' tidak lagi ada di daftar Anda. Data terbaru dimuat ulang.', 'info', 6000);
  if (WZ.id) {
    api('getAssessment', WZ.id)
      .then(r2 => wizardStart(r2.assessment))
      .catch(() => showRiwayatSafe());
  }
}
function showRiwayatSafe() {
  document.body.classList.remove('in-wizard');
  WZ = null;
  goView('riwayat');
}

async function wizFinalize(sid) {
  if (!WZ) return;
  const s = state.schema.sentra.find(x => x.id === sid); if (!s) return;
  if (typeof pinPending === 'function' && pinPending()) { showPinGate(); return; }
  if (!WZ.id) {
    const saved = await wizAutosave(true);
    if (!saved) { toast('Gagal menyimpan  coba lagi.', 'error'); return; }
  }
  try {
    const res = await api('finalizeSentra', WZ.id, sid);
    WZ.data.meta = res.assessment.data.meta;
    wizRefreshSteps();
    WZ.dirty = false;
    try {
      const init = await api('getInitialData');
      state.riwayat = init.riwayat || state.riwayat;
    } catch (_) { /* pembaruan riwayat akan dicoba lagi saat penyegaran */ }
    toast(s.nama + ' difinalisasi ✓', 'success');
    renderStep(); renderBar();
  } catch (e) { toast(e.message, 'error', 5000); }
}
async function wizRetract(sid) {
  if (!WZ || !WZ.id) return;
  if (typeof pinPending === 'function' && pinPending()) { showPinGate(); return; }
  const ok = await confirmModal({ title: 'Tarik finalisasi?', html: '<p class="text-sm">Sentra ini akan dibuka kembali untuk diedit.</p>', danger: true, confirmText: 'Ya, Tarik' });
  if (!ok) return;
  try {
    const res = await api('retractSentra', WZ.id, sid);
    WZ.data.meta = res.assessment.data.meta;
    wizRefreshSteps();
    toast('Finalisasi ditarik.', 'success');
    renderStep(); renderBar();
  } catch (e) { toast(e.message, 'error'); }
}
function wizFinish() {
  if (!WZ) return;
  const mySids = WZ.steps.filter(x => x.type === 'sentra').map(x => x.sid);
  const allFin = mySids.every(sid => WZ.data.meta.sentra[sid].status === 'FINAL');
  if (!allFin) { toast('Finalisasi semua sentra Anda terlebih dahulu.', 'info'); return; }
  WZ.done = true;
  goStep(WZ.steps.length - 1);
}
async function wizSubmitFinal() {
  if (!WZ || WZ.submitted) return;
  if (!Auth.isStaff()) { toast('Hanya Koordinator/Admin yang dapat submit final.', 'error'); return; }
  if (typeof pinPending === 'function' && pinPending()) { showPinGate(); return; }
  const saved = await wizAutosave(true);
  if (!saved) { toast('Gagal menyimpan data terbaru.', 'error'); return; }
  const h = calcHasil(WZ.data);
  if (!h.lengkap) { toast('Masih ada aspek yang belum dinilai.', 'error'); return; }
  const allFin = state.schema.sentra.every(s => WZ.data.meta.sentra[s.id].status === 'FINAL');
  const ok = await confirmModal({
    title: 'Submit Assessment Final?',
    html: '<div class="text-left text-sm bg-slate-50 rounded-2xl p-4 grid gap-1.5">' +
      '<div class="flex justify-between"><span class="text-slate-500">Peserta</span><b>' + esc(WZ.nama) + '</b></div>' +
      '<div class="flex justify-between"><span class="text-slate-500">Pembuat</span><b>' + esc(WZ.creator) + '</b></div>' +
      '<div class="flex justify-between"><span class="text-slate-500">Nilai Akhir</span><b>' + h.nilaiAkhir + '</b></div>' +
      '<div class="flex justify-between"><span class="text-slate-500">Kode</span><b>' + h.kode + '  ' + esc(h.kodeLabel) + '</b></div>' +
      '<div class="flex justify-between"><span class="text-slate-500">Ttd Koordinator</span><b>' + esc(Auth.user.nama) + '</b></div></div>' +
      (allFin ? '' : '<p class="text-xs text-slate-400 mt-3">Sentra yang belum difinalisasi akan ditandai final atas nama Anda.</p>') +
      '<p class="text-xs text-slate-400 mt-3">Setelah submit, data terkunci dan laporan ditandatangani atas nama Anda.</p>',
    confirmText: 'Ya, Submit'
  });
  if (!ok) return;
  const btn = $('#wiz-submit-btn'); setBtnLoading(btn, true, 'Menyimpan...');
  try {
    const res = await api('submitAssessment', WZ.id);
    WZ.data.meta = res.assessment.data.meta;
    WZ.hasilFinal = res.hasil;
    WZ.submitted = true; WZ.dirty = false; WZ.done = true;
    clearTimeout(autosaveTimer);
    wizSaveIndicator('hidden');
    setBtnLoading(btn, false);
    goStep(WZ.steps.length - 1);
    refreshData();
  } catch (e) {
    setBtnLoading(btn, false);
    toast('Submit gagal: ' + e.message + '  data Anda tetap tersimpan.', 'error', 6000);
  }
}
async function wizExit() {
  if (!WZ) {
    document.body.classList.remove('in-wizard');
    goView(Auth.isController() ? 'dashboard' : 'riwayat');
    return;
  }
  if (WZ.dirty && !WZ.submitted && WZ.id_peserta) {
    const ok = await wizAutosave(true);
    if (!ok) {
      const pilihan = await confirmModal({
        title: 'Keluar tanpa menyimpan?',
        html: '<p class="text-sm">Draft gagal tersimpan. Jika keluar sekarang, perubahan terakhir bisa hilang.</p>',
        confirmText: 'Keluar Saja', danger: true
      });
      if (!pilihan) return;
    } else {
      toast('Draft tersimpan.', 'success', 1800);
    }
  }
  clearTimeout(autosaveTimer);
  document.body.classList.remove('in-wizard');
  WZ = null;
  goView(Auth.isController() ? 'dashboard' : 'riwayat');
  refreshData();
}
