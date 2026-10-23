// Are earphones or a headset in use? With them, Nion's own voice cannot leak back into the
// microphone, so the moment someone starts talking over Nion it can safely stop talking, instead
// of waiting for Chrome to write down two whole words. On laptop speakers it must NOT do that,
// or Nion would stop itself every time it hears its own voice.
//
// The browser gives the name of the default sound output ("Default - AirPods Pro"). Only names
// that clearly say headphones, a headset or earbuds count; anything unclear (a Bluetooth
// speaker, "MacBook Pro Speakers", no name at all) is treated as speakers, which is the safe way.

const EARPHONE_WORDS = /headphone|headset|earphone|earbud|earpod|airpods|\bbuds\d*\b/i;

/** Does this sound-output name clearly mean earphones or a headset? */
export function looksLikeEarphones(label) {
  return EARPHONE_WORDS.test(String(label ?? ""));
}

/**
 * Looks at the default sound output now and again whenever devices change. Calls
 * onChange({ on, label }) each time. Names are only visible once the microphone is allowed,
 * so it is also worth calling `check()` again after the microphone starts.
 * Returns { check }.
 */
export function watchEarphones(onChange, mediaDevices = globalThis.navigator?.mediaDevices) {
  async function check() {
    try {
      const devices = (await mediaDevices?.enumerateDevices?.()) ?? [];
      const output = devices.find((d) => d.kind === "audiooutput" && d.deviceId === "default");
      const label = output?.label ?? "";
      onChange({ on: looksLikeEarphones(label), label });
    } catch {
      onChange({ on: false, label: "" });
    }
  }
  try {
    mediaDevices?.addEventListener?.("devicechange", check);
  } catch {
    // No device-change events here: the check still runs when asked.
  }
  return { check };
}
