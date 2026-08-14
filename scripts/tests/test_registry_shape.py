"""Fixture for the greenlight Phase 1 acceptance run (milestone B).

Asserts a shape the registry already guarantees, so it passes on main and gives
the Phase 1 reviewers a real Python diff to look at. Deleted with its branch.
"""
import json
import pathlib
import unittest

REGISTRY = pathlib.Path(__file__).resolve().parents[2] / "skills-compatibility.json"


class RegistryShapeTest(unittest.TestCase):
    def test_every_included_skill_declares_acceptance(self):
        data = json.loads(REGISTRY.read_text())
        for skill_id, entry in data["skills"].items():
            if entry.get("publication", {}).get("codex") != "include":
                continue
            for surface, level in entry["support"].items():
                if not surface.startswith("codex-") or level == "unsupported":
                    continue
                self.assertTrue(
                    entry.get("acceptance", {}).get(surface),
                    f"{skill_id} is included on {surface} with no acceptance evidence",
                )


if __name__ == "__main__":
    unittest.main()
