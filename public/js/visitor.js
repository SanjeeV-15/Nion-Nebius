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
