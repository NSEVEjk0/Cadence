import { describe, expect, it, vi } from "vitest";
import { markedScript, scriptWords } from "../../shared/engine";
import {
  analyzeRehearsal,
  composeBreathMarkers,
  scriptSentences,
} from "../../shared/rehearsal";
import type { Baseline, SessionPoint } from "../../shared/types";

// All signal values in these checks are invented fixtures.
const baseline: Baseline = { pulse: 72, breathing: 14, source: "live" };
const script = 'The budget is 3.5 million. "Ready?"\n\nLet’s start.';
const point = (
  word: number,
  overrides: Partial<SessionPoint> = {},
): SessionPoint => ({
  seconds: 1,
  word,
  pulse: 72,
  breathing: null,
  pace: 130,
  paused: false,
  talking: true,
  breathingUsable: false,
  ...overrides,
});
const analyze = (history: SessionPoint[]) =>
  analyzeRehearsal({ script, baseline, source: "live", history });

describe("sentence review", () => {
  it("keeps decimal values, quotations, and paragraph boundaries intact, including the legacy fallback", () => {
    const expected = ["The budget is 3.5 million.", '"Ready?"', "Let’s start."];
    const sentenceText = () =>
      scriptSentences(script).map((sentence) =>
        script.slice(sentence.start, sentence.end).trim(),
      );
    expect(sentenceText()).toEqual(expected);
    const legacyIntl = Object.create(Intl);
    legacyIntl.Segmenter = undefined;
    vi.stubGlobal("Intl", legacyIntl);
    try {
      expect(sentenceText()).toEqual(expected);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("maps pulse rises to the displayed sentence and deduplicates repeated estimates", () => {
    const sentence = scriptSentences(script)[1];
    const moments = analyze([
      point(0, { pulse: 79.2 }),
      point(sentence.firstWord, { pulse: 79.3, seconds: 2 }),
      point(sentence.firstWord, { pulse: 104, seconds: 3 }),
    ]);
    expect(moments).toHaveLength(1);
    expect(moments[0].sentenceIndex).toBe(1);
    expect(moments[0].pulsePeak).toBe(104);
    expect(moments[0].firstSeenSeconds).toBe(2);
    expect(moments[0].lastSeenSeconds).toBe(3);
    expect(script.slice(moments[0].start, moments[0].end).trim()).toBe(
      '"Ready?"',
    );
  });

  it("flags faster breathing only when its quiet-window eligibility is explicit", () => {
    const word = scriptSentences(script)[2].firstWord;
    expect(
      analyze([
        point(word, { breathing: 28, breathingUsable: true, talking: true }),
        point(word, {
          breathing: 28,
          breathingUsable: undefined,
          talking: false,
        }),
        point(word, { breathing: 28, talking: false }),
        point(word, { breathing: 17.5, breathingUsable: true, talking: false }),
      ]),
    ).toEqual([]);
    const moments = analyze([
      point(word, { breathing: 18, breathingUsable: true, talking: false }),
    ]);
    expect(moments).toHaveLength(1);
    expect(moments[0].breathingPeak).toBe(18);
    expect(moments[0].pulsePeak).toBeNull();
  });

  it("rejects invalid positions, unsupported live rates, and mixed signal sources", () => {
    expect(
      analyze([
        point(-1, { pulse: 104 }),
        point(0.5, { pulse: 104 }),
        point(scriptWords(script).length, { pulse: 104 }),
        point(0, { pulse: 104, seconds: Number.NaN }),
        point(0, { pulse: Number.NaN }),
        point(0, { pulse: 140 }),
      ]),
    ).toEqual([]);
    const simulated = { ...baseline, source: "simulation" as const };
    expect(
      analyzeRehearsal({
        script,
        baseline: simulated,
        source: "live",
        history: [point(0, { pulse: 104 })],
      }),
    ).toEqual([]);
    expect(
      analyzeRehearsal({
        script,
        baseline: simulated,
        source: "simulation",
        history: [point(0, { pulse: 140 })],
      }),
    ).toHaveLength(1);
  });

  it("adds one marker at each flagged sentence end while preserving short scripts and suppressing nearby generic duplicates", () => {
    const text = "Go now. Speak clearly.";
    const moments = analyzeRehearsal({
      script: text,
      baseline,
      source: "live",
      history: [
        point(1, { pulse: 104 }),
        point(3, { breathing: 28, breathingUsable: true, talking: false }),
      ],
    });
    const markers = composeBreathMarkers({
      script: text,
      baseMarkers: [
        { afterWord: 0, reason: "rhythm" },
        { afterWord: 99, reason: "pause" },
      ],
      retainedMarkers: [{ afterWord: 1, reason: "pause" }],
      moments,
    });
    expect(markers).toEqual([
      { afterWord: 1, reason: "pulse" },
      { afterWord: 3, reason: "breathing" },
    ]);
    expect(markedScript(text, markers)).toBe(
      "Go now. [ BREATHE ] Speak clearly. [ BREATHE ]",
    );
  });

  it("preserves original markup and whitespace when carrying annotated text into an export", () => {
    const text =
      "<img src=x onerror=alert(1)> These characters stay as text.\n\nThe next sentence deserves a pause.";
    const first = scriptSentences(text)[0];
    const moments = analyzeRehearsal({
      script: text,
      baseline,
      source: "live",
      history: [point(first.lastWord, { pulse: 104 })],
    });
    const markers = composeBreathMarkers({
      script: text,
      baseMarkers: [],
      moments,
    });
    const exported = markedScript(text, markers);
    expect(exported.replaceAll(" [ BREATHE ]", "")).toBe(text);
    expect(
      composeBreathMarkers({
        script: text,
        baseMarkers: [],
        retainedMarkers: markers,
      }),
    ).toEqual(markers);
  });
});
