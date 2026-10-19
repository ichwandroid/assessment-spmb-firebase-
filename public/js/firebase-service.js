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

  isGlobalCoordinator(user) {
    return !!user && (user.role === 'ADMIN' || user.role === 'KOORDINATOR');
  },

  canManageSentra(user, sid) {
    return this.isGlobalCoordinator(user) ||
      (!!user && user.role === 'KOORDINATOR_SENTRA' && (user.assignments || []).includes(sid));
  },

  priorUnfinalizedSentra(user, sid, meta) {
    if (!user || user.role !== 'ASSESSOR') return null;
    const current = meta.sentra[sid] || {};
    // Sentra pertama boleh dipilih bebas. Setelah satu sentra mulai
    // dikerjakan, sentra tersebut menjadi gerbang dan harus FINAL sebelum
    // tim berpindah ke sentra lain.
    if (current.owner && current.status !== 'FINAL') return null;
    return FORM_SCHEMA.sentra.find(s => {
      const state = meta.sentra[s.id] || {};
      return s.id !== sid && state.owner && state.status !== 'FINAL';
    }) || null;
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
    this.ensureInitialData().catch(e => console.warn('Background init info:', e));
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
    const [cfgSnap, pesertaSnap, riwayat, assessmentSnap] = await Promise.all([
      db.collection('config').doc('app').get(),
      db.collection('peserta').get(),
      this.getRiwayat(user),
      db.collection('assessments').get()
    ]);

    let rawConfig = { ...APP_CONFIG };
    let schema = FORM_SCHEMA;
    if (cfgSnap.exists) {
      const cd = cfgSnap.data();
      rawConfig = { ...rawConfig, ...cd };
      if (cd.form_schema) schema = cd.form_schema;
    }

    // Restructure config to the format expected by app.js:
    // app.js expects state.config.kode = { aMin, bMin, includeEnglish }
    // app.js expects state.config.kodeList = [ { kode, label }, ... ]
    const aMin = rawConfig.kode_a_min ?? rawConfig.KODE_A_MIN ?? 80;
    const bMin = rawConfig.kode_b_min ?? rawConfig.KODE_B_MIN ?? 60;
    const includeEnglish = String(rawConfig.kode_include_english ?? rawConfig.KODE_INCLUDE_ENGLISH ?? false).toUpperCase() === 'TRUE' || rawConfig.kode_include_english === true || rawConfig.KODE_INCLUDE_ENGLISH === true;

    const config = {
      sekolah: rawConfig.sekolah || rawConfig.SEKOLAH || 'SD Anak Saleh',
      tahunPelajaran: rawConfig.tahunPelajaran || rawConfig.TAHUN_PELAJARAN || '',
      kode: {
        aMin: aMin,
        bMin: bMin,
        includeEnglish: includeEnglish
      },
      kodeList: (schema && schema.kode) ? schema.kode : [
        { kode: 'A', label: 'Lancar dalam aspek Calistung' },
        { kode: 'B', label: 'Cukup dalam aspek Calistung' },
        { kode: 'C', label: 'Butuh bimbingan dalam aspek Calistung' }
      ]
    };

    const asmMap = {};
    const countMap = {};
    assessmentSnap.forEach(doc => {
      const a = doc.data();
      const pesertaId = a.idPeserta || a.id_peserta;
      if (!pesertaId) return;
      asmMap[pesertaId] = doc.id;
      countMap[pesertaId] = (countMap[pesertaId] || 0) + 1;
    });

    const blockedPeserta = new Set();
    if (user.role !== 'ADMIN' && user.role !== 'KOORDINATOR') {
      assessmentSnap.forEach(doc => {
        const assessment = doc.data();
        if (!this.canAccessAssessment(user, assessment)) {
          const pesertaId = assessment.idPeserta || assessment.id_peserta;
          if (pesertaId) blockedPeserta.add(pesertaId);
        }
      });
    }

    const peserta = pesertaSnap.docs.filter(doc => !blockedPeserta.has(doc.id)).map(doc => {
      const d = doc.data();
      return {
        id_peserta: d.id,
        nama: d.nama,
        nomor_peserta: d.nomor,
        asal_tk: d.asalSekolah || d.asal_tk || '',
        waktu_dibuat: d.waktuDibuat || '',
        id_assessment: asmMap[d.id] || null,
        jumlah_assessment: countMap[d.id] || 0
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
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');
    const [snap, asmSnap] = await Promise.all([
      db.collection('peserta').get(),
      db.collection('assessments').get()
    ]);
    const asmMap = {};
    const countMap = {};
    asmSnap.forEach(d => {
      const data = d.data();
      const pId = data.idPeserta || data.id_peserta;
      if (pId) {
        asmMap[pId] = d.id;
        countMap[pId] = (countMap[pId] || 0) + 1;
      }
    });

    const blockedPeserta = new Set();
    if (user.role !== 'ADMIN' && user.role !== 'KOORDINATOR') {
      asmSnap.forEach(doc => {
        const assessment = doc.data();
        if (!this.canAccessAssessment(user, assessment)) {
          const pesertaId = assessment.idPeserta || assessment.id_peserta;
          if (pesertaId) blockedPeserta.add(pesertaId);
        }
      });
    }

    let list = snap.docs.filter(d => !blockedPeserta.has(d.id)).map(d => {
      const data = d.data();
      return {
        id_peserta: data.id,
        nama: data.nama,
        nomor_peserta: data.nomor,
        asal_tk: data.asalSekolah || data.asal_tk || '',
        waktu_dibuat: data.waktuDibuat || '',
        id_assessment: asmMap[data.id] || null,
        jumlah_assessment: countMap[data.id] || 0
      };
    });
    if (query) {
      const q = String(query).toLowerCase();
      list = list.filter(p => p.nama.toLowerCase().includes(q) || (p.nomor_peserta && p.nomor_peserta.toLowerCase().includes(q)) || p.id_peserta.toLowerCase().includes(q));
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

  async importPeserta(list) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');
    if (user.role !== 'ADMIN' && user.role !== 'KOORDINATOR') throw new Error('Akses ditolak — khusus Koordinator/Admin.');
    if (!Array.isArray(list) || !list.length) throw new Error('Data peserta kosong.');

    const snap = await db.collection('peserta').get();
    let maxNum = 0;
    const existingNomor = new Set();
    snap.forEach(d => {
      const data = d.data();
      if (data.nomor) existingNomor.add(String(data.nomor).trim().toLowerCase());
      const m = String(d.id).match(/^P(\d+)$/);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });

    const now = this.nowStr();
    let inserted = 0;
    const batch = db.batch();

    for (const item of list) {
      const nama = clampStr_(item.nama, 100);
      const nomor = clampStr_(item.nomor, 50);
      const asal = clampStr_(item.asalSekolah || item.asal_tk || item.asal_sekolah, 100);
      if (!nama || !nomor) continue;

      if (existingNomor.has(nomor.toLowerCase())) continue;
      existingNomor.add(nomor.toLowerCase());

      maxNum++;
      const id = 'P' + String(maxNum).padStart(4, '0');
      const docRef = db.collection('peserta').doc(id);
      batch.set(docRef, {
        id,
        id_peserta: id,
        nama,
        nomor,
        nomor_peserta: nomor,
        asalSekolah: asal,
        asal_tk: asal,
        waktuDibuat: now,
        waktuDiubah: now
      });
      inserted++;
    }

    if (inserted > 0) {
      await batch.commit();
      await this.audit(user, 'PESERTA_IMPORT', `${inserted} Peserta`, 'Import massal');
    }

    return { ok: true, count: inserted };
  },

  async deletePeserta(id) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');
    if (user.role !== 'ADMIN' && user.role !== 'KOORDINATOR') throw new Error('Akses ditolak — khusus Koordinator/Admin.');

    const exSnap = await db.collection('assessments').where('idPeserta', '==', id).get();
    if (!exSnap.empty) {
      throw new Error('Peserta ini sudah memiliki lembar assessment. Hapus lembar assessment terlebih dahulu.');
    }

    await db.collection('peserta').doc(id).delete();
    await this.audit(user, 'PESERTA_HAPUS', id, '');
    return { ok: true };
  },

  // ════════════════ ASSESSMENT (PENILAIAN) ════════════════
  canAccessAssessment(user, assessment) {
    if (this.isGlobalCoordinator(user)) return true;
    const meta = assessment.meta || {};
    const sentras = meta.sentra || {};
    const ownsFinalizedSentra = user.role === 'ASSESSOR' && FORM_SCHEMA.sentra.some(s => {
      const st = sentras[s.id] || {};
      return st.status === 'FINAL' && String(st.owner || '').toLowerCase() === String(user.username || '').toLowerCase();
    });
    const allSentraFinal = FORM_SCHEMA.sentra.every(s => (sentras[s.id] || {}).status === 'FINAL');
    // Setelah semua sentra final, assessor hanya dapat membaca assessment
    // yang memuat sentra yang ia finalisasi sendiri.
    if (allSentraFinal) return ownsFinalizedSentra;
    if (user.role === 'KOORDINATOR_SENTRA') {
      return (user.assignments || []).some(sid => FORM_SCHEMA.sentra.some(s => s.id === sid));
    }
    const asg = user.assignments || [];
    const activeSentra = FORM_SCHEMA.sentra.find(s => {
      const st = sentras[s.id] || {};
      return st.owner && st.status !== 'FINAL';
    });
    const hasFinalSentra = FORM_SCHEMA.sentra.some(s => (sentras[s.id] || {}).status === 'FINAL');
    // Draft lama tanpa pemilik sentra tidak boleh menjadi draft bebas yang
    // dapat dibuka assessor mana pun. Namun pembuat draft tetap harus dapat
    // menemukannya lagi setelah refresh. Ini juga menjadi jalur pemulihan
    // aman bagi draft yang dibuat sebelum penanda owner diberlakukan.
    if (!activeSentra && !hasFinalSentra && assessment.status === 'DRAFT') {
      const creatorUsername = String(assessment.usernameAssessor || '').trim().toLowerCase();
      return !!creatorUsername && creatorUsername === String(user.username || '').trim().toLowerCase();
    }
    // Saat satu sentra masih aktif, assessment hanya tampak bagi guru yang
    // sedang memegangnya. Guru sentra lain baru dapat melihatnya setelah
    // sentra aktif tersebut difinalisasi.
    if (activeSentra) {
      const active = sentras[activeSentra.id] || {};
      if (active.owner.toLowerCase() !== user.username.toLowerCase() && !ownsFinalizedSentra) return false;
    }
    if (ownsFinalizedSentra) return true;
    // Setelah sentra aktif final, assessor pada sentra yang belum diklaim
    // dapat melihat assessment untuk mengambil giliran berikutnya.
    return FORM_SCHEMA.sentra.some(s => {
      const st = sentras[s.id] || {};
      const assigned = asg.length === 0 || asg.includes(s.id);
      return assigned && (!st.owner || st.owner.toLowerCase() === user.username.toLowerCase());
    });
  },

  async getRiwayat(user) {
    const snap = await db.collection('assessments').get();
    const list = [];
    const asg = user.assignments || [];
    const isStaff = this.isGlobalCoordinator(user);
    const isSentraCoordinator = user.role === 'KOORDINATOR_SENTRA';

    snap.forEach(doc => {
      const d = doc.data();
      const meta = d.meta || defaultMeta_();
      const ownsFinalizedSentra = user.role === 'ASSESSOR' && FORM_SCHEMA.sentra.some(s => {
        const st = (meta.sentra || {})[s.id] || {};
        return st.status === 'FINAL' && String(st.owner || '').toLowerCase() === String(user.username || '').toLowerCase();
      });
      if (!this.canAccessAssessment(user, d) && !ownsFinalizedSentra) return;

      const sentras = meta.sentra || {};

      // Build sentraStatus: { [sid]: 'DRAFT'|'FINAL' }
      const sentraStatus = {};
      // Build sentraOwner: { [sid]: { owner, ownerName } }
      const sentraOwner = {};
      // myPending: sentras that this user is assigned to and not yet FINAL
      const myPending = [];
      const myFinalized = [];
      // handledByOther: sentras claimed by another user (not me, not empty)
      const handledByOther = [];
      // Hanya satu sentra yang boleh aktif pada satu assessment. Ini juga
      // dipakai oleh menu Penilaian agar guru berikutnya tidak mendapat
      // tombol "Buka" sebelum sentra aktif difinalisasi.
      const activeSentra = FORM_SCHEMA.sentra.find(s => {
        const st = sentras[s.id] || {};
        return st.owner && st.status !== 'FINAL';
      });
      const activeState = activeSentra ? (sentras[activeSentra.id] || {}) : null;
      const activeOwnedByOther = activeState && activeState.owner &&
        activeState.owner.toLowerCase() !== user.username.toLowerCase();
      if (!isStaff && !isSentraCoordinator && activeOwnedByOther) {
        handledByOther.push({ sid: activeSentra.id, ownerName: activeState.ownerName || activeState.owner });
      }

      FORM_SCHEMA.sentra.forEach(s => {
        const st = sentras[s.id] || {};
        sentraStatus[s.id] = st.status || 'DRAFT';
        sentraOwner[s.id] = { owner: st.owner || '', ownerName: st.ownerName || '' };

        if (user.role === 'ASSESSOR' && st.status === 'FINAL' && String(st.owner || '').toLowerCase() === String(user.username || '').toLowerCase()) {
          myFinalized.push(s.id);
        }

        if (!isStaff && !isSentraCoordinator) {
          const isAssigned = asg.length === 0 || asg.includes(s.id);
          if (!activeOwnedByOther && isAssigned && st.status !== 'FINAL') {
            const claimedByOther = st.owner && st.owner.toLowerCase() !== user.username.toLowerCase();
            if (claimedByOther) {
              handledByOther.push({ sid: s.id, ownerName: st.ownerName || st.owner });
            } else {
              // Either unclaimed or claimed by this user
              myPending.push(s.id);
            }
          }
        }
      });

      list.push({
        id: d.id,
        id_peserta: d.idPeserta || d.id_peserta,
        // Alias fields used by riwayatCard in app.js
        nama: d.namaPeserta || d.nama_peserta || '',
        nomor: d.nomorPeserta || d.nomor_peserta || '',
        creator: d.assessor || d.usernameAssessor || '',
        creatorUsername: d.usernameAssessor || '',
        updated: d.waktuDiubah || '',
        // Legacy / extra fields
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
        meta,
        // Per-user context fields consumed by riwayatCard
        sentraStatus,
        sentraOwner,
        myPending: (isStaff || isSentraCoordinator) ? [] : myPending,
        myFinalized: (isStaff || isSentraCoordinator) ? [] : myFinalized,
        handledByOther: (isStaff || isSentraCoordinator) ? [] : handledByOther
      });
    });

    // Giliran sentra yang belum diklaim tetap dapat dipilih dari daftar siswa,
    // tetapi bukan draft aktif guru. Draft baru tampil setelah owner tercatat.
    list.sort((a, b) => String(b.waktu_diubah || '').localeCompare(String(a.waktu_diubah || '')));
    if (user.role === 'ASSESSOR') {
      return list.filter(item => (item.myFinalized || []).length || FORM_SCHEMA.sentra.some(s => {
        const state = (item.meta && item.meta.sentra && item.meta.sentra[s.id]) || {};
        return state.owner && state.owner.toLowerCase() === String(user.username || '').toLowerCase() && state.status !== 'FINAL';
      }));
    }

    return list;
  },

  async claimNextSentra(id) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');
    if (user.role !== 'ASSESSOR') throw new Error('Klaim sentra hanya tersedia untuk assessor.');
    if (user.pinHarusDiganti) throw new Error('PIN_DEFAULT: Ganti PIN Anda terlebih dahulu.');
    const assigned = user.assignments || [];
    const ref = db.collection('assessments').doc(id);
    return await db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new Error('Assessment tidak ditemukan.');
      const asm = snap.data();
      if (!this.canAccessAssessment(user, asm)) throw new Error('Akses ditolak — assessment ini bukan giliran Anda.');
      if (asm.status === 'SUBMITTED') throw new Error('Assessment sudah SUBMITTED.');
      const meta = sanitizeMeta_(asm.meta);
      const active = FORM_SCHEMA.sentra.find(s => {
        const st = meta.sentra[s.id] || {};
        return st.owner && st.status !== 'FINAL';
      });
      if (active && active.owner.toLowerCase() !== user.username.toLowerCase()) {
        throw new Error('Assessment sedang dikerjakan guru lain.');
      }
      const target = FORM_SCHEMA.sentra.find(s => {
        const st = meta.sentra[s.id] || {};
        return (assigned.length === 0 || assigned.includes(s.id)) && st.status !== 'FINAL' && (!st.owner || st.owner.toLowerCase() === user.username.toLowerCase());
      });
      if (!target) throw new Error('Tidak ada sentra yang dapat Anda klaim pada assessment ini.');
      const blockedBy = this.priorUnfinalizedSentra(user, target.id, meta);
      if (blockedBy) throw new Error(`FINALIZE_FIRST:Finalisasi ${blockedBy.singkat || blockedBy.nama} terlebih dahulu.`);
      const st = meta.sentra[target.id];
      if (st.owner && st.owner.toLowerCase() !== user.username.toLowerCase()) throw new Error('Sentra sudah diklaim guru lain.');
      st.owner = user.username;
      st.ownerName = user.nama;
      transaction.update(ref, { meta, 'data.meta': meta, waktuDiubah: this.nowStr() });
      return { ok: true, sentraId: target.id };
    });
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

    const hasil = hitungHasil_(d.data || {});

    return {
      ok: true,
      assessment: {
        id: d.id,
        id_peserta: d.idPeserta || d.id_peserta,
        nama_peserta: d.namaPeserta || d.nama_peserta,
        nama: d.namaPeserta || d.nama_peserta,
        nomor_peserta: d.nomorPeserta || d.nomor_peserta,
        nomor: d.nomorPeserta || d.nomor_peserta,
        asal_tk: d.asalTk || '',
        assessor: d.assessor || d.usernameAssessor,
        creator: d.assessor || d.usernameAssessor,
        creatorUsername: d.usernameAssessor || '',
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
        koordinator: d.meta && d.meta.koordinator ? d.meta.koordinator.nama : '',
        waktu_dibuat: d.waktuDibuat,
        waktu_diubah: d.waktuDiubah,
        waktu_submit: d.waktuSubmit,
        log_edit: d.logEdit || []
      },
      hasil: hasil
    };
  },

  async saveAssessment(payload) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');
    if (user.pinHarusDiganti) throw new Error('PIN_DEFAULT: Ganti PIN Anda terlebih dahulu.');

    payload = payload || {};
    const isUpdate = !!payload.id;
    if (user.role === 'KOORDINATOR_SENTRA' && !isUpdate) {
      throw new Error('Koordinator Sentra tidak dapat membuat assessment baru.');
    }
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
      } else if (snap.exists) {
        // ID dibuat di klien; dua guru dapat memilih ID berikutnya bersamaan.
        // Jangan izinkan transaksi kedua menimpa assessment yang sudah ada.
        throw new Error(`ASSESSMENT_EXISTS:${snap.id}|Peserta ini sudah memiliki assessment ${snap.id}.`);
      }

      // Deep merge per sentra dengan aturan ownership
      const incoming = payload.data || {};
      const merged = { meta, catatanSentra: {} };

      if (isUpdate) {
        Object.keys(storedData).forEach(k => {
          if (k !== 'meta' && k !== 'catatanSentra') merged[k] = storedData[k];
        });
      } else if (user.role === 'ASSESSOR') {
        // Klaim dibuat sejak draft pertama disimpan, bukan menunggu nilai
        // pertama. Guru lain pada sentra yang sama hanya dapat melanjutkan
        // setelah Koordinator Sentra memindahkan tugasnya.
        const startingSid = String(payload.active_sentra || '');
        if ((user.assignments || []).includes(startingSid) && merged.meta.sentra[startingSid]) {
          merged.meta.sentra[startingSid].owner = user.username;
          merged.meta.sentra[startingSid].ownerName = user.nama;
        }
      }

      FORM_SCHEMA.sentra.forEach(s => {
        const st = merged.meta.sentra[s.id];
        const asg = user.assignments || [];
        const assigned = asg.length === 0 || asg.includes(s.id);
        const isStaff = this.isGlobalCoordinator(user);
        const isSentraCoordinator = user.role === 'KOORDINATOR_SENTRA';
        const blockedBy = this.priorUnfinalizedSentra(user, s.id, merged.meta);
        const editable = isStaff || (!isSentraCoordinator && !blockedBy && assigned && st.status !== 'FINAL' && (!st.owner || st.owner === user.username));
        let part;

        if (editable) {
          part = sanitizeSentraPartial_(s, incoming);
          if (!isStaff && !st.owner && sentraPartHasScores_(part)) {
            st.owner = user.username;
            st.ownerName = user.nama;
          }
        } else {
          const attempted = sanitizeSentraPartial_(s, incoming);
          const storedPart = sentraPartFromData_(s, storedData);
          if (blockedBy && JSON.stringify(attempted) !== JSON.stringify(storedPart)) {
            throw new Error(`FINALIZE_FIRST:Finalisasi ${blockedBy.singkat || blockedBy.nama} terlebih dahulu sebelum mengisi ${s.singkat || s.nama}.`);
          }
          // Tab yang stale tidak boleh menimpa nilai sentra yang baru saja
          // diklaim guru lain. Payload dengan data identik tetap aman untuk
          // autosave karena tidak mengubah data yang tersimpan.
          if (JSON.stringify(attempted) !== JSON.stringify(storedPart)) {
            throw new Error(`HANDLED_BY_OTHER:Sentra ${s.nama} sudah diklaim oleh ${st.ownerName || st.owner}.`);
          }
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

    const canManage = this.canManageSentra(user, sid);
    if (!canManage && !(user.assignments || []).includes(sid)) {
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
      const blockedBy = this.priorUnfinalizedSentra(user, sid, meta);
      if (blockedBy) {
        throw new Error(`FINALIZE_FIRST:Finalisasi ${blockedBy.singkat || blockedBy.nama} terlebih dahulu.`);
      }
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

      return { ok: true, status: newStatus, meta, assessment: { data: { meta } } };
    });
  },

  async retractSentra(id, sid) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');
    if (!this.canManageSentra(user, sid)) throw new Error('Akses ditolak — khusus koordinator sentra yang ditugaskan.');

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

      return { ok: true, status: 'DRAFT', meta, assessment: { data: { meta } } };
    });
  },

  async releaseSentra(id, sid, targetUsername) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('SESSION_EXPIRED');
    if (!this.canManageSentra(user, sid)) throw new Error('Akses ditolak — khusus koordinator sentra yang ditugaskan.');

    targetUsername = String(targetUsername || '').trim().toLowerCase();
    if (!targetUsername) throw new Error('Pilih guru tujuan untuk pemindahan tugas.');
    const targetSnap = await db.collection('users').doc(targetUsername).get();
    if (!targetSnap.exists) throw new Error('Guru tujuan tidak ditemukan.');
    const target = targetSnap.data();
    if (!target.aktif || target.role !== 'ASSESSOR' || !(target.assignments || []).includes(sid)) {
      throw new Error('Guru tujuan harus merupakan assessor aktif yang ditugaskan pada sentra ini.');
    }

    const asmRef = db.collection('assessments').doc(id);
    return await db.runTransaction(async transaction => {
      const snap = await transaction.get(asmRef);
      if (!snap.exists) throw new Error('Assessment tidak ditemukan.');
      const asm = snap.data();
      if (asm.status === 'SUBMITTED') throw new Error('Assessment sudah SUBMITTED.');

      const meta = sanitizeMeta_(asm.meta);
      if (!meta.sentra[sid] || meta.sentra[sid].status === 'FINAL') {
        throw new Error('Tugas hanya dapat dipindahkan saat sentra masih berstatus DRAFT.');
      }
      meta.sentra[sid].status = 'DRAFT';
      meta.sentra[sid].owner = target.username;
      meta.sentra[sid].ownerName = target.nama;
      const log = asm.logEdit || [];
      log.unshift(`${this.nowStr()} [TRANSFER] ${sid} ke ${target.username} oleh ${user.username}`);

      transaction.update(asmRef, {
        meta,
        'data.meta': meta,
        status: 'DRAFT',
        logEdit: log,
        waktuDiubah: this.nowStr()
      });

      return { ok: true, meta, assessment: { data: { meta } } };
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

      return { ok: true, status: 'SUBMITTED', assessment: { data: { meta } }, hasil: { nilaiAkhir: asm.nilaiAkhir, calistung: asm.calistung, kode: asm.kode, kodeLabel: asm.kodeLabel, sentra: asm.rerata || {} } };
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
    if (!user || (!this.isGlobalCoordinator(user) && user.role !== 'KOORDINATOR_SENTRA')) {
      throw new Error('Akses ditolak — khusus Koordinator / Admin.');
    }

    const [pesertaSnap, asmSnap] = await Promise.all([
      db.collection('peserta').get(),
      db.collection('assessments').get()
    ]);

    const totalPeserta = pesertaSnap.size;
    const asmList = [];
    asmSnap.forEach(d => {
      const assessment = d.data();
      if (this.isGlobalCoordinator(user) || (user.assignments || []).length && (user.assignments || []).some(sid => FORM_SCHEMA.sentra.some(s => s.id === sid))) asmList.push(assessment);
    });

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

    // Build readyList (SIAP_REVIEW), draftList (DRAFT), recent (all sorted)
    const readyList = [];
    const draftList = [];
    const recent = [];

    asmList.forEach(a => {
      const entry = {
        id: a.id,
        nama: a.namaPeserta || a.nama_peserta || '',
        nomor: a.nomorPeserta || a.nomor_peserta || '',
        creator: a.assessor || a.usernameAssessor || '',
        tanggal: a.tanggal || '',
        status: a.status,
        kode: a.kode || null,
        waktu_diubah: a.waktuDiubah || ''
      };
      if (a.status === 'SIAP_REVIEW') {
        readyList.push(entry);
      }
      if (a.status === 'DRAFT') {
        const sentraStatus = {};
        const meta = a.meta || {};
        const sentras = meta.sentra || {};
        FORM_SCHEMA.sentra.forEach(s => {
          sentraStatus[s.id] = sentras[s.id] ? sentras[s.id].status : 'DRAFT';
        });
        draftList.push({ ...entry, sentraStatus });
      }
      recent.push(entry);
    });

    // Sort recent by waktu_diubah desc, cap at 10
    recent.sort((a, b) => String(b.waktu_diubah).localeCompare(String(a.waktu_diubah)));
    const recentCapped = recent.slice(0, 10);

    // Build pendingBySentra as object keyed by sentra id
    const pendingBySentra = {};
    FORM_SCHEMA.sentra.forEach(s => {
      pendingBySentra[s.id] = {
        count: pendingSentra[s.id] || 0,
        assessor: s.singkat || s.nama
      };
    });

    // Calculate average nilai_akhir for SUBMITTED
    const submittedValues = asmList
      .filter(a => a.status === 'SUBMITTED' && a.nilaiAkhir != null)
      .map(a => a.nilaiAkhir);
    const rerata = submittedValues.length
      ? Math.round(submittedValues.reduce((a, b) => a + b, 0) / submittedValues.length * 10) / 10
      : null;

    return {
      ok: true,
      dashboard: {
        // Fields for stat cards
        peserta: totalPeserta,
        draft: countStatus.DRAFT,
        siapReview: countStatus.SIAP_REVIEW,
        submitted: countStatus.SUBMITTED,
        // Kode distribution
        kodeCount: countKode,
        // Pending by sentra as object
        pendingBySentra,
        // Lists for dashboard cards
        readyList,
        draftList,
        recent: recentCapped,
        // Average
        rerata,
        // Legacy fields (backwards compat)
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
    if (!['ADMIN', 'KOORDINATOR', 'KOORDINATOR_SENTRA', 'ASSESSOR'].includes(role)) throw new Error('Peran tidak valid.');

    const uRef = db.collection('users').doc(username);
    const snap = await uRef.get();
    const isNew = !snap.exists;
    const now = this.nowStr();

    let assignments = Array.isArray(payload.assignments) ? payload.assignments : [];
    if (role !== 'ASSESSOR' && role !== 'KOORDINATOR_SENTRA') assignments = [];
    if ((role === 'ASSESSOR' || role === 'KOORDINATOR_SENTRA') && !assignments.length) throw new Error('Penugasan minimal satu sentra diperlukan untuk peran ini.');

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

  async importUsers(list) {
    const caller = this.getCurrentUser();
    if (!caller || caller.role !== 'ADMIN') throw new Error('Akses ditolak — khusus Admin.');
    if (!Array.isArray(list) || !list.length) throw new Error('Data pengguna kosong.');

    const now = this.nowStr();
    let imported = 0;

    for (const item of list) {
      const username = clampStr_(item.username, 30).toLowerCase();
      const nama = clampStr_(item.nama, 80);
      let role = String(item.role || 'ASSESSOR').toUpperCase();
      if (!['ADMIN', 'KOORDINATOR', 'KOORDINATOR_SENTRA', 'ASSESSOR'].includes(role)) role = 'ASSESSOR';
      const pin = String(item.pin || '1234').trim();

      if (!username || !nama) continue;

      let assignments = [];
      if (role === 'ASSESSOR' || role === 'KOORDINATOR_SENTRA') {
        if (Array.isArray(item.assignments)) {
          assignments = item.assignments;
        } else if (typeof item.assignments === 'string') {
          assignments = item.assignments.split(/[;,]/).map(s => s.trim().toLowerCase()).filter(Boolean);
        }
      }

      const pinHash = await this.hashPin(username, pin);
      const uRef = db.collection('users').doc(username);
      const uSnap = await uRef.get();

      if (!uSnap.exists) {
        await uRef.set({
          username,
          nama,
          role,
          assignments,
          pinHash,
          aktif: true,
          pinHarusDiganti: true,
          dibuat: now,
          diubah: now
        });
      } else {
        await uRef.update({
          nama,
          role,
          assignments,
          diubah: now
        });
      }
      imported++;
    }

    await this.audit(caller, 'USER_IMPORT', `${imported} Pengguna`, 'Import massal');
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
 * Jembatan API Window — Eksekusi layanan Firebase
 *************************************************************/
window.FirebaseAPI = {
  call(fn, ...args) {
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
  }
};
