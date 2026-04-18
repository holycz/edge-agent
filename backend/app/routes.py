from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse
from app.schemas import ChatRequest, ConfigUpdate
from app.ai_client import stream_chat
from app.config import (
    DEFAULT_USE_CONTEXT,
    DEFAULT_CONTEXT_LENGTH,
    DEFAULT_MAX_TOTAL_CHARS,
    DEFAULT_MAX_HISTORY_ROUNDS,
    get_env,
    get_runtime_config,
    update_runtime_config,
    reload_config,
)
from app.prompts import FEATURE_PROMPTS
import json

router = APIRouter()


@router.get("/api/config")
async def get_config():
    rc = get_runtime_config()
    api_key = get_env("API_KEY")
    return {
        "use_context": rc["use_context"],
        "context_length": rc["context_length"],
        "max_total_chars": rc["max_total_chars"],
        "max_history_rounds": rc["max_history_rounds"],
        "my_name": rc["my_name"],
        "other_info": rc["other_info"],
        "api_key_set": bool(api_key and api_key != "your_api_key_here"),
    }


@router.post("/api/config")
async def save_config(config_update: ConfigUpdate):
    updates = config_update.model_dump(exclude_none=True)
    new_config = update_runtime_config(updates)
    api_key = get_env("API_KEY")
    new_config["api_key_set"] = bool(api_key and api_key != "your_api_key_here")
    return {"ok": True, "config": new_config}


@router.post("/api/config/reload")
async def reload_env_config():
    env = reload_config()
    api_key = env.get("API_KEY", "")
    return {
        "ok": True,
        "api_key_set": bool(api_key and api_key != "your_api_key_here"),
        "api_url": env.get("API_URL", ""),
        "model": env.get("MODEL", ""),
        "port": env.get("PORT", 8765),
    }


@router.post("/api/chat")
async def chat(request: ChatRequest):
    page_cookies_data = (
        request.page_cookies.model_dump() if request.page_cookies else None
    )

    async def event_generator():
        async for event in stream_chat(request, page_cookies=page_cookies_data):
            if event["type"] == "error":
                yield f"data: {json.dumps({'type': 'STREAM_ERROR', 'error': event['error']}, ensure_ascii=False)}\n\n"
            elif event["type"] == "done":
                yield f"data: {json.dumps({'type': 'STREAM_DONE'}, ensure_ascii=False)}\n\n"
            elif event["type"] == "chunk":
                yield f"data: {json.dumps({'type': 'STREAM_CHUNK', 'content': event['content'], 'contentType': event['content_type']}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/api/build-prompt")
async def build_prompt(request: Request):
    body = await request.json()
    action = body.get("action")
    selected_text = body.get("selected_text", "")
    page_content = body.get("page_content", "")
    page_metadata = body.get("page_metadata", {})
    user_question = body.get("question", "")
    conversation_history = body.get("conversation_history", [])
    max_total_chars = body.get("max_total_chars", DEFAULT_MAX_TOTAL_CHARS)
    max_history_rounds = body.get("max_history_rounds", DEFAULT_MAX_HISTORY_ROUNDS)
    enable_thinking = body.get("enable_thinking", True)

    messages = []

    if action in ("summarizePage", "summarizeLeaderComments") and page_content:
        feature = FEATURE_PROMPTS.get(action)
        if feature:
            system_prompt = (
                feature["system_prompt_template"]
                if "system_prompt_template" in feature
                else feature["system_prompt"]
            )

            if action == "summarizeLeaderComments":
                my_name = get_env("MY_NAME")
                other_info = get_env("OTHER_INFO")
                user_info = ""
                if my_name:
                    user_info = f"我的姓名：{my_name}"
                if other_info:
                    if user_info:
                        user_info += "；"
                    user_info += other_info
                if user_info:
                    system_prompt = system_prompt.replace("{USER_INFO}", user_info)
                else:
                    return {
                        "error": "请先在后台配置个人身份信息（MY_NAME / OTHER_INFO），以便准确识别相关批示。"
                    }

            messages.append(
                {"role": "system", "content": f"{system_prompt}\n\n{page_content}"}
            )

    elif action in ("summarize", "rewrite", "proofread") and selected_text:
        feature = FEATURE_PROMPTS.get(action)
        if feature:
            messages.append({"role": "system", "content": feature["system_prompt"]})
            messages.append({"role": "user", "content": selected_text})

    elif user_question:
        if page_content:
            context_header = ""
            if page_metadata.get("title"):
                context_header += f"页面标题: {page_metadata['title']}\n"
            if page_metadata.get("url"):
                context_header += f"页面地址: {page_metadata['url']}\n"

            has_modal = "=== 当前弹窗/模态框内容 ===" in page_content
            instructions = (
                "请优先基于弹窗/模态框内容回答，如果弹窗内容不足以回答，再参考页面主体内容。如果内容完全无关，请告知用户。"
                if has_modal
                else "请基于上述网页内容回答，如果内容与问题无关，请告知用户。"
            )

            messages.append(
                {
                    "role": "system",
                    "content": f"以下是一篇网页的内容，用户的提问可能基于这些内容：\n\n--- 网页内容 ---\n{context_header}\n{page_content}\n--- 内容结束 ---\n\n{instructions}",
                }
            )

        messages.extend(conversation_history[-max_history_rounds * 2 :])
        messages.append({"role": "user", "content": user_question})

    else:
        messages.extend(conversation_history[-max_history_rounds * 2 :])

    total_chars = sum(len(m.get("content", "")) for m in messages)
    if total_chars > max_total_chars:
        system_msgs = [m for m in messages if m["role"] == "system"]
        other_msgs = [m for m in messages if m["role"] != "system"]
        system_chars = sum(len(m.get("content", "")) for m in system_msgs)
        remaining = max_total_chars - system_chars

        if remaining < 1000:
            system_msgs = [
                {**m, "content": m["content"][: int(max_total_chars * 0.6)]}
                for m in system_msgs
            ]
            other_msgs = other_msgs[-2:]

        result = list(system_msgs)
        current_chars = system_chars
        for i in range(len(other_msgs) - 1, -1, -1):
            msg_chars = len(other_msgs[i].get("content", ""))
            if current_chars + msg_chars <= max_total_chars:
                result.insert(len(system_msgs), other_msgs[i])
                current_chars += msg_chars
            else:
                available = max_total_chars - current_chars - 100
                if available > 200:
                    truncated = (
                        other_msgs[i]["content"][:available] + "\n...(内容已截断)"
                    )
                    result.insert(
                        len(system_msgs), {**other_msgs[i], "content": truncated}
                    )
                break
        messages = result

    return {
        "messages": messages,
        "enable_thinking": enable_thinking,
    }
