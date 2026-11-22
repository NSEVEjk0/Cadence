// A bounded, blank-frame integration probe. It cannot measure a person's vitals.
import { fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type { ServerMessage } from "../shared/types";

if (process.env.CADENCE_CREDENTIALS_FILE)
  process.loadEnvFile(process.env.CADENCE_CREDENTIALS_FILE);
const apiKey = process.env.CADENCE_PRESAGE_API_KEY;
if (!apiKey)
  throw new Error(
    "Set a private CADENCE_CREDENTIALS_FILE or CADENCE_PRESAGE_API_KEY; do not put keys in command arguments.",
  );
const cache = await mkdtemp(join(tmpdir(), "cadence-probe-"));
const {
  CADENCE_PRESAGE_API_KEY: _key,
  CADENCE_ROOM_TOKEN: _token,
  ...cleanEnvironment
} = process.env;
const child = fork(new URL("../server/worker.ts", import.meta.url), [], {
  serialization: "advanced",
  stdio: ["ignore", "ignore", "ignore", "ipc"],
  execArgv: ["--import", "tsx"],
  env: { ...cleanEnvironment, XDG_CACHE_HOME: cache },
});
const jpeg = await sharp({
  create: { width: 640, height: 480, channels: 3, background: "#222222" },
})
  .jpeg()
  .toBuffer();
let running = false;
let sawValidation = false;
let errorCode: number | null = null;
let errorText = "";
let inflight = 0;
const start = Date.now();
const outcome = new Promise<void>((resolve) => {
  child.on("message", (message: ServerMessage) => {
    if (message.type === "status") {
      console.log("SDK status:", message.status);
      if (message.code === 3) running = true;
    }
    if (message.type === "signal" && message.signal.validation !== 0)
      sawValidation = true;
    if (message.type === "ack") inflight = Math.max(0, inflight - 1);
    if (message.type === "error") {
      errorCode = message.code;
      errorText = message.message;
      resolve();
    }
  });
  child.on("exit", resolve);
  setTimeout(resolve, 15_000);
});
child.send({ type: "configure", apiKey, pulse: true, talking: true });
const frames = setInterval(() => {
  if (!child.connected || inflight >= 2) return;
  inflight++;
  child.send({
    type: "frame",
    width: 640,
    height: 480,
    timestampUs: Number(process.hrtime.bigint() / 1000n),
    jpeg,
  });
}, 33);
await outcome;
clearInterval(frames);
if (child.connected) child.send({ type: "stop" });
await new Promise<void>((resolve) => {
  if (child.exitCode !== null) {
    resolve();
    return;
  }
  const timeout = setTimeout(() => {
    child.kill("SIGKILL");
    resolve();
  }, 8000);
  child.once("exit", () => {
    clearTimeout(timeout);
    resolve();
  });
});
await rm(cache, { recursive: true, force: true });
if (errorCode !== null) {
  console.log(`SDK probe stopped with code ${errorCode}: ${errorText}`);
  process.exitCode = 1;
} else if (!running || !sawValidation) {
  console.log(
    `Probe incomplete after ${Math.round((Date.now() - start) / 1000)}s: running=${running}, input-validation=${sawValidation}.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    "Authenticated SDK session started and processed generated blank camera frames.",
  );
}
