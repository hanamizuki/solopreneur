"""OpenRouter provider via the OpenAI SDK.

OpenRouter is OpenAI-compatible: same SDK, different base_url. A single
OPENROUTER_API_KEY routes to many upstream model families (Anthropic,
Google, Meta, open-source). This makes OpenRouter the lowest-friction
default for new projects.

Self-contained: env read, lazy client init, DEFAULT_MODEL, and complete().

Lazy init note: API key is read inside the cached _client() helper, not at
module import.
"""

import os
from functools import lru_cache

from openai import OpenAI

# Locked 2026-05-11. Re-check openrouter.ai/models if stale.
# Format: <provider-slug>/<model-id> — see openrouter.ai for the full list.
DEFAULT_MODEL = "anthropic/claude-sonnet-4.6"


@lru_cache(maxsize=1)
def _client() -> OpenAI:
    """Return a process-wide OpenAI-compat client pointing at OpenRouter."""
    return OpenAI(
        api_key=os.environ["OPENROUTER_API_KEY"],
        base_url="https://openrouter.ai/api/v1",
    )


def complete(messages: list[dict], model: str | None = None) -> str:
    """Send a canonical messages array to OpenRouter and return the reply.

    Raises RuntimeError if the response has no text content (e.g. the model
    returned only a tool call, hit the token cap before generating any text,
    or refused to respond). main.py maps this to HTTP 502.
    """
    response = _client().chat.completions.create(
        model=model or DEFAULT_MODEL,
        messages=messages,
    )
    content = response.choices[0].message.content
    if content is None:
        raise RuntimeError(
            "OpenRouter returned no text content "
            "(possible tool-only completion or empty response)"
        )
    return content
