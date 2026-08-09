#!/usr/bin/env python3
"""Parse Codex agent TOML and detect existing identity collisions safely."""

from __future__ import annotations

import os
import stat
import sys
from pathlib import Path
from typing import Any

from tomli_loader import tomli


# These are fields on Codex 0.147's ``AgentsToml`` rather than custom role
# names. Every other table-valued key under ``[agents]`` is a declared role.
AGENT_SETTINGS = {
    "enabled",
    "max_concurrent_threads_per_session",
    "max_threads",
    "max_depth",
    "default_subagent_model",
    "default_subagent_reasoning_effort",
    "job_max_runtime_seconds",
    "interrupt_message",
}
ROLE_FIELDS = {"description", "config_file", "nickname_candidates"}


class UnsafeAgentPathError(Exception):
    """Raised when collision discovery would have to follow an unsafe path."""


def parse_toml(contents: str, label: Path) -> dict[str, Any]:
    try:
        data = tomli.loads(contents)
    except (UnicodeError, tomli.TOMLDecodeError) as error:
        raise ValueError(f"invalid agent TOML {label}: {error}") from error
    if not isinstance(data, dict):
        raise ValueError(f"invalid agent TOML {label}: root must be a table")
    return data


def canonical_file_name(data: dict[str, Any], label: Path) -> str:
    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ValueError(
            f"invalid agent TOML {label}: name must be a non-empty string"
        )
    return name.strip()


def safe_label(path: Path) -> str:
    """Keep diagnostics one-line even for adversarial filenames."""

    return "".join(
        character if character.isprintable() else repr(character)[1:-1]
        for character in str(path)
    )


def directory_flags() -> int:
    return os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_DIRECTORY", 0)


def file_flags() -> int:
    return os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)


def open_child_directory(parent_fd: int, name: str, label: Path) -> int:
    try:
        descriptor = os.open(
            name,
            directory_flags() | getattr(os, "O_NOFOLLOW", 0),
            dir_fd=parent_fd,
        )
    except OSError as error:
        raise UnsafeAgentPathError(
            f"existing agent directory is unsafe: {safe_label(label)}: {error}"
        ) from error
    if not stat.S_ISDIR(os.fstat(descriptor).st_mode):
        os.close(descriptor)
        raise UnsafeAgentPathError(
            f"existing agent path is not a directory: {safe_label(label)}"
        )
    return descriptor


def read_regular_at(parent_fd: int, name: str, label: Path) -> str:
    try:
        descriptor = os.open(name, file_flags(), dir_fd=parent_fd)
    except OSError as error:
        raise UnsafeAgentPathError(
            f"existing agent file is unsafe: {safe_label(label)}: {error}"
        ) from error
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise UnsafeAgentPathError(
                f"existing agent candidate is not a regular file: {safe_label(label)}"
            )
        with os.fdopen(descriptor, "r", encoding="utf-8") as stream:
            descriptor = -1
            return stream.read()
    except UnicodeError as error:
        raise ValueError(f"invalid UTF-8 in {safe_label(label)}: {error}") from error
    finally:
        if descriptor >= 0:
            os.close(descriptor)


def open_path_without_symlinks(base_fd: int, raw_path: str, label: Path) -> str:
    """Read a role config without following relative-path symlinks.

    Relative paths start at the directory containing ``config.toml``. Absolute
    paths start at the filesystem root. ``..`` is allowed, matching Codex's
    path resolution, but every traversed component must be a real directory.
    """

    path = Path(raw_path)
    components = path.parts
    descriptor = -1
    owns_descriptor = False
    try:
        if path.is_absolute():
            descriptor = os.open(path.anchor, directory_flags())
            owns_descriptor = True
            components = components[1:]
        else:
            descriptor = os.dup(base_fd)
            owns_descriptor = True

        if not components:
            raise UnsafeAgentPathError(
                f"agent config_file is not a regular file: {safe_label(label)}"
            )
        for component in components[:-1]:
            next_descriptor = open_child_directory(descriptor, component, label)
            os.close(descriptor)
            descriptor = next_descriptor
        return read_regular_at(descriptor, components[-1], label)
    finally:
        if owns_descriptor and descriptor >= 0:
            os.close(descriptor)


def base_config_roles(
    codex_root_fd: int, config_path: Path
) -> tuple[dict[str, str], set[Path]]:
    """Return canonical declared roles and their lexically resolved files."""

    try:
        metadata = os.stat("config.toml", dir_fd=codex_root_fd, follow_symlinks=False)
    except FileNotFoundError:
        return {}, set()
    except OSError as error:
        raise UnsafeAgentPathError(
            f"cannot inspect Codex base config {safe_label(config_path)}: {error}"
        ) from error

    if stat.S_ISLNK(metadata.st_mode):
        raise UnsafeAgentPathError(
            f"Codex base config is a symlink: {safe_label(config_path)}"
        )
    if not stat.S_ISREG(metadata.st_mode):
        raise UnsafeAgentPathError(
            f"Codex base config is not a regular file: {safe_label(config_path)}"
        )

    contents = read_regular_at(codex_root_fd, "config.toml", config_path)
    data = parse_toml(contents, config_path)
    agents = data.get("agents")
    if agents is None:
        return {}, set()
    if not isinstance(agents, dict):
        raise ValueError(f"invalid Codex base config {config_path}: agents must be a table")

    roles: dict[str, str] = {}
    declared_files: set[Path] = set()
    for declared_name, role in agents.items():
        if declared_name in AGENT_SETTINGS:
            continue
        if not isinstance(role, dict):
            raise ValueError(
                f"invalid Codex base config {config_path}: agents.{declared_name} must be a table"
            )
        unknown_fields = set(role) - ROLE_FIELDS
        if unknown_fields:
            fields = ", ".join(sorted(unknown_fields))
            raise ValueError(
                f"invalid Codex base config {config_path}: agents.{declared_name} has unknown fields: {fields}"
            )

        canonical_name = declared_name
        raw_config_file = role.get("config_file")
        if raw_config_file is not None:
            if not isinstance(raw_config_file, str) or not raw_config_file:
                raise ValueError(
                    f"invalid Codex base config {config_path}: agents.{declared_name}.config_file must be a non-empty string"
                )
            lexical_path = (
                Path(raw_config_file)
                if Path(raw_config_file).is_absolute()
                else config_path.parent / raw_config_file
            )
            lexical_path = Path(os.path.abspath(lexical_path))
            role_contents = open_path_without_symlinks(
                codex_root_fd, raw_config_file, lexical_path
            )
            role_data = parse_toml(role_contents, lexical_path)
            configured_name = role_data.get("name")
            if configured_name is not None and not isinstance(configured_name, str):
                raise ValueError(
                    f"invalid agent TOML {lexical_path}: name must be a string"
                )
            if isinstance(configured_name, str) and configured_name.strip():
                canonical_name = configured_name.strip()
            declared_files.add(lexical_path)

        if canonical_name in roles:
            raise ValueError(
                f"duplicate canonical agent identity {canonical_name!r} in {config_path}"
            )
        roles[canonical_name] = declared_name

    return roles, declared_files


def find_file_conflict(
    agents_fd: int,
    agents_dir: Path,
    excluded_destination: Path,
    declared_files: set[Path],
    target_name: str,
) -> str | None:
    """Recursively scan agent files without following any symlink."""

    excluded = Path(os.path.abspath(excluded_destination))

    def visit(directory_fd: int, relative_dir: Path) -> str | None:
        try:
            with os.scandir(directory_fd) as iterator:
                entries = sorted(iterator, key=lambda entry: entry.name)
        except OSError as error:
            raise UnsafeAgentPathError(
                f"cannot scan existing agent directory {safe_label(agents_dir / relative_dir)}: {error}"
            ) from error

        first_conflict = None
        for entry in entries:
            relative_path = relative_dir / entry.name
            absolute_path = Path(os.path.abspath(agents_dir / relative_path))
            if absolute_path == excluded:
                continue
            try:
                metadata = entry.stat(follow_symlinks=False)
            except OSError as error:
                raise UnsafeAgentPathError(
                    f"cannot inspect existing agent path {safe_label(absolute_path)}: {error}"
                ) from error

            if stat.S_ISLNK(metadata.st_mode):
                raise UnsafeAgentPathError(
                    f"existing agent candidate is a symlink: {safe_label(absolute_path)}"
                )
            if stat.S_ISDIR(metadata.st_mode):
                if absolute_path.suffix == ".toml":
                    raise UnsafeAgentPathError(
                        f"existing agent candidate is not a regular file: {safe_label(absolute_path)}"
                    )
                child_fd = open_child_directory(directory_fd, entry.name, absolute_path)
                try:
                    conflict = visit(child_fd, relative_path)
                finally:
                    os.close(child_fd)
                if first_conflict is None and conflict is not None:
                    first_conflict = conflict
                continue
            if not stat.S_ISREG(metadata.st_mode):
                raise UnsafeAgentPathError(
                    f"existing agent path is not regular: {safe_label(absolute_path)}"
                )
            if absolute_path.suffix != ".toml" or absolute_path in declared_files:
                continue

            contents = read_regular_at(directory_fd, entry.name, absolute_path)
            candidate_name = canonical_file_name(
                parse_toml(contents, absolute_path), absolute_path
            )
            if first_conflict is None and candidate_name == target_name:
                first_conflict = safe_label(relative_path)
        return first_conflict

    return visit(agents_fd, Path())


def find_existing_conflict(
    target_name: str,
    agents_dir: Path,
    destination: Path,
    config_path: Path,
) -> str | None:
    codex_root = config_path.parent
    try:
        codex_root_fd = os.open(codex_root, directory_flags())
    except OSError as error:
        raise UnsafeAgentPathError(
            f"cannot open CODEX_HOME {safe_label(codex_root)}: {error}"
        ) from error
    try:
        roles, declared_files = base_config_roles(codex_root_fd, config_path)
        config_conflict = None
        if target_name in roles:
            config_conflict = (
                f"config.toml [agents.{safe_label(Path(roles[target_name]))}]"
            )

        try:
            agents_fd = os.open(
                agents_dir,
                directory_flags() | getattr(os, "O_NOFOLLOW", 0),
            )
        except FileNotFoundError:
            return config_conflict
        except OSError as error:
            raise UnsafeAgentPathError(
                f"cannot safely open agents directory {safe_label(agents_dir)}: {error}"
            ) from error
        try:
            file_conflict = find_file_conflict(
                agents_fd,
                agents_dir,
                destination,
                declared_files,
                target_name,
            )
            return config_conflict or file_conflict
        finally:
            os.close(agents_fd)
    finally:
        os.close(codex_root_fd)


def main() -> int:
    if len(sys.argv) == 6 and sys.argv[1] == "conflict":
        _, _, target_name, raw_agents_dir, raw_destination, raw_config = sys.argv
        try:
            conflict = find_existing_conflict(
                target_name,
                Path(raw_agents_dir),
                Path(raw_destination),
                Path(raw_config),
            )
        except (OSError, UnicodeError, ValueError, UnsafeAgentPathError) as error:
            print(error, file=sys.stderr)
            return 1
        if conflict is not None:
            print(f"{conflict} already declares name={target_name}")
        return 0

    if len(sys.argv) != 3 or sys.argv[1] not in {"source", "identity"}:
        print(
            "usage: read-codex-agent-name.py source|identity PATH\n"
            "       read-codex-agent-name.py conflict NAME AGENTS_DIR DESTINATION CONFIG",
            file=sys.stderr,
        )
        return 2

    mode, raw_path = sys.argv[1:]
    path = Path(raw_path)
    try:
        data = parse_toml(path.read_text(encoding="utf-8"), path)
    except (OSError, UnicodeError, ValueError, tomli.TOMLDecodeError) as error:
        print(f"invalid agent TOML {path}: {error}", file=sys.stderr)
        return 1

    try:
        name = canonical_file_name(data, path)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1

    if mode == "source":
        for field in ("description", "developer_instructions"):
            value = data.get(field)
            if not isinstance(value, str) or not value.strip():
                print(
                    f"invalid agent TOML {path}: {field} must be a non-empty string",
                    file=sys.stderr,
                )
                return 1

    print(name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
