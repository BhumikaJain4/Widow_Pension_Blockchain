// ============================================================
//  Validator Notification Service
//  Uses the Web Notifications API (browser push).
//  Monitors the blockchain for:
//    1. New application submitted  → "New application #N — cast your vote"
//    2. Application approaching SLA deadline (≤10 days left, still VOTING,
//       and the validator hasn't voted yet)  → "Urgent: App #N needs your vote"
// ============================================================

const STORAGE_KEY_NOTIFIED_NEW    = 'notified_new_apps';
const STORAGE_KEY_NOTIFIED_URGENT = 'notified_urgent_apps';
const POLL_INTERVAL_MS            = 30_000; // 30 seconds

let pollTimer = null;

// ── Permission ───────────────────────────────────────────────
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function notificationsSupported() {
  return 'Notification' in window;
}

export function notificationsEnabled() {
  return notificationsSupported() && Notification.permission === 'granted';
}

// ── Low-level notifier ───────────────────────────────────────
function sendNotification(title, body, options = {}) {
  if (!notificationsEnabled()) return;
  try {
    const n = new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      requireInteraction: true,
      tag: options.tag || title,
      ...options,
    });
    // Auto-close after 12 seconds if not dismissed
    setTimeout(() => n.close(), 12_000);
    return n;
  } catch (e) {
    console.warn('Notification failed:', e);
  }
}

// ── Persistent set helpers (localStorage) ────────────────────
function getNotifiedSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
  catch { return new Set(); }
}
function saveNotifiedSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch {}
}

// ── Main monitoring function ─────────────────────────────────
async function checkAndNotify(contracts, validatorAddress) {
  if (!contracts || !validatorAddress) return;
  if (!notificationsEnabled()) return;

  try {
    const total      = await contracts.registry.totalApplications();
    const totalNum   = Number(total);
    if (totalNum === 0) return;

    const notifiedNew    = getNotifiedSet(STORAGE_KEY_NOTIFIED_NEW);
    const notifiedUrgent = getNotifiedSet(STORAGE_KEY_NOTIFIED_URGENT);
    const nowSec         = Math.floor(Date.now() / 1000);

    for (let i = 1; i <= totalNum; i++) {
      const idStr = i.toString();

      let app;
      try { app = await contracts.registry.getApplication(i); }
      catch { continue; }

      const state = Number(app.state);

      // ── Notification 1: New application arrived (state = SUBMITTED or VOTING) ──
      // Fires once per application per browser session.
      if ((state === 1 || state === 2) && !notifiedNew.has(idStr)) {
        const submittedAgo = nowSec - Number(app.submittedAt);
        // Only notify for apps submitted in the last 24 hours to avoid spam on first load
        if (submittedAgo < 86_400) {
          sendNotification(
            'New Application Arrived',
            `Application #${i} has been submitted. Please open the Validator Dashboard to review and cast your vote.`,
            { tag: `new-app-${i}` }
          );
        }
        notifiedNew.add(idStr);
      }

      // ── Notification 2: Urgent — 10 or fewer days to SLA deadline ──
      // Only fires if:
      //   - App is in VOTING state
      //   - Validator has NOT yet voted
      //   - SLA deadline is ≤10 days away
      //   - We haven't already sent this urgent notification for this app
      if (state === 2 && !notifiedUrgent.has(idStr)) {
        let schemeMaxDays = 30; // fallback
        try {
          const scheme  = await contracts.scheme.getScheme(app.schemeId);
          schemeMaxDays = Number(scheme.maxProcessingDays);
        } catch {}

        const deadlineSec   = Number(app.submittedAt) + schemeMaxDays * 86_400;
        const daysLeft      = Math.floor((deadlineSec - nowSec) / 86_400);
        const alreadyVoted  = await contracts.registry.hasVoted(i, validatorAddress).catch(() => false);

        if (!alreadyVoted && daysLeft <= 10 && daysLeft >= 0) {
          sendNotification(
            `Urgent: Application #${i} Needs Your Vote`,
            `Only ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left to reach a decision on Application #${i}. Please cast your vote now.`,
            { tag: `urgent-${i}`, requireInteraction: true }
          );
          notifiedUrgent.add(idStr);
        }

        // Also notify if already past SLA
        if (!alreadyVoted && daysLeft < 0 && !notifiedUrgent.has(`overdue-${idStr}`)) {
          sendNotification(
            `OVERDUE: Application #${i} is Past SLA`,
            `Application #${i} exceeded its SLA by ${Math.abs(daysLeft)} day(s). Your vote is urgently needed.`,
            { tag: `overdue-${i}`, requireInteraction: true }
          );
          notifiedUrgent.add(`overdue-${idStr}`);
        }
      }
    }

    saveNotifiedSet(STORAGE_KEY_NOTIFIED_NEW,    notifiedNew);
    saveNotifiedSet(STORAGE_KEY_NOTIFIED_URGENT, notifiedUrgent);

  } catch (err) {
    console.warn('[NotificationService] Poll error:', err.message);
  }
}

// ── Start / Stop service ─────────────────────────────────────
export function startNotificationService(contracts, validatorAddress) {
  stopNotificationService();
  if (!notificationsEnabled()) return;
  // First check immediately, then poll
  checkAndNotify(contracts, validatorAddress);
  pollTimer = setInterval(() => checkAndNotify(contracts, validatorAddress), POLL_INTERVAL_MS);
  console.log('[NotificationService] Started — polling every', POLL_INTERVAL_MS / 1000, 's');
}

export function stopNotificationService() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ── Manual test notification ─────────────────────────────────
export function sendTestNotification() {
  sendNotification(
    'Notifications Active',
    'You will receive alerts for new applications and urgent SLA deadlines.',
    { tag: 'test' }
  );
}
