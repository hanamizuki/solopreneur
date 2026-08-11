"""Hermetic security checks for ``validate-skills-compatibility.py``."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


VALIDATOR = Path(__file__).resolve().parents[1] / "validate-skills-compatibility.py"
GUARDED_SKILLS = (
    "autopilot",
    "merge-pr",
    "mvp",
    "plan-review",
    "preview",
    "todos-babysit",
    "worktree-handoff",
)


class ValidateSkillsCompatibilityTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temporary_directory = tempfile.TemporaryDirectory(
            prefix="validate-skills-compatibility-"
        )
        self.addCleanup(self._temporary_directory.cleanup)
        self.repo_root = Path(self._temporary_directory.name) / "repo"
        (self.repo_root / "legacy.md").parent.mkdir(parents=True, exist_ok=True)
        (self.repo_root / "legacy.md").write_text("legacy\n", encoding="utf-8")

        guard_paths = {}
        skill_ids = []
        for skill in GUARDED_SKILLS:
            skill_id = f"solopreneur:{skill}"
            path = self.repo_root / "plugins" / "solopreneur" / "skills" / skill / "SKILL.md"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("## Codex host guard\n`CODEX_THREAD_ID`\n", encoding="utf-8")
            guard_paths[skill_id] = str(path.relative_to(self.repo_root))
            skill_ids.append(skill_id)

        self.registry = {
            "schemaVersion": 1,
            "legacyProvenance": "legacy.md",
            "defaults": {
                "support": {
                    "claude-code": "legacy",
                    "codex-exec": "unsupported",
                    "codex-tui": "unsupported",
                    "codex-app": "unsupported",
                },
                "publication": {"claude-code": "include", "codex": "exclude"},
            },
            "sourceShapes": {
                "shared": [],
                "shared_with_seams": [],
                "native_engines": sorted(skill_ids),
            },
            "skills": {},
            "codexHostGuards": guard_paths,
        }
        self.write_registry()

    def write_registry(self) -> None:
        (self.repo_root / "skills-compatibility.json").write_text(
            json.dumps(self.registry), encoding="utf-8"
        )

    def run_validator(self) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        environment["PYTHONDONTWRITEBYTECODE"] = "1"
        return subprocess.run(
            [sys.executable, str(VALIDATOR), str(self.repo_root)],
            check=False,
            capture_output=True,
            text=True,
            env=environment,
        )

    def assert_failure_contains(self, expected: str) -> None:
        result = self.run_validator()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn(expected, result.stderr)

    def test_valid_fail_closed_registry_passes(self) -> None:
        result = self.run_validator()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("7 skills", result.stdout)
        self.assertIn("Codex included=0", result.stdout)

    def test_codex_default_must_remain_excluded(self) -> None:
        self.registry["defaults"]["publication"]["codex"] = "include"
        self.write_registry()

        self.assert_failure_contains(
            "defaults.publication.codex must be exclude; Codex inclusion is per skill"
        )

    def test_unclassified_skill_fails(self) -> None:
        extra = self.repo_root / "plugins" / "solopreneur" / "skills" / "extra" / "SKILL.md"
        extra.parent.mkdir(parents=True)
        extra.write_text("# Extra\n", encoding="utf-8")

        self.assert_failure_contains("unclassified skills: solopreneur:extra")

    def test_unsupported_skill_cannot_be_published(self) -> None:
        self.registry["skills"]["solopreneur:autopilot"] = {
            "publication": {"codex": "include"}
        }
        self.write_registry()

        self.assert_failure_contains(
            "solopreneur:autopilot is included on Codex without a supported surface"
        )

    def test_guard_must_be_early(self) -> None:
        path = self.repo_root / self.registry["codexHostGuards"]["solopreneur:autopilot"]
        path.write_text("# No guard\n", encoding="utf-8")

        self.assert_failure_contains(
            "codexHostGuards.solopreneur:autopilot lacks an early fail-closed guard"
        )


if __name__ == "__main__":
    unittest.main()
