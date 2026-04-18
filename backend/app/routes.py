from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas import ChatRequest, ConfigUpdate
from app.ai_client import stream_chat
from app.config import (
    get_env,
    get_runtime_config,
    update_runtime_config,
    reload_config,
)
from app.prompt_builder import PromptBuilder
from app.models_config import get_model_config
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


def _check_api_key() -> bool:
    """检查 API Key 是否已配置"""
    api_key = get_env("API_KEY")
    return bool(api_key and api_key != "your_api_key_here")


def _get_config_response() -> dict:
    """获取配置响应（包含 API Key 状态）"""
    rc = get_runtime_config()
    return {
        "use_context": rc["use_context"],
        "context_length": rc["context_length"],
        "max_total_chars": rc["max_total_chars"],
        "max_history_rounds": rc["max_history_rounds"],
        "my_name": rc["my_name"],
        "other_info": rc["other_info"],
        "api_key_set": _check_api_key(),
        "model": get_env("MODEL"),
        "supports_thinking": get_model_config(get_env("MODEL")).supports_thinking,
    }


@router.get("/api/config")
async def get_config():
    """获取当前配置"""
    return _get_config_response()


@router.post("/api/config")
async def save_config(config_update: ConfigUpdate):
    """保存运行时配置"""
    updates = config_update.model_dump(exclude_none=True)
    update_runtime_config(updates)
    return {"ok": True, "config": _get_config_response()}


@router.post("/api/config/reload")
async def reload_env_config():
    """热重载环境变量配置"""
    reload_config()
    return {"ok": True, **get_env_config()}


@router.post("/api/chat")
async def chat(request: ChatRequest):
    """流式对话接口"""
    if not _check_api_key():
        raise HTTPException(status_code=503, detail="API Key 未配置")

    page_cookies_data = (
        request.page_cookies.model_dump() if request.page_cookies else None
    )

    async def event_generator():
        async for event in stream_chat(request, page_cookies=page_cookies_data):
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


def format_sse_event(event: dict) -> str:
    """格式化 SSE 事件"""
    if event["type"] == "error":
        data = {"type": "STREAM_ERROR", "error": event["error"]}
    elif event["type"] == "done":
        data = {"type": "STREAM_DONE"}
    elif event["type"] == "chunk":
        data = {
            "type": "STREAM_CHUNK",
            "content": event["content"],
            "contentType": event["content_type"],
        }
    else:
        data = event

    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/api/build-prompt")
async def build_prompt(request: Request):
    """构建提示词消息列表"""
    body = await request.json()

    try:
        builder = PromptBuilder(
            max_total_chars=body.get("max_total_chars", 25000),
            max_history_rounds=body.get("max_history_rounds", 5),
        )

        builder.build(
            action=body.get("action"),
            selected_text=body.get("selected_text", ""),
            page_content=body.get("page_content", ""),
            page_metadata=body.get("page_metadata", {}),
            user_question=body.get("question", ""),
            conversation_history=body.get("conversation_history", []),
        )

        return {
            "messages": builder.get_messages(),
            "enable_thinking": body.get("enable_thinking", True),
        }

    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:
        logger.error(f"Build prompt error: {e}", exc_info=True)
        return {"error": f"构建提示词失败: {str(e)}"}


@router.get("/api/models")
async def list_models():
    """获取支持的模型列表及其配置"""
    from app.models_config import MODEL_CONFIGS

    return {
        "current_model": get_env("MODEL"),
        "models": [
            {
                "name": config.name,
                "supports_thinking": config.supports_thinking,
                "thinking_control": config.thinking_param is not None,
            }
            for key, config in MODEL_CONFIGS.items()
            if key != "default"
        ],
    }


def get_env_config():
    """获取环境变量配置（用于热重载接口）"""
    env = reload_config()
    return {
        "api_key_set": bool(
            env.get("API_KEY") and env.get("API_KEY") != "your_api_key_here"
        ),
        "api_url": env.get("API_URL", ""),
        "model": env.get("MODEL", ""),
        "port": env.get("PORT", 8765),
    }
