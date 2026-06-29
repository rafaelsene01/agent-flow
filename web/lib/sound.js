/**
 * sound.js — Web Audio API sound utility
 * Tones are generated in code (no audio asset files).
 * Preferences are persisted in localStorage under "agent-flow.sound".
 */

const STORAGE_KEY = "agent-flow.sound";
const DEFAULT_PREFS = { enabled: true, volume: 0.5 };

// Module-singleton AudioContext shared across all play functions.
let _ctx = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns the singleton AudioContext, creating it lazily. Returns null on failure. */
function getCtx() {
  if (_ctx) return _ctx;
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    _ctx = new Ctor();
    return _ctx;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * getSoundPrefs() → { enabled: boolean, volume: number }
 * Reads localStorage key "agent-flow.sound".
 * Returns default when missing/invalid.
 * SSR-safe.
 */
export function getSoundPrefs() {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    const enabled =
      typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_PREFS.enabled;
    const volume =
      typeof parsed.volume === "number" &&
      isFinite(parsed.volume) &&
      parsed.volume >= 0 &&
      parsed.volume <= 1
        ? parsed.volume
        : DEFAULT_PREFS.volume;
    return { enabled, volume };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/**
 * setSoundPrefs(partial) → void
 * Merges partial into current prefs and writes back to localStorage.
 * SSR-safe.
 */
export function setSoundPrefs(partial) {
  if (typeof window === "undefined") return;
  try {
    const current = getSoundPrefs();
    const next = { ...current, ...partial };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Silently ignore (e.g. storage quota, private browsing restrictions).
  }
}

/**
 * unlockAudio() → AudioContext | null
 * Lazily creates the module-singleton AudioContext and resumes it if suspended.
 * Call from a user-gesture handler to satisfy autoplay policy.
 * Safe to call multiple times.
 */
export async function unlockAudio() {
  try {
    const ctx = getCtx();
    if (!ctx) return null;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    return ctx;
  } catch {
    return null;
  }
}

/**
 * playDone() → void
 * Plays a short pleasant ascending tone (660 Hz → 880 Hz, ~0.18 s).
 * No-op when sound is disabled. Respects volume. Never throws.
 */
export function playDone() {
  try {
    const { enabled, volume } = getSoundPrefs();
    if (!enabled) return;

    const ctx = getCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const duration = 0.18;
    const peakGain = 0.2 * volume;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.linearRampToValueAtTime(880, now + duration);

    gain.gain.setValueAtTime(peakGain, now);
    // Ramp to near-zero before stop to avoid click.
    gain.gain.linearRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);

    // Clean up nodes after they finish.
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // Ignore.
      }
    };
  } catch {
    // Degrade silently.
  }
}

/**
 * playWaiting() → void
 * Plays two short attention beeps at 440 Hz (~0.12 s each, with a small gap).
 * No-op when sound is disabled. Respects volume. Never throws.
 */
export function playWaiting() {
  try {
    const { enabled, volume } = getSoundPrefs();
    if (!enabled) return;

    const ctx = getCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const beepDuration = 0.12;
    const gap = 0.06;
    const peakGain = 0.2 * volume;

    function scheduleBeep(startTime) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "square";
      osc.frequency.setValueAtTime(440, startTime);

      gain.gain.setValueAtTime(peakGain, startTime);
      gain.gain.linearRampToValueAtTime(0.0001, startTime + beepDuration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + beepDuration);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // Ignore.
        }
      };
    }

    scheduleBeep(now);
    scheduleBeep(now + beepDuration + gap);
  } catch {
    // Degrade silently.
  }
}
