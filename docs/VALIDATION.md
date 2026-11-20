# Verification record

Checked on November 20, 2026. The current public studio is https://walks-proposals-butter-moscow.trycloudflare.com/. Its temporary tunnel address can change after a tunnel restart.

| Check                            | Result                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests                       | 33 passed across five files.                                                                                                                          |
| Production build                 | TypeScript, browser assets, and both native-server entry points passed.                                                                               |
| Desktop and phone browser checks | All 12 passed, including consent, simulation, calibration fixtures, adaptive pacing, pause holds, review, and exports.                                |
| Native runtime                   | SmartSpectra 3.5.0 loaded successfully.                                                                                                               |
| Local native integration         | The actual SDK authenticated, processed 40 blank JPEG frames, reported its running and no-face states, and removed its isolated cache after shutdown. |
| Public native integration        | HTTPS and WSS, private-room authentication, JPEG decoding, and actual SDK processing passed through the current public studio.                        |
| Human camera readings            | Still require a consented rehearsal on the actual phone.                                                                                              |

The November 20 camera failure came from an unwritable temporary-storage path in the hosted service. The source now tries writable session storage, gives each worker its own temporary and SDK-cache directory, and reports a safe retry message if none is available. Regression checks cover isolation, fallback, existing-file preservation, and avoiding private filesystem paths in the error. The operator probe also installs its connection handlers before a DNS or connection failure can fire.

Blank frames establish the real connection and processing path. They do not establish pulse or breathing accuracy, face positioning, calibration quality, or a human demonstration. The public simulation and virtual-camera fixtures remain labelled separately.

For the remaining phone check, open the operator's private link, accept camera processing, stay quiet and still with a well-lit face and upper chest visible for at least 35 seconds, and wait for reliable baseline readings. Then rehearse, take a natural speaking pause, resume, finish, and confirm that capture stops and the review opens. Use [the demo guide](DEMO.md) to record the required live footage without showing the private link or key.
