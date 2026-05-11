"""Simple LLM API — minimal FastAPI service with one pluggable provider.

The provider is selected at scaffold time by editing the import line below.
After the consuming agent picks a provider, the two unused
providers/*_client.py files should be deleted.
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# --- Provider selection point -------------------------------------------------
# Change to anthropic_client or gemini_client to switch providers.
# OpenRouter is the default because a single key covers many upstreams
# (Anthropic / Google / Meta / OSS), giving the lowest setup friction.
from app.providers import openrouter_client as llm
# -----------------------------------------------------------------------------

app = FastAPI(title="Simple LLM API")


class ChatRequest(BaseModel):
    prompt: str
    model: str | None = None


class ChatResponse(BaseModel):
    text: str
    model: str


@app.get("/health")
def health() -> dict[str, bool]:
    """Liveness probe. Does not call the upstream LLM."""
    return {"ok": True}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    """Send a single prompt to the configured LLM and return its reply."""
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt must not be empty")
    model = req.model or llm.DEFAULT_MODEL
    # Wrap the single prompt into the canonical messages array. Future
    # extensions (system prompt, multi-turn history) only touch this line —
    # provider clients stay in canonical messages-array form.
    messages = [{"role": "user", "content": req.prompt}]
    try:
        text = llm.complete(messages, model=model)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"upstream LLM error: {e}")
    return ChatResponse(text=text, model=model)
