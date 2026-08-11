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
LEGACY_BASELINE = Path(__file__).resolve().parents[1] / "codex-legacy-skill-baseline.txt"
CORE_SKILLS = (
    "autopilot",
    "merge-pr",
    "mvp",
    "plan-review",
    "preview",
    "todos-babysit",
    "worktree-handoff",
)
GUARDED_SKILLS = (
    "autopilot",
    "mvp",
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
        baseline = self.repo_root / "scripts" / "codex-legacy-skill-baseline.txt"
        baseline.parent.mkdir(parents=True)
        baseline.write_bytes(LEGACY_BASELINE.read_bytes())

        guard_paths = {}
        skill_ids = []
        for skill in CORE_SKILLS:
            skill_id = f"solopreneur:{skill}"
            path = self.repo_root / "plugins" / "solopreneur" / "skills" / skill / "SKILL.md"
            path.parent.mkdir(parents=True, exist_ok=True)
            if skill in GUARDED_SKILLS:
                path.write_text(
                    "## Codex host guard\n"
                    "Before any other action, check whether `CODEX_THREAD_ID` is set. "
                    "If it is, stop now. This workflow runs only on Claude Code.\n",
                    encoding="utf-8",
                )
                guard_paths[skill_id] = str(path.relative_to(self.repo_root))
            else:
                path.write_text(f"# {skill}\n", encoding="utf-8")
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

    def add_skill(self, skill_id: str) -> str:
        plugin, skill = skill_id.split(":", 1)
        resource = f"plugins/{plugin}/skills/{skill}/SKILL.md"
        path = self.repo_root / resource
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"# {skill}\n", encoding="utf-8")
        self.registry["sourceShapes"]["shared"].append(skill_id)
        self.registry["sourceShapes"]["shared"].sort()
        return resource

    def publish(
        self,
        skill_id: str,
        dependencies: tuple[str, ...] = (),
        *,
        claude_full: bool = False,
    ) -> None:
        plugin, skill = skill_id.split(":", 1)
        resource = f"plugins/{plugin}/skills/{skill}/SKILL.md"
        support = {
            "codex-exec": "full",
            "codex-tui": "full",
            "codex-app": "full",
        }
        acceptance = {
            "codex-exec": [resource],
            "codex-tui": [resource],
            "codex-app": [resource],
        }
        if claude_full:
            support["claude-code"] = "full"
            acceptance["claude-code"] = [resource]
        self.registry["skills"][skill_id] = {
            "support": support,
            "publication": {"codex": "include"},
            "sharedContract": resource,
            "platformResources": [resource],
            "acceptance": acceptance,
            "dependencies": list(dependencies),
        }

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

    def test_support_defaults_must_remain_fail_closed(self) -> None:
        self.registry["defaults"]["support"]["codex-exec"] = "full"
        self.write_registry()

        self.assert_failure_contains(
            "defaults.support must keep the fail-closed migration baseline"
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

    def test_partially_supported_skill_cannot_enter_shared_codex_view(self) -> None:
        self.publish("solopreneur:autopilot")
        self.registry["skills"]["solopreneur:autopilot"]["support"][
            "codex-app"
        ] = "unsupported"
        del self.registry["skills"]["solopreneur:autopilot"]["acceptance"][
            "codex-app"
        ]
        self.write_registry()

        self.assert_failure_contains(
            "cannot be included while Codex surfaces are unsupported: codex-app"
        )

    def test_published_skill_cannot_depend_on_excluded_skill(self) -> None:
        self.publish("solopreneur:autopilot", ("solopreneur:merge-pr",))
        self.write_registry()

        self.assert_failure_contains(
            "solopreneur:autopilot has excluded Codex dependency solopreneur:merge-pr"
        )

    def test_published_skill_cannot_depend_across_plugins(self) -> None:
        self.add_skill("other:helper")
        self.publish("other:helper", claude_full=True)
        self.publish("solopreneur:autopilot", ("other:helper",))
        self.write_registry()

        self.assert_failure_contains(
            "solopreneur:autopilot has cross-plugin Codex dependency other:helper"
        )

    def test_transitive_excluded_dependency_fails(self) -> None:
        self.add_skill("solopreneur:helper")
        self.publish(
            "solopreneur:helper",
            ("solopreneur:merge-pr",),
            claude_full=True,
        )
        self.publish("solopreneur:autopilot", ("solopreneur:helper",))
        self.write_registry()

        self.assert_failure_contains(
            "solopreneur:helper has excluded Codex dependency solopreneur:merge-pr"
        )

    def test_platform_resource_must_be_present_in_generated_snapshot(self) -> None:
        self.registry["skills"]["solopreneur:autopilot"] = {
            "platformResources": ["legacy.md"]
        }
        self.write_registry()

        self.assert_failure_contains(
            "platformResources must stay inside the skill or use its shared config.sh"
        )

    def test_repository_reference_cannot_escape_root(self) -> None:
        outside = self.repo_root.parent / "outside.md"
        outside.write_text("outside\n", encoding="utf-8")
        self.registry["legacyProvenance"] = "../outside.md"
        self.write_registry()

        self.assert_failure_contains(
            "legacyProvenance must reference an existing file"
        )

    def test_new_skill_cannot_inherit_frozen_legacy_status(self) -> None:
        self.add_skill("solopreneur:extra")
        self.write_registry()

        self.assert_failure_contains(
            "new skills cannot inherit claude-code legacy: solopreneur:extra"
        )

    def test_baseline_skill_can_be_promoted_without_changing_baseline(self) -> None:
        self.registry["skills"]["solopreneur:autopilot"] = {
            "support": {"claude-code": "full"},
            "acceptance": {"claude-code": ["legacy.md"]},
        }
        self.write_registry()

        result = self.run_validator()

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_guard_path_must_be_canonical(self) -> None:
        self.registry["codexHostGuards"]["solopreneur:autopilot"] = "legacy.md"
        self.write_registry()

        self.assert_failure_contains(
            "codexHostGuards.solopreneur:autopilot must reference "
            "plugins/solopreneur/skills/autopilot/SKILL.md"
        )

    def test_guard_must_be_early(self) -> None:
        path = self.repo_root / self.registry["codexHostGuards"]["solopreneur:autopilot"]
        path.write_text("# No guard\n", encoding="utf-8")

        self.assert_failure_contains(
            "codexHostGuards.solopreneur:autopilot lacks an early fail-closed guard"
        )

    def test_guard_must_precede_other_instructions(self) -> None:
        path = self.repo_root / self.registry["codexHostGuards"]["solopreneur:autopilot"]
        path.write_text("Do something first.\n\n" + path.read_text(), encoding="utf-8")

        self.assert_failure_contains(
            "codexHostGuards.solopreneur:autopilot lacks an early fail-closed guard"
        )


if __name__ == "__main__":
    unittest.main()
