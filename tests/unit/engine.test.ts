import { describe, expect, it } from "vitest";
import {
  advancePauseHold,
  decidePace,
  emptyPauseHold,
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
    expect(result.target).toBeCloseTo(91);
    expect(result.multiplier).toBeCloseTo(0.7);
    expect(smoothPace(130, result.target, 0.1)).toBeGreaterThan(result.target);
  });
  it("leaves the selected pace unchanged until pulse rises more than 10%", () => {
    for (const value of [72, 77, 79.2]) {
      const result = decide({ signal: { ...signal(), pulse: reading(value) } });
      expect(result.target).toBe(130);
      expect(result.reason).toBe("steady");
    }
    expect(
      decide({ signal: { ...signal(), pulse: reading(79.3) } }).reason,
    ).toBe("pulse");
  });
  it("bounds a spike slowdown to 20–30%, including the lowest starting pace", () => {
    for (const baseWpm of [60, 130, 220]) {
      for (const value of [79.3, 90, 104]) {
        const result = decide({
          baseWpm,
          signal: { ...signal(), pulse: reading(value) },
        });
        expect(result.target).toBeGreaterThanOrEqual(baseWpm * 0.7);
        expect(result.target).toBeLessThanOrEqual(baseWpm * 0.8);
      }
    }
  });
  it("eases down and recovers without jumping to the new scroll rate", () => {
    const target = decide().target;
    let pace = smoothPace(130, target, 0.1);
    expect(pace).toBeGreaterThan(target);
    expect(pace).toBeLessThan(130);
    for (let step = 0; step < 60; step++) {
      const next = smoothPace(pace, target, 0.1);
      expect(next).toBeLessThan(pace);
      expect(next).toBeGreaterThan(target);
      pace = next;
    }
    expect(pace - target).toBeLessThan(2);
    const recovering = smoothPace(pace, 130, 0.1);
    expect(recovering).toBeGreaterThan(pace);
    expect(recovering).toBeLessThan(130);
    pace = recovering;
    for (let step = 0; step < 60; step++) pace = smoothPace(pace, 130, 0.1);
    expect(130 - pace).toBeLessThan(2);
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
  it("slows for a breathing rise over 25% only after a full quiet window", () => {
    const quiet = { ...signal(), pulse: reading(72), talking: false };
    const options = {
      hasSpoken: false,
      silentSince: now - 30_000,
    };
    expect(
      decide({
        ...options,
        signal: { ...quiet, breathing: reading(17.5) },
      }).target,
    ).toBe(130);
    const result = decide({
      ...options,
      signal: { ...quiet, breathing: reading(18) },
    });
    expect(result.reason).toBe("breathing");
    expect(result.held).toBe(false);
    expect(result.target).toBeGreaterThanOrEqual(91);
    expect(result.target).toBeLessThanOrEqual(104);
    expect(
      decide({
        ...options,
        signal: { ...quiet, breathing: reading(28) },
      }).target,
    ).toBeCloseTo(91);
  });
  it("ignores breathing spikes with insufficient quiet time or unreliable readings", () => {
    const quiet = {
      ...signal(),
      pulse: reading(72),
      breathing: reading(28),
      talking: false,
    };
    for (const overrides of [
      { silentSince: null },
      { silentSince: now - 29_999 },
      { signal: { ...quiet, breathing: reading(28, { confidence: 44 }) } },
      { signal: { ...quiet, breathing: reading(28, { stable: false }) } },
      {
        signal: {
          ...quiet,
          breathing: reading(28, { receivedAt: now - 4001 }),
        },
      },
      { signal: { ...quiet, talking: null } },
      { signal: { ...quiet, talkingStable: false } },
      { signal: { ...quiet, talkingReceivedAt: now - 1201 } },
    ]) {
      expect(
        decide({
          signal: quiet,
          hasSpoken: false,
          silentSince: now - 30_000,
          ...overrides,
        }).target,
      ).toBe(130);
    }
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

describe("timed speaking pauses", () => {
  const quiet = () => ({ ...signal(), talking: false });

  it("arms a 1.5-second hold once a speaking pause is confirmed", () => {
    const options = {
      signal: quiet(),
      now,
      hasSpoken: true,
      silentSince: now - 599,
    };
    expect(advancePauseHold(emptyPauseHold(), options).until).toBeNull();
    const held = advancePauseHold(emptyPauseHold(), {
      ...options,
      silentSince: now - 600,
    });
    expect(held.until).toBe(now + 1500);
    expect(
      advancePauseHold(emptyPauseHold(), {
        ...options,
        silentSince: now - 1000,
        hasSpoken: false,
      }).until,
    ).toBeNull();
  });

  it("keeps the full hold after early speech returns, then eases scrolling back in", () => {
    const held = advancePauseHold(emptyPauseHold(), {
      signal: quiet(),
      now,
      silentSince: now - 700,
      hasSpoken: true,
    });
    const speaking = { ...signal(), talkingReceivedAt: now + 1000 };
    expect(
      advancePauseHold(held, {
        signal: speaking,
        now: now + 1000,
        silentSince: null,
        hasSpoken: true,
      }).until,
    ).toBe(now + 1500);
    expect(
      decide({
        signal: speaking,
        now: now + 1499,
        pauseHoldUntil: held.until,
      }).held,
    ).toBe(true);
    const resumed = decide({
      signal: speaking,
      now: now + 1500,
      pauseHoldUntil: held.until,
    });
    expect(resumed.held).toBe(false);
    expect(smoothPace(0, resumed.target, 0.1)).toBeGreaterThan(0);
    expect(smoothPace(0, resumed.target, 0.1)).toBeLessThan(resumed.target);
  });

  it("does not renew the minimum timer during a longer quiet pause", () => {
    const options = {
      signal: quiet(),
      now,
      silentSince: now - 700,
      hasSpoken: true,
    };
    const held = advancePauseHold(emptyPauseHold(), options);
    const later = {
      ...options,
      now: now + 3000,
      signal: { ...quiet(), talkingReceivedAt: now + 3000 },
    };
    expect(advancePauseHold(held, later).until).toBe(now + 1500);
    expect(decide({ ...later, pauseHoldUntil: held.until }).held).toBe(true);
    expect(
      decide({
        now: now + 3000,
        signal: { ...signal(), talkingReceivedAt: now + 3000 },
        pauseHoldUntil: held.until,
      }).held,
    ).toBe(false);
    expect(
      advancePauseHold(held, {
        ...later,
        silentSince: now + 2300,
      }).until,
    ).toBe(now + 4500);
  });

  it("cancels a timed hold when framing or speaking detection is unreliable", () => {
    const held = { quietStart: now - 700, until: now + 1500 };
    for (const unreliable of [
      { ...quiet(), validation: 12 },
      { ...quiet(), talkingStable: false },
      { ...quiet(), talkingReceivedAt: now - 1201 },
    ]) {
      expect(
        advancePauseHold(held, {
          signal: unreliable,
          now,
          silentSince: now - 700,
          hasSpoken: true,
        }).until,
      ).toBeNull();
      expect(
        decide({ signal: unreliable, pauseHoldUntil: held.until }).held,
      ).toBe(false);
    }
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
