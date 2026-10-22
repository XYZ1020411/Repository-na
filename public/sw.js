self.addEventListener('message', (event) => {
  const payload = event.data || {};
  const { type, title, body } = payload;

  if (type === 'NOTIFY' && title) {
    self.registration.showNotification(title, {
      body: body || 'HolidayPredictor 已更新',
      icon: '/favicon.svg',
      tag: 'holiday-predictor-background' ,
    });
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          return;
        }
      }

      return clients.openWindow('/');
    })
  );
});

