import { expect, test, type Page } from "@playwright/test";

async function expectCueAtReadingBand(page: Page) {
  const cue = page.getByTestId("breath-cue");
  await expect(cue).toBeVisible();
  const bounds = await cue.evaluate((node) => {
    const stage = node.closest<HTMLElement>(".script-viewport")!;
    const guide = stage.querySelector<HTMLElement>(".reading-guide")!;
    const cueBounds = node.getBoundingClientRect();
    const stageBounds = stage.getBoundingClientRect();
    const center = guide.getBoundingClientRect().top;
    const lineHeight = parseFloat(
      getComputedStyle(stage).getPropertyValue("--reading-line-height"),
    );
    return {
      cueLeft: cueBounds.left,
      cueRight: cueBounds.right,
      cueBottom: cueBounds.bottom,
      stageLeft: stageBounds.left,
      stageRight: stageBounds.right,
      expectedCenter: stageBounds.top + stage.clientHeight / 2,
      center,
      bandTop: center - lineHeight / 2,
    };
  });
  expect(Math.abs(bounds.center - bounds.expectedCenter)).toBeLessThan(1);
  expect(bounds.cueLeft).toBeGreaterThanOrEqual(bounds.stageLeft);
  expect(bounds.cueRight).toBeLessThanOrEqual(bounds.stageRight);
  expect(bounds.cueBottom).toBeLessThanOrEqual(bounds.bandTop);
}

test("simulation adapts scrolling, holds an observed pause, and exports a marked script", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Find your rhythm." }),
  ).toBeVisible();
  const originalScript = await page.getByLabel("Your script").inputValue();
  await page.getByRole("button", { name: "Connect camera" }).click();
  await expect(
    page.getByRole("button", { name: "Consent & connect camera" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Try a simulation" }).click();
  await expect(page.getByText("Simulated signals · no camera")).toBeVisible();
  await page.getByRole("button", { name: "Hide simulation controls" }).click();
  await page.getByRole("button", { name: "Start rehearsal" }).click();
  await expect(page.getByTestId("breath-cue")).toHaveCount(0);
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
    .toBeLessThanOrEqual(104);
  expect(
    Number(
      (await page.getByTestId("pace-value").textContent())?.replace(/\D/gu, ""),
    ),
  ).toBeGreaterThanOrEqual(91);
  await page.getByRole("button", { name: "Hide simulation controls" }).click();
  await expectCueAtReadingBand(page);
  await page.getByRole("button", { name: "Open focus view" }).click();
  await expectCueAtReadingBand(page);
  await page.getByRole("button", { name: "Exit focus view" }).click();
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByRole("button", { name: "Take a pause", exact: true }).click();
  await expect(page.getByTestId("pace-value")).toHaveText("Held");
  await expect(page.getByTestId("breath-cue")).toHaveCount(0);
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
  await expect(page.getByTestId("breath-cue")).toBeVisible();
  await page.getByRole("button", { name: "Baseline", exact: true }).click();
  await expect(page.getByTestId("breath-cue")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        Number(
          (await page.getByTestId("pace-value").textContent())?.replace(
            /\D/gu,
            "",
          ),
        ),
      { timeout: 8000 },
    )
    .toBeGreaterThan(120);
  await page.getByRole("button", { name: "Hide simulation controls" }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(
    page.getByText("SIMULATION RESULTS", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("annotated-script")).toContainText(
    "[ BREATHE ]",
  );
  const pulseHighlights = page
    .getByTestId("annotated-script")
    .locator('mark[data-review-reasons~="pulse"]');
  expect(await pulseHighlights.count()).toBeGreaterThan(0);
  await pulseHighlights.first().click();
  const detail = page.getByRole("dialog");
  await expect(
    detail.getByText("Simulated readings", { exact: true }),
  ).toBeVisible();
  await expect(detail.locator(".moment-values")).toContainText("104");
  await expect(detail.locator(".moment-values")).toContainText("44% above");
  await detail.getByRole("button", { name: "Close dialog" }).click();
  expect(
    (await page.getByTestId("annotated-script").textContent())?.replaceAll(
      " [ BREATHE ]",
      "",
    ),
  ).toBe(originalScript);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save marked script" }).click();
  expect((await downloaded).suggestedFilename()).toBe(
    "cadence-breathe-script.txt",
  );
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page
    .getByLabel("Your script")
    .fill(
      "A new draft should have its own sentences. This is a different take.",
    );
  await expect(
    page
      .getByLabel("Teleprompter script")
      .locator('.breath-chip[data-marker-reason="pulse"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Rehearsal notes/u }).click();
  expect(
    (await page.getByTestId("annotated-script").textContent())?.replaceAll(
      " [ BREATHE ]",
      "",
    ),
  ).toBe(originalScript);
  expect(await pulseHighlights.count()).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByLabel("Your script").fill(originalScript);
  await page.getByRole("button", { name: /Rehearsal notes/u }).click();
  await page.getByRole("button", { name: "Rehearse again" }).click();
  await expect(page.getByLabel("Your script")).toHaveValue(originalScript);
  expect(
    await page
      .getByLabel("Teleprompter script")
      .locator('.breath-chip[data-marker-reason="pulse"]')
      .count(),
  ).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("faster quiet breathing waits for a full window and respects reduced motion", async ({
  page,
}) => {
  const clockStart = new Date("2026-11-19T13:00:00Z");
  await page.clock.install({ time: clockStart });
  await page.clock.pauseAt(new Date(clockStart.getTime() + 1000));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Connect camera" }).click();
  await page.getByRole("button", { name: "Try a simulation" }).click();
  await page.getByRole("checkbox", { name: "Simulate speaking" }).uncheck();
  await page.getByLabel("Simulated breathing rate").press("End");
  await page.getByRole("button", { name: "Start rehearsal" }).click();
  await page.clock.runFor(1000);
  await page.clock.fastForward(10_000);
  await expect(page.getByTestId("breath-cue")).toHaveCount(0);
  await page.clock.fastForward(18_000);
  await expect(page.getByTestId("breath-cue")).toHaveCount(0);
  await expect(page.getByTestId("pace-value")).toHaveText("130 wpm");
  await page.clock.fastForward(2000);
  await page.clock.runFor(5000);
  await expectCueAtReadingBand(page);
  expect(
    Number(
      (await page.getByTestId("pace-value").textContent())?.replace(/\D/gu, ""),
    ),
  ).toBeLessThanOrEqual(104);
  expect(
    await page.getByTestId("breath-cue").evaluate((node) => {
      const guide = node
        .closest(".script-viewport")!
        .querySelector(".reading-guide")!;
      return [
        getComputedStyle(node).animationName,
        getComputedStyle(guide, "::before").animationName,
      ];
    }),
  ).toEqual(["none", "none"]);
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByRole("checkbox", { name: "Simulate speaking" }).check();
  await page.clock.runFor(500);
  await expect(page.getByTestId("breath-cue")).toHaveCount(0);
  await page.getByRole("button", { name: "Hide simulation controls" }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  expect(
    await page
      .getByTestId("annotated-script")
      .locator('mark[data-review-reasons~="breathing"]')
      .count(),
  ).toBeGreaterThan(0);
  await expect(
    page
      .getByTestId("annotated-script")
      .locator('mark[data-review-reasons~="pulse"]'),
  ).toHaveCount(0);
});

test("speaking pauses get a minimum hold, resume moving, and preserve observed durations", async ({
  page,
}) => {
  const clockStart = new Date("2026-11-19T14:00:00Z");
  await page.clock.install({ time: clockStart });
  await page.clock.pauseAt(new Date(clockStart.getTime() + 1000));
  await page.goto("/");
  await page.getByRole("button", { name: "Connect camera" }).click();
  await page.getByRole("button", { name: "Try a simulation" }).click();
  await page.getByRole("checkbox", { name: "Simulate speaking" }).uncheck();
  await page.getByRole("button", { name: "Start rehearsal" }).click();
  await page.clock.runFor(2000);
  await expect(page.getByTestId("pace-value")).not.toHaveText("Held");
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(
    page
      .getByText("Observed pauses", { exact: true })
      .locator("..")
      .locator("strong"),
  ).toHaveText("0");

  await page.getByRole("button", { name: "Rehearse again" }).click();
  await page.getByRole("button", { name: "Connect camera" }).click();
  await page.getByRole("button", { name: "Try a simulation" }).click();
  await page.getByRole("button", { name: "Start rehearsal" }).click();
  await page.clock.runFor(500);
  const stage = page.getByLabel("Teleprompter script");
  expect(await stage.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  const speaking = page.getByRole("checkbox", { name: "Simulate speaking" });
  await speaking.uncheck();
  await page.clock.runFor(700);
  await expect(page.getByTestId("pace-value")).toHaveText("Held");
  const stoppedAt = await stage.evaluate((node) => node.scrollTop);
  await speaking.check();
  await page.clock.runFor(1000);
  await expect(page.getByTestId("pace-value")).toHaveText("Held");
  expect(await stage.evaluate((node) => node.scrollTop)).toBe(stoppedAt);
  await page.clock.runFor(1000);
  await expect(page.getByTestId("pace-value")).not.toHaveText("Held");
  expect(await stage.evaluate((node) => node.scrollTop)).toBeGreaterThan(
    stoppedAt,
  );
  const resumedPace = Number(
    (await page.getByTestId("pace-value").textContent())?.replace(/\D/gu, ""),
  );
  expect(resumedPace).toBeGreaterThan(0);
  expect(resumedPace).toBeLessThan(130);

  await speaking.uncheck();
  await page.clock.runFor(2600);
  await expect(page.getByTestId("pace-value")).toHaveText("Held");
  await speaking.check();
  await page.clock.runFor(600);
  await expect(page.getByTestId("pace-value")).not.toHaveText("Held");
  await page.getByRole("button", { name: "Hide simulation controls" }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(
    page
      .getByText("Observed pauses", { exact: true })
      .locator("..")
      .locator("strong"),
  ).toHaveText("2");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export rehearsal data" }).click();
  const stream = await (await downloading).createReadStream();
  expect(stream).not.toBeNull();
  let exported = "";
  for await (const chunk of stream!) exported += chunk.toString();
  const data = JSON.parse(exported);
  expect(data.source).toBe("simulation");
  expect(data.pauses).toHaveLength(2);
  expect(data.pauses[0].duration).toBeGreaterThanOrEqual(600);
  expect(data.pauses[0].duration).toBeLessThan(1500);
  expect(data.pauses[1].duration).toBeGreaterThanOrEqual(2500);
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
