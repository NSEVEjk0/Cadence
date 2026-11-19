import { scriptWords } from "./engine";
import type {
  Baseline,
  BreathMarker,
  ScriptSentence,
  SentenceMoment,
  SessionPoint,
  SignalSource,
} from "./types";

export function scriptSentences(text: string): ScriptSentence[] {
  const words = scriptWords(text);
  if (!words.length) return [];
  const segments =
    typeof Intl.Segmenter === "function"
      ? Array.from(
          new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(
            text,
          ),
          (part) => ({
            start: part.index,
            end: part.index + part.segment.length,
          }),
        )
      : Array.from(
          text.matchAll(
            /[\s\S]+?(?:[.!?]+["'\u201d\u2019)]*(?=\s|$)|\n[ \t]*\n|$)/gu,
          ),
          (part) => ({ start: part.index, end: part.index + part[0].length }),
        );
  const sentences: ScriptSentence[] = [];
  let firstWord = 0;
  for (const { start, end } of segments) {
    while (firstWord < words.length && words[firstWord].end <= start)
      firstWord++;
    if (firstWord >= words.length || words[firstWord].start >= end) continue;
    let lastWord = firstWord;
    while (lastWord + 1 < words.length && words[lastWord + 1].start < end)
      lastWord++;
    sentences.push({
      sentenceIndex: sentences.length,
      start,
      end,
      firstWord,
      lastWord,
    });
  }
  return sentences;
}

function rateInRange(
  value: number | null,
  min: number,
  max: number,
): value is number {
  return (
    value !== null && Number.isFinite(value) && value >= min && value <= max
  );
}

export function analyzeRehearsal({
  script,
  baseline,
  source,
  history,
}: {
  script: string;
  baseline: Baseline | null;
  source: SignalSource | null;
  history: readonly SessionPoint[];
}): SentenceMoment[] {
  if (!baseline || source !== baseline.source) return [];
  const sentences = scriptSentences(script);
  const byWord: ScriptSentence[] = [];
  for (const sentence of sentences) {
    for (let word = sentence.firstWord; word <= sentence.lastWord; word++) {
      byWord[word] ??= sentence;
    }
  }
  const moments = new Map<number, SentenceMoment>();
  for (const point of history) {
    if (
      !Number.isFinite(point.seconds) ||
      point.seconds < 0 ||
      !Number.isInteger(point.word) ||
      point.word < 0
    )
      continue;
    const sentence = byWord[point.word];
    if (!sentence) continue;
    // Numbers enter history only after SDK freshness/confidence checks.
    const pulseRise =
      baseline.pulse !== null &&
      baseline.pulse > 0 &&
      rateInRange(point.pulse, 40, source === "simulation" ? 140 : 110) &&
      point.pulse > baseline.pulse * 1.1;
    // A 30-second rate cannot establish erratic breaths during speech.
    const breathingRise =
      point.breathingUsable === true &&
      point.talking === false &&
      baseline.breathing !== null &&
      baseline.breathing > 0 &&
      rateInRange(point.breathing, 5, 40) &&
      point.breathing > baseline.breathing * 1.25;
    if (!pulseRise && !breathingRise) continue;
    const moment = moments.get(sentence.sentenceIndex) ?? {
      ...sentence,
      firstSeenSeconds: point.seconds,
      lastSeenSeconds: point.seconds,
      pulsePeak: null,
      breathingPeak: null,
    };
    moment.firstSeenSeconds = Math.min(moment.firstSeenSeconds, point.seconds);
    moment.lastSeenSeconds = Math.max(moment.lastSeenSeconds, point.seconds);
    if (pulseRise)
      moment.pulsePeak = Math.max(moment.pulsePeak ?? 0, point.pulse!);
    if (breathingRise)
      moment.breathingPeak = Math.max(
        moment.breathingPeak ?? 0,
        point.breathing!,
      );
    moments.set(sentence.sentenceIndex, moment);
  }
  return [...moments.values()].sort(
    (a, b) => a.sentenceIndex - b.sentenceIndex,
  );
}

export function composeBreathMarkers({
  script,
  baseMarkers,
  moments = [],
  retainedMarkers = [],
}: {
  script: string;
  baseMarkers: readonly BreathMarker[];
  moments?: readonly SentenceMoment[];
  retainedMarkers?: readonly BreathMarker[];
}): BreathMarker[] {
  const wordCount = scriptWords(script).length;
  const priority = { rhythm: 0, pause: 1, breathing: 2, pulse: 3 };
  const signalMarkers = moments.map<BreathMarker>((moment) => ({
    afterWord: moment.lastWord,
    reason: moment.pulsePeak !== null ? "pulse" : "breathing",
  }));
  const candidates = [...baseMarkers, ...retainedMarkers, ...signalMarkers]
    .filter(
      (marker) =>
        Number.isInteger(marker.afterWord) &&
        marker.afterWord >= 0 &&
        marker.afterWord < wordCount,
    )
    .sort((a, b) => priority[a.reason] - priority[b.reason]);
  const markers = new Map<number, BreathMarker>();
  for (const marker of candidates) {
    for (const [word, existing] of markers) {
      if (
        priority[existing.reason] < 2 &&
        priority[existing.reason] < priority[marker.reason] &&
        Math.abs(word - marker.afterWord) <= 3
      )
        markers.delete(word);
    }
    markers.set(marker.afterWord, marker);
  }
  return [...markers.values()].sort((a, b) => a.afterWord - b.afterWord);
}
