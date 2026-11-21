import type {
  ServerMessage,
  SignalSnapshot,
  TransportStats,
} from "../shared/types";

const MAX_FRAME_SIDE = 480;
const JPEG_QUALITY = 0.9;

export interface CameraCallbacks {
  onStream: (stream: MediaStream | null) => void;
  onSignal: (signal: SignalSnapshot, transport: TransportStats) => void;
  onStatus: (status: string) => void;
  onError: (message: string) => void;
}

export class CameraConnection {
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private frameCallback = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private encoding = 0;
  private delivery = Promise.resolve();
  private inflight = new Map<number, number>();
  private cameraFrameTimes: number[] = [];
  private sentFrameTimes: number[] = [];
  private lastTimestamp = 0;
  private visibility = () => {
    if (document.hidden) {
      this.stop();
      this.callbacks.onError(
        "The camera stopped when this page went into the background. Reconnect when you are ready.",
      );
    }
  };

  constructor(private callbacks: CameraCallbacks) {}

  async connect(
    apiKey: string,
    pulse: boolean,
    talking: boolean,
    roomToken = "",
  ): Promise<void> {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Camera access needs HTTPS and a browser with camera support. Open the secure app link in Safari or Chrome.",
      );
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      if (this.stopped) {
        this.stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.callbacks.onStream(this.stream);
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.setAttribute("aria-hidden", "true");
      video.style.cssText =
        "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;bottom:0";
      video.srcObject = this.stream;
      document.body.appendChild(video);
      this.video = video;
      await video.play();
      if (this.stopped) return;
      const socket = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/camera`,
      );
      this.socket = socket;
      socket.binaryType = "arraybuffer";
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () =>
            reject(
              new Error("The camera server did not respond. Please try again."),
            ),
          12_000,
        );
        socket.onopen = () => {
          clearTimeout(timeout);
          if (this.stopped) {
            socket.close();
            resolve();
            return;
          }
          socket.send(
            JSON.stringify({
              type: "configure",
              apiKey,
              roomToken,
              pulse,
              talking,
              consent: true,
            }),
          );
          resolve();
        };
        socket.onerror = () => {
          clearTimeout(timeout);
          reject(
            new Error(
              "The camera connection could not be opened. Please try again.",
            ),
          );
        };
        socket.onclose = () => {
          clearTimeout(timeout);
          reject(
            new Error("The camera connection closed before it was ready."),
          );
        };
      });
      socket.onmessage = (event) => {
        if (this.stopped) return;
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (message.type === "ack") this.inflight.delete(message.timestampUs);
        if (message.type === "status") this.callbacks.onStatus(message.status);
        if (message.type === "signal") {
          // Use ages relative to receipt; a phone and server need not share a clock.
          const received = Date.now();
          const serverNow = message.signal.receivedAt;
          const localAge = (serverTime: number) =>
            received - Math.max(0, serverNow - serverTime);
          const normalized = {
            ...message.signal,
            receivedAt: received,
            pulse: message.signal.pulse
              ? {
                  ...message.signal.pulse,
                  receivedAt: localAge(message.signal.pulse.receivedAt),
                }
              : null,
            breathing: message.signal.breathing
              ? {
                  ...message.signal.breathing,
                  receivedAt: localAge(message.signal.breathing.receivedAt),
                }
              : null,
            talkingReceivedAt: localAge(message.signal.talkingReceivedAt),
          };
          this.callbacks.onSignal(normalized, message.transport);
        }
        if (message.type === "error") {
          const rates =
            message.code === 14
              ? ` Phone camera rate: ${this.rate(this.cameraFrameTimes).toFixed(0)} fps; phone sending rate: ${this.rate(this.sentFrameTimes).toFixed(0)} fps.`
              : "";
          this.stop();
          this.callbacks.onError(message.message + rates);
        }
      };
      socket.onclose = () => {
        if (!this.stopped) {
          this.stop();
          this.callbacks.onError(
            "Your camera connection ended. Your script is still here; reconnect when ready.",
          );
        }
      };
      socket.onerror = () => {
        if (!this.stopped) {
          this.stop();
          this.callbacks.onError(
            "The camera connection was interrupted. Please reconnect.",
          );
        }
      };
      document.addEventListener("visibilitychange", this.visibility);
      const canvas =
        typeof OffscreenCanvas === "function"
          ? new OffscreenCanvas(1, 1)
          : document.createElement("canvas");
      const context =
        canvas instanceof HTMLCanvasElement
          ? canvas.getContext("2d", { alpha: false })
          : canvas.getContext("2d", { alpha: false });
      if (!context)
        throw new Error(
          "This browser cannot prepare camera frames. Try Safari or Chrome.",
        );
      const capture = (now: number) => {
        if (this.stopped || !this.video) return;
        this.schedule(capture);
        this.countFrame(this.cameraFrameTimes, now);
        // Bound memory and latency instead of queuing an old video stream.
        // Acknowledgements can take hundreds of milliseconds on mobile. Allow
        // one second of frames in flight so that latency does not cap 30 fps.
        for (const [timestamp, sent] of this.inflight) {
          if (performance.now() - sent > 10_000) {
            this.stop();
            this.callbacks.onError(
              "The camera feed stopped responding. Reconnect on a stronger connection.",
            );
            return;
          }
        }
        if (
          this.encoding >= 3 ||
          this.inflight.size >= 30 ||
          socket.bufferedAmount > 256_000 ||
          socket.readyState !== WebSocket.OPEN
        )
          return;
        const scale = Math.min(
          1,
          MAX_FRAME_SIDE / Math.max(video.videoWidth, video.videoHeight),
        );
        const width = Math.floor((video.videoWidth * scale) / 2) * 2;
        const height = Math.floor((video.videoHeight * scale) / 2) * 2;
        if (width < 240 || height < 240) return;
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        context.drawImage(video, 0, 0, width, height);
        this.encoding++;
        const timestampUs = Math.max(
          this.lastTimestamp + 1,
          Math.round(now * 1000),
        );
        this.lastTimestamp = timestampUs;
        // Chrome may finish an encode after the next camera frame is ready.
        // Prepare at most three images at once, then send them in capture order.
        // OffscreenCanvas avoids Chrome's idle scheduling in canvas.toBlob.
        const image =
          canvas instanceof HTMLCanvasElement
            ? new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
              )
            : canvas.convertToBlob({
                type: "image/jpeg",
                quality: JPEG_QUALITY,
              });
        this.delivery = this.delivery.then(async () => {
          try {
            const blob = await image;
            if (!blob || this.stopped || socket.readyState !== WebSocket.OPEN)
              return;
            const jpeg = new Uint8Array(await blob.arrayBuffer());
            if (
              this.stopped ||
              socket.readyState !== WebSocket.OPEN ||
              this.inflight.size >= 30 ||
              socket.bufferedAmount > 256_000
            )
              return;
            const frame = new Uint8Array(16 + jpeg.length);
            const header = new DataView(frame.buffer);
            header.setUint16(0, width, true);
            header.setUint16(2, height, true);
            header.setFloat64(8, timestampUs, true);
            frame.set(jpeg, 16);
            this.inflight.set(timestampUs, performance.now());
            socket.send(frame);
            this.countFrame(this.sentFrameTimes, performance.now());
          } catch {
            if (!this.stopped) {
              this.stop();
              this.callbacks.onError(
                "This browser could not prepare camera frames. Please reconnect.",
              );
            }
          } finally {
            this.encoding--;
          }
        });
      };
      this.schedule(capture);
    } catch (error) {
      this.stop();
      if (
        error instanceof DOMException &&
        ["NotAllowedError", "PermissionDeniedError"].includes(error.name)
      ) {
        throw new Error(
          "Camera permission was declined. Allow the camera in your browser settings, then try again.",
        );
      }
      if (error instanceof DOMException && error.name === "NotFoundError")
        throw new Error("No camera was found. Open Cadence on your phone.");
      throw error;
    }
  }

  private countFrame(times: number[], now: number): void {
    times.push(now);
    while (times.length && times[0] < now - 2_000) times.shift();
  }

  private rate(times: number[]): number {
    const recent = times.filter((time) => time >= performance.now() - 2_000);
    if (recent.length < 2) return 0;
    const elapsed = recent[recent.length - 1] - recent[0];
    return elapsed > 0 ? ((recent.length - 1) * 1000) / elapsed : 0;
  }

  private schedule(callback: (now: number) => void): void {
    if (this.stopped || !this.video) return;
    if ("requestVideoFrameCallback" in this.video)
      this.frameCallback = this.video.requestVideoFrameCallback(callback);
    else this.timer = setTimeout(() => callback(performance.now()), 33);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    document.removeEventListener("visibilitychange", this.visibility);
    if (this.frameCallback && this.video?.cancelVideoFrameCallback)
      this.video.cancelVideoFrameCallback(this.frameCallback);
    if (this.timer) clearTimeout(this.timer);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video?.pause();
    if (this.video) this.video.srcObject = null;
    this.video?.remove();
    this.video = null;
    if (this.socket && this.socket.readyState < WebSocket.CLOSING)
      this.socket.close(1000, "Camera stopped");
    this.socket = null;
    this.inflight.clear();
    this.callbacks.onStream(null);
  }
}
