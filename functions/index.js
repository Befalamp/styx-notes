// Daily due-date reminders for Styx Notes.
//
// Runs at 8am UK time. For each person, finds notes due today or overdue
// that haven't been reminded about for that due date, and sends one push
// notification to each of their registered devices (stored by the app in
// the "pushTokens" collection). Deploy with: firebase deploy --only functions
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

// Must match where the app is hosted, so tapping a reminder opens it.
const APP_URL = "https://befalamp.github.io/styx-notes/index.html";

exports.sendDueReminders = onSchedule(
  { schedule: "0 8 * * *", timeZone: "Europe/London", region: "europe-west2" },
  async () => {
    const db = getFirestore();
    // Due dates are stored as YYYY-MM-DD; en-CA formats dates that way.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

    const dueSnap = await db.collection("notes").where("due", "<=", today).get();
    const byOwner = new Map();
    dueSnap.forEach((d) => {
      const n = d.data();
      if (!n.owner || !n.due || n.trashed || n.archived || n.remindedFor === n.due) return;
      if (!byOwner.has(n.owner)) byOwner.set(n.owner, []);
      byOwner.get(n.owner).push({ ref: d.ref, title: n.title || "Untitled note", due: n.due });
    });

    for (const [owner, due] of byOwner) {
      const tokenSnap = await db.collection("pushTokens").where("owner", "==", owner).get();
      const tokens = tokenSnap.docs.map((d) => d.id);
      if (!tokens.length) continue;

      const overdue = due.filter((n) => n.due < today).length;
      const title = due.length === 1
        ? (overdue ? "Overdue note" : "Note due today")
        : `${due.length} notes due${overdue ? ` (${overdue} overdue)` : " today"}`;
      const body = due.slice(0, 4).map((n) => n.title).join(", ") + (due.length > 4 ? `, and ${due.length - 4} more` : "");

      const res = await getMessaging().sendEachForMulticast({
        tokens,
        data: { title, body, tag: `styx-due-${today}`, url: APP_URL },
        webpush: { headers: { Urgency: "high", TTL: String(12 * 60 * 60) } },
      });

      // Forget devices that have uninstalled the app or revoked permission.
      const dead = [];
      res.responses.forEach((r, i) => {
        const code = r.error && r.error.code;
        if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
          dead.push(tokens[i]);
        }
      });
      await Promise.all(dead.map((t) => db.collection("pushTokens").doc(t).delete()));

      if (res.successCount > 0) {
        const batch = db.batch();
        due.forEach((n) => batch.update(n.ref, { remindedFor: n.due }));
        await batch.commit();
      }
      logger.info(`Reminded ${owner}: ${due.length} note(s), ${res.successCount}/${tokens.length} device(s)`);
    }
  }
);
