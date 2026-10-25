"""Google Calendar free/busy through Auth0 Token Vault. Off until the Auth0 keys are set."""
from . import config


def ready() -> bool:
    return bool(config.AUTH0_DOMAIN and config.AUTH0_CLIENT_ID and config.AUTH0_CLIENT_SECRET)
