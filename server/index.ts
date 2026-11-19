import express from "express";
import { createServer } from "node:http";
import { fork, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import {
  allowedOrigin,
  MAX_FRAME_BYTES,
  MAX_SESSION_SECONDS,
  parseConfiguration,
  parseFrame,
  resolveSessionKey,
} from "./protocol";
import type { ServerMessage } from "../shared/types";

if (existsSync(".env")) process.loadEnvFile(".env");
if (
  process.env.CADENCE_CREDENTIALS_FILE &&
  existsSync(process.env.CADENCE_CREDENTIALS_FILE)
)
  process.loadEnvFile(process.env.CADENCE_CREDENTIALS_FILE);
const privateKey = process.env.CADENCE_PRESAGE_API_KEY ?? "";
const privateToken = process.env.CADENCE_ROOM_TOKEN ?? "";
// Never pass the owner's credentials to another visitor's worker environment.
const {
  CADENCE_PRESAGE_API_KEY: _privateKey,
  CADENCE_ROOM_TOKEN: _privateToken,
  CADENCE_CREDENTIALS_FILE: _credentialFile,
  ...workerEnvironment
} = process.env;
const isDev = process.argv.includes("--dev");
const host = process.env.CADENCE_HOST ?? "127.0.0.1";
const port = Number(process.env.CADENCE_PORT ?? 45300);
const app = express();
app.disable("x-powered-by");
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=()",
  );
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Cache-Control", "no-store");
  if (!isDev)
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
  next();
});
app.get("/api/health", (_request, response) =>
  response.json({
    ok: true,
    sdkVersion: "3.5.0",
    cameraSource: "your-browser",
  }),
);

const server = createServer(app);
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: MAX_FRAME_BYTES,
  perMessageDeflate: false,
});
const workers = new Set<ChildProcess>();
const pendingConnections = new Set<WebSocket>();
const maxSessions = 2;

server.on("upgrade", (request, socket, head) => {
  if (isDev && request.url !== "/api/camera") return;
  if (
    request.url !== "/api/camera" ||
    !allowedOrigin(request) ||
    pendingConnections.size >= 12
  ) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws));
});

wss.on("connection", (ws: WebSocket) => {
  pendingConnections.add(ws);
  let worker: ChildProcess | null = null;
  let configured = false;
  let closing = false;
  let inflight = 0;
  let frameSecond = Date.now();
  let framesInSecond = 0;
  let alive = true;
  let lastCaptureTimestamp = 0;
  let cacheDirectory: string | null = null;
  const send = (message: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  };
  const fail = (code: number, message: string, retryable = false) => {
    send({ type: "error", code, message, retryable });
    if (ws.readyState === WebSocket.OPEN)
      ws.close(1008, "Camera session ended");
  };
  const consentTimeout = setTimeout(() => {
    if (!configured)
      fail(400, "Connect again when your key and camera consent are ready.");
  }, 20_000);
  const sessionTimeout = setTimeout(
    () =>
      fail(
        408,
        "The 15-minute camera session has ended. Start a fresh rehearsal when ready.",
      ),
    MAX_SESSION_SECONDS * 1000,
  );
  const heartbeat = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, 15_000);
  ws.on("pong", () => {
    alive = true;
  });
  send({ type: "hello", sdkVersion: "3.5.0" });

  ws.on("message", (data, binary) => {
    try {
      if (!binary) {
        if (configured) {
          fail(400, "This camera connection is already configured.");
          return;
        }
        if (
          (data instanceof ArrayBuffer ? data.byteLength : data.length) > 4096
        ) {
          fail(400, "Configuration is too large.");
          return;
        }
        const configuration = parseConfiguration(JSON.parse(data.toString()));
        const sessionKey = resolveSessionKey(
          configuration,
          privateKey,
          privateToken,
        );
        if (workers.size >= maxSessions) {
          fail(
            429,
            "Both rehearsal rooms are in use. Try again in a moment.",
            true,
          );
          return;
        }
        configured = true;
        clearTimeout(consentTimeout);
        // Native SDK state is process-global. Separate processes isolate keys,
        // metrics, crashes, and shutdown for different people's camera sessions.
        const workerPath = new URL(
          isDev ? "./worker.ts" : "./worker.mjs",
          import.meta.url,
        );
        cacheDirectory = mkdtempSync(join(tmpdir(), "cadence-session-"));
        worker = fork(fileURLToPath(workerPath), [], {
          serialization: "advanced",
          stdio: ["ignore", "ignore", "ignore", "ipc"],
          execArgv: isDev ? ["--import", "tsx"] : [],
          env: {
            ...workerEnvironment,
            CADENCE_CAMERA_WORKER: "1",
            XDG_CACHE_HOME: cacheDirectory,
          },
        });
        workers.add(worker);
        worker.on("message", (message: ServerMessage) => {
          if (message.type === "ack") inflight = Math.max(0, inflight - 1);
          send(message);
          if (message.type === "error")
            ws.close(1011, "Camera processing stopped");
        });
        worker.on("exit", () => {
          if (worker) workers.delete(worker);
          if (cacheDirectory)
            void rm(cacheDirectory, { recursive: true, force: true });
          if (!closing)
            fail(
              500,
              "Camera processing stopped. Reconnect to start a fresh session.",
              true,
            );
        });
        worker.on("error", () =>
          fail(
            500,
            "The camera processor could not start. Please reconnect.",
            true,
          ),
        );
        worker.send({
          type: "configure",
          apiKey: sessionKey,
          pulse: configuration.pulse,
          talking: configuration.talking,
        });
        return;
      }
      if (!worker?.connected || !configured) {
        fail(400, "Connect and consent before sending camera frames.");
        return;
      }
      const buffer = Buffer.isBuffer(data)
        ? data
        : Buffer.from(data as ArrayBuffer);
      const frame = parseFrame(buffer);
      if (frame.timestampUs <= lastCaptureTimestamp) {
        fail(
          400,
          "Camera timestamps must move forward. Reconnect your camera.",
        );
        return;
      }
      lastCaptureTimestamp = frame.timestampUs;
      const now = Date.now();
      if (now - frameSecond >= 1000) {
        frameSecond = now;
        framesInSecond = 0;
      }
      framesInSecond++;
      if (inflight >= 3 || framesInSecond > 40) {
        send({ type: "ack", timestampUs: frame.timestampUs });
        return;
      }
      inflight++;
      worker.send({ type: "frame", ...frame }, (error) => {
        if (error)
          fail(500, "The camera connection stopped. Please reconnect.", true);
      });
    } catch (error) {
      // Validation errors contain app-owned text only; never echo a key or input.
      fail(
        400,
        error instanceof SyntaxError
          ? "Invalid camera configuration."
          : error instanceof Error
            ? error.message
            : "Invalid camera request.",
      );
    }
  });
  const cleanup = () => {
    if (closing) return;
    closing = true;
    pendingConnections.delete(ws);
    clearTimeout(consentTimeout);
    clearTimeout(sessionTimeout);
    clearInterval(heartbeat);
    if (worker?.connected) worker.send({ type: "stop" });
    if (!worker && cacheDirectory)
      void rm(cacheDirectory, { recursive: true, force: true });
    if (worker) {
      const current = worker;
      const terminate = setTimeout(() => {
        if (current.exitCode === null) current.kill("SIGKILL");
      }, 10_000);
      terminate.unref();
      current.once("exit", () => clearTimeout(terminate));
    }
  };
  ws.on("close", cleanup);
  ws.on("error", cleanup);
});

if (isDev) {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(
    express.static(resolve("dist"), { etag: false, index: "index.html" }),
  );
  app.get("/{*path}", (_request, response) =>
    response.sendFile(resolve("dist/index.html")),
  );
}

server.listen(port, host, () =>
  console.log(`Cadence is ready at http://${host}:${port}`),
);
const shutdown = () => {
  for (const socket of wss.clients) socket.close(1001, "Server stopping");
  for (const worker of workers)
    if (worker.connected) worker.send({ type: "stop" });
  server.close();
  setTimeout(() => process.exit(0), 10_000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
