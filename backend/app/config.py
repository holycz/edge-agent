"""
配置管理模块
处理环境变量和运行时配置的加载、验证和更新
"""

import os
from typing import Dict, Any, Optional
from dotenv import load_dotenv
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
}

# 内部状态
_env_config: Dict[str, Any] = {}


def _load_env_config() -> None:
    """从 .env 文件加载环境变量配置"""
    global _env_config
    load_dotenv(ENV_PATH, override=True)

    _env_config = {
        "API_KEY": os.getenv("API_KEY", DEFAULT_CONFIG["API_KEY"]),
        "API_URL": os.getenv("API_URL", DEFAULT_CONFIG["API_URL"]),
        "MODEL": os.getenv("MODEL", DEFAULT_CONFIG["MODEL"]),
        "PORT": int(os.getenv("PORT", str(DEFAULT_CONFIG["PORT"]))),
    }


# 初始化
def init():
    """初始化配置系统"""
    _load_env_config()


init()


def get_env(key: str, default: Optional[Any] = None) -> Any:
    """获取环境变量配置值"""
    return _env_config.get(key, default)


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

    return {
        "valid": len([i for i in issues if i["level"] == "error"]) == 0,
        "issues": issues,
    }
