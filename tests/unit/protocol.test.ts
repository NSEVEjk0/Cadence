import { describe, expect, it } from "vitest";
import {
  allowedOrigin,
  parseConfiguration,
  parseFrame,
  resolveSessionKey,
} from "../../server/protocol";
import type { IncomingMessage } from "node:http";

describe("private camera protocol", () => {
  it("requires explicit consent and keeps a server key behind a private token", () => {
    expect(() =>
      parseConfiguration({
        type: "configure",
        apiKey: "test-key-not-a-secret",
      }),
    ).toThrow(/consent/iu);
    const config = parseConfiguration({
      type: "configure",
      consent: true,
      roomToken: "a-private-room-token",
      pulse: false,
    });
    expect(config.pulse).toBe(false);
    expect(
      resolveSessionKey(
        config,
        "test-key-not-a-secret",
        "a-private-room-token",
      ),
    ).toBe("test-key-not-a-secret");
    expect(() =>
      resolveSessionKey(
        { apiKey: "", roomToken: "wrong-token" },
        "test-key-not-a-secret",
        "a-private-room-token",
      ),
    ).toThrow(/not valid/u);
    expect(
      resolveSessionKey(
        { apiKey: "visitor-key-not-a-secret", roomToken: "" },
        "test-key-not-a-secret",
        "a-private-room-token",
      ),
    ).toBe("visitor-key-not-a-secret");
  });
  it("rejects foreign origins and requires HTTPS outside loopback", () => {
    const request = (origin: string, host: string) =>
      ({ headers: { origin, host } }) as IncomingMessage;
    expect(
      allowedOrigin(request("https://cadence.example", "cadence.example")),
    ).toBe(true);
    expect(
      allowedOrigin(request("https://foreign.example", "cadence.example")),
    ).toBe(false);
    expect(
      allowedOrigin(request("http://cadence.example", "cadence.example")),
    ).toBe(false);
    expect(
      allowedOrigin(request("http://127.0.0.1:45300", "127.0.0.1:45300")),
    ).toBe(true);
  });
  it("bounds image geometry and accepts a monotonic numeric capture timestamp", () => {
    const buffer = Buffer.alloc(20);
    buffer.writeUInt16LE(640, 0);
    buffer.writeUInt16LE(480, 2);
    buffer.writeDoubleLE(1234567, 8);
    buffer[16] = 0xff;
    buffer[17] = 0xd8;
    expect(parseFrame(buffer).width).toBe(640);
    buffer.writeUInt16LE(5000, 0);
    expect(() => parseFrame(buffer)).toThrow(/header/u);
  });
});
