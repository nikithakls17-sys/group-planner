"""Sentry setup plus a gen_ai span helper so every Gemma call shows up as an agent trace."""
from contextlib import contextmanager

import sentry_sdk

from . import config


def init_sentry() -> None:
    if not config.SENTRY_DSN:
        return
    sentry_sdk.init(
        dsn=config.SENTRY_DSN,
        environment=config.SENTRY_ENVIRONMENT,
        traces_sample_rate=1.0,
        send_default_pii=False,
    )
    sentry_sdk.set_tag("mode", config.MODE)
    sentry_sdk.set_tag("prompt_version", config.PROMPT_VERSION)


@contextmanager
def gen_ai_span(operation: str, model: str, system: str, **attrs):
    with sentry_sdk.start_span(op=f"gen_ai.{operation}", name=f"{operation} {model}") as span:
        span.set_data("gen_ai.operation.name", operation)
        span.set_data("gen_ai.system", system)
        span.set_data("gen_ai.request.model", model)
        for k, v in attrs.items():
            span.set_data(k, v)
        yield span


def report_issue(message: str, level: str = "warning", **tags) -> None:
    """Validator failures become Sentry issues, tagged so they group by prompt version and rubric item."""
    with sentry_sdk.new_scope() as scope:
        for k, v in tags.items():
            scope.set_tag(k, str(v))
        scope.set_tag("prompt_version", config.PROMPT_VERSION)
        sentry_sdk.capture_message(message, level=level)
