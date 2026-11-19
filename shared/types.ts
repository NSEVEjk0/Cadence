export type SignalSource = "live" | "simulation";

export interface Reading {
  value: number;
  confidence: number;
  stable: boolean;
  receivedAt: number;
  timestampUs: number;
}

export interface SignalSnapshot {
  source: SignalSource;
  pulse: Reading | null;
  breathing: Reading | null;
  talking: boolean | null;
  talkingStable: boolean;
  talkingReceivedAt: number;
  validation: number;
  hint: string;
  trace: number | null;
  receivedAt: number;
}

export interface Baseline {
  pulse: number | null;
  breathing: number | null;
  source: SignalSource;
}

export interface BreathMarker {
  afterWord: number;
  reason: "rhythm" | "pause" | "pulse" | "breathing";
}

export interface ScriptSentence {
  sentenceIndex: number;
  start: number;
  end: number;
  firstWord: number;
  lastWord: number;
}

export interface SentenceMoment extends ScriptSentence {
  firstSeenSeconds: number;
  lastSeenSeconds: number;
  pulsePeak: number | null;
  breathingPeak: number | null;
}

export interface PauseEvent {
  at: number;
  word: number;
  duration: number;
}

export interface SessionPoint {
  seconds: number;
  pulse: number | null;
  breathing: number | null;
  pace: number;
  word: number;
  paused: boolean;
  talking?: boolean | null;
  breathingUsable?: boolean;
}

export interface TransportStats {
  frames: number;
  fps: number;
  width: number;
  height: number;
}

export type ServerMessage =
  | { type: "hello"; sdkVersion: string }
  | { type: "status"; status: string; code: number }
  | { type: "signal"; signal: SignalSnapshot; transport: TransportStats }
  | { type: "ack"; timestampUs: number }
  | { type: "error"; code: number; message: string; retryable: boolean };

export const emptySignal = (source: SignalSource = "live"): SignalSnapshot => ({
  source,
  pulse: null,
  breathing: null,
  talking: null,
  talkingStable: false,
  talkingReceivedAt: 0,
  validation: 0,
  hint: "",
  trace: null,
  receivedAt: 0,
});
