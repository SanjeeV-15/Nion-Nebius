// Hearing. Wraps Chrome's built-in speech recognition, which turns what the
// microphone hears into text. Chrome sends the audio to its own speech service
// to do this, so it needs an internet connection.

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const speechInSupported = Boolean(SpeechRecognition);

/**
 * Creates a listener.
 *   onText(text):      called each time Chrome finishes hearing a phrase
 *   onProblem(reason): called with "mic-blocked" or "network" when listening can't work
 * Returns { start(), stop() }.
 */
export function createListener({ onText, onProblem }) {
  let recognition = null;
  let wanted = false; // do we want to be listening right now?
  let restartTimer = null;

  function build() {
    const r = new SpeechRecognition();
    r.lang = "en-US";
    r.continuous = true; // keep listening after each phrase
    r.interimResults = false; // only report phrases Chrome is sure about

    r.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) onText(result[0].transcript.trim());
      }
    };

    r.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        wanted = false;
        onProblem("mic-blocked");
      } else if (event.error === "network") {
        onProblem("network");
      }
      // "no-speech" and "aborted" are normal and need no action.
    };

    // Chrome stops listening by itself every so often. If we still want to be
    // listening, start again a moment later.
    r.onend = () => {
      if (wanted) restartTimer = setTimeout(startQuietly, 250);
    };

    return r;
  }

  function startQuietly() {
    try {
      recognition.start();
    } catch {
      // Already running: nothing to do.
    }
  }

  return {
    start() {
      wanted = true;
      recognition ??= build();
      startQuietly();
    },
    stop() {
      wanted = false;
      clearTimeout(restartTimer);
      try {
        recognition?.abort(); // abort drops anything half-heard instead of reporting it
      } catch {
        // Not running: nothing to do.
      }
    },
  };
}
