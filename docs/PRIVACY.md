# Consent and data handling

Cadence is an opt-in presentation rehearsal tool. It does not diagnose or treat a condition, make medical decisions, or infer an emotional state from pulse readings.

## Before the camera starts

**Enable Camera & Biometric Pacing** starts switched off. Enabling it opens the connection dialog, which explains camera processing, offers signal choices, and requires an unchecked consent box to be selected. A separate browser/OS permission controls camera access. No camera access is requested on page load or during simulation. No microphone permission is requested. A new connection requires fresh consent; declining or cancelling a pending connection prevents it from starting even if camera permission arrives later.

## Where data goes

In live mode, the phone browser captures camera frames and sends JPEG frames through HTTPS/WSS to the app's VPS. A per-session worker decodes them to RGB in memory and supplies them to the native Presage SmartSpectra SDK. The VPS returns SDK-reported metrics and quality information through the same connection.

This is remote processing. **It would be inaccurate to say camera frames never leave the phone or are never shared with a server.** Cadence discloses that transfer before consent. Simulation sends no camera frames.

The SDK uses authenticated Presage services; their processing is governed by [Presage's privacy policy](https://api.physiology.presagetech.com/privacypolicy). Cadence does not claim the entire SDK works offline or that disabling diagnostic telemetry disables all SDK service requests.

## Storage and retention

- Cadence does not record video or save incoming/decoded frames. The frame queue is bounded and frames are discarded after in-memory processing.
- Scripts, annotations, and rehearsal history remain in browser memory. They are not sent to the VPS by the camera protocol or saved to local storage. Reloading or closing the page removes those in-memory notes.
- The server keeps current metrics in a session worker's memory and sends them only to that connection. It does not persist or log vital values.
- User-entered API keys are sent through the consented secure connection, held for the SDK session, and cleared from the page when the connection ends. They are not put into exports or browser bundles.
- The optional private hosted room keeps its owner's key in server secret configuration outside the repository. A random private room token is required to use that key. The token is held in page memory, removed from the address bar after loading, and not sent in the initial HTTP URL. The owner's key is not returned to browsers or inherited into other visitors' worker environments.
- On the hosted Linux server, SDK device/model caches are isolated in a temporary directory for each session and removed after normal worker exit. An abnormal host/process failure can leave temporary cache files until operating-system or operator cleanup; this is a limitation of shutdown-based deletion, not a claim of guaranteed secure erasure. On macOS/Windows local server deployments, the SDK's normal platform cache can persist; Linux-specific deletion claims do not apply there.
- Explicit **Save marked script** and **Export rehearsal data** actions save the selected text or data on the user's device. A rehearsal-data export contains physiological estimates and should be treated as personal data. Neither export contains camera frames, an API key, or a private room token.

Basic hosting/network infrastructure may retain connection metadata such as IP addresses, timestamps and access/error logs according to its own configuration and policies. That is separate from Cadence's absence of frame and vital-value storage. The application has no analytics, advertising SDK, external AI insights, or runtime font-provider requests.

## SDK diagnostic telemetry

Cadence creates every measurement SDK with `enableTelemetry: false`. Optional Presage measurement-session summaries and device-readiness diagnostic reports are disabled. The official [SDK telemetry/privacy guide](https://smartspectra.presagetech.com/docs/telemetry-and-privacy) explains their contents, account correlation, storage and retention when enabled. Cadence does not describe the SDK or its authenticated service requests as anonymous.

## Stopping and deleting

Switching off **Enable Camera & Biometric Pacing** stops camera tracks and disconnects the SDK session. During a rehearsal, it also ends the take and opens the review. The switch remains available in focus view. Finishing the rehearsal, disconnecting, closing the page, moving it into the background, or losing the connection also stops browser camera tracks and ends the SDK worker. The server caps camera sessions at 15 minutes. If an error occurs, restarting requires an explicit user action. Closing/reloading clears the page's script and notes. Downloads must be deleted from the user's device separately.

## Demonstrations

Automated simulation videos and test fixtures use invented signals and are labeled accordingly. They are not proof of live Presage physiological readings. A user can choose to make a separate phone screen recording for the challenge; that recording is outside Cadence's camera-processing path and may include their face and visible metrics. Review it before publishing.
