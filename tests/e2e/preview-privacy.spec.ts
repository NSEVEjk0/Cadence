import { expect, test } from "@playwright/test";

test("camera preview stays hidden by default while camera frames continue", async ({
  page,
}) => {
  // An animated canvas exercises capture without recording any human footage
  // or claiming a physiological measurement. The SDK transport is mocked.
  await page.addInitScript(() => {
    const state = window as unknown as {
      __previewTrack: MediaStreamTrack;
      __previewCameraCalls: number;
    };
    state.__previewCameraCalls = 0;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        state.__previewCameraCalls++;
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const context = canvas.getContext("2d")!;
        let frame = 0;
        const draw = () => {
          context.fillStyle = "#888";
          context.fillRect(0, 0, 640, 480);
          context.fillStyle = "#b74b53";
          context.fillRect((frame++ * 7) % 600, 0, 40, 480);
        };
        draw();
        const stream = canvas.captureStream(30);
        const timer = setInterval(draw, 1000 / 30);
        state.__previewTrack = stream.getVideoTracks()[0];
        const stop = state.__previewTrack.stop.bind(state.__previewTrack);
        state.__previewTrack.stop = () => {
          clearInterval(timer);
          stop();
        };
        return stream;
      },
    });
  });
  let frames = 0;
  let configurations = 0;
  await page.routeWebSocket("**/api/camera", (socket) => {
    socket.onMessage((data) => {
      if (typeof data === "string") {
        configurations++;
        expect(JSON.parse(data).consent).toBe(true);
        socket.send(
          JSON.stringify({ type: "status", code: 3, status: "Running" }),
        );
        return;
      }
      frames++;
      socket.send(
        JSON.stringify({
          type: "ack",
          timestampUs: Buffer.from(data).readDoubleLE(8),
        }),
      );
    });
  });
  await page.goto("/#room=fixture_room_token_12345678901234");
  await expect(
    page.getByRole("checkbox", { name: "Show camera preview" }),
  ).not.toBeChecked();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __previewCameraCalls: number })
          .__previewCameraCalls,
    ),
  ).toBe(0);
  await page
    .getByRole("checkbox", { name: "I agree to this camera processing." })
    .check();
  await page.getByRole("button", { name: "Consent & connect camera" }).click();
  await expect(
    page.getByRole("img", { name: "Camera preview hidden" }),
  ).toBeVisible();
  await expect(page.locator(".camera-preview video")).toHaveCount(0);
  await expect.poll(() => frames, { timeout: 10_000 }).toBeGreaterThan(10);
  await expect(
    page.getByRole("button", { name: "Camera on", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show preview", exact: true }).click();
  await expect(page.locator(".camera-preview video")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".camera-preview video")
        .evaluate((video: HTMLVideoElement) => video.videoWidth),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Hide preview", exact: true }).click();
  await expect(page.locator(".camera-preview video")).toHaveCount(0);
  const before = frames;
  await expect
    .poll(() => frames, { timeout: 10_000 })
    .toBeGreaterThan(before + 10);
  expect(configurations).toBe(1);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __previewCameraCalls: number })
          .__previewCameraCalls,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __previewTrack: MediaStreamTrack })
          .__previewTrack.readyState,
    ),
  ).toBe("live");
  await page.getByRole("button", { name: "Camera on", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __previewTrack: MediaStreamTrack })
          .__previewTrack.readyState,
    ),
  ).toBe("ended");
});
