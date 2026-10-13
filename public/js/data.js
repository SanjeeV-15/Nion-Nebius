// Nion's notebook on this device: what it remembers about you, your expenses, your
// two lists and your saved email drafts. It lives in the browser's own storage, so
// it never leaves your device except as a copy inside each question (see
// shared/store.js for the rules, which the server shares).
//
// Storage can be switched off (private windows, strict settings), so every call is
// wrapped: if it fails, Nion simply behaves as if the notebook were empty.

import { applyOps, cleanData, emptyData } from "../../shared/store.js";

const DATA_KEY = "nion.data";

export function loadData() {
  try {
    return cleanData(JSON.parse(localStorage.getItem(DATA_KEY) ?? "null"));
  } catch {
    return emptyData(); // nothing saved, or it was damaged: start fresh
  }
}

function saveData(data) {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
  } catch {
    // Not saved (storage full or switched off): Nion still works, it just forgets this.
  }
}

/** Applies the changes the server sent back, saves the notebook, and returns it. */
export function applyChanges(ops) {
  const next = applyOps(loadData(), ops);
  saveData(next);
  return next;
}

export function clearData() {
  try {
    localStorage.removeItem(DATA_KEY);
  } catch {
    // Nothing to clear.
  }
}
