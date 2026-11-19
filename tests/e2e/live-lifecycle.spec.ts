import { expect, test } from "@playwright/test";

test("private room calibrates through mocked live transport and the pacing switch stops capture", async ({
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
  speaking = true;
  await expect(
    page.getByText("Pause speaking so we can collect your quiet baseline."),
  ).toBeVisible();
  await page.clock.fastForward(10_000);
  await expect(
    page.getByRole("button", { name: "Start rehearsal" }),
  ).toBeDisabled();
  speaking = false;
  await expect(
    page.getByText(/stay quiet for at least 35 seconds/u),
  ).toBeVisible();
  await page.clock.fastForward(10_000);
  await expect(
    page.getByRole("button", { name: "Start rehearsal" }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Breathing needs a full 30-second quiet window/u),
  ).toBeVisible();
  await page.clock.fastForward(26_000);
  await expect(
    page.getByRole("heading", { name: "You’re ready to begin." }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Enable Camera & Biometric Pacing" }),
  ).toBeChecked();
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
  await page.getByRole("button", { name: "Open focus view" }).click();
  await page
    .getByRole("switch", { name: "Enable Camera & Biometric Pacing" })
    .click();
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
  await page.getByRole("button", { name: "Rehearse again" }).click();
  await expect(
    page.getByRole("switch", { name: "Enable Camera & Biometric Pacing" }),
  ).not.toBeChecked();
  await page
    .getByRole("switch", { name: "Enable Camera & Biometric Pacing" })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "I agree to this camera processing." }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Consent & connect camera" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => (window as unknown as { __cameraCalls: number }).__cameraCalls,
    ),
  ).toBe(1);
  if (fixtureTimer) clearInterval(fixtureTimer);
});

test("revoking consent while camera permission is pending stops a late stream", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as unknown as {
      __cameraCalls: number;
      __resolveCamera: () => void;
      __lateCameraTrack: MediaStreamTrack;
    };
    state.__cameraCalls = 0;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () => {
        state.__cameraCalls++;
        return new Promise<MediaStream>((resolve) => {
          state.__resolveCamera = () => {
            const canvas = document.createElement("canvas");
            canvas.width = 640;
            canvas.height = 480;
            const stream = canvas.captureStream(30);
            state.__lateCameraTrack = stream.getVideoTracks()[0];
            resolve(stream);
          };
        });
      },
    });
  });
  let socketAttempts = 0;
  await page.routeWebSocket("**/api/camera", (socket) => {
    socketAttempts++;
    socket.close();
  });
  await page.goto("/");
  const toggle = page.getByRole("switch", {
    name: "Enable Camera & Biometric Pacing",
  });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await page.getByLabel("Your Presage API key").fill("fixture-key-not-real");
  const agreement = page.getByRole("checkbox", {
    name: "I agree to this camera processing.",
  });
  await expect(agreement).not.toBeChecked();
  expect(
    await page.evaluate(
      () => (window as unknown as { __cameraCalls: number }).__cameraCalls,
    ),
  ).toBe(0);
  await agreement.check();
  await page.getByRole("button", { name: "Consent & connect camera" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __cameraCalls: number }).__cameraCalls,
      ),
    )
    .toBe(1);
  await agreement.uncheck();
  await expect(
    page.getByRole("button", { name: "Consent & connect camera" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(toggle).not.toBeChecked();
  await page.evaluate(() =>
    (window as unknown as { __resolveCamera: () => void }).__resolveCamera(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __lateCameraTrack: MediaStreamTrack })
            .__lateCameraTrack.readyState,
      ),
    )
    .toBe("ended");
  expect(socketAttempts).toBe(0);
  await expect(toggle).not.toBeChecked();
});
