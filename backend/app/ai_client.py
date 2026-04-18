import httpx
import json
import os
import logging
from typing import Optional, Dict, Any, AsyncGenerator, Tuple
from app.config import get_env
from app.schemas import ChatRequest
from app.models_config import get_model_config, should_use_thinking_param

logger = logging.getLogger(__name__)


async def stream_chat(
    request: ChatRequest, page_cookies: Optional[Dict[str, Any]] = None
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    流式调用 AI API，支持多种模型的推理模式

    支持两种思考内容格式：
    1. reasoning_content 字段 - OpenAI 标准推理格式（如 kimi-k2-5-thinking）
    2. content 中的特殊标签 - 部分模型使用（暂未使用）
    """
    model = get_env("MODEL")
    api_url_raw = get_env("API_URL")
    api_url = f"{api_url_raw.rstrip('/')}/chat/completions"

    auth_header = _build_auth_header(get_env("API_KEY"))
    config = get_model_config(model)

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "identity",
        "Authorization": auth_header,
    }

    body = _build_request_body(request, model, config)

    proxy_url = _get_proxy_url()

    logger.debug(
        f"Request to {model}: stream={request.stream}, thinking={request.enable_thinking}"
    )

    try:
        async with httpx.AsyncClient(timeout=config.timeout, proxy=proxy_url) as client:
            async with client.stream(
                "POST", api_url, headers=headers, json=body
            ) as response:
                if response.status_code != 200:
                    async for err in _handle_error_response(response):
                        yield err
                    return

                async for event in _parse_stream_response(response, config):
                    yield event

    except httpx.ConnectError as e:
        logger.error(f"Connection error to {api_url}: {e}")
        yield {
            "type": "error",
            "error": f"无法连接 AI API ({api_url}): {str(e)}。请检查网络连接或配置 HTTPS_PROXY 代理。",
        }
    except httpx.TimeoutException:
        logger.error(f"Timeout connecting to {api_url}")
        yield {
            "type": "error",
            "error": f"连接 AI API 超时 ({api_url})。请检查网络连接或配置 HTTPS_PROXY 代理。",
        }
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        yield {"type": "error", "error": f"请求 AI API 异常: {str(e)}"}


def _build_auth_header(api_key: str) -> str:
    """构建认证头"""
    if not api_key.startswith("Bearer ") and not api_key.startswith("sk-"):
        return f"Bearer {api_key}"
    return api_key


def _build_request_body(request: ChatRequest, model: str, config) -> Dict[str, Any]:
    """构建请求体，根据模型特性添加相应参数"""
    body = {
        "model": model,
        "messages": [{"role": m.role, "content": m.content} for m in request.messages],
        "temperature": config.temperature,
        "max_tokens": config.max_tokens,
        "stream": request.stream,
    }

    # 只有支持思考参数的模型才需要传递
    if should_use_thinking_param(model) and request.enable_thinking is not None:
        body["chat_template_kwargs"] = {"enable_thinking": request.enable_thinking}
        logger.debug(
            f"Added enable_thinking={request.enable_thinking} for model {model}"
        )

    return body


def _get_proxy_url() -> Optional[str]:
    """获取代理 URL"""
    return (
        os.getenv("HTTPS_PROXY")
        or os.getenv("https_proxy")
        or os.getenv("HTTP_PROXY")
        or os.getenv("http_proxy")
    )


async def _handle_error_response(
    response: httpx.Response,
) -> AsyncGenerator[Dict[str, Any], None]:
    """处理错误响应"""
    error_body = await response.aread()
    error_text = error_body.decode("utf-8", errors="replace")
    error_message = f"HTTP {response.status_code}"

    try:
        error_json = json.loads(error_text)
        if error_json.get("error", {}).get("message"):
            error_message = error_json["error"]["message"]
    except Exception:
        pass

    logger.error(f"API error: {error_message}")
    yield {"type": "error", "error": error_message}


async def _parse_stream_response(
    response: httpx.Response, config
) -> AsyncGenerator[Dict[str, Any], None]:
    """解析流式响应，处理推理内容"""
    in_think_block = False
    think_started = False

    async for line in response.aiter_lines():
        if not line.startswith("data:"):
            continue

        # 处理 data: {...} 或 data:{...} 格式
        data = line[5:].strip()
        if not data or data == "[DONE]":
            if in_think_block:
                yield {"type": "chunk", "content": "", "content_type": "think_end"}
            yield {"type": "done"}
            return

        try:
            parsed = json.loads(data)

            # 检查完成原因
            finish_reason = parsed.get("choices", [{}])[0].get("finish_reason")
            if finish_reason in ("stop", "eos_token", "length"):
                if in_think_block:
                    yield {"type": "chunk", "content": "", "content_type": "think_end"}
                yield {"type": "done"}
                return

            delta = parsed.get("choices", [{}])[0].get("delta", {})

            # 处理推理内容
            reasoning_content = delta.get(config.reasoning_field)
            if reasoning_content:
                if not think_started:
                    think_started = True
                    in_think_block = True
                    yield {
                        "type": "chunk",
                        "content": "",
                        "content_type": "think_start",
                    }
                yield {
                    "type": "chunk",
                    "content": reasoning_content,
                    "content_type": "think",
                }

            # 处理普通内容
            delta_content = delta.get("content", "")
            if delta_content:
                # 如果之前有推理内容，现在有普通内容，说明思考结束
                if think_started and in_think_block and not reasoning_content:
                    in_think_block = False
                    yield {"type": "chunk", "content": "", "content_type": "think_end"}

                yield {
                    "type": "chunk",
                    "content": delta_content,
                    "content_type": "content",
                }

        except json.JSONDecodeError:
            continue
