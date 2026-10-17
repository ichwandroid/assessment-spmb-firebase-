/*************************************************************
 * Calculation.gs — Sanitasi, validasi & perhitungan nilai
 * meta menyimpan: status/owner per sentra + koordinator
 * penanda tangan (diisi saat Submit Final).
 *************************************************************/

function hitungHasil_(data) {
  data = data || {};
  var cfg = getConfigMap_();
  var aMin = toNum_(cfg.KODE_A_MIN, APP_CONFIG.KODE_A_MIN);
  var bMin = toNum_(cfg.KODE_B_MIN, APP_CONFIG.KODE_B_MIN);
  var incEng = String(cfg.KODE_INCLUDE_ENGLISH).toUpperCase() === 'TRUE';

  var r = { materi: {}, sentra: {}, calistung: null, nilaiAkhir: null, kode: null, kodeLabel: null, lengkap: true };

  getFormSchema_().sentra.forEach(function (s) {
    var persens = [];
    s.materi.forEach(function (m) {
      var h = hitungMateri_(m, data[m.id]);
      r.materi[m.id] = h;
      if (h.lengkap) persens.push(h.persen); else r.lengkap = false;
    });
    r.sentra[s.id] = persens.length ? round1_(persens.reduce(function (a, b) { return a + b; }, 0) / persens.length) : null;
  });

  var sentraSchema = getFormSchema_().sentra;
  var sr = sentraSchema.map(function (s) { return r.sentra[s.id]; }).filter(function (v) { return v !== null; });
  r.nilaiAkhir = sr.length === sentraSchema.length && sr.length ? round1_(sr.reduce(function (a, b) { return a + b; }, 0) / sr.length) : null;

  var calIds = incEng ? ['membaca', 'menulis', 'berhitung', 'english'] : ['membaca', 'menulis', 'berhitung'];
  var cp = calIds.map(function (id) { return (r.materi[id] && r.materi[id].lengkap) ? r.materi[id].persen : null; });
  if (cp.every(function (v) { return v !== null; })) {
    r.calistung = round1_(cp.reduce(function (a, b) { return a + b; }, 0) / cp.length);
    r.kode = r.calistung >= aMin ? 'A' : (r.calistung >= bMin ? 'B' : 'C');
    var k = null;
    var kodeList = getFormSchema_().kode;
    for (var i = 0; i < kodeList.length; i++) if (kodeList[i].kode === r.kode) k = kodeList[i];
    r.kodeLabel = k ? k.label : '';
  }
  return r;
}

function hitungMateri_(m, d) {
  d = d || {};
  var skor = d.skor || {};
  var r = { skor: 0, maks: 0, persen: 0, lengkap: true, terpilih: [], terisi: 0, jumlahSel: 0 };

  if (m.tipe === 'tunggal') {
    var total = 0;
    m.items.forEach(function (it) {
      r.jumlahSel++;
      var v = normalizeSkor_(skor[it.id]);
      if (v) { total += v; r.terisi++; } else r.lengkap = false;
    });
    r.skor = total;
    r.maks = m.items.length * 3;
  } else {
    var totals = m.items.map(function (it) {
      var aspek = it.aspek || m.aspek;
      var t = 0, ok = true;
      aspek.forEach(function (a) {
        r.jumlahSel++;
        var cell = skor[it.id] || {};
        var v = normalizeSkor_(cell[a.id]);
        if (v) { t += v; r.terisi++; } else ok = false;
      });
      if (!ok) r.lengkap = false;
      return { id: it.id, total: t, ok: ok };
    });
    if (m.pilihTerbaik) {
      totals.filter(function (x) { return x.ok; })
        .sort(function (a, b) { return b.total - a.total; })
        .slice(0, m.pilihTerbaik)
        .forEach(function (x) { r.terpilih.push(x.id); r.skor += x.total; });
      r.maks = m.pilihTerbaik * m.aspek.length * 3;
    } else {
      totals.forEach(function (x) { r.skor += x.total; });
      var aspekCount = 0;
      m.items.forEach(function (it) { aspekCount += (it.aspek || m.aspek).length; });
      r.maks = aspekCount * 3;
    }
  }
  r.persen = r.maks ? round1_(r.skor / r.maks * 100) : 0;
  return r;
}

function missingList_(data) {
  data = data || {};
  var out = [];
  getFormSchema_().sentra.forEach(function (s) {
    s.materi.forEach(function (m) {
      var h = hitungMateri_(m, data[m.id]);
      if (!h.lengkap) out.push(m.no + ' ' + m.nama + ' (' + (h.jumlahSel - h.terisi) + ' belum dinilai)');
    });
  });
  return out;
}

function sentraMissing_(data, s) {
  var out = [];
  s.materi.forEach(function (m) {
    var h = hitungMateri_(m, (data || {})[m.id]);
    if (!h.lengkap) out.push(m.no + ' ' + m.nama + ' (' + (h.jumlahSel - h.terisi) + ' belum dinilai)');
  });
  return out;
}

/* ── META: finalisasi + kepemilikan per sentra + koordinator ── */
function defaultMeta_() {
  var m = { sentra: {}, koordinator: { username: '', nama: '', waktu: '' } };
  getFormSchema_().sentra.forEach(function (s) {
    m.sentra[s.id] = { status: 'DRAFT', assessor: '', waktu: '', owner: '', ownerName: '' };
  });
  return m;
}

function sanitizeKoordinator_(k) {
  if (!k || typeof k !== 'object') return { username: '', nama: '', waktu: '' };
  return {
    username: clampStr_(k.username, 30).toLowerCase(),
    nama: clampStr_(k.nama, 80),
    waktu: clampStr_(k.waktu, 30)
  };
}

function sanitizeMeta_(raw) {
  var out = defaultMeta_();
  if (!raw || typeof raw !== 'object') return out;
  if (raw.sentra) {
    getFormSchema_().sentra.forEach(function (s) {
      var e = raw.sentra[s.id];
      if (!e || typeof e !== 'object') return;
      var o = out.sentra[s.id];
      if (e.status === 'FINAL') {
        o.status = 'FINAL';
        o.assessor = clampStr_(e.assessor, 80);
        o.waktu = clampStr_(e.waktu, 30);
      }
      var own = clampStr_(e.owner, 30).toLowerCase();
      if (own) {
        o.owner = own;
        o.ownerName = clampStr_(e.ownerName, 80);
      }
    });
  }
  out.koordinator = sanitizeKoordinator_(raw.koordinator);
  return out;
}

/* ── Sanitasi data ── */

function sanitizeSentraPartial_(s, raw) {
  raw = raw || {};
  var part = { catatanSentra: clampStr_(raw.catatanSentra && raw.catatanSentra[s.id], 500), materi: {} };
  s.materi.forEach(function (m) {
    var src = raw[m.id] || {};
    /* Simpan skor untuk soal yang dihapus dari skema sebagai arsip. */
    var skor = src.skor && typeof src.skor === 'object' ? JSON.parse(JSON.stringify(src.skor)) : {};
    m.items.forEach(function (it) {
      if (m.tipe === 'tunggal') {
        var v = normalizeSkor_(src.skor && src.skor[it.id]);
        if (v) skor[it.id] = v;
      } else {
        var aspek = it.aspek || m.aspek;
        var cell = (src.skor && src.skor[it.id]) || {};
        var o = {};
        aspek.forEach(function (a) {
          var v2 = normalizeSkor_(cell[a.id]);
          if (v2) o[a.id] = v2;
        });
        if (Object.keys(o).length) skor[it.id] = o;
      }
    });
    part.materi[m.id] = { skor: skor, catatan: clampStr_(src.catatan, 2000) };
  });
  return part;
}

function sentraPartFromData_(s, data) {
  data = data || {};
  var part = { catatanSentra: (data.catatanSentra || {})[s.id] || '', materi: {} };
  s.materi.forEach(function (m) {
    var src = data[m.id] || {};
    part.materi[m.id] = { skor: src.skor || {}, catatan: src.catatan || '' };
  });
  return part;
}

function sanitizeData_(raw) {
  raw = (raw && typeof raw === 'object') ? raw : {};
  var out = {};
  Object.keys(raw).forEach(function (k) { if (k !== 'meta') out[k] = raw[k]; });
  out.meta = sanitizeMeta_(raw.meta);
  out.catatanSentra = out.catatanSentra || {};
  getFormSchema_().sentra.forEach(function (s) {
    var part = sanitizeSentraPartial_(s, raw);
    out.catatanSentra[s.id] = part.catatanSentra;
    s.materi.forEach(function (m) { out[m.id] = part.materi[m.id]; });
  });
  return out;
}

function normalizeSkor_(v) {
  var n = parseInt(v, 10);
  return (n === 1 || n === 2 || n === 3) ? n : null;
}

function clampStr_(s, max) {
  s = String(s == null ? '' : s).trim();
  return s.length > max ? s.slice(0, max) : s;
}

function toNum_(v, def) {
  var n = parseFloat(v);
  return isNaN(n) ? def : n;
}

function round1_(v) { return Math.round(v * 10) / 10; }
