// Speaks reminders when their time comes. Nion can only speak while its page is open and
// turned on, so that is the honest limit of a reminder here: it is spoken the moment it is
// due if Nion is open and idle, and a reminder that came due while Nion was closed is spoken
// the next time it is opened, with the time it was for.
//
// Everything it needs from the page is passed in, so it can be tested without a browser.

import { clockTime, isTimeZone } from "../../shared/time.js";

const CHECK_EVERY_MS = 5000; // how often to look for a reminder that is due
const LATE_AFTER_MS = 3 * 60 * 1000; // past this, it is "a reminder from earlier", not "a reminder now"

const tidy = (text) => text.replace(/[.!\s]+$/, "");

/**
 * deps:
 *   loadData, applyChanges  the notebook (see data.js)
 *   canSpeak()              true only when Nion is on and idle: not listening, thinking or talking
 *   announce(text)          says it aloud (and keeps it in the conversation)
 *   timeZone                the person's time zone, for saying the time it was for
 *   now()                   the current time in milliseconds (swapped in tests)
 */
export function createReminderScheduler({ loadData, applyChanges, canSpeak, announce, timeZone, now = () => Date.now() }) {
  const zone = isTimeZone(timeZone) ? timeZone : "UTC";
  let timer = null;

  /** Speaks whatever is due, if Nion is free to speak. Returns true if it spoke. */
  function check() {
    if (!canSpeak()) return false; // try again shortly
    const due = loadData()
      .reminders.filter((r) => !r.done && Date.parse(r.dueAt) <= now())
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
    if (due.length === 0) return false;

    // Mark them spoken first, so the same reminder can never be said twice.
    applyChanges(due.map((r) => ({ op: "complete_reminder", id: r.id })));

    const wording = (r) => (now() - Date.parse(r.dueAt) > LATE_AFTER_MS ? `${tidy(r.text)}, which was for ${clockTime(Date.parse(r.dueAt), zone)}` : tidy(r.text));
    const anyLate = due.some((r) => now() - Date.parse(r.dueAt) > LATE_AFTER_MS);
    const text =
      due.length === 1
        ? `${anyLate ? "You had a reminder" : "Reminder"}: ${wording(due[0])}.`
        : `${anyLate ? "You had reminders" : "Reminders"}: ${due.map((r) => wording(r)).join(". Also: ")}.`;
    announce(text);
    return true;
  }

  function schedule() {
    timer = setTimeout(() => {
      try {
        check();
      } finally {
        schedule();
      }
    }, CHECK_EVERY_MS);
    timer?.unref?.(); // in tests, never keep the program alive for this
  }

  return {
    check,
    /** Start looking every few seconds. */
    start() {
      if (timer === null) schedule();
    },
    stop() {
      clearTimeout(timer);
      timer = null;
    },
    CHECK_EVERY_MS,
  };
}
