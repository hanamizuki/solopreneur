"""Hermetic CLI fixtures for ``validate-codex-agents.py``.

The validator is intentionally exercised as a subprocess so these tests cover
its repository discovery, diagnostics, and exit status as CI invokes them.
Each test owns a temporary marketplace and plugin tree; no real plugin source
or user Codex configuration is read.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


VALIDATOR = Path(__file__).resolve().parents[1] / "validate-codex-agents.py"


class ValidateCodexAgentsTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temporary_directory = tempfile.TemporaryDirectory(
            prefix="validate-codex-agents-"
        )
        self.addCleanup(self._temporary_directory.cleanup)
        self.repo_root = Path(self._temporary_directory.name) / "repo"
        self.set_published_plugins(["marketer"])

    def set_published_plugins(self, names: list[str]) -> None:
        marketplace = self.repo_root / ".claude-plugin" / "marketplace.json"
        marketplace.parent.mkdir(parents=True, exist_ok=True)
        marketplace.write_text(
            json.dumps({"plugins": [{"name": name} for name in names]}),
            encoding="utf-8",
        )

    def write_agent(
        self,
        plugin: str = "marketer",
        *,
        name: str | None = None,
        filename: str | None = None,
        marker: str | None = None,
        fields: tuple[str, ...] = (
            "name",
            "description",
            "developer_instructions",
        ),
        body: str | None = None,
        sibling: bool = True,
    ) -> Path:
        agent_name = name or plugin
        agent_filename = filename or f"{agent_name}.toml"
        agents_dir = self.repo_root / "plugins" / plugin / "agents"
        agents_dir.mkdir(parents=True, exist_ok=True)
        path = agents_dir / agent_filename

        if body is None:
            first_line = marker or (
                f"# solopreneur-managed-agent v2 plugin={plugin} "
                f"agent={agent_name}"
            )
            values = {
                "name": agent_name,
                "description": "Marketing specialist.",
                "developer_instructions": "Do useful marketing work.",
            }
            lines = [first_line]
            lines.extend(
                f'{field} = {json.dumps(values[field])}'
                for field in fields
            )
            body = "\n".join(lines) + "\n"

        path.write_text(body, encoding="utf-8")
        if sibling:
            path.with_suffix(".md").write_text("# Claude agent\n", encoding="utf-8")
        return path

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

    def test_valid_canonical_agent_passes(self) -> None:
        self.write_agent()

        result = self.run_validator()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("1 agent source(s) passed", result.stdout)

    def test_toml_1_1_hex_escape_in_identity_passes(self) -> None:
        self.write_agent(
            body=(
                "# solopreneur-managed-agent v2 plugin=marketer agent=marketer\n"
                'name = "marke\\x74er"\n'
                'description = "Marketing specialist."\n'
                'developer_instructions = "Do useful marketing work."\n'
            )
        )

        result = self.run_validator()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("1 agent source(s) passed", result.stdout)

    def test_quoted_root_name_key_passes(self) -> None:
        self.write_agent(
            body=(
                "# solopreneur-managed-agent v2 plugin=marketer agent=marketer\n"
                '"name" = "marketer"\n'
                'description = "Marketing specialist."\n'
                'developer_instructions = "Do useful marketing work."\n'
            )
        )

        result = self.run_validator()

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_multiline_basic_string_identity_passes(self) -> None:
        self.write_agent(
            body=(
                "# solopreneur-managed-agent v2 plugin=marketer agent=marketer\n"
                'name = """marketer"""\n'
                'description = "Marketing specialist."\n'
                'developer_instructions = "Do useful marketing work."\n'
            )
        )

        result = self.run_validator()

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_required_field_fails(self) -> None:
        self.write_agent(fields=("name", "description"))

        self.assert_failure_contains(
            "developer_instructions must be a non-empty string"
        )

    def test_bad_managed_marker_fails(self) -> None:
        self.write_agent(
            marker="# solopreneur-managed-agent v2 plugin=designer agent=marketer"
        )

        self.assert_failure_contains("first line must be exactly")

    def test_missing_markdown_sibling_fails(self) -> None:
        self.write_agent(sibling=False)

        self.assert_failure_contains("missing regular Claude agent sibling")

    def test_agents_directory_symlink_fails_before_following_it(self) -> None:
        external = Path(self._temporary_directory.name) / "external-agents"
        external.mkdir()
        (external / "marketer.toml").write_text(
            "not valid TOML = [",
            encoding="utf-8",
        )
        agents_dir = self.repo_root / "plugins" / "marketer" / "agents"
        agents_dir.parent.mkdir(parents=True, exist_ok=True)
        agents_dir.symlink_to(external, target_is_directory=True)

        self.assert_failure_contains("agents directory must not be a symlink")

    def test_agent_source_symlink_fails(self) -> None:
        source = self.write_agent()
        external = Path(self._temporary_directory.name) / "external.toml"
        source.replace(external)
        source.symlink_to(external)

        self.assert_failure_contains("agent source must not be a symlink")

    def test_forbidden_platform_vocabulary_fails(self) -> None:
        self.write_agent(
            body=(
                "# solopreneur-managed-agent v2 plugin=marketer agent=marketer\n"
                'name = "marketer"\n'
                'description = "Marketing specialist."\n'
                'developer_instructions = "Use Claude Code for this task."\n'
            )
        )

        self.assert_failure_contains("contains platform-specific vocabulary")

    def test_duplicate_agent_identity_fails(self) -> None:
        # A duplicated marketplace entry causes the same published source to be
        # visited twice. The generator has its own marketplace-name gate; this
        # fixture keeps the validator's cross-source identity guard executable.
        self.set_published_plugins(["marketer", "marketer"])
        self.write_agent()

        self.assert_failure_contains("duplicate agent identity 'marketer'")

    def test_noncanonical_plugin_agent_pair_fails(self) -> None:
        self.write_agent(name="sales")

        self.assert_failure_contains(
            "agent identity 'sales' must equal published plugin name 'marketer'"
        )

    def test_malformed_toml_fails(self) -> None:
        self.write_agent(
            body=(
                "# solopreneur-managed-agent v2 plugin=marketer agent=marketer\n"
                'name = "marketer"\n'
                "description = [\n"
            )
        )

        self.assert_failure_contains("invalid TOML")

    def test_duplicate_root_name_is_invalid_toml(self) -> None:
        self.write_agent(
            body=(
                "# solopreneur-managed-agent v2 plugin=marketer agent=marketer\n"
                'name = "marketer"\n'
                'name = "marketer"\n'
                'description = "Marketing specialist."\n'
                'developer_instructions = "Do useful marketing work."\n'
            )
        )

        self.assert_failure_contains("invalid TOML")

    def test_name_nested_in_a_table_does_not_satisfy_root_identity(self) -> None:
        self.write_agent(
            body=(
                "# solopreneur-managed-agent v2 plugin=marketer agent=marketer\n"
                'description = "Marketing specialist."\n'
                'developer_instructions = "Do useful marketing work."\n'
                "[metadata]\n"
                'name = "marketer"\n'
            )
        )

        self.assert_failure_contains("name must be a non-empty string")

    def test_unpublished_plugin_sources_are_outside_validator_authority(self) -> None:
        self.write_agent()
        self.write_agent(
            "unpublished",
            body="this would be invalid TOML if it were inspected = [",
            sibling=False,
        )

        result = self.run_validator()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("1 agent source(s) passed", result.stdout)


if __name__ == "__main__":
    unittest.main()
