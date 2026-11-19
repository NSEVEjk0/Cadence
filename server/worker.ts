import sharp from "sharp";
import {
  SmartSpectraSDK,
  MetricType,
  PixelFormat,
  ProcessingStatus,
  SmartSpectraLogLevel,
} from "@smartspectra/node-sdk";
import { decodeMetrics } from "@smartspectra/node-sdk/messages";
import { mergeMetrics } from "../shared/metrics";
import {
  emptySignal,
  type ServerMessage,
  type SignalSnapshot,
} from "../shared/types";

sharp.cache(false);
sharp.concurrency(1);
let sdk: SmartSpectraSDK | null = null;
let apiKey = "";
let stopped = false;
let busy = false;
let signal: SignalSnapshot = emptySignal();
let frames = 0;
let width = 0;
let height = 0;
let lastEmit = 0;
const frameTimes: number[] = [];
const send = (message: ServerMessage) => {
  if (process.connected) process.send?.(message);
};

function emitSignal(now: number): void {
  if (now - lastEmit < 100) return;
  lastEmit = now;
  while (frameTimes.length && frameTimes[0] < now - 2000) frameTimes.shift();
  signal.receivedAt = now;
  send({
    type: "signal",
    signal,
    transport: { frames, fps: frameTimes.length / 2, width, height },
  });
}

function safeMessage(code: number, message: string): string {
  const messages: Record<number, string> = {
    2: "Presage could not authenticate this key. Check the key in your developer account.",
    3: "These signals could not be configured. Try disabling pulse or speech-pause sensing.",
    4: "This Presage account has no remaining trial credits. Check your developer account.",
    5: "Presage could not be reached. Check the connection and start a fresh session.",
    7: "The camera input could not be opened. Reconnect your phone camera.",
    13: "Your key is not enabled for a requested signal. Try disabling pulse or speech-pause sensing.",
    14: "The camera feed is too slow for reliable signals. Use a stronger connection and restart.",
  };
  return (
    messages[code] ??
    (apiKey ? message.replaceAll(apiKey, "[redacted]") : message).slice(0, 350)
  );
}

async function stop(): Promise<void> {
  if (stopped) return;
  stopped = true;
  try {
    await sdk?.stopAsync();
    await sdk?.destroy();
  } catch {
    /* A parent timeout also bounds native teardown. */
  }
  sdk = null;
  apiKey = "";
  signal = emptySignal();
  process.exit(0);
}

process.on(
  "message",
  async (message: {
    type: string;
    apiKey?: string;
    pulse?: boolean;
    talking?: boolean;
    width?: number;
    height?: number;
    timestampUs?: number;
    jpeg?: Buffer;
  }) => {
    if (stopped) return;
    try {
      if (message.type === "stop") {
        await stop();
        return;
      }
      if (message.type === "configure") {
        if (sdk || !message.apiKey)
          throw new Error("Invalid camera processor configuration.");
        apiKey = message.apiKey;
        const requestedMetrics: number[] = [
          MetricType.CHEST_BREATHING,
          MetricType.BREATHING_RATE,
        ];
        if (message.pulse) requestedMetrics.push(MetricType.PULSE_RATE);
        if (message.talking) requestedMetrics.push(MetricType.TALKING);
        sdk = new SmartSpectraSDK({
          apiKey,
          requestedMetrics,
          enableTelemetry: false,
          enableAccumulatedOutput: false,
          logLevel: SmartSpectraLogLevel.kNone,
        });
        sdk.on("processingStatus", (code) => {
          const status =
            Object.entries(ProcessingStatus)
              .find(([, value]) => value === code)?.[0]
              .replace(/^k/u, "") ?? "Starting";
          send({ type: "status", status, code });
        });
        sdk.on("validationStatus", (code, _timestamp, hint) => {
          signal.validation = code;
          signal.hint = apiKey
            ? (hint ?? "").replaceAll(apiKey, "[redacted]")
            : (hint ?? "");
          emitSignal(Date.now());
        });
        sdk.on("metrics", (buffer) => {
          const now = Date.now();
          signal = mergeMetrics(signal, decodeMetrics(buffer), now);
          emitSignal(now);
        });
        sdk.on("error", (code, message, retryable) => {
          send({
            type: "error",
            code,
            message: safeMessage(code, message),
            retryable,
          });
          void stop();
        });
        sdk.useCustomInput();
        sdk.start();
        return;
      }
      if (message.type === "frame") {
        if (busy || !sdk) {
          send({ type: "ack", timestampUs: message.timestampUs ?? 0 });
          return;
        }
        busy = true;
        try {
          // decode stays in RAM; the application has no video-recording path.
          const { data, info } = await sharp(message.jpeg, {
            limitInputPixels: 1280 * 720,
            failOn: "warning",
          })
            .toColourspace("srgb")
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          if (
            info.width !== message.width ||
            info.height !== message.height ||
            info.channels !== 3
          )
            throw new Error(
              "The camera frame dimensions changed. Please reconnect.",
            );
          if (stopped) return;
          sdk.sendFrame(
            data,
            info.width,
            info.height,
            info.width * 3,
            PixelFormat.kRGB,
            message.timestampUs!,
          );
          frames++;
          width = info.width;
          height = info.height;
          frameTimes.push(Date.now());
        } finally {
          busy = false;
          send({ type: "ack", timestampUs: message.timestampUs ?? 0 });
        }
      }
    } catch (error) {
      const code =
        typeof (error as { code?: unknown })?.code === "number"
          ? Number((error as { code: number }).code)
          : 500;
      send({
        type: "error",
        code,
        message: safeMessage(
          code,
          error instanceof Error ? error.message : "Camera processing failed.",
        ),
        retryable: false,
      });
      await stop();
    }
  },
);
process.on("disconnect", () => {
  void stop();
});
process.on("SIGTERM", () => {
  void stop();
});
