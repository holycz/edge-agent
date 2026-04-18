import os
from dotenv import load_dotenv, set_key, unset_key
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
if not ENV_PATH.exists():
    ENV_PATH.touch()

_env_config = {}


def _load_env_config():
    global _env_config
    load_dotenv(ENV_PATH, override=True)
    _env_config = {
        "API_KEY": os.getenv("API_KEY", ""),
        "API_URL": os.getenv("API_URL", "https://integrate.api.nvidia.com/v1"),
        "MODEL": os.getenv("MODEL", "qwen/qwen3-next-80b-a3b-instruct"),
        "PORT": int(os.getenv("PORT", "8765")),
        "MY_NAME": os.getenv("MY_NAME", ""),
        "OTHER_INFO": os.getenv("OTHER_INFO", ""),
    }


_load_env_config()

DEFAULT_USE_CONTEXT = True
DEFAULT_CONTEXT_LENGTH = 8000
DEFAULT_MAX_TOTAL_CHARS = 25000
DEFAULT_MAX_HISTORY_ROUNDS = 5

_runtime_config = {
    "use_context": DEFAULT_USE_CONTEXT,
    "context_length": DEFAULT_CONTEXT_LENGTH,
    "max_total_chars": DEFAULT_MAX_TOTAL_CHARS,
    "max_history_rounds": DEFAULT_MAX_HISTORY_ROUNDS,
    "my_name": _env_config["MY_NAME"],
    "other_info": _env_config["OTHER_INFO"],
}


def get_env(key: str, default=None):
    return _env_config.get(key, default)


def reload_config():
    _load_env_config()
    _runtime_config["my_name"] = _env_config["MY_NAME"]
    _runtime_config["other_info"] = _env_config["OTHER_INFO"]
    return get_env_config()


def get_env_config():
    return _env_config.copy()


def get_runtime_config():
    return _runtime_config.copy()


def update_runtime_config(updates: dict):
    for key, value in updates.items():
        if key in _runtime_config:
            _runtime_config[key] = value

    if "my_name" in updates:
        set_key(ENV_PATH, "MY_NAME", updates["my_name"] or "")
    if "other_info" in updates:
        set_key(ENV_PATH, "OTHER_INFO", updates["other_info"] or "")

    return get_runtime_config()
