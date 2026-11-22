---
title: Cadence — a little room to breathe
published: false
tags: devchallenge, presagechallenge
cover_image: {{STUDIO_ORIGIN}}/demo/studio.png
---

*This is a submission for the [Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04).*

## What I Built

Cadence is a camera-aware rehearsal teleprompter for founders, creators, and speakers preparing a pitch or presentation. It gives a speaker room to pause, responds to reliable changes from their own quiet baseline, and produces a marked script for the next take.

The experience runs in a phone browser. A Linux server runs the official Presage SmartSpectra SDK, and the camera preview can stay hidden while live readings and the prompter remain visible.

## Demo

[Watch the Cadence product overview]({{LIVE_DEMO_URL}})

[Open Cadence]({{STUDIO_ORIGIN}}/)

The short overview introduces the editor, reading stage, camera consent, and the benefits of an adaptive rehearsal.

The live phone workflow has been tested on Android with Chrome, including camera connection, quiet calibration, rehearsal, and review. Preview visibility is optional, so a screen recording can show the live interaction without displaying the speaker's face.

## Code

[Public repository and setup instructions](https://github.com/NSEVEjk0/Cadence)

The implementation uses SmartSpectra Node SDK **3.5.0**. Consented browser frames travel over encrypted WebSocket transport to an isolated worker, where JPEGs are decoded to RGB and supplied through `useCustomInput()` and `sendFrame()`. SDK metrics, confidence, and validation information return to the browser to drive the rehearsal.

The repository includes an MIT licence for the application, dependency credits, native setup instructions, and verification results: **37 unit checks and 14 desktop/phone browser checks passed**, alongside native integration and manual phone validation.

## How It Responds to Human Signals

- A quiet calibration of at least 35 seconds establishes a personal baseline. Pulse uses the SDK's 12-second window; breathing uses its 30-second quiet window.
- A stable pulse estimate more than 10% above baseline eases the selected prompter pace down by 20–30%. Quiet breathing can also guide pacing when its full measurement window is available.
- Stable speaking detection holds the script after a 600 ms speaking pause. The hold lasts at least 1.5 seconds, stays held during longer quiet pauses, and resumes smoothly when speech returns.
- Confidence, freshness, and validation checks gate the response. The review highlights relevant sentence locations and adds `[ BREATHE ]` suggestions that can be saved and carried into another take.

## Prize Categories

**Best Thoughtful Real-World Use.** Cadence addresses a familiar rehearsal problem with a phone-accessible interface, readable controls, voluntary camera use, an optional preview, and useful rehearsal output. Signal timing and quality guide the interaction, and the speaker retains control of the camera and pace.

## Consent and Data Handling

Camera capture starts only after the user accepts the processing disclosure and grants browser permission. No microphone is requested. Camera frames are sent to the VPS for native Presage processing; the preview setting controls only the on-screen image.

Cadence processes frames and metrics in memory. It does not record camera video or persist frames or vital values. Scripts and rehearsal history stay in browser memory; saving a marked script or data export is an explicit user action. Private room keys stay in server configuration outside the repository.

Each Linux worker uses private temporary SDK cache storage, cleaned after normal exit. SDK diagnostic telemetry is disabled. Presage authentication and service requests remain governed by its terms and privacy policy; hosting infrastructure may retain ordinary connection metadata. Cadence uses no runtime external AI insights or analytics.

Finishing, disconnecting, or leaving the page stops the camera. Cadence supports presentation practice; physiological estimates are not used for medical decisions or emotional diagnosis.

[Full consent and data-handling documentation](https://github.com/NSEVEjk0/Cadence/blob/main/docs/PRIVACY.md)
