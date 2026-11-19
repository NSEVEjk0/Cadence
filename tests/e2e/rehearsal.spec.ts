import { expect, test } from "@playwright/test";

test("simulation adapts scrolling, holds an observed pause, and exports a marked script", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Find your rhythm." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connect camera" }).click();
  await expect(
    page.getByRole("button", { name: "Consent & connect camera" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Try a simulation" }).click();
  await expect(page.getByText("Simulated signals · no camera")).toBeVisible();
  await page.getByRole("button", { name: "Hide simulation controls" }).click();
  await page.getByRole("button", { name: "Start rehearsal" }).click();
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByRole("button", { name: "Raised pulse", exact: true }).click();
  await expect
    .poll(async () =>
      Number(
        await page
          .getByTestId("pace-value")
          .textContent()
          .then((value) => value?.replace(/\D/gu, "")),
      ),
    )
    .toBeLessThan(115);
  await page.getByRole("button", { name: "Take a pause", exact: true }).click();
  await expect(page.getByTestId("pace-value")).toHaveText("Held");
  const stoppedAt = await page
    .getByLabel("Teleprompter script")
    .evaluate((node) => node.scrollTop);
  await page.waitForTimeout(900);
  expect(
    await page
      .getByLabel("Teleprompter script")
      .evaluate((node) => node.scrollTop),
  ).toBe(stoppedAt);
  await page.getByRole("checkbox", { name: "Simulate speaking" }).check();
  await expect(page.getByTestId("pace-value")).not.toHaveText("Held");
  await page.getByRole("button", { name: "Hide simulation controls" }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(
    page.getByText("SIMULATION RESULTS", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("annotated-script")).toContainText(
    "[ BREATHE ]",
  );
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save marked script" }).click();
  expect((await downloaded).suggestedFilename()).toBe(
    "cadence-breathe-script.txt",
  );
  expect(errors).toEqual([]);
});

test("camera is not requested before consent, settings are usable, and script markup is inert", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__cameraCalls", {
      value: 0,
      writable: true,
    });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        (window as unknown as { __cameraCalls: number }).__cameraCalls++;
        throw new DOMException("Denied", "NotAllowedError");
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("switch", { name: "Enable Camera & Biometric Pacing" }),
  ).not.toBeChecked();
  await page
    .getByLabel("Your script")
    .fill(
      "<img src=x onerror=alert(1)> This is a plain text script, with a pause for our next thought.",
    );
  await expect(
    page.getByLabel("Teleprompter script").locator("img"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByLabel("Mirror text for a teleprompter reflector").check();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByLabel("Teleprompter script")).toHaveClass(/mirrored/u);
  await page
    .getByRole("switch", { name: "Enable Camera & Biometric Pacing" })
    .click();
  await page.getByLabel("Your Presage API key").fill("test-key-not-a-secret");
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
    page.getByText(/Camera permission was declined/u).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { __cameraCalls: number }).__cameraCalls,
    ),
  ).toBe(1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
