# Verification record

Validation completed across November 20–22, 2026. The public studio is https://walks-proposals-butter-moscow.trycloudflare.com/.

| Check                            | Result                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests                       | 37 passed across six files, including ordered frame delivery, capacity, shutdown, and decoder-error handling.                                          |
| Production build                 | TypeScript, browser assets, and both native-server entry points passed.                                                                               |
| Desktop and phone browser checks | All 14 passed, covering consent, calibration fixtures, adaptive pacing, pause holds, review, exports, and preview privacy.                              |
| Native runtime                   | SmartSpectra 3.5.0 loaded successfully.                                                                                                               |
| Local native integration         | The actual SDK authenticated, processed 40 blank JPEG frames, reported its running and no-face states, and removed its isolated cache after shutdown. |
| Public native integration        | HTTPS/WSS, private-room authentication, JPEG decoding, and native SDK processing passed. The grouped-frame probe reached 31 processed fps.              |
| Live phone rehearsal             | Manual testing on Android with Chrome confirmed the live camera workflow and quiet baseline. The project owner confirmed the rehearsal checks worked. |
| Preview privacy                  | Show/Hide changes the display while camera capture and frame delivery continue; the preview starts hidden.                                             |
| Continuous integration           | [GitHub verification passed](https://github.com/NSEVEjk0/Cadence/actions/runs/44908331315) for the published implementation.                                |

The browser prepares compact JPEG frames and preserves capture order during delivery. The server processes small arrival bursts through a bounded queue. Each SDK worker has isolated temporary storage and removes its session cache after normal exit. Regression checks cover queue capacity, ordering, shutdown, storage isolation, and safe fallback.

Automated tests use clearly labelled simulation values and virtual-camera fixtures. Native transport probes use generated blank frames. The manual phone check exercises the actual live camera path.

Use [the demo guide](DEMO.md) to record the live readings, pause response, camera shutdown, and rehearsal review. The camera preview can stay hidden throughout the recording.
