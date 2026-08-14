# Preview local-first delivery

**Status:** Accepted for degraded Codex local-only support; A1–A5 passed.
Local-default contract superseded by
[Preview Local Library](./2026-08-14-preview-local-library.md) (2026-08-14):
the single-file contract below lives on as that spec's ephemeral mode, and
local delivery now defaults to the built local Library.

**Date:** 2026-08-12

**Source shape:** `shared_with_seams`

**Surfaces:** Claude Code, Codex exec, Codex TUI, Codex App

## Outcome

Preview has one canonical skill contract for Claude Code and Codex. Its default
delivery is a self-contained local HTML file. The existing private Vercel
Library and isolated Share paths remain available on Claude Code only when the
user explicitly requests remote delivery.

Codex Phase 1 is useful but degraded: it supports the complete local contract
and rejects Vercel delivery before any file, config, preflight, network, or
deployment action.

## Delivery mode contract

Delivery mode is resolved before content files, Preview config, Vercel
preflight, setup, or network access.

| User intent | Mode |
| --- | --- |
| Explicit Vercel request | Vercel |
| Explicit online deployment | Vercel |
| Explicit cross-device access | Vercel |
| Explicit external sharing | Vercel |
| Any other request, including “give me a link” | Local |

The canonical skill invokes the side-effect-free delivery resolver at this
boundary. The resolver defaults to local. On Claude Code it accepts explicit
Vercel mode. On any host carrying `CODEX_THREAD_ID`, explicit Vercel mode
returns the Codex Phase 1 limitation and fails before side effects.

The compatibility validator binds Preview to this early mode gate and its
resolver. Preview uses this mode-specific contract instead of the coarse Codex
host-guard set.

## Local contract

Local delivery creates one HTML file and no delivery sidecar or directory
tree.

- A user-specified output path has priority.
- Temporary work with no path uses the Desktop and a safe lowercase ASCII
  slug. If the title produces no safe characters, the slug is `preview`.
- Other pathless work uses an existing source-related directory only when the
  relationship is evidenced; otherwise it uses the same Desktop fallback.
- An existing file is never overwritten silently. After local mode is decided,
  the local-output helper atomically reserves either the requested path or a
  reported collision-free sibling. Explicitly approved replacements bypass
  reservation for that exact file.
- CSS and necessary JavaScript are inline. Required images are inline SVG or
  data URIs. Rendering under `file://` requires no server, build, CDN, external
  module, stylesheet, script, runtime fetch, or relative asset.
- Local delivery creates no `preview.json` or `.vercel` directory; it neither
  reads nor writes either Preview config format; it does not run Library
  resolution, setup, preflight, or deployment; and it makes no Vercel or other
  deployment network call.
- The final response contains a clickable Markdown link whose target is the
  absolute file path. The browser is opened only on an explicit user request.

The Library-oriented template remains available to the remote workflow. Its
CDN and comment-overlay references are not valid local dependencies and must
not appear in a local artifact.

## Vercel contract

Claude Code remote delivery retains the existing Library v2 and Share
behavior. After explicit remote intent and successful mode resolution, Vercel
preflight remains the first remote action. Path-scoped config resolution,
first-run setup, item metadata, Library publication, Share isolation,
protection checks, archive management, and the legacy escape hatch retain their
existing contracts and tests.

An explicit external-sharing request uses Share. A Vercel or online request
that does not require outsider access uses the private Library. Remote delivery
never follows from the word “link” alone.

## Support and limitations

| Surface | Status | Supported subset | Limitation |
| --- | --- | --- | --- |
| Claude Code | Full | Local plus existing Library and Share | Vercel still requires its existing CLI, authentication, and config gates |
| Codex exec | Degraded | Local only | Explicit Vercel fails before side effects |
| Codex TUI | Degraded | Local only | Explicit Vercel fails before side effects |
| Codex App | Degraded | Local only | Explicit Vercel fails before side effects; opening the result remains an explicit user action |

All surfaces require Node 20 or newer for the delivery resolver and write
access to the chosen local destination. Browser opening is optional. Vercel CLI
and authentication are optional capabilities used only by Claude Code remote
mode.

## Acceptance

Support status is not granted by plugin loadability. Each claimed surface must
prove that the generated candidate skill is the loaded contract, local output
is one self-contained file with no forbidden side effect, and explicit Codex
Vercel intent fails closed before mutation or network access.

### A1 Contract and regression suite

Accepted on 2026-08-12. The delivery, collision, and canonical-order suite
passed 7 of 7 tests. The complete Preview Node suite passed 475 tests, skipped two
filesystem-normalization cases that the host filesystem cannot construct, and
failed none. The compatibility fixture passed 18 of 18 tests, and the complete
Codex validator passed every registry, generation, install-smoke, publication,
and bootstrap gate.

Generation was deterministic and left no drift. Canonical and generated
Preview trees compared byte-for-byte. Both `SKILL.md` copies have SHA-256
`7651699bab3e0642f8e8d2ee03ed8d3ac6f6ff394921937e6e79ea9631c99455`;
both resolver copies have SHA-256
`da1b226ad9c04b61b71d762c5c25c3f631cd3a2c3d4d5767145e2aac7e2c9860`.
Both local-output reservation helpers have SHA-256
`6da0f97bf3a727f393a662943aa06d976eb07100bc56ed441b2c8f75454a1f61`.

### A2 Claude Code

Accepted in Claude Code session `06a228c1-45d9-41d3-a9e5-38f7c781fc9f`.
Claude Code loaded the candidate through `--plugin-dir`; the Skill result named
the canonical worktree Preview directory and contained the early delivery gate.
It ran the local resolver, created only the requested HTML, did not open it, and
returned the absolute-path Markdown link. The artifact SHA-256 was
`9db500fc87e71bc1249c500552db46cd278af9261caeb487a78415e385de5c09`.
An intentionally invalid `.solopreneur.json` and a sentinel retained their
pre-run hashes, and the transcript reported zero web search or fetch requests.
The mocked Library and Share coverage passed inside A1; no live deployment was
performed.

### A3 Codex exec

Accepted with Codex CLI 0.147.0 from an isolated `HOME`, `CODEX_HOME`, and
project, installed through the local marketplace consumer path. Local thread
`019ff4b3-1f4f-74b3-9bf9-26ed253e8934` loaded the generated cached Preview,
ran the resolver before checking or writing the target, created one standalone
HTML with SHA-256
`24cca7fc6028896e31283ff67b6284e11f7556f4e36b1ca93f758249a8539470`,
and returned its absolute-path link. The invalid config and sentinel were
unchanged and no browser command ran.

Explicit-Vercel thread `019ff4b4-7efc-7fc1-bbe2-37a55b1debcb` made exactly one
tool call: the resolver with Vercel mode. It returned the Phase 1 limitation;
the fixture retained exactly its two original files and hashes, with no local
fallback, config read, preflight, network, or deployment call.

Collision thread `019ff4cd-458b-7872-95f7-c21bfccb5368` loaded the generated
consumer-cache skill, resolved local mode, and then invoked the shipped atomic
reservation helper against an existing `collision.html`. The original file
retained SHA-256
`39ab4a9c297fdfd3624e7e59eb5e5055c08929237b582d28407000a1ff181796`;
the helper selected `collision-2.html`, and Codex wrote the single new
self-contained artifact with SHA-256
`37fc2a23e2808c4dbeb5745cce2dbc43eb36930c38cabc7de7d6f7d4cf9636d1`.
The intentionally invalid config retained its hash, and the transcript showed
no browser, config, preflight, network, or deployment action.

### A4 Codex TUI

Accepted through real PTY-backed interactive TUI sessions against the same
isolated consumer install. Local thread
`019ff4b5-74ab-7241-8cda-0cc51d87acb1` loaded the generated cached Preview,
created one standalone HTML with SHA-256
`a1a145da2841e59fe424895a811693a2cbf04698f42db5ab5bc9ebd871f10a80`,
left the invalid config and sentinel unchanged, returned the absolute-path
link, and did not open a browser.

Explicit-Vercel thread `019ff4b7-6f24-73e2-8ca7-366ec68c0e4a` called only the
Vercel-mode resolver. Its fixture retained exactly the original two files and
hashes and the final answer reported the Phase 1 limitation without a local
fallback.

### A5 Codex App

Accepted through the real Codex 0.147.0 App Server JSON-RPC protocol, not
inherited from CLI or TUI evidence. `skills/list` returned
`solopreneur:preview` at the generated consumer-cache path, and both turns
received that exact path as a `skill` input item.

Local thread `019ff4b8-ed9e-7a31-b9c9-72747f27f76f`, turn
`019ff4b9-18a9-7ae3-b308-1e2bea6535be`, created one standalone HTML with
SHA-256
`b8a6a08ff32c12d33d2f07b84e8746abb06b27b7539ed8e0e8c6356abc155f35`,
left the invalid config and sentinel unchanged, and returned the absolute-path
link without opening it. Explicit-Vercel thread
`019ff4b9-e189-7e23-a185-eae67d8e087e`, turn
`019ff4ba-0929-7710-89d6-0d5b194688d8`, read the selected skill and then ran
only the Vercel-mode resolver. The fixture retained exactly its original two
files and hashes; no fallback, config, preflight, network, or deployment action
occurred.

## References

- [Codex skill portability](./2026-08-09-codex-skill-portability.md)
- [Codex dual-publish](./2026-07-08-codex-dual-publish.md)
- [OpenAI skill documentation](https://developers.openai.com/codex/skills)
- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)
