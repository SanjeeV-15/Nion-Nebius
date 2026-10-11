// Nion's memory on this device. It uses the browser's own storage, which is like
// a sticky note the browser keeps for this one site. Nothing leaves your computer.
//
// Storage can be switched off (private windows, strict settings), so every call
// is wrapped: if it fails, Nion simply behaves as if nothing was saved.

const NAME_KEY = "nion.name";

export function getName() {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

export function setName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Not saved: Nion will ask again next time.
  }
}

export function clearName() {
  try {
    localStorage.removeItem(NAME_KEY);
  } catch {
    // Nothing to clear.
  }
}
