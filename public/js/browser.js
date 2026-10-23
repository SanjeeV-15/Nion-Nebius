// Which browsers can run Nion's hands-free voice. Nion listens all the time for "Hey Nion",
// which relies on Chrome's speech recognition. Safari has a version of it that often turns on
// but never hears anything, so there we offer typing (which works everywhere) instead of a
// button that looks like it works and doesn't.

/**
 * False for Safari (on a Mac or an iPhone). True for Chrome, Edge, Firefox and others, and when
 * the browser doesn't say what it is (so a test or an odd browser is never blocked by mistake).
 */
export function voiceLikelyWorks(userAgent) {
  const ua = String(userAgent ?? "");
  if (!ua) return true;
  const safari = /Safari\//.test(ua) && !/Chrome\/|Chromium\/|CriOS\/|FxiOS\/|EdgiOS\/|Edg\/|OPR\/|Android/.test(ua);
  return !safari;
}
