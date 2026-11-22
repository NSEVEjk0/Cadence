# Submission preparation

Official challenge: https://dev.to/challenges/presage-2026-11-04

The deadline is **November 23, 2026, 07:59 UTC / 08:59 WAT**, equivalent to November 22 at 11:59 p.m. PST. Publish the DEV post using the organizer's official template and tags `devchallenge` and `presagechallenge`. This is an individual entry, for participants age 18 or older; each person may submit once.

The [prepared submission page](https://walks-proposals-butter-moscow.trycloudflare.com/submission/) includes the title, tags, cover image, code link, and all required sections. Add the public or unlisted live demo URL, review the text, and open the completed post in DEV. Publishing that post completes the entry.

The reusable Markdown is in [the submission template](../public/submission/post.md). The guide below maps the entry to the organizer's requested sections.

## What I Built

- App name: Cadence.
- Intended users: founders, creators, speakers rehearsing a pitch or presentation.
- Problem: fixed-speed teleprompters keep scrolling through natural pauses and give the speaker little room to adjust.
- Product behavior: quiet calibration, relative pulse-based pacing, camera-detected speaking holds, and a marked script for another take.
- Explain why the phone-browser/VPS design makes the demo accessible without a PC.

## Demo

- Add a public link to the final 2–3 minute video, with real camera consent and actual live Presage signal footage.
- Describe any simulation segment explicitly.
- Public studio: https://walks-proposals-butter-moscow.trycloudflare.com/. This temporary preview supports simulation and the user-key workflow; do not publish the operator's private room link. Public hosting is optional under the challenge rules.
- Use the recording sequence in [DEMO.md](DEMO.md).

## Code

- Public GitHub repository: https://github.com/NSEVEjk0/Cadence.
- Point judges to the README's setup and API-key instructions.
- Explain the three separate parts: the teleprompter interface, the phone-camera/native SDK integration, and the pure adaptive pacing rules. The README maps each part to its implementation and verification.
- Useful files: `server/worker.ts` (actual native SDK configuration and input); `shared/metrics.ts` (SDK packet normalization); `shared/engine.ts` (quality gates and adaptive rules); `src/camera.ts` (consent-triggered video transport and stop behavior).
- Credit Presage and the dependencies, and describe AI assistance honestly if you choose to discuss it.

## How It Responds to Human Signals

- Native SDK version: 3.5.0. Actual custom RGB input via `useCustomInput` and `sendFrame`, not a hand-built biometric estimator.
- Pulse: stable estimates within the SDK-supported live range, with confidence and freshness gates, compared with the same person's measured baseline.
- Breathing: used during quiet calibration; speaking-time breathing changes are excluded. Phrase-break spacing uses the measured quiet rate when available.
- Talking: stable live detection holds the scroll after a 600 ms speaking pause; stale or low-quality detection does not hold indefinitely.
- Outputs: smooth pace changes, pause holds, confidence/readiness feedback and a useful rehearsal script.
- Explain the limits: pulse is not an emotion label, breathing is unreliable during speech, prompter pace is not measured speaking speed, and marker alignment is approximate.

## Prize Categories

- **Best Thoughtful Real-World Use** is the strongest fit: a recognizable speaking/rehearsal need, a phone-accessible interface, consent, clear capture status, and quality-aware behavior.
- **Most Creative or Delightful Use** may also be selected if you explain what makes the live rehearsal interaction distinct.
- Each submission can win once. The challenge awards ten $300 cash prizes, plus memberships and badges.

## Consent and Data Handling

This section is mandatory. Use the actual implementation facts in [PRIVACY.md](PRIVACY.md), including remote phone-to-VPS frame processing, no application frame/vital persistence, optional exports, per-session SDK cache cleanup, optional private server-key configuration, disabled diagnostic telemetry and Presage service requests. Do not replace them with the inaccurate statement that frames never leave the phone.

## Agent Session

The organizer allows AI tools and offers an optional public agent-session attachment. If you include one, curate it and remove all secrets, including API keys, private room links/tokens and unrelated workspace information. A transcript is not required for eligibility.
