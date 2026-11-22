# Cadence

**A little room to breathe.**

Cadence is a rehearsal teleprompter for founders, creators, and speakers. It holds your place during camera-detected speaking pauses, gently slows when a reliable pulse estimate rises above your own quiet baseline, and adds `[ BREATHE ]` markers at natural phrase breaks for your next take.

Built for the [Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04). The app runs in a phone or desktop browser; a Linux server runs the native SmartSpectra SDK. A PC is not needed to use the hosted app.

[Open the public studio](https://walks-proposals-butter-moscow.trycloudflare.com/) · [Consent and data handling](docs/PRIVACY.md) · [Demo guide](docs/DEMO.md) · [Submission preparation](docs/SUBMISSION.md)

![Cadence studio preview](public/demo/studio.png)

[Watch the 2:17 simulation walkthrough](public/demo/simulation-walkthrough.mp4) for a guided tour of the controls and adaptive behavior using clearly labelled test values.

The public studio offers clearly labeled simulation. For live signals, use a Presage developer key or an operator-provided private rehearsal link. The current preview uses a temporary HTTPS tunnel; its address can change if the tunnel restarts.

## What works

- Paste or import a text script, choose a starting pace, adjust the text size, mirror it, and enter a focused reading view. A dark stage with bright script text and a centered highlight band keeps the reading line clear as the script scrolls.
- Choose a dark or light workspace with the sun/moon button in the header. Dark is the default, and your choice stays on this browser between visits.
- Use the **Enable Camera & Biometric Pacing** switch, which starts off and opens the consent step. After accepting phone-camera processing, establish a quiet baseline over at least 35 seconds with stable pulse and breathing estimates. Switching off stops capture; during a rehearsal, it ends the take and opens the review.
- The camera preview starts hidden. **Show preview** helps with framing, and **Hide preview** lets a screen recording show the prompter and live readings without displaying your face. Preview visibility does not interrupt camera capture or Presage processing.
- A reliable pulse estimate **more than 10% above your baseline** eases the selected scroll rate down by **20–30%** and gently pulses a **“Take a breath”** cue above the reading band. The scroll smoothly returns toward the selected pace as the pulse settles. The cue stays still when reduced motion is preferred.
- Reliable breathing **more than 25% above the quiet baseline** can offer the same 20–30% slowdown after a full 30-second quiet window.
- After **600 ms of stable detected quiet following speech**, hold your place for **at least 1.5 seconds**, even if you resume speaking sooner. Longer quiet pauses stay held until speech returns, then scrolling eases back in. Pause holds take priority over slowing down; unreliable signals cancel an automatic hold.
- View SDK-reported BPM, breathing rate, confidence, speaking status, and camera throughput in a collapsible telemetry panel.
- Review **highlighted sentence locations** where reliable pulse estimates rose more than 10% above baseline or eligible quiet breathing rose more than 25%. Tap a highlight to inspect the estimated reading time, peak rate, and baseline comparison. Breathing flags require a full quiet window; they do not classify erratic breathing during speech.
- Automatically add `[ BREATHE ]` markers after flagged sentences, combine them with phrase breaks and observed pauses, and carry those suggestions into the next take of the same script. Annotations do not add to the spoken word count. The review retains the captured script when a later draft is edited. Saving the marked script or exporting its data is a separate, explicit action.
- Test behavior with simulated BPM **60–140**, breathing rate **8–28**, and speaking/pause controls. Simulation is labeled everywhere and never opens the camera.

**Signal timing guides the rehearsal.** SmartSpectra estimates pulse over a 12-second window and breathing over a 30-second quiet window. Cadence collects at least 35 seconds of quiet capture for the baseline, then uses stable speaking detection for pause holds during the rehearsal. Confidence, freshness, and validation checks keep the pacing response tied to usable estimates. Breathing-based decisions use quiet periods, and pulse-based decisions compare the speaker with their own baseline.

## Run locally

Use Linux x64/ARM64 with glibc 2.35 or newer, Windows x64, or Apple Silicon macOS for the server. Node.js **22.12 or newer** is required. The browser can run on another device.

```sh
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:45300`. This loopback address supports browser camera access for a camera on the same computer. To use a phone, publish the server behind **HTTPS with WebSocket support**, then open its secure link on the phone. Plain HTTP on a LAN address is not sufficient for browser camera permission.

`npm ci` installs the SDK's native runtime packages for every supported platform. The download is larger than a typical web app; only the host's runtime is loaded. No C++ build or Electron rebuild is required.

For development, run `npm run dev`. Optional bind settings are documented in [.env.example](.env.example).

For a service with a read-only home directory, use a writable `CADENCE_CACHE_DIR` for temporary SDK session storage. If a configured directory is unavailable, the server tries the operating system's temporary directory and Linux `/tmp`. Each worker uses its own private session directory for both SDK caches and temporary files, with cleanup after exit.

## Add a Presage key

1. [Register as a Presage developer](https://physiology.presagetech.com/auth/register) and get a SmartSpectra API key. The challenge uses the normal free trial; additional credits are not included.
2. Select **Enable Camera & Biometric Pacing** to open the consent dialog, then paste the key into the password field. Cadence does not put it in local storage, an export, or a browser bundle.
3. Leave **Include pulse** and **Detect speaking pauses** enabled if your key supports them. If Presage reports a signal authorization error, disable the affected option and reconnect. Pulse is requested individually, without requesting the entire cardio bundle.
4. Read and accept camera processing, then grant the browser's camera permission. Keep the phone still, with a well-lit face and upper chest visible, for the quiet calibration.
5. Press play when the baseline is ready. If only reliable pulse is available after the quiet window, **Continue with pulse only** is available; breathing-based markers then use generic phrase spacing instead of a measured breathing baseline.

Do not paste a real key into source, a `VITE_` environment variable, screenshots, issue comments, or a submission post.

### Private hosted room

An operator can configure an owner key on the server and let its owner use a private link without typing the key on their phone. This configuration is optional; it is not included in this repository or needed for simulation.

Create a private file outside the repository containing:

```dotenv
CADENCE_PRESAGE_API_KEY=your_private_key
CADENCE_ROOM_TOKEN=your_random_private_token
```

Give it mode `600`, use a cryptographically random URL-safe room token of 24–64 characters, and set `CADENCE_CREDENTIALS_FILE` to its absolute path before starting the server. Alternatively, supply the two settings through your service manager's private environment configuration.

The owner opens `https://your-app/#room=their_private_token`. The fragment is removed from the address bar after loading and is not included in the initial HTTP request. The token is sent only in the consented secure WebSocket configuration. The server compares it before supplying the private key to that person's isolated SDK worker. The owner key is never returned to the browser. Other visitors can use their own keys; they cannot use the owner's key without the token. Keep the private room link out of public materials.

## How the integration works

The app separates the teleprompter, camera integration, and pacing rules so the interface can be exercised before connecting a real camera.

| Layer                  | Main files                                               | How to verify it                                                                                                                                           |
| ---------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Teleprompter interface | `src/App.tsx`, `src/components.tsx`, `src/styles.css`    | Use the labeled simulation to check scrolling, text controls, pause/resume, telemetry, and exports on desktop and phone layouts.                           |
| Camera and native SDK  | `src/camera.ts`, `server/worker.ts`, `shared/metrics.ts` | Run `npm run sdk:check` on the server, then use a consented phone-camera session to check actual signal acquisition.                                       |
| Adaptive pacing        | `shared/engine.ts`                                       | Run `npm test` to check baseline-relative pulse response, signal quality and freshness, speaking-pause holds, and phrase markers independently of the SDK. |

For the hosted version, the phone's browser handles camera access and the VPS runs the official Node.js SDK. Timestamped camera frames enter the SDK's custom-input interface over encrypted WebSocket transport. The native runtime is installed through npm, and each camera session has its own processing worker. The live phone workflow has been checked on Android with Chrome.

```text
Phone browser
  consent -> getUserMedia(video only) -> timestamped JPEG camera frames
                       | encrypted WebSocket
                       v
Node server -> isolated worker for this camera session
                 JPEG -> RGB -> SmartSpectraSDK.useCustomInput()
                              -> sendFrame(... PixelFormat.kRGB ...)
                              -> SDK metrics + validation callbacks
                       | normalized readings, confidence and sample ages
                       v
Browser -> quiet baseline -> adaptive pace and speaking-pause holds
        -> rehearsal notes and optional downloads
```

The native SDK is pinned to **3.5.0**. The implementation follows the [official Node.js custom-input API](https://smartspectra.presagetech.com/docs/nodejs) and decodes protobuf packets with `@smartspectra/node-sdk/messages`.

Live requests include chest breathing, breathing rate, and optionally `PULSE_RATE` and `TALKING`. Cadence requests no emotion labels, audio, HRV, blood-pressure diagnosis, or external AI insights. It explicitly sets `enableTelemetry: false`.

Each camera session gets a separate child process because the SDK has process-global native state. That isolates credentials, readings, errors, and teardown across people. Camera frames and decoded metrics are held in memory. On the hosted Linux server, SDK device/model caches go into a per-session temporary directory and are removed after normal worker exit. The frame queue is bounded, the server caps concurrent measurement sessions at two, and a camera session ends after 15 minutes. Closing the connection stops and destroys the SDK worker.

Temporary SDK-cache isolation currently uses Linux's `XDG_CACHE_HOME`. On macOS and Windows the SDK uses its normal platform cache instead; that cache can persist after the camera session. The native measurement API supports those platforms, but use Linux for this application's documented temporary-cache hosting behavior.

## Verification

See the [verification record](docs/VALIDATION.md) for the automated checks, native integration, and completed live phone validation.

```sh
npm test
npm run sdk:check
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit checks cover pulse and quiet-breathing thresholds, bounded slowdowns and smooth recovery, confidence and freshness, supported pulse ranges, source separation, timed speaking holds, breathing exclusions during speech, sentence mapping, marker preservation, private-room authorization, and frame validation. Browser checks cover desktop and phone layouts, reading-band cues and reduced motion, consent gating, simulation adaptation, the 1.5-second minimum hold, longer pauses, sentence details, captured-script review, carried markers, exports, and inert script markup.

A separate browser test uses mocked transport and a virtual camera to verify private-link consent, quiet calibration, pulse-based pacing, and camera-track shutdown. Fixtures stay in the test suite; the live app takes its readings from SmartSpectra.

`sdk:check` verifies native runtime loading, custom-input configuration, and teardown.

The optional operator probes in `scripts/verify-presage.ts` and `scripts/check-hosted-camera.ts` authenticate the SDK using a private key and generated blank frames. They exercise startup, input validation, secure transport, JPEG decoding, and shutdown. Manual phone testing covers the live camera and rehearsal workflow.

## Signal quality and session behavior

- Cadence supports presentation practice. SDK estimates guide the prompter relative to a personal baseline; they are not used for medical decisions or emotional diagnosis.
- Camera quality, lighting, motion, framing, compression, and network throughput affect measurements. Poor validation, low confidence, stale readings, and unsupported live pulse estimates fall back to the selected manual pace. A sustained low frame rate can end the SDK session; restarting requires a user action.
- Mobile frames are resized for efficient JPEG transport, with bounded encoding, delivery, and processing queues. The interface shows camera throughput, confidence, and validation feedback throughout a live session.
- The app measures camera-based speaking pauses, not an audio transcript or actual spoken words per minute. **Prompter pace** is the chosen/adapted scroll rate. Sentence highlights and marker locations follow the visible script position. They are estimates rather than exact spoken-sentence alignment, and the SDK's 12-second pulse and 30-second breathing averages cannot establish which words caused a rate change.
- If speech-pause sensing is disabled or unreliable, pulse-based pacing remains available if pulse is supported. A breathing-only session can establish phrase markers, but offers fewer adaptive controls during speech.
- Leaving the page, moving it into the background, or finishing the rehearsal stops the camera. Script and notes are in page memory; save an export if you want to keep them.

## Credits and license

Cadence's original application code is MIT licensed. Presage SmartSpectra is a separately licensed proprietary dependency, used under [Presage's terms](https://physiology.presagetech.com/tos). It is not relicensed by this project. The official documentation and sample at source revision `90f0cbb4018362ddf5e1a6c3ae2875e92e41861e` informed the integration; this is an independently written application, not a redistributed sample.

DM Sans and Instrument Serif are served locally under the SIL Open Font License; their notices are included in `public/fonts`. Lucide icons, React, and the remaining dependencies retain their respective licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
