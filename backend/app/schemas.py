from pydantic import BaseModel, Field
from typing import List, Optional


class ChatMessage(BaseModel):
    role: str
    content: str


# ========== 智能体统一请求模型 ==========


class AgentRequest(BaseModel):
    """智能体统一请求格式"""

    requestId: str = Field(..., description="调用流水号，时间戳+6位随机数")
    dialogId: Optional[str] = Field(
        default=None, description="对话ID，(yyyyMMddHHmmssSSS)+6位随机数，每对话框唯一"
    )
    keyword: str = Field(
        ..., description="用户输入的文本内容，从接口配置读取但不做处理"
    )
    stream: bool = Field(default=True, description="是否流式返回")
    enable_thinking: Optional[bool] = Field(
        default=None, description="是否启用思考模式"
    )
    # 文件引用相关字段
    referenced_objects: Optional[str] = Field(
        default=None, description="引用对象，JSON格式，如：{file: [{fileId: 'xxx'}]}"
    )
    referenced_object_type: Optional[str] = Field(
        default=None, description="引用对象类型，如：file"
    )
    session_id: Optional[str] = Field(
        default=None, description="会话ID，用于关联文件"
    )
    agent_state: Optional[str] = Field(
        default=None, description="智能体状态，如：save"
    )


class ChatRequest(BaseModel):
    """AI问答智能体请求（保持旧格式用于兼容，内部直接透传messages）"""

    requestId: str = Field(..., description="调用流水号，时间戳+6位随机数")
    dialogId: Optional[str] = Field(default=None, description="对话ID")
    keyword: str = Field(..., description="用户输入的文本内容/关键词")
    messages: Optional[List[ChatMessage]] = Field(
        default=None, description="对话消息列表（前端构建）"
    )
    stream: bool = True
    enable_thinking: Optional[bool] = None
    # 文件引用相关字段
    referenced_objects: Optional[str] = Field(
        default=None, description="引用对象，JSON格式，如：{file: [{fileId: 'xxx'}]}"
    )
    referenced_object_type: Optional[str] = Field(
        default=None, description="引用对象类型，如：file"
    )
    session_id: Optional[str] = Field(
        default=None, description="会话ID，用于关联文件"
    )
    agent_state: Optional[str] = Field(
        default=None, description="智能体状态，如：save"
    )
