// Exercise the hosted WSS -> JPEG decoder -> native SDK path with blank frames.
// This checks transport and lifecycle, not biological accuracy or live vitals.
import { readFile } from "node:fs/promises";
import { WebSocket } from "ws";
import sharp from "sharp";
import type { ServerMessage } from "../shared/types";

const credentials = process.env.CADENCE_CREDENTIALS_FILE;
if (credentials) process.loadEnvFile(credentials);
const roomToken = process.env.CADENCE_ROOM_TOKEN;
if (!roomToken)
  throw new Error("A private room token is required for this operator check.");
const origin =
  process.env.CADENCE_TEST_ORIGIN ??
  JSON.parse(await readFile("/root/.config/cadence/deployment.json", "utf8"))
    .publicOrigin;
const ws = new WebSocket(origin.replace(/^http/u, "ws") + "/api/camera", {
  headers: { Origin: origin },
});
const jpeg = await sharp({
  create: { width: 640, height: 480, channels: 3, background: "#222222" },
})
  .jpeg()
  .toBuffer();
let acknowledged = 0;
let validation = false;
let running = false;
let inflight = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let error = "";
const done = new Promise<void>((resolve) => {
  const timeout = setTimeout(resolve, 12_000);
  ws.on("open", () => {
    ws.send(
      JSON.stringify({
        type: "configure",
        consent: true,
        roomToken,
        pulse: true,
        talking: true,
      }),
    );
    timer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN || inflight >= 2) return;
      const buffer = Buffer.alloc(16 + jpeg.length);
      buffer.writeUInt16LE(640, 0);
      buffer.writeUInt16LE(480, 2);
      buffer.writeDoubleLE(Number(process.hrtime.bigint() / 1000n), 8);
      jpeg.copy(buffer, 16);
      inflight++;
      ws.send(buffer);
    }, 33);
  });
  ws.on("message", (data) => {
    const message: ServerMessage = JSON.parse(data.toString());
    if (message.type === "status" && message.code === 3) running = true;
    if (message.type === "ack") {
      acknowledged++;
      inflight = Math.max(0, inflight - 1);
    }
    if (message.type === "signal" && message.signal.validation !== 0)
      validation = true;
    if (message.type === "error") {
      error = `code ${message.code}: ${message.message}`;
      clearTimeout(timeout);
      resolve();
    }
  });
  ws.on("error", () => {
    error = "The secure WebSocket could not connect.";
    clearTimeout(timeout);
    resolve();
  });
  ws.on("close", () => {
    clearTimeout(timeout);
    resolve();
  });
});
await done;
if (timer) clearInterval(timer);
ws.close(1000, "Operator transport check complete");
if (error || !running || !validation || acknowledged < 10) {
  console.log(
    "Hosted camera check failed:",
    error ||
      `running=${running}, validation=${validation}, acknowledged=${acknowledged}`,
  );
  process.exitCode = 1;
} else
  console.log(
    `Public HTTPS/WSS, private-room authentication, JPEG decoding and native processing passed (${acknowledged} blank frames acknowledged). No real physiological readings were claimed.`,
  );
