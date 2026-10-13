// Keeps the screen on while Nion is on. Nion only hears you while its page is open
// and the screen is awake, so a phone that dims and locks after 30 seconds would
// silently stop listening. This asks the browser (the Screen Wake Lock feature) to
// keep the screen awake. It is NOT background listening: if the person switches to
// another app or locks the phone, the browser pauses Nion, and this lets go.
//
// Not every browser has the feature, and it can refuse (for example on low battery),
// so a failure is never an error: Nion just works as it did before.

export function createWakeLock({ nav = globalThis.navigator, doc = globalThis.document } = {}) {
  let wanted = false; // should the screen be kept on?
  let sentinel = null; // what the browser gave us while we hold it

  async function acquire() {
    if (!wanted || sentinel || !nav?.wakeLock || doc?.visibilityState === "hidden") return;
    try {
      const lock = await nav.wakeLock.request("screen");
      if (!wanted) return void lock.release().catch(() => {}); // turned off while we were asking
      sentinel = lock;
      // The browser can take it back (switching apps, low battery). Remember that, so
      // we ask again when the page is back in front.
      lock.addEventListener?.("release", () => {
        if (sentinel === lock) sentinel = null;
      });
    } catch {
      // Refused or not allowed here. Nothing to do.
    }
  }

  doc?.addEventListener?.("visibilitychange", () => {
    if (doc.visibilityState === "visible") acquire();
  });

  return {
    supported: Boolean(nav?.wakeLock),
    /** Keep the screen on from now until disable(). */
    enable() {
      wanted = true;
      return acquire();
    },
    /** Let the screen sleep again. */
    async disable() {
      wanted = false;
      const lock = sentinel;
      sentinel = null;
      try {
        await lock?.release();
      } catch {
        // Already released.
      }
    },
    get active() {
      return sentinel !== null;
    },
  };
}
