// A random id for this browser, made once and kept on the device. It is sent with each
// question so the demo's fair-use limit counts each visitor separately, instead of
// lumping everyone on the same network together. It holds no personal information.

const KEY = "nion.visitor";

export function visitorId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = globalThis.crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return undefined; // storage is off: the server falls back to the network address
  }
}

const PASS_KEY = "nion.pass";
const PASS_SHAPE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * The judge pass, if this browser has one. A link ending ?pass=... gives it: it is kept on the
 * device (so the link only has to be opened once) and taken out of the address bar. Anyone
 * without it is simply an ordinary visitor.
 */
export function judgePass(loc = globalThis.location, hist = globalThis.history) {
  try {
    const given = new URLSearchParams(loc?.search ?? "").get("pass");
    if (given && PASS_SHAPE.test(given)) {
      localStorage.setItem(PASS_KEY, given);
      try {
        // Take out only the pass; any other setting (like ?debug) stays exactly as it was.
        const rest = loc.search.replace(/^\?/, "").split("&").filter((part) => part && !part.startsWith("pass=")).join("&");
        hist?.replaceState?.(null, "", `${loc.pathname ?? "/"}${rest ? `?${rest}` : ""}`);
      } catch {
        // The address bar keeps the pass: harmless.
      }
    }
    const stored = localStorage.getItem(PASS_KEY);
    return stored && PASS_SHAPE.test(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
}
