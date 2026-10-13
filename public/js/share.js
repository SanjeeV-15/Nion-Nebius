// Share some text: through the phone's share sheet where there is one (so it can go
// to Notes, Messages, Mail...), otherwise by copying it. Returns what happened:
// "shared", "copied", "cancelled" or "failed".

export async function shareText({ title, text }, nav = globalThis.navigator) {
  if (typeof nav?.share === "function") {
    try {
      await nav.share({ title, text });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled"; // they closed the share sheet
      // Any other problem: fall through and copy instead.
    }
  }
  try {
    await nav.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
