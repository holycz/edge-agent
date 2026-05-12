import json
import logging
import re
import time
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Header
from fastapi.responses import StreamingResponse, JSONResponse

from app.ai_client import stream_chat, chat_once
from app.config import get_env
from app.dialog_manager import dialog_manager
from app.schemas import ChatRequest, AgentRequest, ChatMessage

# 上传文件存储目录
UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

logger = logging.getLogger(__name__)
router = APIRouter()

UNIFIED_ENDPOINT = "/sxzypt/py_talkHub/agent/agent"


def _check_api_key() -> bool:
    """检查 API Key 是否已配置"""
    api_key = get_env("API_KEY")
    return bool(api_key and api_key != "your_api_key_here")


def format_sse_event(event: dict, stream_start_time: Optional[float] = None) -> str:
    """格式化 SSE 事件为 OpenAI 流式格式
    
    Args:
        event: 事件字典
        stream_start_time: 流开始时间，用于计算性能指标
    
    Returns:
        (格式化的SSE字符串, 更新后的stream_start_time或None)
    """
    data = None

    if event["type"] == "error":
        data = {"choices": [{"delta": {"error": event["error"]}}]}
    elif event["type"] == "done":
        data = {"choices": [{"delta": {"content": "end##end"}}]}
    elif event["type"] == "chunk":
        content_type = event.get("content_type", "content")
        content = event.get("content", "")

        if stream_start_time is None:
            stream_start_time = time.time()

        if content_type == "think_start":
            data = {"choices": [{"delta": {"status": "processing"}}]}
        elif content_type == "think":
            data = {"choices": [{"delta": {"reasoning_content": content}}]}
        elif content_type == "think_end":
            elapsed = time.time() - stream_start_time
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
            data = {"choices": [{"delta": {"content": content}}]}
    else:
        data = {"choices": [{"delta": event}]}

    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n", stream_start_time


AGENT_SYSTEM_PROMPTS = {
    "ac32fe9431b1444f8ac3cdf42901024e": """你是一位专业的网页内容总结专家。请基于当前网页的全部内容进行深度总结，要求：
1. **页面主旨提炼**：用一句话概括页面核心内容
2. **关键信息提取**：提取页面中的重要信息，包括但不限于：
   - 表单/申请的核心内容
   - 审批流程和状态
   - 关键数据和时间节点
   - 重要审批意见
3. **突出重点**：标记出需要特别关注的内容
4. **简洁明了**：避免冗余，保留核心信息

请用中文输出。

网页内容如下：""",
    "bbad433949b64fab8de7f1a26d6ab56c": """你是一位资深的文字编辑和写作专家。请对用户提供的文本进行润色改写，要求：

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
    "a03444b0e45d416fbc0a494b46a2c55b": """你是一位严谨的文字校对专家。请对用户提供的文本进行全面稽核检查，要求：

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
    "ddf09cedfcbd4d188adc528461a91392": None,  # AI问答智能体没有固定的 system 提示词，直接使用前端传来的完整 messages
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
        request_id=request.request_id,
        dialogId=request.dialog_id,
        keyword=request.question,
        messages=messages,
        stream=True,
        enable_thinking=None,
        referenced_objects=request.referenced_objects,
        referenced_object_type=request.referenced_object_type,
        session_id=request.session_id,
        agent_state=request.agent_state,
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


def _build_messages_for_agent(agent_id: str, question: str) -> List[ChatMessage]:
    """根据智能体ID构建对应的消息列表
    
    Args:
        agent_id: 智能体ID
        question: 用户问题
    """
    # 自定义智能体（不在内置列表中）直接传用户消息，不使用 system prompt
    if agent_id not in AGENT_SYSTEM_PROMPTS:
        return [
            ChatMessage(role="user", content=question),
        ]
    
    system_prompt = AGENT_SYSTEM_PROMPTS.get(agent_id)
    
    if agent_id == "ddf09cedfcbd4d188adc528461a91392":  # AI问答智能体
        return []
    else:  # 其他内置智能体（网页总结、文本润色、文本稽核、公文批示总结）
        return [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=question),
        ]


# ========== 统一智能体接口 ==========


@router.post("/sxzypt/py_talkHub/agent/agent")
async def unified_agent(request: AgentRequest):
    """统一智能体接口 - 通过 agent_id 区分不同智能体

    请求体：
    {
        "request_id": "时间戳+6位随机数",
        "dialog_id": "(yyyyMMddHHmmssSSS)+6位随机数，同一对话需保持相同",
        "agent_id": "智能体ID",
        "user_id": "用户ID",
        "question": "用户输入的问题/文本内容",
        "use_history": "true",
        "model_id": "",
        "ifInternet": false,
        "ifCallback": true,
        "referenced_objects": "{\"file\":[{\"file_id\":\"xxx\",\"file_name\":\"xxx\",\"file_size\":0}]}",
        "referenced_object_type": "file",
        "session_id": "会话ID",
        "agent_state": "save"
    }

    智能体ID列表：
    - ac32fe9431b1444f8ac3cdf42901024e: 网页总结
    - bbad433949b64fab8de7f1a26d6ab56c: 文本润色
    - a03444b0e45d416fbc0a494b46a2c55b: 文本稽核
    - ddf09cedfcbd4d188adc528461a91392: AI问答（支持多轮对话）
    - 205a099ade6a4c4fb454e11f96ee6a18: 公文批示总结
    """
    if not _check_api_key():
        raise HTTPException(status_code=503, detail="API Key 未配置")

    # 获取并验证智能体ID
    agent_id = request.agent_id
    if not agent_id:
        raise HTTPException(status_code=400, detail="缺少 agent_id 参数")

    # 判断是否为自定义智能体（不在内置列表中）
    is_custom_agent = agent_id not in AGENT_SYSTEM_PROMPTS

    # 获取用户问题
    question = request.question
    if not question:
        raise HTTPException(status_code=400, detail="缺少 question 参数")

    # ====================== 【新增：读取上传的 TXT 文件】 ======================
    file_content = ""
    logger.info(f"[question] : {request.referenced_object_type}， {request.referenced_objects}")
    print(request.referenced_object_type)
    try:
        # 仅当类型为 file 且有文件信息时读取
        if request.referenced_object_type == "file" and request.referenced_objects:
            ref_data = json.loads(request.referenced_objects)
            file_list = ref_data.get("file", [])
            if file_list:
                # 取第一个文件（你也可以循环读取多个）
                file_info = file_list[0]
                file_id = file_info.get("file_id", "")
                file_name = file_info.get("file_name", "")
                request_id = request.request_id
                dialog_id = request.dialog_id

                if not file_id or not request_id:
                    logger.warning("[FileRead] file_id 或 request_id 为空")
                else:
                    # 拼接上传时的路径：uploads/agent_id/request_id/file_id_filename
                    target_dir = UPLOAD_DIR / agent_id / dialog_id
                    logger.info(f"[target_dir] : {target_dir}")
                    # 遍历目录找到以 file_id 开头的文件（匹配上传规则）
                    if target_dir.exists():
                        for file_path in target_dir.glob(f"{file_id}_*"):
                            # 只处理 txt 文件
                            if file_path.suffix.lower() == ".txt":
                                logger.info(f"[FileRead] 读取文件：{file_path}")
                                with open(file_path, "r", encoding="utf-8") as f:
                                    file_content = f.read()
                                break  # 只读取第一个匹配的txt
            if file_content:
                # 把文件内容拼到问题前面
                question = f"以下是上传的文件内容：\n{file_content}\n\n用户问题：{question}"
                logger.info(f"[question] : {question}")

    except Exception as e:
        logger.error(f"[FileRead] 读取文件失败：{str(e)}")
    # ==========================================================================

    # 根据不同智能体类型处理
    if agent_id == "ddf09cedfcbd4d188adc528461a91392":  # AI问答智能体
        # 1. 获取或创建对话会话
        session = dialog_manager.get_or_create_session(request.dialog_id)

        # 2. 解析 question，提取页面上下文和用户问题
        page_context, user_question = _parse_keyword_for_qa(question, session)

        # 3. 如果是首次对话且提取到了页面上下文，保存到会话
        if page_context and len(session.messages) == 0:
            session.set_page_context(page_context)
            logger.info(f"[QA Agent] 首次对话，保存页面上下文到会话 {question[:50]}...")

        # 4. 添加用户问题到对话历史
        session.add_message("user", user_question)

        # 5. 构建用于 API 调用的消息列表
        messages = session.get_messages_for_api()

        # 6. 构建 ChatRequest
        chat_request = _build_chat_request(request, messages)

        # 7. 流式调用并收集AI回复
        accumulated_response = ""

        async def event_generator_qa():
            nonlocal accumulated_response
            stream_start_time = None
            async for event in stream_chat(chat_request):
                if event.get("type") == "chunk":
                    content = event.get("content", "")
                    if content and event.get("content_type") == "content":
                        accumulated_response += content
                sse_str, stream_start_time = format_sse_event(event, stream_start_time)
                yield sse_str

            # 流结束后，将AI回复添加到对话历史
            if accumulated_response:
                session.add_message("assistant", accumulated_response)

        return StreamingResponse(
            event_generator_qa(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    else:  # 其他智能体（网页总结、文本润色、文本稽核、公文批示总结、自定义智能体）
        # 构建消息列表（自定义智能体直接传用户消息）
        messages = _build_messages_for_agent(agent_id, question)

        # 构建内部使用的 ChatRequest
        chat_request = _build_chat_request(request, messages)

        async def event_generator():
            stream_start_time = None
            async for event in stream_chat(chat_request):
                sse_str, stream_start_time = format_sse_event(event, stream_start_time)
                yield sse_str

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
# ========== 文件上传接口 ==========


@router.post("/sxzypt/aistar_server/agent/upload")
async def upload_files(
    files: UploadFile = File(...),
    param: str = Form(...),
):
    """统一文件上传接口 - 通过 param 中的 agent_id 区分不同智能体
    
    请求示例:
    POST /sxzypt/aistar_server/agent/upload
    Content-Type: multipart/form-data
    
    form-data:
    - files: 文件
    - param: {"session_id":"xxx","agent_id":"xxx","user_id":"xxx","chat_type":"listing","requestId":"xxx","dialog_id":"xxx","model_instance_id":"8"}
    
    返回格式:
    {
        "code": 1000,
        "message": "上传成功",
        "timestamp": null,
        "data": ["uuid-string"]
    }
    """
    # 解析 param JSON
    try:
        param_data = json.loads(param)
    except json.JSONDecodeError:
        return JSONResponse(
            content={"code": 4001, "message": "param 参数格式错误，需要合法 JSON"},
            status_code=400,
        )

    agent_id = param_data.get("agent_id")
    request_id = param_data.get("requestId", "")
    dialog_id = param_data.get("dialog_id", "")

    # 验证 agent_id
    if not agent_id:
        return JSONResponse(
            content={"code": 4001, "message": "缺少 agent_id 参数"},
            status_code=400,
        )

    if agent_id not in AGENT_SYSTEM_PROMPTS:
        return JSONResponse(
            content={"code": 4002, "message": f"未知智能体ID: {agent_id}"},
            status_code=400,
        )

    try:
        # 生成随机的文件 UUID
        file_uuid = uuid.uuid4().hex

        # 构建存储路径: uploads/{agent_id}/{request_id}/{file_uuid}_{filename}
        save_dir = UPLOAD_DIR / agent_id / dialog_id
        save_dir.mkdir(parents=True, exist_ok=True)

        # 安全文件名处理
        safe_filename = re.sub(r'[^\w\s.-]', '_', files.filename or "unnamed")
        save_path = save_dir / f"{file_uuid}_{safe_filename}"

        # 增加配置
        MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

        # 写入逻辑
        with open(save_path, "wb") as f:
            file_size = 0
            while chunk := await files.read(1024 * 1024):  # 1MB 分块
                file_size += len(chunk)
                if file_size > MAX_FILE_SIZE:
                    raise HTTPException(status_code=413, detail="文件超过50MB")
                f.write(chunk)

        logger.info(f"[FileUpload] 文件上传成功: {files.filename} -> {save_path}, size: {file_size} bytes, agent_id: {agent_id}, file_uuid: {file_uuid}")

        return JSONResponse(
            content={
                "code": 1000,
                "message": "上传成功",
                "timestamp": None,
                "data": [file_uuid],
            },
            status_code=200,
        )
    except Exception as e:
        logger.error(f"[FileUpload] 失败: {str(e)}")
        return JSONResponse(
            content={"code": 5002, "message": f"文件上传失败: {str(e)}"},
            status_code=500,
        )


# ========== 智云平台接口模拟 ==========

# 支持的场景端点配置
SCENE_GATEWAY_ENDPOINTS = {
    "b6eec25e63fe414987cb3e5d2ab655aa": {
        "name": "直播话术打分",
        "auth_token": "7f0083451d46482495f1b43107c2e959",
        "system_prompt": """你是一位专业的直播话术评审专家。请对用户提供的直播话术进行打分和评价，要求：
1. 从话术的吸引力、逻辑性、感染力、专业性等维度进行评分
2. 每个维度给出1-10分的评分
3. 指出话术的优点和不足
4. 给出改进建议
5. 给出综合评分和总结

请输出详细的评分报告。""",
    },
    "b18651667a744c949c65130328f01946": {
        "name": "失败案例复盘智能体",
        "auth_token": "4cd344898c0f4b1b8483a395b71c5636",
        "system_prompt": """你是一位专业的销售培训专家。请对用户提供的失败案例进行复盘分析，要求：
1. 分析失败的根本原因
2. 指出关键的失误环节
3. 提供具体的改进措施
4. 给出类似场景的应对策略
5. 总结经验教训

请输出详细的复盘分析报告。""",
    },
    "53dfe4e721084030b8ddcc0cfe56ff5a": {
        "name": "直播脚本生成",
        "auth_token": "950fcd3e9e7d4f4ba344158fb854ddc8",
        "system_prompt": """你是一位专业的直播脚本编剧。请根据用户提供的产品信息和需求，生成完整的直播脚本，要求：
1. 包含开场白、产品介绍、互动环节、促单话术、结尾等完整流程
2. 话术要口语化、有感染力
3. 包含适当的产品卖点强调
4. 包含与观众互动的设计
5. 时间节奏合理

请输出完整的直播脚本。""",
    },
    "03a2e05bbbbb47c6822f817532f282ee": {
        "name": "电销话术工作流",
        "auth_token": "2ed10d86f21b492f8a9f4590787c79c1",
        "system_prompt": """你是一位专业的电话销售话术专家。请根据用户提供的产品信息和销售场景，生成专业的电销话术，要求：
1. 包含开场白、需求挖掘、产品介绍、异议处理、促成成交等完整流程
2. 话术简洁明了，适合电话沟通
3. 包含常见异议的应对方案
4. 语气专业友善，有亲和力
5. 包含跟进策略

请输出完整的电销话术。""",
    },
    "34103af5f0554bbfbca6fa08c051d601": {
        "name": "应对话术工作流",
        "auth_token": "8a58aceed2534c4c9feacc658323c1b9",
        "system_prompt": """你是一位专业的销售应对话术专家。请根据用户提供的客户问题或异议，生成专业的应对话术，要求：
1. 分析客户问题的核心诉求
2. 提供多种应对方案
3. 话术要专业、有说服力
4. 包含进一步引导的技巧
5. 注意维护客户关系

请输出专业的应对话术。""",
    },
    "c96deac874ac47d0a6b5280b68cbc77e": {
        "name": "产品信息及卖点提取",
        "auth_token": "5a0506aee0df4dbe8375a76f1fe420ee",
        "system_prompt": """你是一位专业的产品分析师。请从用户提供的内容中提取产品信息和关键卖点，要求：
1. 提取产品的核心信息（名称、功能、特点等）
2. 提取核心卖点，每个卖点用简洁的语言概括
3. 按重要性排序
4. 突出产品/服务的独特优势
5. 使用清晰的格式输出

请输出提取的产品信息和卖点列表。""",
    },
    "7caeaadb1e964274938981b36211a7f7": {
        "name": "直播话术订正",
        "auth_token": "290adc62ebd54d76a71e2087d8a43d56",
        "system_prompt": """你是一位专业的直播话术编辑专家。请对用户提供的直播话术进行订正和优化，要求：
1. 修正语法错误、错别字和不当表达
2. 优化话术的流畅度和感染力
3. 确保话术符合直播场景的口语化特点
4. 保持原意不变
5. 适当增加互动元素

请输出订正后的完整话术。""",
    },
    "cd5695e0db7d4b74b9013a9b68377148": {
        "name": "产品销售培训文档",
        "auth_token": "ecceb736bb4246b8ba91b984d99b8b91",
        "system_prompt": """你是一位专业的销售培训师。请根据用户提供的产品信息，生成专业的产品销售培训文档，要求：
1. 产品概述和核心价值
2. 目标客户画像分析
3. 核心卖点和话术
4. 常见客户异议及应对方案
5. 销售技巧和注意事项
6. 竞品对比分析

请输出完整的销售培训文档。""",
    },
}


@router.post("/sxzypt/scene_gateway/{endpoint_id}")
async def scene_gateway(
    endpoint_id: str,
    keyword: str = Form(...),
    requestId: str = Form(...),
    input_file: Optional[UploadFile] = File(None),
    AuthToken: Optional[str] = Header(None),
):
    """智云平台接口模拟 - 非流式接口
    
    模拟智云平台的工具流接口，接收 keyword 作为输入，调用大模型后返回结果。
    
    请求格式：multipart/form-data
    - keyword: 输入内容（必填）
    - requestId: 请求ID，格式：时间戳(13位) + 6位随机数（必填）
    - input_file: 上传的文件（可选）
    
    请求头：
    - AuthToken: 认证令牌
    
    响应格式：JSON
    {
        "errMsg": "success",
        "errCode": 0,
        "requestId": "xxx",
        "id": "xxx",
        "data": {
            "code": 200,
            "data": "AI生成的内容",
            "num": 100,
            "status": "success",
            "msg": "",
            "sendMessage": {}
        }
    }
    """
    # 验证端点是否存在
    endpoint_config = SCENE_GATEWAY_ENDPOINTS.get(endpoint_id)
    if not endpoint_config:
        return JSONResponse(
            content={
                "errMsg": "endpoint not found",
                "errCode": 404,
                "requestId": requestId,
                "id": "",
                "data": {
                    "code": 404,
                    "data": "",
                    "num": 0,
                    "status": "error",
                    "msg": f"未知的端点ID: {endpoint_id}",
                    "sendMessage": {},
                },
            },
            status_code=404,
        )

    # 验证 AuthToken
    expected_token = endpoint_config.get("auth_token")
    if expected_token and AuthToken != expected_token:
        logger.warning(f"[SceneGateway] AuthToken 验证失败: expected={expected_token}, got={AuthToken}")
        return JSONResponse(
            content={
                "errMsg": "authentication failed",
                "errCode": 401,
                "requestId": requestId,
                "id": "",
                "data": {
                    "code": 401,
                    "data": "",
                    "num": 0,
                    "status": "error",
                    "msg": "AuthToken 验证失败",
                    "sendMessage": {},
                },
            },
            status_code=401,
        )

    # 读取文件内容（如果有）
    file_content = ""
    if input_file:
        try:
            file_bytes = await input_file.read()
            # 尝试解码为文本
            try:
                file_content = file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                try:
                    file_content = file_bytes.decode("gbk")
                except UnicodeDecodeError:
                    file_content = file_bytes.decode("latin-1")
            logger.info(f"[SceneGateway] 读取文件: {input_file.filename}, 长度: {len(file_content)}")
        except Exception as e:
            logger.error(f"[SceneGateway] 读取文件失败: {str(e)}")

    # 构建完整的输入内容
    full_input = keyword
    if file_content:
        full_input = f"{keyword}\n\n附件内容：\n{file_content}"

    # 构建消息列表
    system_prompt = endpoint_config.get("system_prompt", "")
    messages = []
    if system_prompt:
        messages.append(ChatMessage(role="system", content=system_prompt))
    messages.append(ChatMessage(role="user", content=full_input))

    # 生成会话ID
    session_id = f"{requestId[:13]}{requestId[13:]}" if len(requestId) >= 13 else requestId

    try:
        # 调用大模型（非流式）
        logger.info(f"[SceneGateway] 开始调用大模型，端点: {endpoint_id}, keyword长度: {len(keyword)}")
        ai_response = await chat_once(messages)
        logger.info(f"[SceneGateway] 大模型调用完成，响应长度: {len(ai_response)}")

        # 返回响应
        return JSONResponse(
            content={
                "errMsg": "success",
                "errCode": 0,
                "requestId": requestId,
                "id": session_id,
                "data": {
                    "code": 200,
                    "data": ai_response,
                    "num": len(ai_response),
                    "status": "success",
                    "msg": "",
                    "sendMessage": {
                        "inprompt_llm": keyword[:50] + "..." if len(keyword) > 50 else keyword,
                    },
                },
            },
            status_code=200,
        )

    except Exception as e:
        logger.error(f"[SceneGateway] 大模型调用失败: {str(e)}")
        return JSONResponse(
            content={
                "errMsg": "internal error",
                "errCode": 500,
                "requestId": requestId,
                "id": session_id,
                "data": {
                    "code": 500,
                    "data": "",
                    "num": 0,
                    "status": "error",
                    "msg": f"大模型调用失败: {str(e)}",
                    "sendMessage": {},
                },
            },
            status_code=500,
        )


@router.post("/sxzypt/scene_gateway/sse/{endpoint_id}")
async def scene_gateway_sse(
    endpoint_id: str,
    keyword: str = Form(...),
    requestId: str = Form(...),
    input_file: Optional[UploadFile] = File(None),
    AuthToken: Optional[str] = Header(None),
):
    """智云平台接口模拟 - SSE流式接口

    模拟智云平台的工具流SSE接口，接收 keyword 作为输入，调用大模型后以SSE格式逐字符返回结果。

    请求格式：multipart/form-data
    - keyword: 输入内容（必填）
    - requestId: 请求ID，格式：时间戳(13位) + 6位随机数（必填）
    - input_file: 上传的文件（可选）

    请求头：
    - AuthToken: 认证令牌

    响应格式：SSE流，每行一个字符
    data:字
    data:符
    data:1
    data:字
    data:符
    data:2
    ...
    data: [DONE]
    """
    # 验证端点是否存在
    endpoint_config = SCENE_GATEWAY_ENDPOINTS.get(endpoint_id)
    if not endpoint_config:
        async def error_stream_not_found():
            yield f"data: 端点不存在: {endpoint_id}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(
            error_stream_not_found(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # 验证 AuthToken
    expected_token = endpoint_config.get("auth_token")
    if expected_token and AuthToken != expected_token:
        logger.warning(f"[SceneGatewaySSE] AuthToken 验证失败: expected={expected_token}, got={AuthToken}")
        async def error_stream_auth():
            yield "data: AuthToken验证失败\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(
            error_stream_auth(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # 读取文件内容（如果有）
    file_content = ""
    if input_file:
        try:
            file_bytes = await input_file.read()
            try:
                file_content = file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                try:
                    file_content = file_bytes.decode("gbk")
                except UnicodeDecodeError:
                    file_content = file_bytes.decode("latin-1")
            logger.info(f"[SceneGatewaySSE] 读取文件: {input_file.filename}, 长度: {len(file_content)}")
        except Exception as e:
            logger.error(f"[SceneGatewaySSE] 读取文件失败: {str(e)}")

    # 构建完整的输入内容
    full_input = keyword
    if file_content:
        full_input = f"{keyword}\n\n附件内容：\n{file_content}"

    # 构建消息列表
    system_prompt = endpoint_config.get("system_prompt", "")
    messages = []
    if system_prompt:
        messages.append(ChatMessage(role="system", content=system_prompt))
    messages.append(ChatMessage(role="user", content=full_input))

    # 生成会话ID
    session_id = f"{requestId[:13]}{requestId[13:]}" if len(requestId) >= 13 else requestId

    # 构建 ChatRequest 对象
    chat_request = ChatRequest(
        request_id=requestId,
        dialogId=session_id,
        keyword=full_input,
        messages=messages,
        stream=True,
        enable_thinking=False,
    )

    async def sse_stream():
        try:
            logger.info(f"[SceneGatewaySSE] 开始流式调用大模型，端点: {endpoint_id}, keyword长度: {len(keyword)}")

            # 流式调用大模型
            async for event in stream_chat(chat_request):
                if event["type"] == "chunk" and event["content_type"] == "content":
                    # 直接发送内容块，换行符转义为 \\n
                    content = event["content"].replace("\\", "\\\\").replace("\n", "\\n")
                    yield f"data:{content}\n\n"
                elif event["type"] == "done":
                    break
                elif event["type"] == "error":
                    yield f"data:错误: {event['error']}\n\n"
                    break

            logger.info(f"[SceneGatewaySSE] 流式调用完成，端点: {endpoint_id}")

        except Exception as e:
            logger.error(f"[SceneGatewaySSE] 大模型调用失败: {str(e)}")
            yield f"data:大模型调用失败: {str(e)}\n\n"

    return StreamingResponse(
        sse_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

