/*************************************************************
 * firebase-service.js — Layanan Database Firestore & Auth SPMB
 * Menggantikan Kode.js dan Services.js secara murni di sisi klien
 *************************************************************/

const FirebaseService = {
  // Utility Hash SHA-256 (Identik dengan hash Apps Script)
  async hashPin(username, pin) {
    const raw = String(username || '').trim().toLowerCase() + '::' + String(pin || '');
    const msgBuffer = new TextEncoder().encode(raw);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  nowStr() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  todayIso() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  async audit(user, aksi, target, detail) {
    try {
      await db.collection('audit').add({
        waktu: this.nowStr(),
        oleh: (user && user.username) || 'system',
        aksi: aksi,
        target: target || '',
        detail: detail || ''
      });
    } catch (e) {
      console.warn('Audit failed (non-critical):', e);
    }
  },

  // Inisialisasi data awal (Bootstrap jika Firestore masih kosong)
  async ensureInitialData() {
    try {
      // 1. Cek config
      const cfgRef = db.collection('config').doc('app');
      const cfgSnap = await cfgRef.get();
      if (!cfgSnap.exists) {
        await cfgRef.set({
          sekolah: APP_CONFIG.SEKOLAH,
          tahunPelajaran: APP_CONFIG.TAHUN_PELAJARAN,
          kode_a_min: APP_CONFIG.KODE_A_MIN,
          kode_b_min: APP_CONFIG.KODE_B_MIN,
          kode_include_english: APP_CONFIG.KODE_INCLUDE_ENGLISH,
          form_schema: FORM_SCHEMA
        });
      } else {
        const d = cfgSnap.data();
        if (d.form_schema) FORM_SCHEMA = d.form_schema;
      }

      // 2. Cek akun admin
      const usersSnap = await db.collection('users').limit(1).get();
      if (usersSnap.empty) {
        const now = this.nowStr();
        const initialUsers = [
          { username: 'admin', nama: 'Administrator', pin: '1234', role: 'ADMIN', assignments: [], mustChange: true },
          { username: 'koordinator', nama: 'Ustzh. Aminah Zahra', pin: '1234', role: 'KOORDINATOR', assignments: [], mustChange: false },
          { username: 'ustabdullah', nama: 'Ust. Abdullah Hakim', pin: '1234', role: 'ASSESSOR', assignments: ['ubudiyah'], mustChange: false },
          { username: 'usthasan', nama: 'Ust. Hasan Basri', pin: '1234', role: 'ASSESSOR', assignments: ['ubudiyah'], mustChange: false },
          { username: 'ustzhfatimah', nama: 'Ustzh. Fatimah Hasan', pin: '1234', role: 'ASSESSOR', assignments: ['persiapan', 'seni'], mustChange: false }
        ];

        for (const u of initialUsers) {
          const pinHash = await this.hashPin(u.username, u.pin);
          await db.collection('users').doc(u.username).set({
            username: u.username,
            nama: u.nama,
            pinHash: pinHash,
            role: u.role,
            assignments: u.assignments,
            aktif: true,
            dibuat: now,
            diubah: now,
            pinHarusDiganti: u.mustChange
          });
        }

        // Dummy Peserta awal
        const initialPeserta = [
          { id: 'P0001', nama: 'Ahmad Fauzan Ramadhan', nomor: 'PPDB-001', asalSekolah: 'TK Anak Saleh 1' },
          { id: 'P0002', nama: 'Aisyah Nur Fadhilah', nomor: 'PPDB-002', asalSekolah: 'TK Anak Saleh 2' },
          { id: 'P0003', nama: 'Muhammad Rizki Pratama', nomor: 'PPDB-003', asalSekolah: 'RA Al-Ikhlas' },
          { id: 'P0004', nama: 'Khadijah Salsabila', nomor: 'PPDB-004', asalSekolah: 'TK Islam Terpadu Ceria' }
        ];
        for (const p of initialPeserta) {
          await db.collection('peserta').doc(p.id).set({
            id: p.id,
            id_peserta: p.id,
            nama: p.nama,
            nomor: p.nomor,
            nomor_peserta: p.nomor,
            asalSekolah: p.asalSekolah,
            asal_tk: p.asalSekolah,
            waktuDibuat: now,
            waktuDiubah: now
          });
        }
      }
    } catch (e) {
      console.error('Error in ensureInitialData:', e);
    }
  },

  // ════════════════ AUTENTIKASI ════════════════
  async getPublicBranding() {
    await this.ensureInitialData();
    let sekolah = APP_CONFIG.SEKOLAH;
    let tahunPelajaran = APP_CONFIG.TAHUN_PELAJARAN;
    try {
      const snap = await db.collection('config').doc('app').get();
      if (snap.exists) {
        const d = snap.data();
        if (d.sekolah) sekolah = d.sekolah;
        if (d.tahunPelajaran) tahunPelajaran = d.tahunPelajaran;
      }
    } catch (e) {}
    return { ok: true, sekolah, tahunPelajaran };
  },

  async login(username, pin) {
    await this.ensureInitialData();
    username = String(username || '').trim().toLowerCase();
    pin = String(pin || '');
    if (!username || !pin) throw new Error('Username dan PIN wajib diisi.');

    // Rate limiting via localStorage
    const failKey = 'spmb_fail_' + username;
    let fails = parseInt(localStorage.getItem(failKey) || '0', 10);
    const lockTimeKey = 'spmb_lock_' + username;
    const lockUntil = parseInt(localStorage.getItem(lockTimeKey) || '0', 10);
    if (Date.now() < lockUntil) {
      const remMins = Math.ceil((lockUntil - Date.now()) / 60000);
      throw new Error(`Terlalu banyak percobaan gagal. Coba lagi dalam ${remMins} menit.`);
    }

    const userDoc = await db.collection('users').doc(username).get();
    if (!userDoc.exists) {
      this.recordFailedLogin(failKey, lockTimeKey, fails);
      throw new Error('Username atau PIN salah.');
    }
    const userData = userDoc.data();
    if (!userData.aktif) throw new Error('Akun dinonaktifkan.');

    const hash = await this.hashPin(username, pin);
    if (hash !== userData.pinHash) {
      this.recordFailedLogin(failKey, lockTimeKey, fails);
      throw new Error('Username atau PIN salah.');
    }

    // Login sukses: reset failed attempts
    localStorage.removeItem(failKey);
    localStorage.removeItem(lockTimeKey);

    const token = 'token_' + Math.random().toString(36).substring(2) + Date.now();
    const publicUser = {
      username: userData.username,
      nama: userData.nama,
      role: userData.role,
      assignments: userData.assignments || [],
      pinHarusDiganti: !!userData.pinHarusDiganti
    };

    localStorage.setItem('spmb_session', JSON.stringify({ token, user: publicUser, time: Date.now() }));
    const init = await this.buildInitialData(publicUser);

    return { ok: true, token, init };
  },

  recordFailedLogin(failKey, lockTimeKey, fails) {
    fails++;
    localStorage.setItem(failKey, String(fails));
    if (fails >= 8) {
      localStorage.setItem(lockTimeKey, String(Date.now() + 10 * 60000));
    }
  },

  async logout() {
    localStorage.removeItem('spmb_session');
    return { ok: true };
  },

  getCurrentUser() {
    try {
      const sess = JSON.parse(localStorage.getItem('spmb_session') || '{}');
      return sess.user || null;
    } catch (e) {
      return null;
    }
  },

  async changeMyPin(oldPin, newPin) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');

    const uRef = db.collection('users').doc(user.username);
    const snap = await uRef.get();
    if (!snap.exists) throw new Error('Pengguna tidak ditemukan.');
    const uData = snap.data();

    const oldHash = await this.hashPin(user.username, oldPin);
    if (oldHash !== uData.pinHash) throw new Error('PIN lama tidak sesuai.');

    newPin = String(newPin || '');
    if (!/^\d{4,12}$/.test(newPin)) throw new Error('PIN baru wajib 4-12 digit angka.');
    if (newPin === String(oldPin || '')) throw new Error('PIN baru harus berbeda dari PIN lama.');
    if (newPin === 'admin123') throw new Error('PIN terlalu mudah ditebak — pilih PIN lain.');

    const newHash = await this.hashPin(user.username, newPin);
    await uRef.update({
      pinHash: newHash,
      pinHarusDiganti: false,
      diubah: this.nowStr()
    });

    user.pinHarusDiganti = false;
    const sess = JSON.parse(localStorage.getItem('spmb_session') || '{}');
    sess.user = user;
    localStorage.setItem('spmb_session', JSON.stringify(sess));

    await this.audit(user, 'PIN_GANTI', user.username, 'PIN diubah sendiri oleh pemilik akun');
    return { ok: true, user };
  },

  // ════════════════ DATA UMUM & PESERTA ════════════════
  async buildInitialData(user) {
    const [cfgSnap, pesertaSnap, riwayat] = await Promise.all([
      db.collection('config').doc('app').get(),
      db.collection('peserta').get(),
      this.getRiwayat(user)
    ]);

    let config = { ...APP_CONFIG };
    let schema = FORM_SCHEMA;
    if (cfgSnap.exists) {
      const cd = cfgSnap.data();
      config = { ...config, ...cd };
      if (cd.form_schema) schema = cd.form_schema;
    }

    const asmMap = {};
    riwayat.forEach(r => { asmMap[r.id_peserta] = r.id; });

    const peserta = pesertaSnap.docs.map(doc => {
      const d = doc.data();
      return {
        id_peserta: d.id,
        nama: d.nama,
        nomor_peserta: d.nomor,
        asal_tk: d.asalSekolah || d.asal_tk || '',
        waktu_dibuat: d.waktuDibuat || '',
        id_assessment: asmMap[d.id] || null
      };
    });

    return {
      user,
      config,
      schema,
      peserta,
      riwayat
    };
  },

  async getInitialData() {
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');
    const init = await this.buildInitialData(user);
    init.ok = true;
    return init;
  },

  async getPeserta(query) {
    const snap = await db.collection('peserta').get();
    let list = snap.docs.map(d => {
      const data = d.data();
      return {
        id_peserta: data.id,
        nama: data.nama,
        nomor_peserta: data.nomor,
        asal_tk: data.asalSekolah || data.asal_tk || ''
      };
    });
    if (query) {
      const q = String(query).toLowerCase();
      list = list.filter(p => p.nama.toLowerCase().includes(q) || p.nomor_peserta.toLowerCase().includes(q) || p.id_peserta.toLowerCase().includes(q));
    }
    return { ok: true, peserta: list };
  },

  async savePeserta(payload) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');
    if (user.role !== 'ADMIN' && user.role !== 'KOORDINATOR') throw new Error('Akses ditolak — khusus Koordinator/Admin.');

    payload = payload || {};
    const nama = clampStr_(payload.nama, 100);
    const nomor = clampStr_(payload.nomor, 50);
    const asal = clampStr_(payload.asal_tk, 100);
    if (!nama || !nomor) throw new Error('Nama dan Nomor Peserta wajib diisi.');

    const now = this.nowStr();
    let id = payload.id_peserta;
    let isNew = !id;

    if (isNew) {
      // Generate ID P0001, P0002...
      const snap = await db.collection('peserta').get();
      let maxNum = 0;
      snap.forEach(d => {
        const m = String(d.id).match(/^P(\d+)$/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
      id = 'P' + String(maxNum + 1).padStart(4, '0');
      await db.collection('peserta').doc(id).set({
        id, id_peserta: id, nama, nomor, nomor_peserta: nomor, asalSekolah: asal, asal_tk: asal, waktuDibuat: now, waktuDiubah: now
      });
      await this.audit(user, 'PESERTA_BARU', id, `${nama} (${nomor})`);
    } else {
      await db.collection('peserta').doc(id).update({
        nama, nomor, nomor_peserta: nomor, asalSekolah: asal, asal_tk: asal, waktuDiubah: now
      });
      await this.audit(user, 'PESERTA_UBAH', id, `${nama} (${nomor})`);
    }

    return {
      ok: true,
      peserta: {
        id_peserta: id,
        nama,
        nomor_peserta: nomor,
        asal_tk: asal,
        waktu_dibuat: now,
        id_assessment: null
      }
    };
  },

  // ════════════════ ASSESSMENT (PENILAIAN) ════════════════
  canAccessAssessment(user, assessment) {
    if (user.role === 'ADMIN' || user.role === 'KOORDINATOR') return true;
    if (assessment.usernameAssessor && assessment.usernameAssessor.toLowerCase() === user.username.toLowerCase()) return true;
    const meta = assessment.meta || {};
    const sentras = meta.sentra || {};
    return Object.keys(sentras).some(sid => {
      const st = sentras[sid] || {};
      const assigned = (user.assignments || []).includes(sid);
      const owned = st.owner && st.owner.toLowerCase() === user.username.toLowerCase();
      return assigned || owned;
    });
  },

  async getRiwayat(user) {
    const snap = await db.collection('assessments').get();
    const list = [];
    snap.forEach(doc => {
      const d = doc.data();
      if (this.canAccessAssessment(user, d)) {
        list.push({
          id: d.id,
          id_peserta: d.idPeserta || d.id_peserta,
          nama_peserta: d.namaPeserta || d.nama_peserta,
          nomor_peserta: d.nomorPeserta || d.nomor_peserta,
          assessor: d.assessor || d.usernameAssessor,
          username_assessor: d.usernameAssessor,
          tanggal: d.tanggal,
          status: d.status,
          rerata: d.rerata || {},
          nilai_akhir: d.nilaiAkhir,
          calistung: d.calistung,
          kode: d.kode,
          kode_label: d.kodeLabel,
          waktu_submit: d.waktuSubmit,
          waktu_diubah: d.waktuDiubah,
          meta: d.meta || defaultMeta_()
        });
      }
    });

    list.sort((a, b) => String(b.waktu_diubah || '').localeCompare(String(a.waktu_diubah || '')));
    return list;
  },

  async getAssessment(id) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');

    const snap = await db.collection('assessments').doc(id).get();
    if (!snap.exists) throw new Error('Assessment tidak ditemukan: ' + id);
    const d = snap.data();

    if (!this.canAccessAssessment(user, d)) {
      throw new Error('Akses ditolak — assessment ini bukan milik Anda.');
    }

    return {
      ok: true,
      assessment: {
        id: d.id,
        id_peserta: d.idPeserta || d.id_peserta,
        nama_peserta: d.namaPeserta || d.nama_peserta,
        nomor_peserta: d.nomorPeserta || d.nomor_peserta,
        assessor: d.assessor || d.usernameAssessor,
        username_assessor: d.usernameAssessor,
        tanggal: d.tanggal,
        status: d.status,
        data: d.data || {},
        meta: d.meta || defaultMeta_(),
        rerata: d.rerata || {},
        nilai_akhir: d.nilaiAkhir,
        calistung: d.calistung,
        kode: d.kode,
        kode_label: d.kodeLabel,
        waktu_dibuat: d.waktuDibuat,
        waktu_diubah: d.waktuDiubah,
        waktu_submit: d.waktuSubmit,
        log_edit: d.logEdit || []
      }
    };
  },

  async saveAssessment(payload) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');
    if (user.pinHarusDiganti) throw new Error('PIN_DEFAULT: Ganti PIN Anda terlebih dahulu.');

    payload = payload || {};
    const isUpdate = !!payload.id;
    const idPeserta = payload.id_peserta;
    if (!idPeserta) throw new Error('ID peserta wajib diisi.');

    // Validasi peserta
    const pSnap = await db.collection('peserta').doc(idPeserta).get();
    if (!pSnap.exists) throw new Error('Peserta tidak ditemukan: ' + idPeserta);
    const peserta = pSnap.data();

    const now = this.nowStr();
    let id = payload.id;

    if (!isUpdate) {
      // Pastikan belum ada assessment untuk peserta ini
      const exSnap = await db.collection('assessments').where('idPeserta', '==', idPeserta).get();
      if (!exSnap.empty) {
        const exId = exSnap.docs[0].id;
        throw new Error(`ASSESSMENT_EXISTS:${exId}|Peserta ini sudah memiliki assessment ${exId}.`);
      }

      // Generate ID A0001, A0002...
      const allAsm = await db.collection('assessments').get();
      let maxNum = 0;
      allAsm.forEach(d => {
        const m = String(d.id).match(/^A(\d+)$/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
      id = 'A' + String(maxNum + 1).padStart(4, '0');
    }

    const asmRef = db.collection('assessments').doc(id);

    return await db.runTransaction(async transaction => {
      const snap = await transaction.get(asmRef);
      let storedData = {};
      let meta = defaultMeta_();
      let logEdit = [];

      if (isUpdate) {
        if (!snap.exists) throw new Error('Assessment tidak ditemukan.');
        const cur = snap.data();
        if (cur.status === 'SUBMITTED') {
          throw new Error('Assessment sudah SUBMITTED dan terkunci. Koordinator dapat membuka kunci terlebih dahulu.');
        }
        storedData = cur.data || {};
        meta = sanitizeMeta_(cur.meta);
        logEdit = cur.logEdit || [];
      }

      // Deep merge per sentra dengan aturan ownership
      const incoming = payload.data || {};
      const merged = { meta, catatanSentra: {} };

      if (isUpdate) {
        Object.keys(storedData).forEach(k => {
          if (k !== 'meta' && k !== 'catatanSentra') merged[k] = storedData[k];
        });
      }

      FORM_SCHEMA.sentra.forEach(s => {
        const st = merged.meta.sentra[s.id];
        const assigned = (user.assignments || []).includes(s.id);
        const isStaff = user.role === 'ADMIN' || user.role === 'KOORDINATOR';
        const editable = isStaff || (assigned && st.status !== 'FINAL' && (!st.owner || st.owner === user.username));
        let part;

        if (editable) {
          part = sanitizeSentraPartial_(s, incoming);
          if (!isStaff && !st.owner && sentraPartHasScores_(part)) {
            st.owner = user.username;
            st.ownerName = user.nama;
          }
        } else {
          part = sentraPartFromData_(s, storedData);
        }

        merged.catatanSentra[s.id] = part.catatanSentra;
        s.materi.forEach(m => { merged[m.id] = part.materi[m.id]; });
      });

      const calc = hitungHasil_(merged);
      const status = isUpdate && snap.data().status === 'SUBMITTED' ? 'SUBMITTED' : deriveStatus_(merged);

      logEdit.unshift(`${now} [${isUpdate ? 'SAVE' : 'CREATE'}] oleh ${user.username}`);
      if (logEdit.length > 20) logEdit.pop();

      const docPayload = {
        id,
        idPeserta: peserta.id,
        namaPeserta: peserta.nama,
        nomorPeserta: peserta.nomor,
        assessor: payload.creator || user.nama,
        usernameAssessor: user.username,
        tanggal: payload.tanggal || this.todayIso(),
        status,
        data: merged,
        meta: merged.meta,
        rerata: calc.sentra,
        nilaiAkhir: calc.nilaiAkhir,
        calistung: calc.calistung,
        kode: calc.kode,
        kodeLabel: calc.kodeLabel,
        logEdit,
        waktuDiubah: now
      };

      if (!isUpdate) {
        docPayload.waktuDibuat = now;
        docPayload.waktuSubmit = null;
        transaction.set(asmRef, docPayload);
      } else {
        transaction.update(asmRef, docPayload);
      }

      return {
        ok: true,
        assessment: {
          ...docPayload,
          id_peserta: docPayload.idPeserta,
          nama_peserta: docPayload.namaPeserta,
          nomor_peserta: docPayload.nomorPeserta,
          nilai_akhir: docPayload.nilaiAkhir,
          kode_label: docPayload.kodeLabel,
          waktu_diubah: now
        }
      };
    });
  },

  async updateAssessment(payload) {
    return await this.saveAssessment(payload);
  },

  async finalizeSentra(id, sid) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');
    if (user.pinHarusDiganti) throw new Error('PIN_DEFAULT: Ganti PIN Anda terlebih dahulu.');

    const isStaff = user.role === 'ADMIN' || user.role === 'KOORDINATOR';
    if (!isStaff && !(user.assignments || []).includes(sid)) {
      throw new Error('Anda tidak ditugaskan pada sentra/BAB ini.');
    }

    const asmRef = db.collection('assessments').doc(id);
    return await db.runTransaction(async transaction => {
      const snap = await transaction.get(asmRef);
      if (!snap.exists) throw new Error('Assessment tidak ditemukan.');
      const asm = snap.data();
      if (asm.status === 'SUBMITTED') throw new Error('Assessment sudah SUBMITTED.');

      const sentra = FORM_SCHEMA.sentra.find(s => s.id === sid);
      if (!sentra) throw new Error('Sentra tidak valid: ' + sid);

      const missing = sentraMissing_(asm.data, sentra);
      if (missing.length > 0) {
        throw new Error(`Penilaian ${sentra.singkat} belum lengkap:\n- ${missing.join('\n- ')}`);
      }

      const meta = sanitizeMeta_(asm.meta);
      meta.sentra[sid].status = 'FINAL';
      meta.sentra[sid].assessor = user.nama;
      meta.sentra[sid].waktu = this.nowStr();
      meta.sentra[sid].owner = user.username;
      meta.sentra[sid].ownerName = user.nama;

      const mergedData = { ...asm.data, meta };
      const newStatus = deriveStatus_(mergedData);
      const log = asm.logEdit || [];
      log.unshift(`${this.nowStr()} [FINALIZE] ${sentra.singkat} oleh ${user.username}`);

      transaction.update(asmRef, {
        meta,
        'data.meta': meta,
        status: newStatus,
        logEdit: log,
        waktuDiubah: this.nowStr()
      });

      return { ok: true, status: newStatus, meta };
    });
  },

  async retractSentra(id, sid) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');
    if (user.role !== 'ADMIN' && user.role !== 'KOORDINATOR') throw new Error('Akses ditolak — khusus Koordinator/Admin.');

    const asmRef = db.collection('assessments').doc(id);
    return await db.runTransaction(async transaction => {
      const snap = await transaction.get(asmRef);
      if (!snap.exists) throw new Error('Assessment tidak ditemukan.');
      const asm = snap.data();
      if (asm.status === 'SUBMITTED') throw new Error('Assessment sudah SUBMITTED.');

      const meta = sanitizeMeta_(asm.meta);
      meta.sentra[sid].status = 'DRAFT';
      const log = asm.logEdit || [];
      log.unshift(`${this.nowStr()} [RETRACT] ${sid} oleh ${user.username}`);

      transaction.update(asmRef, {
        meta,
        'data.meta': meta,
        status: 'DRAFT',
        logEdit: log,
        waktuDiubah: this.nowStr()
      });

      return { ok: true, status: 'DRAFT', meta };
    });
  },

  async releaseSentra(id, sid) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');
    if (user.role !== 'ADMIN' && user.role !== 'KOORDINATOR') throw new Error('Akses ditolak — khusus Koordinator/Admin.');

    const asmRef = db.collection('assessments').doc(id);
    return await db.runTransaction(async transaction => {
      const snap = await transaction.get(asmRef);
      if (!snap.exists) throw new Error('Assessment tidak ditemukan.');
      const asm = snap.data();

      const meta = sanitizeMeta_(asm.meta);
      meta.sentra[sid].owner = '';
      meta.sentra[sid].ownerName = '';
      const log = asm.logEdit || [];
      log.unshift(`${this.nowStr()} [RELEASE] klaim ${sid} oleh ${user.username}`);

      transaction.update(asmRef, {
        meta,
        'data.meta': meta,
        logEdit: log,
        waktuDiubah: this.nowStr()
      });

      return { ok: true, meta };
    });
  },

  async submitAssessment(id) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');
    if (user.role !== 'ADMIN' && user.role !== 'KOORDINATOR') throw new Error('Akses ditolak — khusus Koordinator/Admin.');

    const asmRef = db.collection('assessments').doc(id);
    return await db.runTransaction(async transaction => {
      const snap = await transaction.get(asmRef);
      if (!snap.exists) throw new Error('Assessment tidak ditemukan.');
      const asm = snap.data();
      if (asm.status === 'SUBMITTED') throw new Error('Assessment sudah pernah di-submit.');

      const missing = missingList_(asm.data);
      if (missing.length > 0) {
        throw new Error(`Penilaian belum lengkap:\n- ${missing.join('\n- ')}`);
      }

      const meta = sanitizeMeta_(asm.meta);
      meta.koordinator = {
        username: user.username,
        nama: user.nama,
        waktu: this.nowStr()
      };

      const log = asm.logEdit || [];
      const now = this.nowStr();
      log.unshift(`${now} [SUBMIT] ditandatangani koordinator ${user.username}`);

      transaction.update(asmRef, {
        meta,
        'data.meta': meta,
        status: 'SUBMITTED',
        waktuSubmit: now,
        logEdit: log,
        waktuDiubah: now
      });

      // Export terdenormalisasi ke koleksi 'hasil'
      const hasilRef = db.collection('hasil').doc(id);
      transaction.set(hasilRef, {
        idAssessment: id,
        idPeserta: asm.idPeserta,
        namaPeserta: asm.namaPeserta,
        nomorPeserta: asm.nomorPeserta,
        tanggal: asm.tanggal,
        nilaiAkhir: asm.nilaiAkhir,
        calistung: asm.calistung,
        kode: asm.kode,
        kodeLabel: asm.kodeLabel,
        koordinator: user.nama,
        waktuSubmit: now,
        rerata: asm.rerata || {}
      });

      return { ok: true, status: 'SUBMITTED' };
    });
  },

  async unlockAssessment(id) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');
    if (user.role !== 'ADMIN' && user.role !== 'KOORDINATOR') throw new Error('Akses ditolak — khusus Koordinator/Admin.');

    const asmRef = db.collection('assessments').doc(id);
    const snap = await asmRef.get();
    if (!snap.exists) throw new Error('Assessment tidak ditemukan.');
    const asm = snap.data();

    const meta = sanitizeMeta_(asm.meta);
    FORM_SCHEMA.sentra.forEach(s => {
      meta.sentra[s.id].status = 'DRAFT';
    });
    meta.koordinator = { username: '', nama: '', waktu: '' };

    const log = asm.logEdit || [];
    const now = this.nowStr();
    log.unshift(`${now} [UNLOCK] dibuka oleh ${user.username}`);

    await asmRef.update({
      meta,
      'data.meta': meta,
      status: 'DRAFT',
      waktuSubmit: null,
      logEdit: log,
      waktuDiubah: now
    });

    // Hapus dari koleksi 'hasil'
    await db.collection('hasil').doc(id).delete().catch(() => {});
    await this.audit(user, 'ASSESSMENT_UNLOCK', id, `Dibuka kembali untuk revisi`);

    return { ok: true, status: 'DRAFT' };
  },

  async deleteDraft(id) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');

    const asmRef = db.collection('assessments').doc(id);
    const snap = await asmRef.get();
    if (!snap.exists) return { ok: true };
    const asm = snap.data();

    if (asm.status === 'SUBMITTED') throw new Error('Assessment yang sudah SUBMITTED tidak dapat dihapus.');
    const isStaff = user.role === 'ADMIN' || user.role === 'KOORDINATOR';
    if (!isStaff && asm.usernameAssessor !== user.username) {
      throw new Error('Anda hanya dapat menghapus draft milik sendiri.');
    }

    await asmRef.delete();
    await this.audit(user, 'DRAFT_HAPUS', id, `Peserta: ${asm.namaPeserta}`);
    return { ok: true };
  },

  calculateResult(data) {
    return { ok: true, hasil: hitungHasil_(sanitizeData_(data)) };
  },

  // ════════════════ DASHBOARD KOORDINATOR ════════════════
  async getDashboardData() {
    const user = this.getCurrentUser();
    if (!user || (user.role !== 'ADMIN' && user.role !== 'KOORDINATOR')) {
      throw new Error('Akses ditolak — khusus Koordinator / Admin.');
    }

    const [pesertaSnap, asmSnap] = await Promise.all([
      db.collection('peserta').get(),
      db.collection('assessments').get()
    ]);

    const totalPeserta = pesertaSnap.size;
    const asmList = [];
    asmSnap.forEach(d => asmList.push(d.data()));

    const countStatus = { DRAFT: 0, SIAP_REVIEW: 0, SUBMITTED: 0 };
    const countKode = { A: 0, B: 0, C: 0 };
    const pendingSentra = {};
    FORM_SCHEMA.sentra.forEach(s => { pendingSentra[s.id] = 0; });

    const siapSubmit = [];

    asmList.forEach(a => {
      if (countStatus[a.status] !== undefined) countStatus[a.status]++;
      if (a.status === 'SUBMITTED' && a.kode) {
        if (countKode[a.kode] !== undefined) countKode[a.kode]++;
      }
      if (a.status === 'SIAP_REVIEW') {
        siapSubmit.push({
          id: a.id,
          id_peserta: a.idPeserta,
          nama_peserta: a.namaPeserta,
          nomor_peserta: a.nomorPeserta,
          nilai_akhir: a.nilaiAkhir,
          kode: a.kode,
          waktu_diubah: a.waktuDiubah
        });
      }
      if (a.status === 'DRAFT') {
        const meta = a.meta || {};
        const sentras = meta.sentra || {};
        FORM_SCHEMA.sentra.forEach(s => {
          if (!sentras[s.id] || sentras[s.id].status !== 'FINAL') {
            pendingSentra[s.id]++;
          }
        });
      }
    });

    const pendingList = FORM_SCHEMA.sentra.map(s => ({
      id: s.id,
      singkat: s.singkat,
      belum_final: pendingSentra[s.id] || 0
    }));

    return {
      ok: true,
      dashboard: {
        total_peserta: totalPeserta,
        status: countStatus,
        kode: countKode,
        pending_sentra: pendingList,
        siap_submit: siapSubmit
      }
    };
  },

  // ════════════════ MANAJEMEN PENGGUNA ════════════════
  async getUsers() {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'ADMIN') throw new Error('Akses ditolak — khusus Admin.');

    const snap = await db.collection('users').get();
    const list = snap.docs.map(d => {
      const u = d.data();
      return {
        username: u.username,
        nama: u.nama,
        role: u.role,
        assignments: u.assignments || [],
        aktif: !!u.aktif,
        dibuat: u.dibuat || '',
        diubah: u.diubah || '',
        pin_harus_diganti: !!u.pinHarusDiganti
      };
    });
    list.sort((a, b) => a.username.localeCompare(b.username));
    return { ok: true, users: list };
  },

  async getUsersLite() {
    const snap = await db.collection('users').where('aktif', '==', true).get();
    const list = snap.docs.map(d => {
      const u = d.data();
      return { username: u.username, nama: u.nama, role: u.role, assignments: u.assignments || [] };
    });
    return { ok: true, users: list };
  },

  async saveUser(payload) {
    const caller = this.getCurrentUser();
    if (!caller || caller.role !== 'ADMIN') throw new Error('Akses ditolak — khusus Admin.');

    payload = payload || {};
    const username = clampStr_(payload.username, 30).toLowerCase();
    const nama = clampStr_(payload.nama, 80);
    const role = String(payload.role || '').toUpperCase();
    if (!username || !nama) throw new Error('Username dan nama lengkap wajib diisi.');
    if (!['ADMIN', 'KOORDINATOR', 'ASSESSOR'].includes(role)) throw new Error('Peran tidak valid.');

    const uRef = db.collection('users').doc(username);
    const snap = await uRef.get();
    const isNew = !snap.exists;
    const now = this.nowStr();

    let assignments = Array.isArray(payload.assignments) ? payload.assignments : [];
    if (role !== 'ASSESSOR') assignments = [];

    const pin = String(payload.pin || '').trim();
    if (isNew && !pin) throw new Error('PIN awal wajib diisi untuk pengguna baru.');

    let pinHash = isNew ? await this.hashPin(username, pin) : snap.data().pinHash;
    let pinHarusDiganti = isNew;

    if (pin) {
      if (!/^\d{4,12}$/.test(pin)) throw new Error('PIN wajib 4-12 digit angka.');
      pinHash = await this.hashPin(username, pin);
      pinHarusDiganti = true;
    }

    const userData = {
      username,
      nama,
      role,
      assignments,
      aktif: payload.aktif !== false,
      pinHash,
      pinHarusDiganti,
      diubah: now
    };

    if (isNew) {
      userData.dibuat = now;
      await uRef.set(userData);
      await this.audit(caller, 'USER_BARU', username, `Nama: ${nama}, Role: ${role}`);
    } else {
      await uRef.update(userData);
      await this.audit(caller, 'USER_UBAH', username, `Nama: ${nama}, Role: ${role}`);
    }

    return await this.getUsers();
  },

  async setUserActive(username, active) {
    const caller = this.getCurrentUser();
    if (!caller || caller.role !== 'ADMIN') throw new Error('Akses ditolak — khusus Admin.');
    if (caller.username === username && !active) throw new Error('Anda tidak dapat menonaktifkan akun sendiri.');

    await db.collection('users').doc(username).update({
      aktif: !!active,
      diubah: this.nowStr()
    });
    await this.audit(caller, active ? 'USER_AKTIF' : 'USER_NONAKTIF', username, '');
    return await this.getUsers();
  },

  async deleteUser(username) {
    const caller = this.getCurrentUser();
    if (!caller || caller.role !== 'ADMIN') throw new Error('Akses ditolak — khusus Admin.');
    if (caller.username === username) throw new Error('Anda tidak dapat menghapus akun sendiri.');

    await db.collection('users').doc(username).delete();
    await this.audit(caller, 'USER_HAPUS', username, '');
    return await this.getUsers();
  },

  // ════════════════ SOAL & RUBRIK ════════════════
  async saveAssessmentQuestion(payload) {
    const caller = this.getCurrentUser();
    if (!caller || caller.role !== 'ADMIN') throw new Error('Akses ditolak — khusus Admin.');

    const cfgRef = db.collection('config').doc('app');
    const snap = await cfgRef.get();
    const currentSchema = (snap.exists && snap.data().form_schema) ? snap.data().form_schema : FORM_SCHEMA;

    // Apply question change
    const sentra = currentSchema.sentra.find(s => s.id === payload.sentraId);
    if (!sentra) throw new Error('Sentra tidak ditemukan.');
    const materi = sentra.materi.find(m => m.id === payload.materiId);
    if (!materi) throw new Error('Materi tidak ditemukan.');

    if (payload.action === 'edit') {
      const item = materi.items.find(it => it.id === payload.itemId);
      if (item) item.nama = payload.nama;
    } else if (payload.action === 'add') {
      const id = 'soal_' + Date.now();
      materi.items.push({ id, nama: payload.nama });
    } else if (payload.action === 'delete') {
      if (materi.items.length <= 1) throw new Error('Minimal harus ada 1 soal per materi.');
      materi.items = materi.items.filter(it => it.id !== payload.itemId);
    }

    FORM_SCHEMA = currentSchema;
    await cfgRef.set({ form_schema: currentSchema }, { merge: true });
    await this.audit(caller, 'SOAL_UBAH', payload.materiId, payload.action);
    return { ok: true, schema: currentSchema };
  },

  async saveAssessmentRubric(payload) {
    const caller = this.getCurrentUser();
    if (!caller || caller.role !== 'ADMIN') throw new Error('Akses ditolak — khusus Admin.');

    const cfgRef = db.collection('config').doc('app');
    const snap = await cfgRef.get();
    const currentSchema = (snap.exists && snap.data().form_schema) ? snap.data().form_schema : FORM_SCHEMA;

    const sentra = currentSchema.sentra.find(s => s.id === payload.sentraId);
    if (!sentra) throw new Error('Sentra tidak ditemukan.');
    const materi = sentra.materi.find(m => m.id === payload.materiId);
    if (!materi) throw new Error('Materi tidak ditemukan.');

    if (payload.rubrik) {
      if (materi.tipe === 'tunggal') materi.labelNilai = payload.rubrik;
      if (payload.pedoman) materi.pedoman = payload.pedoman;
    }

    FORM_SCHEMA = currentSchema;
    await cfgRef.set({ form_schema: currentSchema }, { merge: true });
    await this.audit(caller, 'RUBRIK_UBAH', payload.materiId, 'Perubahan rubrik');
    return { ok: true, schema: currentSchema };
  }
};

/*************************************************************
 * Jembatan API Window — Kompatibel 100% dengan frontend
 * Menggantikan google.script.run tanpa merusak JS_Core / JS_Wizard
 *************************************************************/
window.api = function (fn, ...args) {
  return new Promise((resolve, reject) => {
    if (typeof FirebaseService[fn] === 'function') {
      FirebaseService[fn](...args)
        .then(res => resolve(res))
        .catch(err => {
          const m = (err && err.message) || String(err);
          if (m === 'SESSION_EXPIRED' && typeof forceLogin === 'function') forceLogin();
          reject(new Error(m));
        });
    } else {
      reject(new Error(`Fungsi API '${fn}' tidak ditemukan di FirebaseService.`));
    }
  });
};

window.apiNoAuth = function (fn, ...args) {
  return new Promise((resolve, reject) => {
    if (typeof FirebaseService[fn] === 'function') {
      FirebaseService[fn](...args)
        .then(res => resolve(res))
        .catch(err => reject(new Error((err && err.message) || String(err))));
    } else {
      reject(new Error(`Fungsi API '${fn}' tidak ditemukan di FirebaseService.`));
    }
  });
};

