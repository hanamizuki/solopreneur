"""Static contracts for the cross-harness marketer router and eval set."""

from __future__ import annotations

import json
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
ROUTER = (
    REPO_ROOT
    / "plugins"
    / "marketer"
    / "skills"
    / "using-marketer"
    / "SKILL.md"
)
AGENT = REPO_ROOT / "plugins" / "marketer" / "agents" / "marketer.toml"
EVAL_FIXTURE = Path(__file__).with_name("fixtures") / "marketer-router-eval.json"


class MarketerRouterTests(unittest.TestCase):
    def test_current_marketer_guard_precedes_all_delegation_rules(self) -> None:
        source = ROUTER.read_text(encoding="utf-8")
        normalized = " ".join(source.split())
        guard = "If the current agent is `marketer`"

        self.assertIn(guard, source)
        self.assertIn("complete the request inline and never delegate", normalized)
        self.assertLess(source.index(guard), source.index("Decide the route"))

    def test_router_orders_decision_before_domain_skills_and_delegation(self) -> None:
        source = ROUTER.read_text(encoding="utf-8")
        frontmatter = " ".join(source.split("---", 2)[1].split())
        proof = "Decide the route before reading or invoking any marketing domain skill."

        self.assertEqual(source.count(proof), 1)
        self.assertIn("First routing gate", frontmatter)
        self.assertIn("explicit request for marketer", frontmatter)
        self.assertIn(
            "If marketer is known unavailable, stay inline with no agent call.",
            frontmatter,
        )
        self.assertIn(
            "When this gate selects delegation, Codex V2 must delegate exactly "
            'once with agent_type="marketer" and fork_turns="none".',
            frontmatter,
        )
        self.assertNotIn("On Codex V2, delegate exactly once", frontmatter)
        self.assertIn(
            "Never retry as a generic or full-history agent.",
            frontmatter,
        )
        self.assertLess(source.index(proof), source.index("Route the request once"))
        self.assertLess(
            source.index("Route the request once"),
            source.index("After choosing the route"),
        )

    def test_router_has_exact_cross_harness_call_and_failure_contracts(self) -> None:
        source = ROUTER.read_text(encoding="utf-8")
        normalized = " ".join(source.split())
        inline = "If the route is inline, make zero agent calls"
        unavailable = (
            "If the route is delegation and `marketer` is known unavailable, "
            "make zero agent calls"
        )
        available = (
            "If the route is delegation and `marketer` is available, make exactly "
            "one named-agent call"
        )
        failed_call = (
            "If the exact named-agent call in branch 3 is rejected or fails"
        )

        self.assertIn("mutually exclusive branches", normalized)
        self.assertIn(inline, normalized)
        self.assertIn(unavailable, normalized)
        self.assertIn(available, normalized)
        self.assertIn(
            'In Codex, call `spawn_agent` once with `agent_type="marketer"` and '
            '`fork_turns="none"`.',
            normalized,
        )
        self.assertIn(
            'In Claude Code, call `Agent` once with `subagent_type="marketer"`.',
            normalized,
        )
        self.assertIn(
            "Never spawn a generic agent, split the brief across agents, or retry",
            normalized,
        )
        self.assertIn(failed_call, normalized)
        self.assertIn("make no further spawn or delegation calls", normalized)
        self.assertLess(normalized.index(inline), normalized.index(unavailable))
        self.assertLess(normalized.index(unavailable), normalized.index(available))
        self.assertLess(normalized.index(available), normalized.index(failed_call))
        self.assertNotIn("Otherwise, make exactly one named-agent call", normalized)
        self.assertNotIn("when those fields exist", normalized)

    def test_agent_description_exposes_exact_codex_spawn_guidance(self) -> None:
        source = AGENT.read_text(encoding="utf-8")
        description = next(line for line in source.splitlines() if line.startswith("description = "))

        self.assertTrue(description.startswith("description = '") and description.endswith("'"))
        self.assertIn(
            'Spawn only with agent_type="marketer" and fork_turns="none"; '
            "never omit or change either field.",
            description,
        )

    def test_versioned_eval_fixture_has_twelve_boundary_cases(self) -> None:
        fixture = json.loads(EVAL_FIXTURE.read_text(encoding="utf-8"))
        cases = fixture["cases"]
        boundaries = {
            "current_marketer_explicit_request",
            "coordinator_explicit_marketer_request",
            "single_skill_rewrite",
            "single_skill_multistep_workflow",
            "single_skill_multiple_outputs",
            "natural_cross_concern_synthesis",
            "natural_naming_positioning_and_x",
            "natural_gtm_and_deck",
            "natural_cross_channel_experiment",
            "explicit_inline_override",
            "known_marketer_unavailable",
            "exact_marketer_spawn_failure",
        }
        routes_and_spawns = {
            "R01": ("inline", 0),
            "R02": ("delegate", 1),
            "R03": ("inline", 0),
            "R04": ("inline", 0),
            "R05": ("inline", 0),
            "R06": ("delegate", 1),
            "R07": ("delegate", 1),
            "R08": ("delegate", 1),
            "R09": ("delegate", 1),
            "R10": ("inline", 0),
            "R11": ("fallback_inline", 0),
            "R12": ("fallback_inline", 1),
        }

        self.assertEqual(
            set(fixture),
            {
                "schema_version",
                "fixture_kind",
                "records_live_results",
                "description",
                "cases",
            },
        )
        self.assertEqual(fixture["schema_version"], 1)
        self.assertEqual(fixture["fixture_kind"], "routing_expectations")
        self.assertFalse(fixture["records_live_results"])
        self.assertIn("not live execution evidence", fixture["description"].lower())
        self.assertEqual(
            [case["id"] for case in cases],
            [f"R{i:02d}" for i in range(1, 13)],
        )
        self.assertEqual({case["boundary"] for case in cases}, boundaries)
        self.assertEqual(
            {
                case["id"]: (
                    case["expected"]["route"],
                    case["expected"]["spawn_count"],
                )
                for case in cases
            },
            routes_and_spawns,
        )

    def test_eval_fixture_expected_trace_schema_and_coverage(self) -> None:
        cases = json.loads(EVAL_FIXTURE.read_text(encoding="utf-8"))["cases"]
        expected_keys = {
            "route",
            "spawn_count",
            "agent_type",
            "fork_turns",
            "failure",
            "generic_spawn_count",
        }

        for case in cases:
            with self.subTest(case=case["id"]):
                self.assertEqual(
                    set(case),
                    {"id", "boundary", "current_agent", "harness_state", "prompt", "expected"},
                )
                self.assertTrue(case["prompt"].strip())
                self.assertIn(case["current_agent"], {"coordinator", "marketer"})
                self.assertIn(
                    case["harness_state"],
                    {"available", "known_unavailable", "spawn_error"},
                )
                self.assertEqual(set(case["expected"]), expected_keys)
                self.assertIn(
                    case["expected"]["route"],
                    {"inline", "delegate", "fallback_inline"},
                )
                self.assertIn(case["expected"]["spawn_count"], {0, 1})
                self.assertIn(
                    case["expected"]["failure"],
                    {"none", "unavailable", "spawn_error"},
                )
                self.assertEqual(case["expected"]["generic_spawn_count"], 0)
                self.assertNotIn("observed", case)
                self.assertNotIn("passed", case)

                if case["expected"]["spawn_count"] == 1:
                    self.assertEqual(case["expected"]["agent_type"], "marketer")
                    self.assertEqual(case["expected"]["fork_turns"], "none")
                else:
                    self.assertIsNone(case["expected"]["agent_type"])
                    self.assertIsNone(case["expected"]["fork_turns"])

        by_id = {case["id"]: case for case in cases}
        self.assertEqual(by_id["R01"]["current_agent"], "marketer")
        self.assertEqual(by_id["R11"]["expected"]["failure"], "unavailable")
        self.assertEqual(by_id["R12"]["expected"]["failure"], "spawn_error")
        self.assertEqual(by_id["R12"]["expected"]["spawn_count"], 1)

    def test_inline_boundary_cases_never_spawn(self) -> None:
        cases = {
            case["id"]: case
            for case in json.loads(EVAL_FIXTURE.read_text(encoding="utf-8"))["cases"]
        }

        for case_id in {"R01", "R03", "R04", "R05", "R10"}:
            with self.subTest(case=case_id):
                expected = cases[case_id]["expected"]
                self.assertEqual(expected["route"], "inline")
                self.assertEqual(expected["spawn_count"], 0)
                self.assertIsNone(expected["agent_type"])
                self.assertIsNone(expected["fork_turns"])


if __name__ == "__main__":
    unittest.main()
