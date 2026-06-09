// notifications.js
// FCM Push Notification helper

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";
import { getFirestore, doc, updateDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBn3uC3F6QsfNNzRTaCPfBVHu8_BlLYNy8",
  authDomain: "pharmacy-6d661.firebaseapp.com",
  projectId: "pharmacy-6d661",
  storageBucket: "pharmacy-6d661.firebasestorage.app",
  messagingSenderId: "601956352826",
  appId: "1:601956352826:web:a639bd54f58383c33d8603"
};

const VAPID_KEY = "BIIJjbDOj1yBIqKuN2Rm82rRbk3zuw95T0u-EZYDds-PdsujB1CbmqsXacyRHHrMZ-I5QcK1ual2CrjNjMJ36mU";

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

let messaging = null;

// ── INIT MESSAGING ──
export async function initNotifications(userId) {
  try {
    // Check browser support
    if(!('Notification' in window)) {
      console.log('Browser does not support notifications');
      return false;
    }

    // Register service worker
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    console.log('Service Worker registered:', registration);

    messaging = getMessaging(app);

    // Request permission
    const permission = await Notification.requestPermission();
    if(permission !== 'granted') {
      console.log('Notification permission denied');
      return false;
    }

    // Get FCM token
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if(token) {
      console.log('FCM Token:', token);
      // Save token to Firestore
      await saveToken(userId, token);
      return token;
    }

    return false;
  } catch(error) {
    console.error('FCM init error:', error);
    return false;
  }
}

// ── SAVE TOKEN TO FIRESTORE ──
async function saveToken(userId, token) {
  try {
    await updateDoc(doc(db, 'users', userId), {
      fcmToken: token,
      fcmUpdatedAt: serverTimestamp()
    });
  } catch(e) {
    console.error('Save token error:', e);
  }
}

// ── FOREGROUND MESSAGE HANDLER ──
export function onForegroundMessage(callback) {
  if(!messaging) return;
  onMessage(messaging, (payload) => {
    console.log('Foreground message:', payload);
    callback(payload);

    // Show in-app notification
    showInAppNotification(
      payload.notification?.title || 'Sondhan Pharmacy',
      payload.notification?.body || '',
      payload.data
    );
  });
}

// ── IN-APP NOTIFICATION BANNER ──
function showInAppNotification(title, body, data = {}) {
  // Remove existing
  document.getElementById('fcm-toast')?.remove();

  const toast = document.createElement('div');
  toast.id = 'fcm-toast';
  toast.style.cssText = `
    position:fixed;top:16px;left:50%;transform:translateX(-50%);
    background:#1a2e28;color:#fff;
    border-radius:16px;padding:14px 18px;
    max-width:360px;width:calc(100% - 32px);
    z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.3);
    display:flex;align-items:center;gap:12px;
    animation:slideDown 0.3s ease;
  `;

  const icon = data?.type === 'new_order' ? '🔔' :
               data?.type === 'order_update' ? '📦' : '💊';

  toast.innerHTML = `
    <div style="font-size:24px">${icon}</div>
    <div style="flex:1">
      <div style="font-size:13px;font-weight:700;margin-bottom:2px">${title}</div>
      <div style="font-size:11px;opacity:0.85">${body}</div>
    </div>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;opacity:0.7">✕</button>
  `;

  // Add animation style if not exists
  if(!document.getElementById('toast-style')) {
    const style = document.createElement('style');
    style.id = 'toast-style';
    style.textContent = `
      @keyframes slideDown {
        from { opacity:0; transform:translateX(-50%) translateY(-20px); }
        to { opacity:1; transform:translateX(-50%) translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);

  // Auto remove after 5 seconds
  setTimeout(() => toast.remove(), 5000);
}

// ── SEND NOTIFICATION (via Firestore trigger) ──
// Note: Real FCM send requires server/Cloud Functions
// এখন Firestore এ notification document create করলে
// Cloud Function পরে send করবে
export async function sendNotificationViaFirestore(targetUserId, data) {
  try {
    await addDoc(collection(db, 'notifications'), {
      targetUserId,
      title: data.title,
      body: data.body,
      type: data.type,
      orderId: data.orderId || null,
      sent: false,
      createdAt: serverTimestamp()
    });
  } catch(e) {
    console.error('Send notification error:', e);
  }
}

// ── PHARMACY NEW ORDER NOTIFICATION ──
export async function notifyPharmacyNewOrder(pharmacyId, order) {
  await sendNotificationViaFirestore(pharmacyId, {
    title: '🔔 নতুন অর্ডার!',
    body: `${order.items?.map(i=>`${i.name} × ${i.qty}`).join(', ')} — ৳${order.total}`,
    type: 'new_order',
    orderId: order.id
  });
}

// ── USER ORDER UPDATE NOTIFICATION ──
export async function notifyUserOrderUpdate(userId, status, orderId) {
  const messages = {
    'confirmed': '✅ আপনার অর্ডার নিশ্চিত হয়েছে!',
    'preparing': '⏳ ফার্মেসি আপনার ওষুধ প্রস্তুত করছে',
    'picked': '🛵 রাইডার আপনার ওষুধ নিয়ে আসছে',
    'delivered': '🎉 আপনার ওষুধ পৌঁছে গেছে!'
  };

  await sendNotificationViaFirestore(userId, {
    title: 'Sondhan Pharmacy',
    body: messages[status] || 'অর্ডার আপডেট',
    type: 'order_update',
    orderId
  });
}