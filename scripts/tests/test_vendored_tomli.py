"""Integrity and compatibility checks for the shared vendored TOML parser."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import unittest
from pathlib import Path
from types import ModuleType


REPO_ROOT = Path(__file__).resolve().parents[2]
SKILL_ROOT = (
    REPO_ROOT / "skills" / "solopreneur" / "codex-agents-bootstrap"
)
VENDOR_ROOT = SKILL_ROOT / "vendor" / "tomli"
LOADER_PATH = SKILL_ROOT / "scripts" / "tomli_loader.py"
PROVENANCE_PATH = VENDOR_ROOT / "PROVENANCE.json"
UPSTREAM_FILES = {
    "LICENSE",
    "tomli/__init__.py",
    "tomli/_parser.py",
    "tomli/_re.py",
    "tomli/_types.py",
    "tomli/py.typed",
}


def load_shared_parser() -> ModuleType:
    specification = importlib.util.spec_from_file_location(
        "codex_agents_tomli_loader_test", LOADER_PATH
    )
    if specification is None or specification.loader is None:
        raise AssertionError(f"cannot load shared parser loader from {LOADER_PATH}")
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module.tomli


class VendoredTomliTests(unittest.TestCase):
    def test_provenance_pins_tag_commit_and_every_upstream_file_hash(self) -> None:
        provenance = json.loads(PROVENANCE_PATH.read_text(encoding="utf-8"))

        self.assertEqual(provenance["name"], "tomli")
        self.assertEqual(provenance["version"], "2.4.1")
        self.assertEqual(provenance["upstream_tag"], "2.4.1")
        self.assertEqual(
            provenance["tag_object"],
            "ccaa8bc3c7bcff65a174824b0268288f9be52d94",
        )
        self.assertEqual(
            provenance["peeled_commit"],
            "c5f44690c68c5ed29534faa8f9df18882113728c",
        )
        self.assertEqual(set(provenance["files"]), UPSTREAM_FILES)

        for relative, expected_digest in provenance["files"].items():
            actual_digest = hashlib.sha256(
                (VENDOR_ROOT / relative).read_bytes()
            ).hexdigest()
            self.assertEqual(actual_digest, expected_digest, relative)

    def test_loader_always_resolves_the_vendored_2_4_1_parser(self) -> None:
        tomli = load_shared_parser()

        self.assertEqual(tomli.__version__, "2.4.1")
        self.assertTrue(
            Path(tomli.__file__).resolve().is_relative_to(VENDOR_ROOT.resolve())
        )

    def test_vendored_parser_supports_toml_1_1_hex_escapes(self) -> None:
        tomli = load_shared_parser()

        self.assertEqual(tomli.loads(r'name = "marke\x74er"')["name"], "marketer")


if __name__ == "__main__":
    unittest.main()
