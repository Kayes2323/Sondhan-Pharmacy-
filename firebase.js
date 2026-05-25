// ── Sondhan Pharmacy — Firebase Core ──
// firebase.js — সব page এ এই file টা include করতে হবে

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, RecaptchaVerifier, signInWithPhoneNumber } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, updateDoc, onSnapshot, query, where, orderBy, serverTimestamp, GeoPoint } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── CONFIG ──
const firebaseConfig = {
  apiKey: "AIzaSyBn3uC3F6QsfNNzRTaCPfBVHu8_BlLYNy8",
  authDomain: "pharmacy-6d661.firebaseapp.com",
  projectId: "pharmacy-6d661",
  storageBucket: "pharmacy-6d661.firebasestorage.app",
  messagingSenderId: "601956352826",
  appId: "1:601956352826:web:a639bd54f58383c33d8603",
  measurementId: "G-2EMPT770S0"
};

// ── INIT ──
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// ── ADMIN EMAIL ──
const ADMIN_EMAIL = 'akayes99@gmail.com';

// ════════════════════════════════════════
// AUTH FUNCTIONS
// ════════════════════════════════════════

// Google Login
async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Admin check
    if (user.email === ADMIN_EMAIL) {
      await saveUserToFirestore(user, 'admin');
      return { success: true, role: 'admin', user };
    }

    // Check if pharmacy
    const pharmacyDoc = await getDoc(doc(db, 'pharmacies', user.uid));
    if (pharmacyDoc.exists()) {
      const status = pharmacyDoc.data().status;
      return { success: true, role: 'pharmacy', status, user };
    }

    // Regular user
    await saveUserToFirestore(user, 'user');
    return { success: true, role: 'user', user };

  } catch (error) {
    console.error('Google login error:', error);
    return { success: false, error: error.message };
  }
}

// Phone OTP — Step 1: Send OTP
function setupRecaptcha(buttonId) {
  window.recaptchaVerifier = new RecaptchaVerifier(auth, buttonId, {
    size: 'invisible',
    callback: () => {}
  });
}

async function sendOTP(phoneNumber) {
  try {
    // BD format: +880XXXXXXXXXX
    const formattedPhone = phoneNumber.startsWith('+880')
      ? phoneNumber
      : '+880' + phoneNumber.replace(/^0/, '');

    const confirmationResult = await signInWithPhoneNumber(
      auth, formattedPhone, window.recaptchaVerifier
    );
    window.confirmationResult = confirmationResult;
    return { success: true };
  } catch (error) {
    console.error('OTP send error:', error);
    return { success: false, error: error.message };
  }
}

// Phone OTP — Step 2: Verify OTP
async function verifyOTP(otp) {
  try {
    const result = await window.confirmationResult.confirm(otp);
    const user = result.user;

    // Check existing role
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      return { success: true, role: userDoc.data().role, user };
    }

    // New user
    await saveUserToFirestore(user, 'user');
    return { success: true, role: 'user', user };

  } catch (error) {
    console.error('OTP verify error:', error);
    return { success: false, error: 'OTP ভুল হয়েছে। আবার চেষ্টা করুন।' };
  }
}

// Logout
async function logoutUser() {
  await signOut(auth);
  localStorage.clear();
  window.location.href = 'login.html';
}

// Auth state listener
function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ════════════════════════════════════════
// FIRESTORE — USER
// ════════════════════════════════════════

async function saveUserToFirestore(user, role) {
  const userData = {
    uid: user.uid,
    name: user.displayName || '',
    email: user.email || '',
    phone: user.phoneNumber || '',
    photoURL: user.photoURL || '',
    role: role,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await setDoc(doc(db, 'users', user.uid), userData, { merge: true });
}

async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

async function updateUserProfile(uid, data) {
  await updateDoc(doc(db, 'users', uid), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

// ════════════════════════════════════════
// FIRESTORE — PHARMACY
// ════════════════════════════════════════

async function registerPharmacy(uid, data) {
  const pharmacyData = {
    uid,
    name: data.name,
    address: data.address,
    area: data.area || '',
    tradeLicense: data.tradeLicense,
    ownerName: data.ownerName,
    phone: data.phone || '',
    status: 'pending', // pending → approved → rejected
    isOpen: false,
    rating: 0,
    totalOrders: 0,
    location: new GeoPoint(23.8103, 90.4125), // default Dhaka
    deliveryAreas: [],
    createdAt: serverTimestamp()
  };
  await setDoc(doc(db, 'pharmacies', uid), pharmacyData);
  return pharmacyData;
}

async function getPharmacyProfile(uid) {
  const snap = await getDoc(doc(db, 'pharmacies', uid));
  return snap.exists() ? snap.data() : null;
}

async function updatePharmacyStatus(uid, isOpen) {
  await updateDoc(doc(db, 'pharmacies', uid), {
    isOpen,
    updatedAt: serverTimestamp()
  });
}

// Nearby pharmacies (simple version — geo filter পরে add হবে)
async function getNearbyPharmacies() {
  const q = query(
    collection(db, 'pharmacies'),
    where('status', '==', 'approved'),
    where('isOpen', '==', true)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ════════════════════════════════════════
// FIRESTORE — ORDERS
// ════════════════════════════════════════

async function createOrder(orderData) {
  const order = {
    userId: orderData.userId,
    userName: orderData.userName,
    userPhone: orderData.userPhone,
    deliveryAddress: orderData.deliveryAddress,
    items: orderData.items,        // [{medicineId, name, qty, price}]
    subtotal: orderData.subtotal,
    deliveryCharge: orderData.deliveryCharge || 30,
    discount: orderData.discount || 0,
    total: orderData.total,
    paymentMethod: orderData.paymentMethod, // bkash/nagad/cod
    paymentStatus: 'pending',
    status: 'searching',           // searching → confirmed → preparing → picked → delivered
    pharmacyId: null,              // dispatch engine assign করবে
    riderId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  const docRef = await addDoc(collection(db, 'orders'), order);
  return { id: docRef.id, ...order };
}

async function updateOrderStatus(orderId, status, extra = {}) {
  await updateDoc(doc(db, 'orders', orderId), {
    status,
    ...extra,
    updatedAt: serverTimestamp()
  });
}

// Real-time order tracking
function listenToOrder(orderId, callback) {
  return onSnapshot(doc(db, 'orders', orderId), (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() });
  });
}

// Pharmacy এর pending orders listen
function listenToPharmacyOrders(pharmacyId, callback) {
  const q = query(
    collection(db, 'orders'),
    where('pharmacyId', '==', pharmacyId),
    where('status', 'in', ['confirmed', 'preparing', 'picked']),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(orders);
  });
}

// New incoming orders listen (dispatch engine)
function listenToNewOrders(callback) {
  const q = query(
    collection(db, 'orders'),
    where('status', '==', 'searching'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(orders);
  });
}

// ════════════════════════════════════════
// FIRESTORE — MEDICINES
// ════════════════════════════════════════

async function searchMedicines(query_) {
  // Simple name search — পরে Algolia add করব full-text search এর জন্য
  const q = query(
    collection(db, 'medicines'),
    where('nameLower', '>=', query_.toLowerCase()),
    where('nameLower', '<=', query_.toLowerCase() + '\uf8ff')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ════════════════════════════════════════
// DISPATCH ENGINE
// ════════════════════════════════════════

async function dispatchOrder(orderId, userLocation) {
  // Step 1: Get all open pharmacies
  const pharmacies = await getNearbyPharmacies();

  // Step 2: Sort by distance (simple calculation)
  const sorted = pharmacies.sort((a, b) => {
    const distA = getDistance(userLocation, a.location);
    const distB = getDistance(userLocation, b.location);
    return distA - distB;
  });

  // Step 3: Assign to nearest
  if (sorted.length > 0) {
    await updateOrderStatus(orderId, 'confirmed', {
      pharmacyId: sorted[0].uid
    });
    return sorted[0];
  }
  return null;
}

// Simple distance calculation (km)
function getDistance(loc1, loc2) {
  const R = 6371;
  const dLat = (loc2.latitude - loc1.lat) * Math.PI / 180;
  const dLon = (loc2.longitude - loc1.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(loc1.lat * Math.PI/180) * Math.cos(loc2.latitude * Math.PI/180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ════════════════════════════════════════
// EXPORT — সব function export করা
// ════════════════════════════════════════
export {
  auth, db,
  // Auth
  loginWithGoogle, sendOTP, verifyOTP, logoutUser, onAuthChange, setupRecaptcha,
  // User
  saveUserToFirestore, getUserProfile, updateUserProfile,
  // Pharmacy
  registerPharmacy, getPharmacyProfile, updatePharmacyStatus, getNearbyPharmacies,
  // Orders
  createOrder, updateOrderStatus, listenToOrder, listenToPharmacyOrders, listenToNewOrders,
  // Medicines
  searchMedicines,
  // Dispatch
  dispatchOrder,
  // Constants
  ADMIN_EMAIL
};