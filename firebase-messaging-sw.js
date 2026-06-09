// firebase-messaging-sw.js
// Service Worker for FCM Push Notifications

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBn3uC3F6QsfNNzRTaCPfBVHu8_BlLYNy8",
  authDomain: "pharmacy-6d661.firebaseapp.com",
  projectId: "pharmacy-6d661",
  storageBucket: "pharmacy-6d661.firebasestorage.app",
  messagingSenderId: "601956352826",
  appId: "1:601956352826:web:a639bd54f58383c33d8603"
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage((payload) => {
  console.log('Background message:', payload);

  const { title, body, icon } = payload.notification || {};
  const data = payload.data || {};

  self.registration.showNotification(title || 'Sondhan Pharmacy', {
    body: body || 'নতুন বার্তা',
    icon: icon || '/icon.png',
    badge: '/badge.png',
    tag: data.orderId || 'sondhan',
    data: data,
    actions: data.type === 'new_order' ? [
      { action: 'accept', title: '✅ Accept' },
      { action: 'reject', title: '❌ Reject' }
    ] : [
      { action: 'view', title: '👁 দেখুন' }
    ],
    vibrate: [200, 100, 200],
    requireInteraction: data.type === 'new_order'
  });
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  let url = '/';
  if(data.type === 'new_order') url = '/dashboard.html';
  else if(data.type === 'order_update') url = '/index.html';
  else if(data.type === 'payment') url = '/dashboard.html';

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      for(const client of windowClients) {
        if(client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      if(clients.openWindow) return clients.openWindow(url);
    })
  );
});