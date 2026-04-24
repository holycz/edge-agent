"""
模型配置管理
支持不同 AI 模型的特定参数配置
"""

from typing import Dict, Any, Optional
from dataclasses import dataclass, replace


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
    max_tokens: Optional[int] = None  # 不限制输出长度，使用模型默认最大输出
    temperature: float = 0.7
    extra_params: Dict[str, Any] = None

    def __post_init__(self):
        if self.extra_params is None:
            self.extra_params = {}


# 默认配置（用于未匹配的模型）
DEFAULT_CONFIG = ModelConfig(
    name="default",
    supports_thinking=False,
    reasoning_field="reasoning_content",
    timeout=120,
)

# 预定义的模型配置 - 仅保留与默认配置不同的项
MODEL_CONFIGS: Dict[str, ModelConfig] = {
    # 原生思考模型（不支持关闭思考）
    "kimi-k2-5-thinking": ModelConfig(
        name="kimi-k2-5-thinking",
        supports_thinking=True,
        thinking_param=None,  # 原生思考模型，参数无法控制
    ),
    # 可通过参数控制思考的模型（匹配 qwen 开头的所有模型）
    "qwen": ModelConfig(
        name="qwen",
        supports_thinking=True,
        thinking_param="enable_thinking",
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

    # 返回默认配置的副本
    return replace(DEFAULT_CONFIG)
