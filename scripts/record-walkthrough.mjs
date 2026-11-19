// This video is deliberately labeled simulation throughout. It is not the
// live Presage footage required for the final challenge submission.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

await mkdir("artifacts/video", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: { dir: "artifacts/video", size: { width: 1280, height: 900 } },
});
const page = await context.newPage();
await page.goto(process.env.CADENCE_DEMO_ORIGIN ?? "http://127.0.0.1:45300");
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => {
  const flag = document.createElement("div");
  flag.textContent =
    "SIMULATION WALKTHROUGH  ·  No live biometric measurements";
  flag.style.cssText =
    "position:fixed;inset:0 0 auto;z-index:99999;height:25px;display:flex;align-items:center;justify-content:center;background:#6f5c30;color:#fff6df;font:500 11px Arial;letter-spacing:.3px;pointer-events:none";
  document.body.appendChild(flag);
  const caption = document.createElement("div");
  caption.id = "walkthrough-caption";
  caption.style.cssText =
    "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);max-width:600px;width:max-content;padding:12px 20px;background:#243a30ed;color:#f4f8ea;border-radius:8px;z-index:99998;font:400 14px/1.5 Arial;text-align:center;box-shadow:0 3px 20px #0002;pointer-events:none";
  document.body.appendChild(caption);
});
const show = async (caption, seconds) => {
  await page.evaluate((text) => {
    document.getElementById("walkthrough-caption").textContent = text;
  }, caption);
  console.log(caption);
  await page.waitForTimeout(seconds * 1000);
};

await show(
  "Cadence: a rehearsal space for your words, your pace, and your pauses.",
  8,
);
await page.getByLabel("Your script").click();
await show(
  "Paste a pitch or import a text script. Choose a comfortable starting pace.",
  13,
);
await page.getByRole("button", { name: "Connect camera" }).click();
await show(
  "Live mode explains phone-to-server camera processing and requires explicit consent.",
  12,
);
await show(
  "The final challenge demo must show real Presage readings. This walkthrough uses simulation.",
  8,
);
await page.getByRole("button", { name: "Try a simulation" }).click();
await show(
  "These clearly labeled sliders test pulse, breathing rate, and speaking pauses without a camera.",
  9,
);
await page.getByRole("button", { name: "Hide simulation controls" }).click();
await page.getByRole("button", { name: "Start rehearsal" }).click();
await show(
  "At the baseline, the prompter follows the chosen pace. The panel shows signal provenance.",
  11,
);
await page.getByRole("button", { name: "Controls", exact: true }).click();
await page.getByRole("button", { name: "Raised pulse", exact: true }).click();
await show(
  "A reliable pulse rise above your baseline gently slows the scroll. It is not a stress diagnosis.",
  12,
);
await page.getByRole("button", { name: "Take a pause", exact: true }).click();
await show(
  "A speaking pause holds your place. Nothing keeps rushing ahead of you.",
  8,
);
await page.getByRole("button", { name: "Baseline", exact: true }).click();
await page.getByRole("button", { name: "Hide simulation controls" }).click();
await show(
  "Resume speaking and the prompter moves again. Breathing during speech is reference only.",
  10,
);
await page.getByRole("button", { name: "Open focus view" }).click();
await show(
  "The focused view keeps the script and reading controls close at hand.",
  8,
);
await page.getByRole("button", { name: "Exit focus view" }).click();
await page.getByRole("button", { name: "Finish", exact: true }).click();
await show(
  "Finish the take. Capture ends and rehearsal notes keep the useful pauses.",
  10,
);
await page.getByTestId("annotated-script").scrollIntoViewIfNeeded();
await show(
  "Suggested and observed [ BREATHE ] markers give the next take more room.",
  9,
);
await page.getByRole("button", { name: "Save marked script" }).click();
await show(
  "Save a marked script, or explicitly export rehearsal data. Keys and video are never in these downloads.",
  9,
);
await context.close();
console.log("Recorded simulation walkthrough:", await page.video().path());
await browser.close();
