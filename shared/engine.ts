import type {
  Baseline,
  BreathMarker,
  PauseEvent,
  Reading,
  SignalSnapshot,
} from "./types";

export const PULSE_FRESH_MS = 4_000;
export const BREATHING_FRESH_MS = 4_000;
export const TALKING_FRESH_MS = 1_200;
export const BREATHING_QUIET_WINDOW_MS = 30_000;
export const PAUSE_HOLD_MS = 600;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function median(values: number[]): number | null {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

export function validPulse(
  reading: Reading | null,
  now: number,
  simulation = false,
): boolean {
  return (
    !!reading &&
    Number.isFinite(reading.value) &&
    reading.value >= 40 &&
    reading.value <= (simulation ? 140 : 110) &&
    reading.stable &&
    reading.confidence >= 40 &&
    now >= reading.receivedAt &&
    now - reading.receivedAt <= PULSE_FRESH_MS
  );
}

export function validBreathing(reading: Reading | null, now: number): boolean {
  return (
    !!reading &&
    Number.isFinite(reading.value) &&
    reading.value >= 5 &&
    reading.value <= 40 &&
    reading.stable &&
    reading.confidence >= 45 &&
    now >= reading.receivedAt &&
    now - reading.receivedAt <= BREATHING_FRESH_MS
  );
}

export function trustedTalking(signal: SignalSnapshot, now: number): boolean {
  return (
    signal.talking !== null &&
    signal.talkingStable &&
    now >= signal.talkingReceivedAt &&
    now - signal.talkingReceivedAt <= TALKING_FRESH_MS
  );
}

export interface PaceDecision {
  target: number;
  multiplier: number;
  held: boolean;
  reason: "pause" | "pulse" | "breathing" | "steady" | "manual" | "quality";
  message: string;
}

export function decidePace({
  baseWpm,
  baseline,
  signal,
  now,
  silentSince,
  hasSpoken,
}: {
  baseWpm: number;
  baseline: Baseline | null;
  signal: SignalSnapshot;
  now: number;
  silentSince: number | null;
  hasSpoken: boolean;
}): PaceDecision {
  const base = clamp(baseWpm, 60, 220);
  const plain = (
    reason: PaceDecision["reason"],
    message: string,
  ): PaceDecision => ({
    target: base,
    multiplier: 1,
    held: false,
    reason,
    message,
  });
  if (!baseline) return plain("manual", "Your pace, your choice.");
  if (baseline.source !== signal.source)
    return plain("manual", "Recalibrate for this signal source.");
  if (signal.validation !== 0)
    return plain(
      "quality",
      "Holding your chosen pace while the signal settles.",
    );
  const talkingIsTrusted = trustedTalking(signal, now);
  if (
    hasSpoken &&
    talkingIsTrusted &&
    signal.talking === false &&
    silentSince !== null &&
    now - silentSince >= PAUSE_HOLD_MS
  ) {
    return {
      target: 0,
      multiplier: 0,
      held: true,
      reason: "pause",
      message: "Take your time. Your place is held.",
    };
  }
  let pulseReduction = 0;
  let breathingReduction = 0;
  const pulseUsable = validPulse(
    signal.pulse,
    now,
    signal.source === "simulation",
  );
  if (baseline.pulse && pulseUsable) {
    // A small deadband prevents normal variation from constantly changing the scroll.
    pulseReduction = clamp(
      ((signal.pulse!.value - baseline.pulse - 5) / baseline.pulse) * 1.6,
      0,
      0.32,
    );
  }
  // A rate is a 30-second estimate. It cannot describe breathing during speech.
  const breathingUsable =
    validBreathing(signal.breathing, now) &&
    talkingIsTrusted &&
    signal.talking === false &&
    silentSince !== null &&
    now - silentSince >= BREATHING_QUIET_WINDOW_MS;
  if (baseline.breathing && breathingUsable) {
    breathingReduction = clamp(
      ((signal.breathing!.value - baseline.breathing - 2) /
        baseline.breathing) *
        0.5,
      0,
      0.25,
    );
  }
  const reduction = Math.max(pulseReduction, breathingReduction);
  if (reduction > 0.025) {
    const reason = pulseReduction >= breathingReduction ? "pulse" : "breathing";
    return {
      target: Math.max(60, base * (1 - reduction)),
      multiplier: 1 - reduction,
      held: false,
      reason,
      message: "A little more room between ideas.",
    };
  }
  if (!pulseUsable && !breathingUsable && !talkingIsTrusted) {
    return plain(
      "quality",
      "Using your chosen pace until a reliable signal returns.",
    );
  }
  return plain("steady", "You have room to make your point.");
}

export function smoothPace(
  current: number,
  target: number,
  deltaSeconds: number,
): number {
  if (target === 0) return 0;
  const initial = current === 0 ? target : current;
  return (
    initial +
    (target - initial) * (1 - Math.exp(-clamp(deltaSeconds, 0, 0.5) / 1.8))
  );
}

export function scriptWords(
  text: string,
): { text: string; start: number; end: number }[] {
  return [...text.matchAll(/\S+/gu)].map((match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

export function planBreathMarkers(
  text: string,
  baseWpm: number,
  baseline: Baseline | null,
  pauses: PauseEvent[] = [],
): BreathMarker[] {
  const words = scriptWords(text);
  if (words.length < 8) return [];
  // Quiet breathing sets a suggestion interval, not a prescription for speech.
  const interval = baseline?.breathing
    ? clamp(Math.round((baseWpm / baseline.breathing) * 1.5), 8, 24)
    : 20;
  const punctuation = words
    .map((word, i) => (/[,;:.!?][\u201d\u2019"')]*$/u.test(word.text) ? i : -1))
    .filter((i) => i >= 0);
  const markers = new Map<number, BreathMarker>();
  let previous = -1;
  while (previous + interval < words.length - 2) {
    const target = previous + interval;
    const candidates = punctuation.filter(
      (i) => i >= previous + 5 && i <= target + 8 && i < words.length - 1,
    );
    const position = candidates.length
      ? candidates.reduce((best, i) =>
          Math.abs(i - target) < Math.abs(best - target) ? i : best,
        )
      : Math.min(target, words.length - 2);
    if (position <= previous) break;
    markers.set(position, { afterWord: position, reason: "rhythm" });
    previous = position;
  }
  for (const pause of pauses) {
    if (pause.duration < PAUSE_HOLD_MS || !Number.isFinite(pause.word))
      continue;
    const target = clamp(Math.floor(pause.word), 3, words.length - 2);
    const candidates = punctuation.filter(
      (i) => Math.abs(i - target) <= 8 && i >= 3 && i < words.length - 1,
    );
    const position = candidates.length
      ? candidates.reduce((best, i) =>
          Math.abs(i - target) < Math.abs(best - target) ? i : best,
        )
      : target;
    for (const existing of markers.keys())
      if (Math.abs(existing - position) <= 3) markers.delete(existing);
    markers.set(position, { afterWord: position, reason: "pause" });
  }
  return [...markers.values()].sort((a, b) => a.afterWord - b.afterWord);
}

export function markedScript(text: string, markers: BreathMarker[]): string {
  const words = scriptWords(text);
  let result = text;
  for (const marker of [...markers].sort((a, b) => b.afterWord - a.afterWord)) {
    const word = words[marker.afterWord];
    if (word)
      result =
        result.slice(0, word.end) + " [ BREATHE ]" + result.slice(word.end);
  }
  return result;
}

export const DEMO_SCRIPT = `The best ideas don’t arrive fully formed. They start as a question. A small frustration. A moment when you think: there has to be a better way.\n\nFor us, that moment was watching someone with a brilliant idea rush through their pitch. The words were right, but there was no room for the audience to catch up.\n\nSo we built Cadence. A rehearsal space that makes room for the person behind the script. When you pause, it waits. When your pulse rises above your own baseline, it gently gives you more time.\n\nBecause a good pitch isn’t a race to the final slide. It’s a chance to make someone see what you see.\n\nTake a breath. Let the idea land. And give the next sentence the space it deserves.`;
