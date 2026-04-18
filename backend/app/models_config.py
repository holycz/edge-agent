"""
模型配置管理
支持不同 AI 模型的特定参数配置
"""

from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class ModelConfig:
    """模型配置"""

    name: str
    supports_thinking: bool
    thinking_param: Optional[str] = None  # 思考参数名，如 "enable_thinking"
    reasoning_field: str = "reasoning_content"  # 推理内容字段名
    requires_auth_header: bool = True
    auth_prefix: str = "Bearer "
    timeout: int = 120
    max_tokens: int = 2048
    temperature: float = 0.7
    extra_params: Dict[str, Any] = None

    def __post_init__(self):
        if self.extra_params is None:
            self.extra_params = {}


# 预定义的模型配置
MODEL_CONFIGS: Dict[str, ModelConfig] = {
    # 九天平台 - kimi-k2-5-thinking (原生支持推理)
    "kimi-k2-5-thinking": ModelConfig(
        name="kimi-k2-5-thinking",
        supports_thinking=True,
        thinking_param=None,  # 原生思考模型，不需要参数控制
        reasoning_field="reasoning_content",
        timeout=120,
    ),
    # 九天平台 - 其他模型
    "kimi-k2-5": ModelConfig(
        name="kimi-k2-5",
        supports_thinking=False,
        reasoning_field="reasoning_content",
        timeout=120,
    ),
    # Qwen3 模型（通过 enable_thinking 参数控制）
    "qwen/qwen3-235b-a22b-instruct": ModelConfig(
        name="qwen/qwen3-235b-a22b-instruct",
        supports_thinking=True,
        thinking_param="enable_thinking",
        reasoning_field="reasoning_content",
        timeout=120,
    ),
    "qwen/qwen3-next-80b-a3b-instruct": ModelConfig(
        name="qwen/qwen3-next-80b-a3b-instruct",
        supports_thinking=True,
        thinking_param="enable_thinking",
        reasoning_field="reasoning_content",
        timeout=120,
    ),
    # 默认配置
    "default": ModelConfig(
        name="default",
        supports_thinking=False,
        reasoning_field="reasoning_content",
        timeout=120,
    ),
}


def get_model_config(model_name: str) -> ModelConfig:
    """获取模型配置"""
    # 精确匹配
    if model_name in MODEL_CONFIGS:
        return MODEL_CONFIGS[model_name]

    # 前缀匹配
    for key in MODEL_CONFIGS:
        if key != "default" and model_name.startswith(
            key.replace("/", "").split("-")[0]
        ):
            return MODEL_CONFIGS[key]

    # 返回默认配置
    return MODEL_CONFIGS["default"].copy()


def should_use_thinking_param(model_name: str) -> bool:
    """判断模型是否需要 enable_thinking 参数"""
    config = get_model_config(model_name)
    return config.supports_thinking and config.thinking_param is not None


def get_model_extra_params(
    model_name: str, enable_thinking: Optional[bool] = None
) -> Dict[str, Any]:
    """获取模型特定的额外参数"""
    config = get_model_config(model_name)
    params = config.extra_params.copy()

    # 添加思考参数（如果模型需要且提供了值）
    if config.thinking_param and enable_thinking is not None:
        params[config.thinking_param] = enable_thinking

    return params
