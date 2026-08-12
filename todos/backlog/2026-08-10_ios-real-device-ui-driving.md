# Evaluate iPhone Mirroring as a CLI path for driving a real iPhone

`ios-dev` ships a complete CLI debug story for the **simulator** in
`skills/ios-dev/iphone-apps/references/cli-observability.md` — logs,
crash symbolication, lldb, leaks, profiling, network, test results, and a
"What CLI Can and Cannot Do" matrix at line 442. Physical-device coverage stops
at install + launch (`<device_debugging>`, line 397).

Nothing in the plugin lets an agent **operate** a real device: no tap, no type,
no scroll. Android has a native CLI path for this (`adb shell input tap` +
`adb exec-out screencap`), so agent-driven verification on a physical Android
device is routine. iOS has no equivalent — XCUITest drives the simulator or a
dev-signed test build, never the shipping App Store build on the user's own
phone. Every real-device iOS check therefore falls back to manual work handed
to the human.

## Prior art

[ShawnPana/phone-harness](https://github.com/ShawnPana/phone-harness) (MIT,
Python, actively developed) closes exactly that gap with no jailbreak and no
paid device farm. The transport is the macOS **iPhone Mirroring** window:
`screencapture` + Vision-framework OCR for eyes, HID-level `CGEvent`s for hands.
Roughly 500 lines, stateless, no daemon, already packaged as a `SKILL.md` plus a
helper module — so it is directly readable as a skill design, whether or not we
adopt the code.

Requirements: macOS Sequoia+, Python 3.12+, three `pyobjc` frameworks, an iPhone
paired once through iPhone Mirroring, and two TCC grants for the terminal
(Accessibility, Screen Recording).

The capability we do not have today: taps, long-press, drag, scroll and typing
against the **shipping build**, on the real device, with no source checkout, no
signing, and no rebuild.

## Complementary, not a replacement

| | phone-harness | existing `cli-observability` device path |
|---|---|---|
| Needs source + dev signing | no | yes |
| Evidence available | screen pixels + OCR text | `devicectl` console, app container, crash reports |
| State injection | none | launch arguments, seeded DB |
| Who operates the UI | the agent | the human |
| Assertions | OCR string match | accessibility tree, `#expect` |
| Multi-touch | no | yes (XCUITest) |

It supplies hands, not eyes. Anything that needs a log line, a `UserDefaults`
value, or a crash report still goes through `devicectl`.

## Open questions before shipping anything

- **Headless is out.** iPhone Mirroring needs an active GUI login session, a
  frontmost window, and two TCC grants. Untested on a machine driven purely over
  SSH — verify before documenting it as usable there.
- **The phone is occupied while it runs.** Per upstream's own SKILL.md,
  physically unlocking the iPhone pauses the session, so the human cannot use
  the device concurrently.
- **OCR is the only reader.** The mirroring window is a video stream and is
  opaque to macOS accessibility, so there is no AX tree to assert against — this
  is structurally flakier than XCUITest and cannot be papered over.
- **No pinch or two-finger gestures**, and tap coordinates must never be cached
  across calls (window origin and scale drift).
- Upstream is MIT, so vendoring or forking is permitted with attribution — but
  a wrapper skill would inherit a dependency on an Apple feature Apple can change
  at any release.

## Options

- **A. Nothing.** Real-device iOS interaction stays manual.
- **B. Document the technique** as a section in `cli-observability.md`: add a
  row to the `cli_vs_xcode` matrix, describe the iPhone Mirroring path, link
  upstream, and state the limits above. No code, no dependency, no install step.
  **Recommended** — it removes the "iOS agents are blind on device" blind spot
  at the cost of one reference section.
- **C. Ship a skill** that wraps or vendors the harness. Only worth it once B
  has been used in anger and the GUI-session constraint has been measured on a
  real setup.

## Acceptance (for option B)

- `cli_vs_xcode` matrix gains a "Drive UI on physical device" row with an honest
  verdict, not a bare ✓.
- The new section states the four hard constraints (GUI session, phone locked,
  OCR-only, no multi-touch) — a reader must not discover them by trying.
- Upstream credited by name and license.
