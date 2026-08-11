#!/usr/bin/env python3
"""Validate the compatibility registry against the canonical skill tree."""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any


SURFACES = ("claude-code", "codex-exec", "codex-tui", "codex-app")
CODEX_SURFACES = SURFACES[1:]
STATUSES = {"full", "degraded", "unsupported", "legacy"}
SHAPES = {"shared", "shared_with_seams", "native_engines"}
PUBLICATION = {"include", "exclude"}
REQUIRED_GUARDS = {
    "solopreneur:autopilot",
    "solopreneur:merge-pr",
    "solopreneur:mvp",
    "solopreneur:plan-review",
    "solopreneur:preview",
    "solopreneur:todos-babysit",
    "solopreneur:worktree-handoff",
}


class DuplicateKey(ValueError):
    pass


def object_without_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise DuplicateKey(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def referenced_path(repo: Path, value: str) -> Path:
    return repo / value.split("#", 1)[0]


def main() -> int:
    repo = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
    registry_path = repo / "skills-compatibility.json"
    errors: list[str] = []

    try:
        registry = json.loads(
            registry_path.read_text(), object_pairs_hook=object_without_duplicates
        )
    except (OSError, json.JSONDecodeError, DuplicateKey) as error:
        print(f"error: cannot load {registry_path}: {error}", file=sys.stderr)
        return 1
    if not isinstance(registry, dict):
        print(f"error: {registry_path} root must be an object", file=sys.stderr)
        return 1

    expected_root = {
        "schemaVersion",
        "legacyProvenance",
        "defaults",
        "sourceShapes",
        "skills",
        "codexHostGuards",
    }
    if set(registry) != expected_root:
        errors.append(f"root keys must be exactly {sorted(expected_root)}")
    if registry.get("schemaVersion") != 1:
        errors.append("schemaVersion must be 1")

    discovered = {
        f"{path.parts[-4]}:{path.parent.name}"
        for path in repo.glob("plugins/*/skills/*/SKILL.md")
    }

    source_shapes = registry.get("sourceShapes", {})
    if not isinstance(source_shapes, dict) or set(source_shapes) != SHAPES:
        errors.append(f"sourceShapes keys must be exactly {sorted(SHAPES)}")
        source_shapes = {}
    classified: list[str] = []
    for shape in SHAPES:
        values = source_shapes.get(shape, [])
        if not isinstance(values, list) or not all(isinstance(value, str) for value in values):
            errors.append(f"sourceShapes.{shape} must be an array of skill IDs")
            continue
        if values != sorted(values):
            errors.append(f"sourceShapes.{shape} must be sorted")
        classified.extend(values)

    duplicates = sorted(skill for skill, count in Counter(classified).items() if count > 1)
    if duplicates:
        errors.append(f"skills classified more than once: {', '.join(duplicates)}")
    missing = sorted(discovered - set(classified))
    unknown = sorted(set(classified) - discovered)
    if missing:
        errors.append(f"unclassified skills: {', '.join(missing)}")
    if unknown:
        errors.append(f"unknown classified skills: {', '.join(unknown)}")

    defaults = registry.get("defaults", {})
    if not isinstance(defaults, dict):
        errors.append("defaults must be an object")
        defaults = {}
    default_support = defaults.get("support", {})
    default_publication = defaults.get("publication", {})
    if not isinstance(default_support, dict):
        errors.append("defaults.support must be an object")
        default_support = {}
    if not isinstance(default_publication, dict):
        errors.append("defaults.publication must be an object")
        default_publication = {}
    if set(default_support) != set(SURFACES):
        errors.append(f"defaults.support must declare exactly {list(SURFACES)}")
    if set(default_publication) != {"claude-code", "codex"}:
        errors.append("defaults.publication must declare claude-code and codex")
    for surface, status in default_support.items():
        if status not in STATUSES:
            errors.append(f"invalid default support status {surface}={status!r}")
    for platform, decision in default_publication.items():
        if decision not in PUBLICATION:
            errors.append(f"invalid default publication {platform}={decision!r}")
    if default_support.get("claude-code") == "legacy":
        provenance = registry.get("legacyProvenance")
        if not isinstance(provenance, str) or not referenced_path(repo, provenance).is_file():
            errors.append("legacyProvenance must reference an existing file")

    overrides = registry.get("skills", {})
    if not isinstance(overrides, dict):
        errors.append("skills must be an object")
        overrides = {}
    allowed_override_keys = {
        "support",
        "publication",
        "sharedContract",
        "platformResources",
        "limitations",
        "acceptance",
        "dependencies",
        "requiredCapabilities",
        "optionalEnhancements",
        "surfaceGuards",
    }
    for skill_id, entry in overrides.items():
        if skill_id not in discovered:
            errors.append(f"override references unknown skill: {skill_id}")
            continue
        if not isinstance(entry, dict):
            errors.append(f"skills.{skill_id} must be an object")
            continue
        extra = set(entry) - allowed_override_keys
        if extra:
            errors.append(f"skills.{skill_id} has unknown fields: {', '.join(sorted(extra))}")

        support = dict(default_support)
        support_override = entry.get("support", {})
        if not isinstance(support_override, dict) or set(support_override) - set(SURFACES):
            errors.append(f"skills.{skill_id}.support has invalid surfaces")
            support_override = {}
        support.update(support_override)
        for surface, status in support.items():
            if status not in STATUSES:
                errors.append(f"skills.{skill_id} has invalid {surface} status {status!r}")
            if surface != "claude-code" and status == "legacy":
                errors.append(f"skills.{skill_id} cannot use legacy on {surface}")
        if support.get("claude-code") == "unsupported":
            errors.append(f"skills.{skill_id} cannot be unsupported on the unfiltered Claude tree")

        publication = dict(default_publication)
        publication_override = entry.get("publication", {})
        if not isinstance(publication_override, dict) or set(publication_override) - {
            "claude-code",
            "codex",
        }:
            errors.append(f"skills.{skill_id}.publication has invalid platforms")
            publication_override = {}
        publication.update(publication_override)
        if any(value not in PUBLICATION for value in publication.values()):
            errors.append(f"skills.{skill_id}.publication has an invalid decision")

        limitations = entry.get("limitations", {})
        acceptance = entry.get("acceptance", {})
        if not isinstance(limitations, dict) or set(limitations) - set(SURFACES):
            errors.append(f"skills.{skill_id}.limitations has invalid surfaces")
            limitations = {}
        if not isinstance(acceptance, dict) or set(acceptance) - set(SURFACES):
            errors.append(f"skills.{skill_id}.acceptance has invalid surfaces")
            acceptance = {}
        for surface, status in support.items():
            if status == "degraded":
                limitation = limitations.get(surface)
                if not isinstance(limitation, str) or not referenced_path(repo, limitation).is_file():
                    errors.append(f"skills.{skill_id} degraded {surface} needs a limitation file")
            if status in {"full", "degraded"}:
                scenarios = acceptance.get(surface)
                if not isinstance(scenarios, list) or not scenarios:
                    errors.append(f"skills.{skill_id} supported {surface} needs acceptance evidence")
                elif any(
                    not isinstance(value, str) or not referenced_path(repo, value).is_file()
                    for value in scenarios
                ):
                    errors.append(f"skills.{skill_id} has missing {surface} acceptance evidence")

        resources = entry.get("platformResources", [])
        if not isinstance(resources, list) or any(
            not isinstance(value, str) or not referenced_path(repo, value).exists()
            for value in resources
        ):
            errors.append(f"skills.{skill_id}.platformResources contains a missing path")
        if any(support.get(surface) in {"full", "degraded"} for surface in CODEX_SURFACES):
            contract = entry.get("sharedContract")
            if not isinstance(contract, str) or not referenced_path(repo, contract).is_file():
                errors.append(f"skills.{skill_id} needs a sharedContract for Codex support")
            if not resources:
                errors.append(f"skills.{skill_id} needs platformResources for Codex support")

        dependencies = entry.get("dependencies", [])
        if not isinstance(dependencies, list) or any(value not in discovered for value in dependencies):
            errors.append(f"skills.{skill_id}.dependencies contains an unknown skill")

        capabilities = entry.get("requiredCapabilities", {})
        if not isinstance(capabilities, dict) or set(capabilities) - set(SURFACES) or any(
            not isinstance(values, list)
            or not all(isinstance(value, str) and value for value in values)
            for values in capabilities.values()
        ):
            errors.append(f"skills.{skill_id}.requiredCapabilities is invalid")
        enhancements = entry.get("optionalEnhancements", [])
        if not isinstance(enhancements, list) or not all(
            isinstance(value, str) and value for value in enhancements
        ):
            errors.append(f"skills.{skill_id}.optionalEnhancements is invalid")

        if publication.get("codex") == "include":
            supported = [
                surface for surface in CODEX_SURFACES if support.get(surface) in {"full", "degraded"}
            ]
            if not supported:
                errors.append(f"skills.{skill_id} is included on Codex without a supported surface")
            guards = entry.get("surfaceGuards", {})
            if not isinstance(guards, dict) or set(guards) - set(CODEX_SURFACES):
                errors.append(f"skills.{skill_id}.surfaceGuards has invalid surfaces")
                guards = {}
            for surface in CODEX_SURFACES:
                if support.get(surface) == "unsupported":
                    evidence = guards.get(surface)
                    if not isinstance(evidence, str) or not referenced_path(repo, evidence).is_file():
                        errors.append(
                            f"skills.{skill_id} needs tested guard evidence for unsupported {surface}"
                        )
            for dependency in dependencies if isinstance(dependencies, list) else []:
                dependency_support = dict(default_support)
                dependency_entry = overrides.get(dependency, {})
                if isinstance(dependency_entry, dict):
                    dependency_override = dependency_entry.get("support", {})
                    if isinstance(dependency_override, dict):
                        dependency_support.update(dependency_override)
                if any(dependency_support.get(surface) == "unsupported" for surface in supported):
                    errors.append(f"skills.{skill_id} has unsupported Codex dependency {dependency}")

    guard_paths = registry.get("codexHostGuards", {})
    if not isinstance(guard_paths, dict):
        errors.append("codexHostGuards must be an object")
        guard_paths = {}
    if set(guard_paths) != REQUIRED_GUARDS:
        errors.append(f"codexHostGuards must declare exactly {sorted(REQUIRED_GUARDS)}")
    for skill_id, raw_path in guard_paths.items():
        path = referenced_path(repo, raw_path) if isinstance(raw_path, str) else repo / "missing"
        if skill_id not in discovered or not path.is_file():
            errors.append(f"codexHostGuards.{skill_id} references a missing skill file")
            continue
        first_lines = "\n".join(path.read_text().splitlines()[:120])
        if "## Codex host guard" not in first_lines or "CODEX_THREAD_ID" not in first_lines:
            errors.append(f"codexHostGuards.{skill_id} lacks an early fail-closed guard")

    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1

    counts = Counter(
        shape for shape, values in source_shapes.items() for _skill_id in values
    )
    included = sorted(
        skill_id
        for skill_id, entry in overrides.items()
        if entry.get("publication", {}).get("codex", default_publication.get("codex")) == "include"
    )
    print(
        "skills-compatibility: "
        f"{len(discovered)} skills "
        f"(shared={counts['shared']}, shared_with_seams={counts['shared_with_seams']}, "
        f"native_engines={counts['native_engines']}), Codex included={len(included)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
