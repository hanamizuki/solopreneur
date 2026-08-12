#!/usr/bin/env python3
"""Validate hand-maintained Codex custom-agent TOML sources.

Plugin installation does not register or parse `agents/*.toml`, so a successful
`codex plugin add` is not evidence that these files can be loaded. This gate
validates the sources before the manifest generator copies them into the
project-scoped `.codex/agents/` directory.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


TOMLI_LOADER_DIR = (
    Path(__file__).resolve().parent.parent
    / "skills"
    / "solopreneur"
    / "codex-agents-bootstrap"
    / "scripts"
)
sys.path.insert(0, str(TOMLI_LOADER_DIR))
from tomli_loader import tomli  # noqa: E402  # fixed parser shared with runtime

REQUIRED_FIELDS = ("name", "description", "developer_instructions")
FORBIDDEN_VOCABULARY = (
    re.compile(r"Claude Code", re.IGNORECASE),
    re.compile(r"\bSkill tool\b", re.IGNORECASE),
    re.compile(r"\bAgent tool\b", re.IGNORECASE),
    re.compile(r"CLAUDE_CONFIG_DIR"),
    re.compile(r"(?:~|\$HOME)/\.claude"),
    re.compile(r"\bAskUserQuestion\b"),
    re.compile(r"\bTodoWrite\b"),
)


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def published_plugins(repo_root: Path) -> list[str]:
    marketplace_path = repo_root / ".claude-plugin" / "marketplace.json"
    try:
        marketplace = json.loads(marketplace_path.read_text(encoding="utf-8"))
        names = [entry["name"] for entry in marketplace["plugins"]]
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as error:
        raise ValueError(f"cannot read published plugin names from {marketplace_path}: {error}") from error
    if not all(isinstance(name, str) and name for name in names):
        raise ValueError(f"{marketplace_path} contains an invalid plugin name")
    return names


def validate_agent(path: Path, plugin: str, errors: list[str]) -> tuple[str, str] | None:
    relative = path.as_posix()
    if path.is_symlink():
        fail(errors, f"{relative}: agent source must not be a symlink")
        return None

    try:
        raw = path.read_text(encoding="utf-8")
        data = tomli.loads(raw)
    except (OSError, UnicodeError, tomli.TOMLDecodeError) as error:
        fail(errors, f"{relative}: invalid TOML: {error}")
        return None

    for field in REQUIRED_FIELDS:
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            fail(errors, f"{relative}: {field} must be a non-empty string")

    name = data.get("name")
    if not isinstance(name, str) or not name:
        return None

    if path.stem != name:
        fail(errors, f"{relative}: filename stem must equal TOML name ({name!r})")

    # Each published plugin owns exactly one canonical custom-agent identity.
    # Keeping the pair derived from marketplace data avoids a second hard-coded
    # allowlist drifting from the actual published plugin set.
    if name != plugin:
        fail(
            errors,
            f"{relative}: agent identity {name!r} must equal "
            f"published plugin name {plugin!r}",
        )

    expected_marker = f"# solopreneur-managed-agent v2 plugin={plugin} agent={name}"
    first_line = raw.splitlines()[0] if raw.splitlines() else ""
    if first_line != expected_marker:
        fail(errors, f"{relative}: first line must be exactly {expected_marker!r}")

    sibling = path.with_suffix(".md")
    if not sibling.is_file() or sibling.is_symlink():
        fail(errors, f"{relative}: missing regular Claude agent sibling {sibling.name}")

    for pattern in FORBIDDEN_VOCABULARY:
        if pattern.search(raw):
            fail(errors, f"{relative}: contains platform-specific vocabulary matching {pattern.pattern!r}")

    return name, path.name


def main() -> int:
    repo_root = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent).resolve()
    errors: list[str] = []
    identities: dict[str, Path] = {}
    basenames: dict[str, Path] = {}
    count = 0

    try:
        plugin_names = published_plugins(repo_root)
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    for plugin in plugin_names:
        agents_dir = repo_root / "src" / plugin / "agents"
        # Path.is_dir() follows directory symlinks. Reject the intermediate
        # component first so an otherwise valid marketplace entry cannot make
        # validation traverse agent sources outside the repository tree.
        if agents_dir.is_symlink():
            fail(errors, f"{agents_dir}: agents directory must not be a symlink")
            continue
        if agents_dir.exists() and not agents_dir.is_dir():
            fail(errors, f"{agents_dir}: agents path must be a directory")
            continue
        if not agents_dir.is_dir():
            continue
        for path in sorted(agents_dir.glob("*.toml")):
            count += 1
            validated = validate_agent(path, plugin, errors)
            if validated is None:
                continue
            name, basename = validated
            if name in identities:
                fail(errors, f"{path}: duplicate agent identity {name!r}; first seen at {identities[name]}")
            else:
                identities[name] = path
            if basename in basenames:
                fail(errors, f"{path}: duplicate agent filename {basename!r}; first seen at {basenames[basename]}")
            else:
                basenames[basename] = path

    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1

    print(f"validate-codex-agents: {count} agent source(s) passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
