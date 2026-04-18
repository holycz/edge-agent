import httpx
import json
import os
from app.config import get_env
from app.schemas import ChatRequest


async def stream_chat(request: ChatRequest, page_cookies: dict = None):
    if page_cookies:
        pass
    model = get_env("MODEL")
    api_url_raw = get_env("API_URL")
    api_url = (
        api_url_raw.rstrip("/") if api_url_raw.endswith("/") else api_url_raw
    ) + "/chat/completions"

    auth_header = get_env("API_KEY")
    if not auth_header.startswith("Bearer ") and not auth_header.startswith("sk-"):
        auth_header = f"Bearer {auth_header}"

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "identity",
        "Authorization": auth_header,
    }

    body = {
        "model": model,
        "messages": [{"role": m.role, "content": m.content} for m in request.messages],
        "temperature": 0.7,
        "max_tokens": 2048,
        "stream": True,
    }

    # 根据模型类型决定是否传递 enable_thinking 参数
    # 只有部分模型（如 Qwen3）支持此参数
    if request.enable_thinking is not None:
        body["chat_template_kwargs"] = {"enable_thinking": request.enable_thinking}

    proxy_url = (
        os.getenv("HTTPS_PROXY")
        or os.getenv("https_proxy")
        or os.getenv("HTTP_PROXY")
        or os.getenv("http_proxy")
        or None
    )

    try:
        async with httpx.AsyncClient(timeout=120.0, proxy=proxy_url) as client:
            async with client.stream(
                "POST", api_url, headers=headers, json=body
            ) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    error_text = error_body.decode("utf-8", errors="replace")
                    error_message = f"HTTP {response.status_code}"
                    try:
                        error_json = json.loads(error_text)
                        if error_json.get("error", {}).get("message"):
                            error_message = error_json["error"]["message"]
                    except Exception:
                        pass
                    yield {"type": "error", "error": error_message}
                    return

                in_think_block = False
                think_started = False

                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue

                    # 处理 data: {...} 或 data:{...} 格式（九天 API 冒号后无空格）
                    data = line[5:].strip()
                    if not data or data == "[DONE]":
                        if in_think_block:
                            yield {"type": "chunk", "content": "", "content_type": "think_end"}
                        yield {"type": "done"}
                        return

                    try:
                        parsed = json.loads(data)

                        # 检查 finish_reason 标记结束
                        finish_reason = parsed.get("choices", [{}])[0].get("finish_reason")
                        if finish_reason in ("stop", "eos_token", "length"):
                            if in_think_block:
                                yield {"type": "chunk", "content": "", "content_type": "think_end"}
                            yield {"type": "done"}
                            return

                        delta = parsed.get("choices", [{}])[0].get("delta", {})
                        
                        content = ""
                        
                        # 优先处理 reasoning_content 字段（标准 OpenAI 推理格式）
                        # 部分模型如 kimi-k2-5-thinking 使用此字段
                        reasoning_content = delta.get("reasoning_content")
                        if reasoning_content:
                            if not think_started:
                                think_started = True
                                in_think_block = True
                                yield {"type": "chunk", "content": "", "content_type": "think_start"}
                            yield {
                                "type": "chunk",
                                "content": reasoning_content,
                                "content_type": "think",
                            }
                        
                        # 处理普通 content 字段
                        delta_content = delta.get("content", "")
                        if delta_content:
                            # 如果之前有 reasoning_content，现在有 content，说明思考结束
                            if think_started and in_think_block and not reasoning_content:
                                in_think_block = False
                                yield {"type": "chunk", "content": "", "content_type": "think_end"}
                            
                            # 输出普通内容
                            yield {
                                "type": "chunk",
                                "content": delta_content,
                                "content_type": "content",
                            }

                    except json.JSONDecodeError:
                        continue

    except httpx.ConnectError as e:
        yield {
            "type": "error",
            "error": f"无法连接 AI API ({api_url}): {str(e)}。请检查网络连接或配置 HTTPS_PROXY 代理。",
        }
    except httpx.TimeoutException:
        yield {
            "type": "error",
            "error": f"连接 AI API 超时 ({api_url})。请检查网络连接或配置 HTTPS_PROXY 代理。",
        }
    except Exception as e:
        yield {"type": "error", "error": f"请求 AI API 异常: {str(e)}"}
