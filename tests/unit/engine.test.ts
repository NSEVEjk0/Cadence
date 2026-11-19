import { describe, expect, it } from "vitest";
import {
  decidePace,
  markedScript,
  planBreathMarkers,
  scriptWords,
  smoothPace,
  validBreathing,
  validPulse,
} from "../../shared/engine";
import { emptySignal, type Baseline, type Reading } from "../../shared/types";

const now = 100_000;
const reading = (value: number, overrides: Partial<Reading> = {}): Reading => ({
  value,
  confidence: 80,
  stable: true,
  receivedAt: now,
  timestampUs: now * 1000,
  ...overrides,
});
const baseline: Baseline = { pulse: 72, breathing: 14, source: "live" };
const signal = () => ({
  ...emptySignal(),
  pulse: reading(100),
  breathing: reading(24),
  talking: true,
  talkingStable: true,
  talkingReceivedAt: now,
  receivedAt: now,
});
const decide = (overrides: Partial<Parameters<typeof decidePace>[0]> = {}) =>
  decidePace({
    baseWpm: 130,
    baseline,
    signal: signal(),
    now,
    silentSince: null,
    hasSpoken: true,
    ...overrides,
  });

describe("adaptive pace", () => {
  it("gently slows for a valid pulse rise relative to the same source baseline", () => {
    const result = decide();
    expect(result.reason).toBe("pulse");
    expect(result.target).toBeGreaterThanOrEqual(60);
    expect(result.target).toBeLessThan(130);
    expect(smoothPace(130, result.target, 0.1)).toBeGreaterThan(result.target);
  });
  it("ignores low-confidence, unstable, stale, and out-of-range pulse estimates", () => {
    for (const pulse of [
      reading(100, { confidence: 39 }),
      reading(100, { stable: false }),
      reading(100, { receivedAt: now - 4001 }),
      reading(120),
      reading(Number.NaN),
    ]) {
      expect(decide({ signal: { ...signal(), pulse } }).target).toBe(130);
    }
  });
  it("never treats a 30-second breathing estimate during speech as a current breathing change", () => {
    const result = decide({
      signal: { ...signal(), pulse: reading(72), breathing: reading(35) },
    });
    expect(result.target).toBe(130);
  });
  it("holds during an observed speech pause and resumes when speech returns", () => {
    const quiet = { ...signal(), talking: false };
    expect(decide({ signal: quiet, silentSince: now - 700 }).held).toBe(true);
    expect(decide({ signal: quiet, silentSince: now - 300 }).held).toBe(false);
    expect(decide({ silentSince: null }).held).toBe(false);
  });
  it("does not get stuck on stale talk detection, poor framing, or before speech starts", () => {
    const quiet = { ...signal(), talking: false };
    expect(
      decide({
        signal: { ...quiet, talkingReceivedAt: now - 1500 },
        silentSince: now - 700,
      }).held,
    ).toBe(false);
    expect(
      decide({ signal: { ...quiet, validation: 12 }, silentSince: now - 700 })
        .target,
    ).toBe(130);
    expect(
      decide({ signal: quiet, hasSpoken: false, silentSince: now - 700 }).held,
    ).toBe(false);
  });
  it("does not mix a simulated baseline with real measurements", () => {
    expect(
      decide({ baseline: { ...baseline, source: "simulation" } }).target,
    ).toBe(130);
  });
  it("allows the requested mock range while rejecting unsupported live pulse values", () => {
    expect(validPulse(reading(140), now, true)).toBe(true);
    expect(validPulse(reading(140), now)).toBe(false);
    expect(validBreathing(reading(14, { confidence: 44 }), now)).toBe(false);
    expect(validBreathing(reading(14, { confidence: 45 }), now)).toBe(true);
  });
});

describe("rehearsal markers", () => {
  const text =
    "An idea starts with a question, then we take a moment to listen. Our next sentence gives the audience some room, before we share the point that matters most. Finally we let the idea land.";
  it("uses phrase breaks, preserves all original words, and labels observed pauses", () => {
    const markers = planBreathMarkers(text, 130, baseline, [
      { at: 8, word: 22, duration: 1000 },
    ]);
    expect(markers.some((marker) => marker.reason === "pause")).toBe(true);
    const result = markedScript(text, markers);
    expect(result.replaceAll(" [ BREATHE ]", "")).toBe(text);
    expect(new Set(markers.map((marker) => marker.afterWord)).size).toBe(
      markers.length,
    );
    expect(
      markers.every(
        (marker) => marker.afterWord < scriptWords(text).length - 1,
      ),
    ).toBe(true);
  });
  it("does not turn a short detection flicker into an observed pause", () => {
    expect(
      planBreathMarkers(text, 130, baseline, [
        { at: 4, word: 20, duration: 100 },
      ]).every((marker) => marker.reason !== "pause"),
    ).toBe(true);
  });
  it("preserves paragraph breaks and treats script markup as plain text", () => {
    const script =
      "<script>alert(1)</script> is just text.\n\nThis sentence has enough words for a naturally placed pause, and nothing executes.";
    const output = markedScript(
      script,
      planBreathMarkers(script, 130, baseline),
    );
    expect(output.replaceAll(" [ BREATHE ]", "")).toBe(script);
  });
});
