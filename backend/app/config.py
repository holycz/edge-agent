"""
配置管理模块
处理环境变量和运行时配置的加载、验证和更新
"""

import os
from typing import Dict, Any, Optional
from dotenv import load_dotenv, set_key
from pathlib import Path

# 环境变量文件路径
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
if not ENV_PATH.exists():
    ENV_PATH.touch()

# 默认配置值
DEFAULT_CONFIG = {
    "API_KEY": "",
    "API_URL": "https://integrate.api.nvidia.com/v1",
    "MODEL": "qwen/qwen3-next-80b-a3b-instruct",
    "PORT": 8765,
    "MY_NAME": "",
    "OTHER_INFO": "",
}

# 运行时配置的默认值
DEFAULT_RUNTIME_CONFIG = {
    "use_context": True,
    "context_length": 8000,
    "max_total_chars": 25000,
    "max_history_rounds": 5,
}

# 内部状态
_env_config: Dict[str, Any] = {}
_runtime_config: Dict[str, Any] = {}


def _load_env_config() -> None:
    """从 .env 文件加载环境变量配置"""
    global _env_config
    load_dotenv(ENV_PATH, override=True)

    _env_config = {
        "API_KEY": os.getenv("API_KEY", DEFAULT_CONFIG["API_KEY"]),
        "API_URL": os.getenv("API_URL", DEFAULT_CONFIG["API_URL"]),
        "MODEL": os.getenv("MODEL", DEFAULT_CONFIG["MODEL"]),
        "PORT": int(os.getenv("PORT", str(DEFAULT_CONFIG["PORT"]))),
        "MY_NAME": os.getenv("MY_NAME", DEFAULT_CONFIG["MY_NAME"]),
        "OTHER_INFO": os.getenv("OTHER_INFO", DEFAULT_CONFIG["OTHER_INFO"]),
    }


def _init_runtime_config() -> None:
    """初始化运行时配置（从环境变量或默认值）"""
    global _runtime_config
    _runtime_config = {
        "use_context": DEFAULT_RUNTIME_CONFIG["use_context"],
        "context_length": DEFAULT_RUNTIME_CONFIG["context_length"],
        "max_total_chars": DEFAULT_RUNTIME_CONFIG["max_total_chars"],
        "max_history_rounds": DEFAULT_RUNTIME_CONFIG["max_history_rounds"],
        "my_name": _env_config.get("MY_NAME", ""),
        "other_info": _env_config.get("OTHER_INFO", ""),
    }


# 初始化
def init():
    """初始化配置系统"""
    _load_env_config()
    _init_runtime_config()


init()


def get_env(key: str, default: Optional[Any] = None) -> Any:
    """获取环境变量配置值"""
    return _env_config.get(key, default)


def get_env_config() -> Dict[str, Any]:
    """获取完整的环境变量配置（敏感信息）"""
    return _env_config.copy()


def get_runtime_config() -> Dict[str, Any]:
    """获取运行时配置（可动态修改）"""
    return _runtime_config.copy()


def update_runtime_config(updates: Dict[str, Any]) -> Dict[str, Any]:
    """
    更新运行时配置
    同时会同步更新 .env 文件中的个人身份信息
    """
    global _runtime_config

    for key, value in updates.items():
        if key in _runtime_config:
            _runtime_config[key] = value

    # 同步更新 .env 文件中的持久化配置
    if "my_name" in updates:
        set_key(ENV_PATH, "MY_NAME", str(updates["my_name"] or ""))
        _env_config["MY_NAME"] = updates["my_name"]

    if "other_info" in updates:
        set_key(ENV_PATH, "OTHER_INFO", str(updates["other_info"] or ""))
        _env_config["OTHER_INFO"] = updates["other_info"]

    return get_runtime_config()


def reload_config() -> Dict[str, Any]:
    """热重载环境变量配置，重新从 .env 文件加载"""
    _load_env_config()

    # 更新运行时配置中的环境变量相关项
    global _runtime_config
    _runtime_config["my_name"] = _env_config.get("MY_NAME", "")
    _runtime_config["other_info"] = _env_config.get("OTHER_INFO", "")

    return get_env_config()


def validate_config() -> Dict[str, Any]:
    """验证配置有效性，返回问题列表"""
    issues = []

    # 检查 API Key
    api_key = _env_config.get("API_KEY", "")
    if not api_key:
        issues.append(
            {"field": "API_KEY", "message": "API Key 未配置", "level": "error"}
        )
    elif api_key == "your_api_key_here":
        issues.append(
            {
                "field": "API_KEY",
                "message": "API Key 使用了默认值，请修改",
                "level": "warning",
            }
        )

    # 检查 API URL
    api_url = _env_config.get("API_URL", "")
    if not api_url:
        issues.append(
            {"field": "API_URL", "message": "API URL 未配置", "level": "error"}
        )
    elif not api_url.startswith(("http://", "https://")):
        issues.append(
            {
                "field": "API_URL",
                "message": "API URL 格式不正确，应以 http:// 或 https:// 开头",
                "level": "error",
            }
        )

    # 检查模型
    if not _env_config.get("MODEL"):
        issues.append({"field": "MODEL", "message": "模型未配置", "level": "warning"})

    # 检查运行时配置
    if _runtime_config.get("context_length", 0) < 1000:
        issues.append(
            {
                "field": "context_length",
                "message": "上下文长度设置过小（< 1000），可能影响效果",
                "level": "warning",
            }
        )

    if _runtime_config.get("max_total_chars", 0) > 50000:
        issues.append(
            {
                "field": "max_total_chars",
                "message": "单次请求最大字符数过大（> 50000），可能导致请求失败",
                "level": "warning",
            }
        )

    return {
        "valid": len([i for i in issues if i["level"] == "error"]) == 0,
        "issues": issues,
    }


# 为向后兼容导出默认值
DEFAULT_USE_CONTEXT = DEFAULT_RUNTIME_CONFIG["use_context"]
DEFAULT_CONTEXT_LENGTH = DEFAULT_RUNTIME_CONFIG["context_length"]
DEFAULT_MAX_TOTAL_CHARS = DEFAULT_RUNTIME_CONFIG["max_total_chars"]
DEFAULT_MAX_HISTORY_ROUNDS = DEFAULT_RUNTIME_CONFIG["max_history_rounds"]
