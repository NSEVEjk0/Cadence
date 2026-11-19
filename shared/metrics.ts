import { emptySignal, type Reading, type SignalSnapshot } from "./types";

interface WireMeasurement {
  value?: number | null;
  confidence?: number | null;
  stable?: boolean | null;
  timestamp?: unknown;
}
interface WireDetection {
  detected?: boolean | null;
  stable?: boolean | null;
  timestamp?: unknown;
}
export interface WireMetrics {
  cardio?: { pulseRate?: WireMeasurement[] | null } | null;
  breathing?: {
    rate?: WireMeasurement[] | null;
    upperTrace?: WireMeasurement[] | null;
  } | null;
  face?: { talking?: WireDetection[] | null } | null;
}

function timestampNumber(value: unknown): number {
  if (typeof value === "number" || typeof value === "bigint")
    return Number(value);
  if (
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof value.toNumber === "function"
  )
    return value.toNumber();
  return Number(value ?? 0);
}

function updateReading(
  previous: Reading | null,
  measurements: WireMeasurement[] | null | undefined,
  now: number,
): Reading | null {
  const latest = measurements?.at(-1);
  if (
    !latest ||
    typeof latest.value !== "number" ||
    !Number.isFinite(latest.value)
  )
    return previous;
  const timestampUs = timestampNumber(latest.timestamp);
  if (previous && timestampUs <= previous.timestampUs) return previous;
  return {
    value: latest.value,
    confidence: Number.isFinite(latest.confidence)
      ? Number(latest.confidence)
      : 0,
    stable: latest.stable === true,
    receivedAt: now,
    timestampUs,
  };
}

export function mergeMetrics(
  previous: SignalSnapshot | null,
  metrics: WireMetrics,
  now: number,
): SignalSnapshot {
  const signal = { ...(previous ?? emptySignal()) };
  signal.pulse = updateReading(signal.pulse, metrics.cardio?.pulseRate, now);
  signal.breathing = updateReading(
    signal.breathing,
    metrics.breathing?.rate,
    now,
  );
  const talking = metrics.face?.talking?.at(-1);
  if (talking && typeof talking.detected === "boolean") {
    signal.talking = talking.detected;
    signal.talkingStable = talking.stable === true;
    signal.talkingReceivedAt = now;
  }
  const trace = metrics.breathing?.upperTrace?.at(-1);
  if (trace && Number.isFinite(trace.value) && trace.stable === true)
    signal.trace = Number(trace.value);
  signal.receivedAt = now;
  return signal;
}
