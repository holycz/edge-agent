from typing import List, Optional
import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas import ChatRequest, AgentRequest, ChatMessage
from app.ai_client import stream_chat
from app.config import get_env
from app.dialog_manager import dialog_manager
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


def _check_api_key() -> bool:
    """检查 API Key 是否已配置"""
    api_key = get_env("API_KEY")
    return bool(api_key and api_key != "your_api_key_here")


import time

# 用于记录流开始时间
_stream_start_time = None


def format_sse_event(event: dict) -> str:
    """格式化 SSE 事件为 OpenAI 流式格式"""
    global _stream_start_time

    if event["type"] == "error":
        data = {"choices": [{"delta": {"error": event["error"]}}]}
    elif event["type"] == "done":
        # 发送结束标记
        data = {"choices": [{"delta": {"content": "end##end"}}]}
        _stream_start_time = None
    elif event["type"] == "chunk":
        content_type = event.get("content_type", "content")
        content = event.get("content", "")

        # 初始化流开始时间
        if _stream_start_time is None:
            _stream_start_time = time.time()

        # 处理不同类型的内容
        if content_type == "think_start":
            data = {"choices": [{"delta": {"status": "processing"}}]}
        elif content_type == "think":
            # 思考内容作为特殊标记发送（可选）
            data = {"choices": [{"delta": {"reasoning_content": content}}]}
        elif content_type == "think_end":
            # 思考结束，发送性能指标
            elapsed = time.time() - _stream_start_time
            data = {
                "choices": [
                    {
                        "delta": {
                            "performanceMetrics": {
                                "first_token_time": round(elapsed * 0.1, 2),
                                "total_time": round(elapsed, 2),
                                "token_count": 0,
                                "token_per_second": 0,
                            }
                        }
                    }
                ]
            }
        else:
            # 普通内容
            data = {"choices": [{"delta": {"content": content}}]}
    else:
        # 默认处理
        data = {"choices": [{"delta": event}]}

    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ========== 智能体提示词配置 ==========

AGENT_SYSTEM_PROMPTS = {
    "1": """你是一位专业的网页内容总结专家。请基于当前网页的全部内容进行深度总结，要求：

1. **页面主旨提炼**：用一句话概括页面核心内容
2. **关键信息提取**：提取页面中的重要信息，包括但不限于：
   - 表单/申请的核心内容
   - 审批流程和状态
   - 关键数据和时间节点
   - 重要审批意见
3. **结构化呈现**：使用清晰的层次结构展示信息
4. **突出重点**：标记出需要特别关注的内容
5. **简洁明了**：避免冗余，保留核心信息

请用中文输出，采用 Markdown 格式。

网页内容如下：""",
    "2": """你是一位资深的文字编辑和写作专家。请对用户提供的文本进行润色改写，要求：

1. **保持原意**：确保改写后的文本与原意完全一致，不增删核心信息
2. **优化表达**：
   - 提升语言流畅度，消除生硬表达
   - 优化句式结构，使阅读更顺畅
   - 替换平淡词汇，使用更准确、生动的表达
   - 统一语气和风格，保持专业性
3. **修正错误**：
   - 修正语法错误
   - 修正标点符号使用
   - 修正错别字
   - 优化语序和逻辑
4. **格式优化**：
   - 合理分段
   - 优化标点使用
   - 保持适当的段落长度

请输出改写后的完整文本，并在最后简要说明主要改进点（用列表形式）。

原始文本如下：""",
    "3": """你是一位严谨的文字校对专家。请对用户提供的文本进行全面稽核检查，要求：

1. **错别字检查**：找出并标出所有错别字、错用字、形近字错误
2. **语句通顺性**：
   - 检查语法错误
   - 检查语序不当
   - 检查成分残缺或赘余
   - 检查搭配不当
   - 检查逻辑不通之处
3. **标点符号**：
   - 检查标点使用是否正确
   - 检查是否有遗漏或多余标点
4. **专业术语**：检查专业词汇使用是否准确
5. **格式规范**：检查格式是否统一、规范

请按以下格式输出检查结果：

**检查结果概览**：总体评价（如"存在 X 处问题，整体质量良好/一般/较差"）

**问题详情**：
1. 【类型】原文："XXX" → 建议："XXX"（说明：...）
2. ...

**修改建议版本**：给出修改后的完整文本

原始文本如下：""",
    "4": None,  # AI问答智能体没有固定的 system 提示词，直接使用前端传来的完整 messages
    "205a099ade6a4c4fb454e11f96ee6a18": """请从以下OA审批意见中，提取并总结与我相关的领导批示。

【重要提示】
我的身份信息（姓名等）已包含在【我的身份信息】部分，请仔细阅读并记住。
在分析【OA审批页面内容】时，只提取与我（即上述身份信息中的人）相关的批示意见。

【任务要求】
1. 先从【我的身份信息】中提取我的姓名和相关信息
2. 然后分析【OA审批页面内容】中的每条审批意见
3. 只提取与我直接相关的批示意见（包含我姓名或明确指派给我的任务）
4. 重点关注包含我姓名或与我工作相关的审批意见
5. 按审批人分组，提取每个人的批示要点

【输出格式】
1. 总体批示情况（简要说明有几个领导批示、主要态度）

2. 与我相关的批示详情：
   - 审批人：XXX
   - 批示时间：XXXX年XX月XX日
   - 批示意见：（原文摘录关键内容）
   - 涉及我的事项：（明确列出需要我做什么）
   - 批示结果：同意/驳回/补充/转办

3. 待办事项清单：
   - [ ] 事项1（来自XX领导的批示）
   - [ ] 事项2（来自XX领导的批示）

【重要提示】
- 只输出与我相关的批示，其他无关人员的意见一律忽略
- 批示意见要完整准确，不要遗漏关键信息
- 明确标注每个批示对我的具体要求

【页面内容如下】：""",
}


def _build_chat_request(
    request: AgentRequest, messages: List[ChatMessage]
) -> ChatRequest:
    """从 AgentRequest 构建 ChatRequest 用于流式调用"""
    return ChatRequest(
        requestId=request.requestId,
        dialogId=request.dialogId,
        keyword=request.keyword,
        messages=messages,
        stream=request.stream,
        enable_thinking=request.enable_thinking,
    )


def _parse_keyword_for_qa(
    keyword: str, session: "DialogSession"
) -> tuple[Optional[str], str]:
    """
    解析 AI 问答智能体的 keyword，提取页面上下文和用户问题

    格式（前端发送）：
    --- 页面上下文 ---
    页面标题: xxx
    页面地址: xxx
    [页面内容]
    --- 页面上下文结束 ---

    用户问题: xxx

    或（后续对话）：
    用户问题: xxx

    Returns:
        (页面上下文或None, 用户问题)
    """
    # 检查是否包含页面上下文标记
    if "--- 页面上下文 ---" in keyword and "--- 页面上下文结束 ---" in keyword:
        # 提取页面上下文
        context_match = re.search(
            r"--- 页面上下文 ---\n(.*?)--- 页面上下文结束 ---", keyword, re.DOTALL
        )
        page_context = context_match.group(1).strip() if context_match else None

        # 提取用户问题
        question_match = re.search(
            r"用户问题:\s*(.+)$", keyword, re.MULTILINE | re.DOTALL
        )
        user_question = (
            question_match.group(1).strip() if question_match else keyword.strip()
        )

        return page_context, user_question

    # 如果没有页面上下文标记，说明是后续对话或纯文本问题
    # 检查是否是 "用户问题: xxx" 格式
    if keyword.startswith("用户问题:"):
        user_question = keyword.replace("用户问题:", "", 1).strip()
        return None, user_question

    # 纯文本问题
    return None, keyword.strip()


# ========== 智能体接口 ==========


@router.post("/sxzypt/scene_gateway/agent/open/ac32fe9431b1444f8ac3cdf42901024e")
async def summarize_page_agent(request: AgentRequest):
    """网页总结智能体 - 自动总结当前页面内容

    请求体：
    {
        "requestId": "时间戳+6位随机数",
        "dialogId": "(yyyyMMddHHmmssSSS)+6位随机数",
        "keyword": "网页内容（用户输入）",
        "stream": true,
        "enable_thinking": true
    }

    后端：将 keyword 作为用户输入内容，加上 system prompt 后调用AI
    """
    if not _check_api_key():
        raise HTTPException(status_code=503, detail="API Key 未配置")

    # keyword 即为用户输入的网页内容
    user_content = request.keyword

    # 组装完整的 messages（后端添加 system 提示词）
    system_prompt = AGENT_SYSTEM_PROMPTS["1"]
    messages = [
        ChatMessage(role="system", content=f"{system_prompt}\n\n{user_content}")
    ]

    # 构建内部使用的 ChatRequest
    chat_request = _build_chat_request(request, messages)

    async def event_generator():
        async for event in stream_chat(chat_request):
            yield format_sse_event(event)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/sxzypt/scene_gateway/agent/open/bbad433949b64fab8de7f1a26d6ab56c")
async def rewrite_agent(request: AgentRequest):
    """文本润色智能体 - 润色改写给定的文本

    请求体：
    {
        "requestId": "时间戳+6位随机数",
        "dialogId": "(yyyyMMddHHmmssSSS)+6位随机数",
        "keyword": "需要润色的文本（用户输入）",
        "stream": true,
        "enable_thinking": true
    }

    后端：将 keyword 作为用户输入文本，加上润色相关的 system prompt 后调用AI
    """
    if not _check_api_key():
        raise HTTPException(status_code=503, detail="API Key 未配置")

    # keyword 即为用户输入的文本
    user_content = request.keyword

    # 组装完整的 messages
    system_prompt = AGENT_SYSTEM_PROMPTS["2"]
    messages = [
        ChatMessage(role="system", content=system_prompt),
        ChatMessage(role="user", content=user_content),
    ]

    # 构建内部使用的 ChatRequest
    chat_request = _build_chat_request(request, messages)

    async def event_generator():
        async for event in stream_chat(chat_request):
            yield format_sse_event(event)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/sxzypt/scene_gateway/agent/open/a03444b0e45d416fbc0a494b46a2c55b")
async def proofread_agent(request: AgentRequest):
    """文本稽核智能体 - 稽核检查给定文本

    请求体：
    {
        "requestId": "时间戳+6位随机数",
        "dialogId": "(yyyyMMddHHmmssSSS)+6位随机数",
        "keyword": "需要稽核的文本（用户输入）",
        "stream": true,
        "enable_thinking": true
    }

    后端：将 keyword 作为用户输入文本，加上稽核相关的 system prompt 后调用AI
    """
    if not _check_api_key():
        raise HTTPException(status_code=503, detail="API Key 未配置")

    # keyword 即为用户输入的文本
    user_content = request.keyword

    # 组装完整的 messages
    system_prompt = AGENT_SYSTEM_PROMPTS["3"]
    messages = [
        ChatMessage(role="system", content=system_prompt),
        ChatMessage(role="user", content=user_content),
    ]

    # 构建内部使用的 ChatRequest
    chat_request = _build_chat_request(request, messages)

    async def event_generator():
        async for event in stream_chat(chat_request):
            yield format_sse_event(event)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/sxzypt/scene_gateway/agent/open/ddf09cedfcbd4d188adc528461a91392")
async def qa_agent(request: AgentRequest):
    """AI问答智能体 - 基于页面内容的问答（支持多轮对话，后端维护上下文）

    请求体：
    {
        "requestId": "时间戳+6位随机数",
        "dialogId": "(yyyyMMddHHmmssSSS)+6位随机数，同一对话需保持相同",
        "keyword": "用户当前问题（前端只需发送问题本身，上下文由后端管理）",
        "stream": true,
        "enable_thinking": true
    }

    后端：
    1. 根据 dialogId 获取或创建对话会话
    2. 首次对话时从 keyword 中提取页面上下文并保存
    3. 添加用户消息到对话历史
    4. 构建完整的消息列表（包含页面上下文和历史对话）调用AI
    5. 将AI回复添加到对话历史
    6. 返回流式响应

    注意：前端只需发送当前问题和页面上下文（第一次），历史对话由后端维护
    """
    if not _check_api_key():
        raise HTTPException(status_code=503, detail="API Key 未配置")
    # if not request.dialogId:
    #     raise HTTPException(
    #         status_code=400, detail="AI问答模式必须提供 dialogId 以维护对话上下文"
    #     )

    # 1. 获取或创建对话会话
    session = dialog_manager.get_or_create_session(request.dialogId)

    # 2. 解析 keyword，提取页面上下文和用户问题
    page_context, user_question = _parse_keyword_for_qa(request.keyword, session)

    # 如果是首次对话且提取到了页面上下文，保存到会话
    if page_context and len(session.messages) == 0:
        session.set_page_context(page_context)
        # logger.info(
        #     f"[QA Agent] 首次对话，保存页面上下文到会话 {request.dialogId}, 长度: {len(page_context)}"
        # )
    logger.info(f"[QA Agent] 首次对话，保存页面上下文到会话 {request.keyword}")

    # 3. 添加用户问题到对话历史
    session.add_message("user", user_question)
    # logger.info(
    #     f"[QA Agent] 添加用户消息到会话 {request.dialogId}, 当前消息数: {len(session.messages)}"
    # )

    # 4. 构建用于 API 调用的消息列表
    messages = session.get_messages_for_api()
    # logger.info(
    #     f"[QA Agent] 会话 {request.dialogId} 构建消息列表: {len(messages)} 条 (含页面上下文)"
    # )

    # 5. 构建内部 ChatRequest
    chat_request = _build_chat_request(request, messages)

    # 6. 流式调用并收集AI回复
    accumulated_response = ""

    async def event_generator():
        nonlocal accumulated_response
        async for event in stream_chat(chat_request):
            # 收集AI回复内容
            if event.get("type") == "chunk":
                content = event.get("content", "")
                if content and event.get("content_type") == "content":
                    accumulated_response += content
            yield format_sse_event(event)

        # 流结束后，将AI回复添加到对话历史
        if accumulated_response:
            session.add_message("assistant", accumulated_response)
            # logger.info(
            #     f"[QA Agent] 添加AI回复到会话 {request.dialogId}, 长度: {len(accumulated_response)}, 当前消息数: {len(session.messages)}"
            # )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/sxzypt/scene_gateway/agent/open/205a099ade6a4c4fb454e11f96ee6a18")
async def leader_comments_agent(request: AgentRequest):
    """公文批示总结智能体 - 总结领导批示

    请求体：
    {
        "requestId": "时间戳+6位随机数",
        "dialogId": "(yyyyMMddHHmmssSSS)+6位随机数",
        "keyword": "个人信息前缀 + OA审批页面内容（由前端构建）",
        "stream": true,
        "enable_thinking": true
    }

    后端：将 keyword 作为页面内容，加上批示总结的 system prompt 调用AI
    个人信息由前端在 keyword 中传递，格式："请记住，我的姓名：XXX；...\n\n请基于以上信息分析以下批示内容：\n\n[原始页面内容]"
    """
    if not _check_api_key():
        raise HTTPException(status_code=503, detail="API Key 未配置")

    # keyword 即为用户输入的页面内容（包含前端附加的个人信息前缀）
    user_content = request.keyword

    # 使用 system prompt 模板（保留环境变量回退兼容性）
    system_prompt = AGENT_SYSTEM_PROMPTS["205a099ade6a4c4fb454e11f96ee6a18"]

    # 组装完整的 messages
    messages = [
        ChatMessage(role="system", content=f"{system_prompt}\n\n{user_content}")
    ]

    # 构建内部使用的 ChatRequest
    chat_request = _build_chat_request(request, messages)

    async def event_generator():
        async for event in stream_chat(chat_request):
            yield format_sse_event(event)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
