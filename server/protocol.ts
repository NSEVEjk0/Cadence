import type { IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";

export const FRAME_HEADER_BYTES = 16;
export const MAX_FRAME_BYTES = 550_000;
export const MAX_SESSION_SECONDS = 15 * 60;

export function allowedOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin || !request.headers.host) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.host !== request.headers.host) return false;
    return (
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname))
    );
  } catch {
    return false;
  }
}

export function parseFrame(buffer: Buffer): {
  width: number;
  height: number;
  timestampUs: number;
  jpeg: Buffer;
} {
  if (buffer.length <= FRAME_HEADER_BYTES || buffer.length > MAX_FRAME_BYTES)
    throw new Error("Invalid frame size.");
  const width = buffer.readUInt16LE(0);
  const height = buffer.readUInt16LE(2);
  const timestampUs = buffer.readDoubleLE(8);
  if (
    width < 240 ||
    height < 240 ||
    width > 1280 ||
    height > 1280 ||
    width * height > 1280 * 720 ||
    !Number.isSafeInteger(timestampUs) ||
    timestampUs < 1
  )
    throw new Error("Invalid frame header.");
  const jpeg = buffer.subarray(FRAME_HEADER_BYTES);
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8)
    throw new Error("Only JPEG camera frames are accepted.");
  return { width, height, timestampUs, jpeg };
}

export function parseConfiguration(value: unknown): {
  apiKey: string;
  roomToken: string;
  pulse: boolean;
  talking: boolean;
} {
  if (!value || typeof value !== "object")
    throw new Error("Confirm camera consent before connecting.");
  const input = value as Record<string, unknown>;
  if (input.type !== "configure" || input.consent !== true)
    throw new Error("Camera processing requires explicit consent.");
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const roomToken = typeof input.roomToken === "string" ? input.roomToken : "";
  if (
    (!roomToken && apiKey.length < 8) ||
    apiKey.length > 2048 ||
    roomToken.length > 128 ||
    /[\r\n\0]/u.test(apiKey + roomToken)
  ) {
    throw new Error("Enter your Presage developer API key.");
  }
  return {
    apiKey,
    roomToken,
    pulse: input.pulse !== false,
    talking: input.talking !== false,
  };
}

export function resolveSessionKey(
  configuration: { apiKey: string; roomToken: string },
  privateKey: string,
  privateToken: string,
): string {
  if (configuration.roomToken) {
    const supplied = Buffer.from(configuration.roomToken);
    const expected = Buffer.from(privateToken);
    if (
      !privateKey ||
      !privateToken ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      throw new Error(
        "This private rehearsal link is not valid. Use your own Presage key or reopen the current private link.",
      );
    }
    return privateKey;
  }
  return configuration.apiKey;
}
