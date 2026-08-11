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
        cls.autopilot = (
            REPO_ROOT / "plugins/solopreneur/skills/autopilot/SKILL.md"
        ).read_text(encoding="utf-8")
        cls.autopilot_template = (
            REPO_ROOT
            / "plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md"
        ).read_text(encoding="utf-8")
        cls.merge_pr = (
            REPO_ROOT / "plugins/solopreneur/skills/merge-pr/SKILL.md"
        ).read_text(encoding="utf-8")

    def autopilot_preflight(self) -> str:
        heading_at = self.autopilot.index("#### Codex V1")
        block_at = self.autopilot.index("```bash\n", heading_at) + len("```bash\n")
        return self.autopilot[block_at : self.autopilot.index("\n```", block_at)]

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

    def test_autopilot_v1_contract_and_real_worktree_preflight(self) -> None:
        registry = json.loads((REPO_ROOT / "skills-compatibility.json").read_text())
        entry = registry["skills"]["solopreneur:autopilot"]

        self.assertNotIn("## Codex host guard", self.autopilot)
        self.assertIn("only a single PR executed now from an up-to-date `main`", self.autopilot)
        self.assertIn('if [[ "$BASE_BRANCH" != main ]]', self.autopilot)
        self.assertIn('fork_turns="none"', self.autopilot)
        self.assertIn("built-in `worker`", self.autopilot)
        self.assertIn("never dispatch a replacement child", self.autopilot)
        self.assertIn('its `headRefOid` is exactly `WORKTREE_HEAD`', self.autopilot)
        self.assertIn(
            'git ls-remote --heads "$PUSH_REMOTE_URL" "refs/heads/$BRANCH"',
            self.autopilot,
        )
        self.assertIn(
            '--force-with-lease="refs/heads/$BRANCH:$WORKTREE_HEAD"',
            self.autopilot,
        )
        preflight = self.autopilot_preflight()
        self.assertNotIn("git fetch --quiet origin", preflight)
        self.assertIn('git update-ref "refs/heads/$BRANCH" "$BASE_SHA" ""', preflight)
        self.assertIn('git update-ref -d "refs/heads/$BRANCH" "$BASE_SHA"', preflight)
        self.assertNotIn('git branch -D "$BRANCH"', preflight)
        self.assertIn("the parent already created the worktree", self.autopilot_template)
        self.assertIn('gh pr create --base "{BASE_BRANCH}"', self.autopilot_template)
        self.assertIn("The parent owns cleanup", self.autopilot_template)
        self.assertEqual(
            entry["dependencies"],
            [
                "solopreneur:greenlight",
                "solopreneur:merge-pr",
                "solopreneur:plan-review",
            ],
        )
        self.assertEqual(entry["publication"]["codex"], "include")
        self.assertNotIn("solopreneur:autopilot", registry["codexHostGuards"])

        with tempfile.TemporaryDirectory(prefix="autopilot-v1-contract-") as temp:
            root = Path(temp)
            origin = root / "origin.git"
            repo = root / "project"
            subprocess.run(["git", "init", "--bare", str(origin)], check=True, capture_output=True)
            subprocess.run(["git", "init", "-b", "main", str(repo)], check=True, capture_output=True)
            for key, value in (("user.name", "Test"), ("user.email", "test@example.com")):
                subprocess.run(["git", "-C", str(repo), "config", key, value], check=True)
            (repo / "README.md").write_text("fixture\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(repo), "add", "README.md"], check=True)
            subprocess.run(["git", "-C", str(repo), "commit", "-m", "fixture"], check=True, capture_output=True)
            subprocess.run(["git", "-C", str(repo), "remote", "add", "origin", str(origin)], check=True)
            subprocess.run(["git", "-C", str(repo), "push", "-u", "origin", "main"], check=True, capture_output=True)

            env = os.environ | {
                "BRANCH": "feature/autopilot-contract",
                "PLAN_DIR": "docs/loops/2026-08-12_autopilot-contract",
                "SPEC_FILE": "pr1-contract.md",
                "PR_ID": "pr1",
            }
            result = subprocess.run(
                ["/bin/bash", "-c", "set -euo pipefail\n" + self.autopilot_preflight()],
                cwd=repo,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            worktree = root / "project-autopilot-pr1"
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(worktree.is_dir())
            branch = subprocess.run(
                ["git", "-C", str(worktree), "branch", "--show-current"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
            self.assertEqual(branch, env["BRANCH"])
            self.assertTrue((worktree / env["PLAN_DIR"]).is_dir())

            subprocess.run(
                ["git", "-C", str(repo), "worktree", "remove", str(worktree)],
                check=True,
            )
            subprocess.run(
                ["git", "-C", str(repo), "branch", "-D", env["BRANCH"]],
                check=True,
                capture_output=True,
            )

            push_origin = root / "push-origin.git"
            subprocess.run(
                ["git", "init", "--bare", str(push_origin)],
                check=True,
                capture_output=True,
            )
            collision_env = env | {"BRANCH": "feature/autopilot-push-collision"}
            subprocess.run(
                [
                    "git",
                    "-C",
                    str(repo),
                    "push",
                    str(push_origin),
                    f"HEAD:{collision_env['BRANCH']}",
                ],
                check=True,
                capture_output=True,
            )
            subprocess.run(
                [
                    "git",
                    "-C",
                    str(repo),
                    "remote",
                    "set-url",
                    "--push",
                    "origin",
                    str(push_origin),
                ],
                check=True,
            )
            result = subprocess.run(
                ["/bin/bash", "-c", "set -euo pipefail\n" + self.autopilot_preflight()],
                cwd=repo,
                env=collision_env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Remote branch already exists", result.stdout)
            self.assertFalse(worktree.exists())
            subprocess.run(
                [
                    "git",
                    "-C",
                    str(repo),
                    "remote",
                    "set-url",
                    "--delete",
                    "--push",
                    "origin",
                    str(push_origin),
                ],
                check=True,
            )

            hooks = root / "hooks"
            hooks.mkdir()
            post_checkout = hooks / "post-checkout"
            post_checkout.write_text("#!/bin/sh\nexit 1\n", encoding="utf-8")
            post_checkout.chmod(0o755)
            subprocess.run(
                ["git", "-C", str(repo), "config", "core.hooksPath", str(hooks)],
                check=True,
            )
            hook_env = env | {"BRANCH": "feature/autopilot-hook"}
            result = subprocess.run(
                ["/bin/bash", "-c", "set -euo pipefail\n" + self.autopilot_preflight()],
                cwd=repo,
                env=hook_env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("cleanup was limited to this invocation", result.stdout)
            self.assertFalse(worktree.exists())
            self.assertNotEqual(
                subprocess.run(
                    ["git", "-C", str(repo), "show-ref", "--verify", "--quiet", f"refs/heads/{hook_env['BRANCH']}"],
                    check=False,
                ).returncode,
                0,
            )
            subprocess.run(
                ["git", "-C", str(repo), "config", "--unset", "core.hooksPath"],
                check=True,
            )

            outside = root / "outside"
            outside.mkdir()
            (repo / "docs").mkdir()
            (repo / "docs/loops").symlink_to(outside, target_is_directory=True)
            subprocess.run(["git", "-C", str(repo), "add", "docs/loops"], check=True)
            subprocess.run(
                ["git", "-C", str(repo), "commit", "-m", "symlink fixture"],
                check=True,
                capture_output=True,
            )
            subprocess.run(
                ["git", "-C", str(repo), "push", "origin", "main"],
                check=True,
                capture_output=True,
            )
            symlink_env = env | {"BRANCH": "feature/autopilot-symlink"}
            result = subprocess.run(
                ["/bin/bash", "-c", "set -euo pipefail\n" + self.autopilot_preflight()],
                cwd=repo,
                env=symlink_env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Spec path contains a symlink", result.stdout)
            self.assertFalse((outside / "2026-08-12_autopilot-contract").exists())
            self.assertFalse(worktree.exists())
            self.assertNotEqual(
                subprocess.run(
                    ["git", "-C", str(repo), "show-ref", "--verify", "--quiet", f"refs/heads/{symlink_env['BRANCH']}"],
                    check=False,
                ).returncode,
                0,
            )

            subprocess.run(
                ["git", "-C", str(repo), "switch", "-c", "stacked-base"],
                check=True,
                capture_output=True,
            )
            result = subprocess.run(
                ["/bin/bash", "-c", "set -euo pipefail\n" + self.autopilot_preflight()],
                cwd=repo,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("stacked PRs are not supported", result.stdout)
            self.assertFalse(worktree.exists())

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
