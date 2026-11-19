import { expect, test } from "@playwright/test";

test("private room calibrates through mocked live transport and stops camera tracks on finish", async ({
  page,
}) => {
  // Invented transport fixtures are confined to this test; no Presage service
  // is contacted and no result is represented as a physiological measurement.
  await page.clock.install();
  await page.addInitScript(() => {
    (window as unknown as { __cameraCalls: number }).__cameraCalls = 0;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const state = window as unknown as {
          __cameraCalls: number;
          __cameraTrack: MediaStreamTrack;
        };
        state.__cameraCalls++;
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#888";
        context.fillRect(0, 0, 640, 480);
        const stream = canvas.captureStream(30);
        state.__cameraTrack = stream.getVideoTracks()[0];
        return stream;
      },
    });
  });
  let pulse = 72;
  let speaking = false;
  let receivedConfiguration = false;
  let packets = 0;
  let fixtureTimer: ReturnType<typeof setInterval> | null = null;
  await page.routeWebSocket("**/api/camera", (socket) => {
    socket.onMessage((data) => {
      if (typeof data !== "string") {
        const buffer = Buffer.from(data);
        socket.send(
          JSON.stringify({ type: "ack", timestampUs: buffer.readDoubleLE(8) }),
        );
        return;
      }
      const configuration = JSON.parse(data);
      expect(configuration.consent).toBe(true);
      expect(configuration.apiKey).toBe("");
      expect(configuration.roomToken).toBe("fixture_room_token_12345678901234");
      receivedConfiguration = true;
      socket.send(
        JSON.stringify({ type: "status", status: "Running", code: 3 }),
      );
      fixtureTimer = setInterval(() => {
        packets++;
        const now = Date.now();
        const reading = (value: number) => ({
          value,
          confidence: 80,
          stable: true,
          receivedAt: now,
          timestampUs: packets * 1000000,
        });
        socket.send(
          JSON.stringify({
            type: "signal",
            transport: {
              frames: packets * 10,
              fps: 30,
              width: 640,
              height: 480,
            },
            signal: {
              source: "live",
              pulse: reading(pulse),
              breathing: reading(14),
              talking: speaking,
              talkingStable: true,
              talkingReceivedAt: now,
              validation: 0,
              hint: "",
              trace: null,
              receivedAt: now,
            },
          }),
        );
      }, 200);
    });
    socket.onClose(() => {
      if (fixtureTimer) clearInterval(fixtureTimer);
    });
  });
  await page.goto("/#room=fixture_room_token_12345678901234");
  await expect(
    page.getByText("Your private rehearsal room is ready."),
  ).toBeVisible();
  expect(page.url()).not.toContain("#room=");
  expect(
    await page.evaluate(
      () => (window as unknown as { __cameraCalls: number }).__cameraCalls,
    ),
  ).toBe(0);
  await page
    .getByRole("checkbox", { name: "I agree to this camera processing." })
    .check();
  await page.getByRole("button", { name: "Consent & connect camera" }).click();
  await expect(
    page.getByRole("heading", { name: "Sit still. Breathe normally." }),
  ).toBeVisible();
  await expect.poll(() => packets).toBeGreaterThan(4);
  await page.clock.fastForward(36_000);
  await expect(
    page.getByRole("heading", { name: "You’re ready to begin." }),
  ).toBeVisible();
  expect(receivedConfiguration).toBe(true);
  await page.getByRole("button", { name: "Start rehearsal" }).click();
  speaking = true;
  pulse = 104;
  await page.clock.resume();
  await expect
    .poll(async () =>
      Number(
        (await page.getByTestId("pace-value").textContent())?.replace(
          /\D/gu,
          "",
        ),
      ),
    )
    .toBeLessThan(120);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(
    page.getByText("PRESAGE REHEARSAL", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __cameraTrack: MediaStreamTrack }).__cameraTrack
          .readyState,
    ),
  ).toBe("ended");
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  if (fixtureTimer) clearInterval(fixtureTimer);
});
