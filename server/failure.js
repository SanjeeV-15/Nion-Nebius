// Works out why a request to Claude failed, in words the person running Nion can
// act on. The page shows this under the status line. (Nion still says the same
// short "I'm having trouble reaching my sources" out loud, because a listener who
// is walking through an airport can't fix a billing problem.)

/**
 * Returns "credit" (the prepaid credit ran out), "key" (the API key was
 * rejected), "busy" (too many requests), or undefined (anything else).
 */
export function classifyFailure(error) {
  const status = error?.status;
  const message = String(error?.message ?? "");
  if (/credit balance is too low|insufficient (funds|credits?|balance)|out of credits?|payment required/i.test(message) || status === 402) return "credit";
  if (status === 401 || status === 403) return "key";
  if (status === 429 || status === 529) return "busy";
  return undefined;
}
