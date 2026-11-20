# sign-offs: minor findings left from the #207 review

> **Status (2026-11-20):** not started. CodeRabbit's last review of #207 (after
> ten greenlight rounds) raised these seven Minor items; they were deferred so
> the skill could ship in solopreneur 0.6.4. Verify each premise against the
> current code before fixing; some may no longer apply.

1. `scripts/tests/test_signoffs.py` can fail on a machine with an HTTP proxy
   configured: the local test server requests should bypass proxy env vars.
2. Image-reference scan: a `/*` inside a CSS string hides a real `url(...)`
   reference that comes after it.
3. Read-back CSP check: a host CSP that allows the page script by hash is
   misjudged as blocking it.
4. `meta.json` comparison treats JSON `true` and `1` as equal.
5. A target name starting with `-` should be printed as `--target=<name>` in
   the update and recovery commands the CLI suggests.
6. SKILL.md, exit 3 handling: tell the agent to run the full command the CLI
   prints.
7. `connect-src` matching compares the host only, not the path.
