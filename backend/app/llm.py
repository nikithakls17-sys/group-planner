"""The ONE place the app talks to a language model. Swap providers with LLM_PROVIDER."""
import json
import re
import time

from openai import OpenAI

from . import config
from .observability import gen_ai_span

_client: OpenAI | None = None


def _provider() -> tuple[str, str, str]:
    if config.LLM_PROVIDER == "digitalocean":
        if not config.DO_MODEL_ACCESS_KEY:
            raise RuntimeError("DO_MODEL_ACCESS_KEY is not set")
        return config.DO_INFERENCE_BASE_URL, config.DO_MODEL_ACCESS_KEY, config.DO_MODEL
    return config.OLLAMA_BASE_URL, "ollama", config.OLLAMA_MODEL


def model_name() -> str:
    return _provider()[2]


def client() -> OpenAI:
    global _client
    if _client is None:
        base_url, key, _ = _provider()
        _client = OpenAI(base_url=base_url, api_key=key, timeout=120)
    return _client


def chat(messages: list[dict], *, temperature: float = 0.3, max_tokens: int = 1200,
         json_mode: bool = False, operation: str = "chat") -> dict:
    """Returns {"text", "input_tokens", "output_tokens", "latency_ms"}."""
    model = model_name()
    kwargs = {}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    if config.LLM_PROVIDER == "ollama":
        # Gemma 4 thinks by default and spends the whole token budget on it; switch it off.
        kwargs["extra_body"] = {"reasoning_effort": "none"}
    with gen_ai_span(operation, model, config.LLM_PROVIDER, **{"gen_ai.request.temperature": temperature}) as span:
        t0 = time.perf_counter()
        resp = client().chat.completions.create(
            model=model, messages=messages, temperature=temperature, max_tokens=max_tokens, **kwargs
        )
        latency = int((time.perf_counter() - t0) * 1000)
        text = resp.choices[0].message.content or ""
        finish = resp.choices[0].finish_reason
        usage = resp.usage
        in_tok = getattr(usage, "prompt_tokens", 0) or 0
        out_tok = getattr(usage, "completion_tokens", 0) or 0
        span.set_data("gen_ai.usage.input_tokens", in_tok)
        span.set_data("gen_ai.usage.output_tokens", out_tok)
        span.set_data("gen_ai.response.model", resp.model)
        span.set_data("latency_ms", latency)
    return {"text": text, "input_tokens": in_tok, "output_tokens": out_tok, "latency_ms": latency, "finish_reason": finish}


def parse_json(text: str) -> dict:
    """Models sometimes wrap JSON in fences or add chatter; pull out the first object."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in model output")
    body = text[start : end + 1]
    # Gemma 4 occasionally emits a raw control character inside a string, which strict JSON rejects
    body = "".join(ch for ch in body if ch >= " " or ch in "\n\t")
    return json.loads(body, strict=False)


def chat_json(messages: list[dict], **kw) -> tuple[dict, dict]:
    out = chat(messages, json_mode=True, **kw)
    if out.get("finish_reason") == "length":
        # Ollama's default context is 4096 tokens: a long prompt leaves little room and the JSON gets cut off
        raise ValueError(f"output truncated at {out['output_tokens']} tokens (prompt {out['input_tokens']})")
    data = parse_json(out["text"])
    if data == {}:
        # DigitalOcean's JSON mode answers some long prompts with a bare {} (5 of 6 runs for the Day 5 chapter);
        # the same prompt without response_format gives fenced JSON that parse_json handles. Retry once that way.
        out = chat(messages, json_mode=False, **kw)
        if out.get("finish_reason") == "length":
            raise ValueError(f"output truncated at {out['output_tokens']} tokens (prompt {out['input_tokens']})")
        data = parse_json(out["text"])
    return data, out
