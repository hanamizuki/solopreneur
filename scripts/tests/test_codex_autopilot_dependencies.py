"""Static safety contract for the Codex Autopilot dependency seams."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class CodexAutopilotDependencyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.merge_pr = (
            REPO_ROOT / "plugins/solopreneur/skills/merge-pr/SKILL.md"
        ).read_text(encoding="utf-8")

    def shell_block(self, heading: str) -> str:
        heading_at = self.merge_pr.index(heading)
        block_at = self.merge_pr.index("```bash\n", heading_at) + len("```bash\n")
        return self.merge_pr[block_at : self.merge_pr.index("\n```", block_at)]

    def run_block(self, block: str, scenario: str, prelude: str = "") -> tuple[subprocess.CompletedProcess[str], list[list[str]]]:
        with tempfile.TemporaryDirectory(prefix="merge-pr-contract-") as temp:
            root = Path(temp)
            call_log = root / "calls.jsonl"
            fake = root / "fake.py"
            fake.write_text(
                """#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

name = Path(sys.argv[0]).name
args = sys.argv[1:]
with open(os.environ["CALL_LOG"], "a", encoding="utf-8") as handle:
    handle.write(json.dumps([name, *args]) + "\\n")
scenario = os.environ["SCENARIO"]

if name == "git":
    if args[:2] == ["branch", "--show-current"]:
        print("feature")
    elif args[:2] == ["rev-parse", "--git-common-dir"]:
        print(".git")
    elif args[:2] == ["rev-parse", "--git-dir"]:
        print(".git/worktrees/feature")
    elif args[:2] == ["diff", "--quiet"]:
        raise SystemExit(1 if scenario == "dirty" else 0)
    raise SystemExit(0)

if args[:2] == ["pr", "view"]:
    if scenario == "missing":
        raise SystemExit(1)
    field = args[args.index("--json") + 1]
    if field == "number":
        print("42")
    elif field == "headRefOid":
        print("new-sha" if scenario == "moved" else "old-sha")
    elif field == "state":
        print("MERGED")
elif args and args[0] == "api":
    joined = " ".join(args)
    if "check-runs" in joined:
        if "--slurp" in args:
            print('[{"total_count":1,"check_runs":[{"status":"completed","conclusion":"failure","name":"unit"}]}]')
        else:
            print("  - unit: failure")
    else:
        print('{"total_count":0,"state":"pending","statuses":[]}')
raise SystemExit(0)
""",
                encoding="utf-8",
            )
            fake.chmod(0o755)
            (root / "git").symlink_to(fake)
            (root / "gh").symlink_to(fake)
            env = os.environ | {
                "CALL_LOG": str(call_log),
                "CODEX_THREAD_ID": "fixture",
                "PATH": f"{root}:{os.environ['PATH']}",
                "SCENARIO": scenario,
            }
            result = subprocess.run(
                ["/bin/bash", "-c", f"set -u\n{prelude}\n{block}"],
                capture_output=True,
                check=False,
                env=env,
                text=True,
            )
            calls = [json.loads(line) for line in call_log.read_text().splitlines()]
            return result, calls

    def assert_no_mutation(self, calls: list[list[str]]) -> None:
        self.assertFalse(any(call[:3] == ["gh", "pr", "merge"] for call in calls))
        self.assertFalse(any(call[:4] == ["git", "push", "origin", "--delete"] for call in calls))

    def test_codex_profiles_fail_closed_without_pre_merge_mutation(self) -> None:
        plan_review = (
            REPO_ROOT / "plugins/solopreneur/skills/plan-review/SKILL.md"
        ).read_text(encoding="utf-8")
        merge_pr = (
            REPO_ROOT / "plugins/solopreneur/skills/merge-pr/SKILL.md"
        ).read_text(encoding="utf-8")

        self.assertIn("Codex V1 supports only /plan-review internal", plan_review)
        self.assertIn("never run Stage 3, R3, or R4", plan_review)
        self.assertIn("never modify the reviewed document", plan_review)
        self.assertIn('fork_turns="none"', plan_review)

        self.assertIn("Skip Steps 0 and 3 entirely", merge_pr)
        self.assertIn("Do not clean another worktree", merge_pr)
        self.assertIn('--match-head-commit "$HEAD_SHA"', merge_pr)
        self.assertLess(
            merge_pr.index('STATE=$(gh pr view "$PR_NUMBER"'),
            merge_pr.index('git push origin --delete "$BRANCH"'),
        )

    def test_merge_boundaries_and_atomic_command(self) -> None:
        step_1 = self.shell_block("### Step 1:")
        step_2 = self.shell_block("### Step 2:")
        step_4 = self.shell_block("### Step 4:")
        step_5 = self.shell_block("### Step 5:")

        result, calls = self.run_block(step_1, "missing")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("stopping without changes", result.stdout)
        self.assert_no_mutation(calls)

        result, calls = self.run_block(step_2, "dirty")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("refusing to merge", result.stdout)
        self.assert_no_mutation(calls)

        result, calls = self.run_block(step_4, "failed", "PR_NUMBER=42")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("CI FAILED", result.stdout)
        self.assert_no_mutation(calls)

        prelude = "PR_NUMBER=42\nHEAD_SHA=old-sha\nBRANCH=feature"
        result, calls = self.run_block(step_5, "moved", prelude)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("PR head moved", result.stdout)
        self.assert_no_mutation(calls)

        result, calls = self.run_block(step_5, "green", prelude)
        self.assertEqual(result.returncode, 0, result.stderr)
        merge_call = ["gh", "pr", "merge", "42", "--squash", "--match-head-commit", "old-sha"]
        self.assertIn(merge_call, calls)
        state_at = calls.index(["gh", "pr", "view", "42", "--json", "state", "--jq", ".state"])
        delete_at = calls.index(["git", "push", "origin", "--delete", "feature"])
        self.assertLess(state_at, delete_at)


if __name__ == "__main__":
    unittest.main()
