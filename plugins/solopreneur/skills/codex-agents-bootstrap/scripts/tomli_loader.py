"""Load the pinned Tomli parser bundled with this skill.

The private module name and direct file loading make parser behavior independent
of both the Python stdlib version and any site-packages installed by the user.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType


EXPECTED_VERSION = "2.4.1"
VENDOR_ROOT = Path(__file__).resolve().parent.parent / "vendor" / "tomli"
PACKAGE_ROOT = VENDOR_ROOT / "tomli"
PACKAGE_INIT = PACKAGE_ROOT / "__init__.py"
PRIVATE_MODULE_NAME = "_solopreneur_vendored_tomli"
REQUIRED_SOURCES = (
    PACKAGE_INIT,
    PACKAGE_ROOT / "_parser.py",
    PACKAGE_ROOT / "_re.py",
    PACKAGE_ROOT / "_types.py",
)


def _load_vendored_tomli() -> ModuleType:
    if VENDOR_ROOT.is_symlink() or PACKAGE_ROOT.is_symlink():
        raise ImportError(f"vendored Tomli path must not be a symlink: {VENDOR_ROOT}")
    for source in REQUIRED_SOURCES:
        if source.is_symlink() or not source.is_file():
            raise ImportError(f"vendored Tomli source is missing or unsafe: {source}")

    existing = sys.modules.get(PRIVATE_MODULE_NAME)
    if existing is None:
        specification = importlib.util.spec_from_file_location(
            PRIVATE_MODULE_NAME,
            PACKAGE_INIT,
            submodule_search_locations=[str(PACKAGE_ROOT)],
        )
        if specification is None or specification.loader is None:
            raise ImportError(f"cannot load vendored Tomli from {PACKAGE_INIT}")
        existing = importlib.util.module_from_spec(specification)
        sys.modules[PRIVATE_MODULE_NAME] = existing
        try:
            specification.loader.exec_module(existing)
        except BaseException:
            sys.modules.pop(PRIVATE_MODULE_NAME, None)
            raise

    if getattr(existing, "__version__", None) != EXPECTED_VERSION:
        raise ImportError(
            "vendored Tomli version mismatch: "
            f"expected {EXPECTED_VERSION}, got {getattr(existing, '__version__', None)!r}"
        )
    if Path(existing.__file__).resolve() != PACKAGE_INIT.resolve():
        raise ImportError(f"vendored Tomli resolved outside the pinned source: {existing.__file__}")
    return existing


tomli = _load_vendored_tomli()

__all__ = ("tomli",)
