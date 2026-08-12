"""Google Gemini provider via the google-genai SDK.

Self-contained: env read, lazy client init, DEFAULT_MODEL, and complete().

Gemini differs from OpenAI/Anthropic shapes:
- role values are "user" / "model" (no "assistant", no inline "system")
- system prompts go to a separate `system_instruction` field in config
- message content uses `parts: [{"text": ...}]` instead of plain strings

The `_to_gemini` adapter below maps the canonical OpenAI-style messages
array into Gemini's shape so callers stay provider-agnostic.

Lazy init note: API key is read inside the cached _client() helper, not at
module import.
"""

import os
from functools import lru_cache

from google import genai
from google.genai import types

# Locked 2026-05-11. Re-check ai.google.dev/gemini-api/docs/models if stale.
DEFAULT_MODEL = "gemini-2.5-flash"


@lru_cache(maxsize=1)
def _client() -> genai.Client:
    """Return a process-wide Gemini client. Reads env on first call."""
    return genai.Client(api_key=os.environ["GEMINI_API_KEY"])


def _to_gemini(messages: list[dict]) -> tuple[str | None, list[dict]]:
    """Map OpenAI-style messages to Gemini's role + system_instruction shape.

    Returns (system_instruction, contents) where:
    - system_instruction is the system prompt as a plain string (or None)
    - contents is a list of {"role": "user"|"model", "parts": [{"text": str}]}
    """
    system: str | None = None
    contents: list[dict] = []
    for m in messages:
        role = m["role"]
        text = m["content"]
        if role == "system":
            system = text
        elif role == "assistant":
            contents.append({"role": "model", "parts": [{"text": text}]})
        else:
            contents.append({"role": "user", "parts": [{"text": text}]})
    return system, contents


def complete(messages: list[dict], model: str | None = None) -> str:
    """Send a canonical messages array to Gemini and return the text reply."""
    system, contents = _to_gemini(messages)
    config = (
        types.GenerateContentConfig(system_instruction=system)
        if system is not None
        else None
    )
    response = _client().models.generate_content(
        model=model or DEFAULT_MODEL,
        contents=contents,
        config=config,
    )
    return response.text
