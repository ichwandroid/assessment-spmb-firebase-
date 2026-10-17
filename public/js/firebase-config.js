/*************************************************************
 * firebase-config.js — Inisialisasi Firebase & Firestore
 *************************************************************/

const firebaseConfig = {
  apiKey: "AIzaSyAo4Vt_tPSmayzrFbcZAiehOqjfPpBDOek",
  authDomain: "assessment-spmb.firebaseapp.com",
  projectId: "assessment-spmb",
  storageBucket: "assessment-spmb.firebasestorage.app",
  messagingSenderId: "967596817283",
  appId: "1:967596817283:web:5d2adb9bf581f4e32e94b6"
};

// Inisialisasi Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const auth = firebase.auth();

// Enable offline persistence if available
db.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
  if (err.code === 'failed-precondition') {
    console.warn('Multiple tabs open, persistence enabled only in first tab.');
  } else if (err.code === 'unimplemented') {
    console.warn('Browser does not support offline persistence.');
  }
});

