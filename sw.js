const CACHE = 'daily-planner-v1';
const ASSETS = ['/', '/index.html', '/manifest.json'];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// ── Fetch (offline-first) ────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// ── Notification click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length) return list[0].focus();
      return clients.openWindow('/');
    })
  );
});

// ── Message from main thread (schedule check) ────────────────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SCHEDULE_CHECK') {
    checkAndNotify(e.data.payload);
  }
});

function checkAndNotify({ tasks, recurringTemplates, now }) {
  const date = new Date(now);
  const h = date.getHours();
  const m = date.getMinutes();

  // 7:30am morning briefing
  if (h === 7 && m >= 30 && m < 35) {
    const items = buildMorningList(tasks, recurringTemplates, date);
    if (items.length) {
      self.registration.showNotification('Good morning! Here\'s your day 🌅', {
        body: items.slice(0, 5).map((t, i) => `${i + 1}. ${t}`).join('\n'),
        icon: '/icon-192.png',
        badge: '/icon-96.png',
        tag: 'morning-brief',
        renotify: false,
        requireInteraction: false,
        data: { type: 'morning' }
      });
    }
  }

  // 5:00pm wind-down reminder
  if (h === 17 && m >= 0 && m < 5) {
    const open = tasks.filter(t => !t.completed);
    const recOpen = (recurringTemplates || []).filter(r => {
      const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][date.getDay()];
      const dueToday = r.schedule.type === 'daily' ||
        (r.schedule.type === 'weekly' && r.schedule.days.includes(dayName)) ||
        (r.schedule.type === 'monthly' && date.getDate() === r.schedule.dayOfMonth);
      const doneToday = r.lastCompleted && r.lastCompleted.slice(0, 10) === date.toISOString().slice(0, 10);
      return dueToday && !doneToday;
    });

    const remaining = [...open.map(t => t.title), ...recOpen.map(r => '🔁 ' + r.title)];

    if (remaining.length) {
      self.registration.showNotification(`${remaining.length} task${remaining.length > 1 ? 's' : ''} still open — you\'ve got this 💪`, {
        body: remaining.slice(0, 5).map((t, i) => `${i + 1}. ${t}`).join('\n'),
        icon: '/icon-192.png',
        badge: '/icon-96.png',
        tag: 'evening-reminder',
        renotify: false,
        requireInteraction: false,
        data: { type: 'evening' }
      });
    } else {
      self.registration.showNotification('All done for today! Great work 🎉', {
        body: 'Your task list is clear. Enjoy your evening!',
        icon: '/icon-192.png',
        badge: '/icon-96.png',
        tag: 'evening-reminder',
        data: { type: 'evening' }
      });
    }
  }
}

function buildMorningList(tasks, recurringTemplates, date) {
  const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][date.getDay()];
  const dayDate = date.toISOString().slice(0, 10);

  const recToday = (recurringTemplates || [])
    .filter(r =>
      r.schedule.type === 'daily' ||
      (r.schedule.type === 'weekly' && r.schedule.days.includes(dayName)) ||
      (r.schedule.type === 'monthly' && date.getDate() === r.schedule.dayOfMonth)
    )
    .map(r => '🔁 ' + r.title);

  const w = { high: 3, medium: 2, low: 1 };
  const oneOff = (tasks || [])
    .filter(t => !t.completed)
    .sort((a, b) => {
      const days = d => (Date.now() - new Date(d.added).getTime()) / 86400000;
      return ((w[b.priority] || 1) + days(b) * 0.1) - ((w[a.priority] || 1) + days(a) * 0.1);
    })
    .map(t => t.title);

  return [...recToday, ...oneOff];
}
