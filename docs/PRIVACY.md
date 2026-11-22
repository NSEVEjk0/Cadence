# Consent and data handling

Cadence is an opt-in presentation rehearsal tool. Physiological estimates guide presentation pacing; medical decisions, treatment, and emotional diagnosis are outside its scope.

## Before the camera starts

**Enable Camera & Biometric Pacing** starts switched off. Enabling it opens the connection dialog, which explains camera processing, offers signal choices, and requires an unchecked consent box to be selected. A separate browser/OS permission controls camera access. No camera access is requested on page load or during simulation. No microphone permission is requested. A new connection requires fresh consent; declining or cancelling a pending connection prevents it from starting even if camera permission arrives later.

## Where data goes

The camera preview starts hidden. **Show camera preview**, **Show preview**, and **Hide preview** control the on-screen image only. Camera capture and Presage processing continue while the preview is hidden. This lets a user record the studio and live metrics without displaying their face; it does not prevent camera frames from reaching the VPS.

In live mode, the phone browser captures camera frames and sends JPEG frames through HTTPS/WSS to the app's VPS. A per-session worker decodes them to RGB in memory and supplies them to the native Presage SmartSpectra SDK. The VPS returns SDK-reported metrics and quality information through the same connection.

Cadence explains this encrypted phone-to-VPS transfer before consent. Simulation uses generated values without accessing the camera.

The SDK uses authenticated Presage services; their processing is governed by [Presage's privacy policy](https://api.physiology.presagetech.com/privacypolicy). SDK authentication and service requests require an internet connection independently of the diagnostic telemetry setting.

## Storage and retention

- Cadence does not record video or save incoming/decoded frames. The frame queue is bounded and frames are discarded after in-memory processing.
- Scripts, annotations, and rehearsal history remain in browser memory. They are not sent to the VPS by the camera protocol or saved to local storage. Reloading or closing the page removes those in-memory notes.
- The server keeps current metrics in a session worker's memory and sends them only to that connection. It does not persist or log vital values.
- User-entered API keys are sent through the consented secure connection, held for the SDK session, and cleared from the page when the connection ends. They are not put into exports or browser bundles.
- The optional private hosted room keeps its owner's key in server secret configuration outside the repository. A random private room token is required to use that key. The token is held in page memory, removed from the address bar after loading, and not sent in the initial HTTP URL. The owner's key is not returned to browsers or inherited into other visitors' worker environments.
- On the hosted Linux server, SDK device/model caches are isolated in a private temporary directory for each session and removed after normal worker exit. Operating-system or operator cleanup handles files left by interrupted exits. Local macOS/Windows deployments follow the SDK's platform cache behavior, which can retain device/model cache files.
- Explicit **Save marked script** and **Export rehearsal data** actions save the selected text or data on the user's device. A rehearsal-data export contains physiological estimates and should be treated as personal data. Neither export contains camera frames, an API key, or a private room token.

Basic hosting/network infrastructure may retain connection metadata such as IP addresses, timestamps and access/error logs according to its own configuration and policies. That is separate from Cadence's absence of frame and vital-value storage. The application has no analytics, advertising SDK, external AI insights, or runtime font-provider requests.

## SDK diagnostic telemetry

Cadence creates every measurement SDK with `enableTelemetry: false`. Optional Presage measurement-session summaries and device-readiness diagnostic reports are disabled. The official [SDK telemetry/privacy guide](https://smartspectra.presagetech.com/docs/telemetry-and-privacy) explains their contents, account correlation, storage and retention when enabled. Authentication remains associated with the developer's Presage account.

## Stopping and deleting

Switching off **Enable Camera & Biometric Pacing** stops camera tracks and disconnects the SDK session. During a rehearsal, it also ends the take and opens the review. The switch remains available in focus view. Finishing the rehearsal, disconnecting, closing the page, moving it into the background, or losing the connection also stops browser camera tracks and ends the SDK worker. The server caps camera sessions at 15 minutes. If an error occurs, restarting requires an explicit user action. Closing/reloading clears the page's script and notes. Downloads must be deleted from the user's device separately.

## Demonstrations

Simulation walkthroughs and automated fixtures use clearly labelled test values. Live mode displays SmartSpectra's camera-derived estimates. A user can make a separate phone screen recording for the challenge; that recording is outside Cadence's camera-processing path. Keeping the preview hidden allows a recording of the studio and live metrics without the camera image. Visible metrics and other phone-screen content can still appear in the recording.
