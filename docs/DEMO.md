# Demo plan

The final challenge video needs actual live Presage signals. A simulation walkthrough is useful for explaining behavior and debugging, but cannot replace that footage.

[Watch the 2:17 simulation walkthrough](../public/demo/simulation-walkthrough.mp4). It is labeled simulation throughout and contains no real camera or physiological readings. The hosted copy is available at `/demo/simulation-walkthrough.mp4` on the public studio.

## Recording using only a phone

Open the private hosted link in Safari or Chrome first and wait for the private fragment to disappear from the address bar. Close the initial consent dialog to show the stage with **Enable Camera & Biometric Pacing** switched off. Start the phone's built-in screen recorder while the camera is still off, then enable the switch, accept processing, and grant camera permission. This keeps the private room link out of the recording and establishes consent before capture. There is no need for a PC. Screen recording is a separate, explicit user action and is not started by Cadence.

Keep the phone on a stand with a well-lit face and upper chest visible. Because the camera must remain still for breathing measurement, avoid recording while holding or moving the phone. Do not strain, hold your breath, or deliberately hyperventilate to manufacture a biometric change.

## Suggested 2–3 minute sequence

| Approximate time | Show                                                                                                                                          | What it establishes                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 0:00–0:20        | Name, script editor, starting pace and a short description in your own words                                                                  | A concrete rehearsal use case                                                                |
| 0:20–0:35        | The initially off camera/pacing switch, data disclosure, unchecked consent box, and browser camera permission                                 | Voluntary camera use and truthful remote processing                                          |
| 0:35–1:15        | Quiet calibration, camera preview, and expanded live telemetry                                                                                | Actual SDK signal acquisition and baseline                                                   |
| 1:15–2:00        | Start reading, take a natural speaking pause, then resume                                                                                     | The prompter holds and resumes in response to stable Presage talking detection               |
| 2:00–2:20        | If a reliable pulse change occurs naturally, show the pace response; otherwise explain the rule separately using a clearly labeled simulation | A truthful demonstration without inventing physiology or promising a pulse change on command |
| 2:20–2:50        | Finish, confirm the camera turns off, show the marked script, and save it                                                                     | Useful rehearsal output and a clear end to capture                                           |

Breathing is a 30-second estimate and unreliable during speech. Do not describe a rising breathing value while talking as valid proof of instantaneous nervousness. Pulse also has a 12-second averaging window. A brief pause need not immediately change those rates; the speaking detector is the correct live signal to demonstrate a prompt pause hold.

## Before publishing the recording

- Make sure the visible badge says **Presage live** for the live segment, with real confidence/readiness information.
- Keep any simulated explanation under a visible **Simulation** label. Do not mix it into the live proof without saying which part is simulated.
- Avoid exposing an API key, private room link/token, browser password manager, or personal notifications.
- Show enough of the live telemetry and camera consent flow for judges to connect the behavior with the SDK integration in the public repository.

The app does not measure actual spoken words per minute. Call the changing number **prompter pace**, and describe marker word positions as approximate.
