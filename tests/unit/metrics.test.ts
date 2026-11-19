import { describe, expect, it } from "vitest";
import { mergeMetrics } from "../../shared/metrics";

describe("official protobuf metrics normalization", () => {
  it("reads real confidence percentages and preserves freshness for unchanged samples", () => {
    const first = mergeMetrics(
      null,
      {
        cardio: {
          pulseRate: [
            { value: 88.3, stable: true, confidence: 52, timestamp: 1000 },
          ],
        },
      },
      1000,
    );
    expect(first.pulse?.confidence).toBe(52);
    const unchanged = mergeMetrics(
      first,
      {
        cardio: {
          pulseRate: [
            { value: 88.3, stable: true, confidence: 52, timestamp: 1000 },
          ],
        },
        face: { talking: [{ detected: true, stable: true }] },
      },
      6000,
    );
    expect(unchanged.pulse?.receivedAt).toBe(1000);
    expect(unchanged.talkingReceivedAt).toBe(6000);
    expect(unchanged.breathing).toBe(null);
  });
  it("keeps absent and unstable readings distinct from a usable number", () => {
    const metrics = mergeMetrics(
      null,
      {
        breathing: {
          rate: [{ value: 15, confidence: 0, stable: false, timestamp: 1 }],
        },
      },
      300,
    );
    expect(metrics.breathing?.stable).toBe(false);
    expect(metrics.pulse).toBe(null);
    expect(metrics.talking).toBe(null);
  });
});
