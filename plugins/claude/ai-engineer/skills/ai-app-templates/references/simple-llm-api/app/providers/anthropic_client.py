"""Anthropic (Claude) provider.

Self-contained: env read, lazy client init, DEFAULT_MODEL, and complete().
No shared base class — keep three provider files independent so the unused
two can be deleted at scaffold time without dragging in shared imports.

Lazy init note: the API key is read inside the cached _client() helper, not
at module import. This lets the template be imported during scaffolding
before keys are placed in .env.
"""

import os
from functools import lru_cache

from anthropic import Anthropic

# Locked 2026-05-11. Re-check anthropic.com/models if more than 6 months old.
DEFAULT_MODEL = "claude-sonnet-4-6"


@lru_cache(maxsize=1)
def _client() -> Anthropic:
    """Return a process-wide Anthropic client. Reads env on first call."""
    return Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


def complete(messages: list[dict], model: str | None = None) -> str:
    """Send a canonical messages array to Claude and return the text reply.

    `messages` follows the {"role": "user"|"assistant"|"system", "content": str}
    convention. Anthropic's native API expects `system` as a top-level kwarg,
    not an inline message — we extract it here so callers don't have to care.
    """
    system: str | None = None
    chat: list[dict] = []
    for m in messages:
        if m["role"] == "system":
            system = m["content"]
        else:
            chat.append({"role": m["role"], "content": m["content"]})

    kwargs: dict = {
        "model": model or DEFAULT_MODEL,
        "max_tokens": 4096,
        "messages": chat,
    }
    if system is not None:
        kwargs["system"] = system

    response = _client().messages.create(**kwargs)
    return response.content[0].text
