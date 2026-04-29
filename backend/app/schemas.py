from pydantic import BaseModel, Field
from typing import List, Optional


class ChatMessage(BaseModel):
    role: str
    content: str


# ========== 智能体统一请求模型（新版本）==========


class AgentRequest(BaseModel):
    """智能体统一请求格式 - 新接口
    
    接口路径：/sxzypt/py_talkHub/agent/agent
    所有智能体共用一个接口，通过 agent_id 区分
    """

    request_id: str = Field(
        ..., 
        description="调用流水号，时间戳+6位随机数"
    )
    dialog_id: Optional[str] = Field(
        default=None, 
        description="对话ID，(yyyyMMddHHmmssSSS)+6位随机数，同一对话需保持相同"
    )
    agent_id: str = Field(
        ..., 
        description="智能体ID，区分不同功能类型"
    )
    user_id: Optional[str] = Field(
        default=None, 
        description="用户ID"
    )
    question: str = Field(
        ..., 
        description="用户输入的问题/文本内容"
    )
    use_history: Optional[str] = Field(
        default="true",
        description="是否使用历史对话"
    )
    model_id: Optional[str] = Field(
        default="",
        description="模型ID"
    )
    ifInternet: Optional[bool] = Field(
        default=False,
        description="是否联网搜索"
    )
    ifCallback: Optional[bool] = Field(
        default=True,
        description="是否回调"
    )
    # 文件引用相关字段
    referenced_objects: Optional[str] = Field(
        default=None, 
        description="引用对象，JSON格式，如：{\"file\":[{\"file_id\":\"xxx\",\"file_name\":\"xxx\",\"file_size\":0}]}"
    )
    referenced_object_type: Optional[str] = Field(
        default=None, 
        description="引用对象类型，如：file"
    )
    session_id: Optional[str] = Field(
        default=None, 
        description="会话ID，用于关联文件"
    )
    agent_state: Optional[str] = Field(
        default=None, 
        description="智能体状态，如：save"
    )

    class Config:
        extra = "allow"


class ChatRequest(BaseModel):
    """AI问答智能体请求（内部使用）"""

    request_id: str = Field(..., description="调用流水号")
    dialogId: Optional[str] = Field(default=None, description="对话ID")
    keyword: str = Field(..., description="用户输入内容（兼容字段）")
    messages: Optional[List[ChatMessage]] = Field(
        default=None, 
        description="对话消息列表"
    )
    stream: bool = True
    enable_thinking: Optional[bool] = None
    # 文件引用相关字段
    referenced_objects: Optional[str] = Field(
        default=None, 
        description="引用对象，JSON格式"
    )
    referenced_object_type: Optional[str] = Field(
        default=None, 
        description="引用对象类型"
    )
    session_id: Optional[str] = Field(
        default=None, 
        description="会话ID"
    )
    agent_state: Optional[str] = Field(
        default=None, 
        description="智能体状态"
    )
