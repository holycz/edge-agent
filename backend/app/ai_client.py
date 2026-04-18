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

    if request.enable_thinking is False:
        body["chat_template_kwargs"] = {"enable_thinking": False}

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

                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue

                    # 处理 data: {...} 或 data:{...} 格式
                    data = line[5:].strip()
                    if not data or data == "[DONE]":
                        yield {"type": "done"}
                        return

                    try:
                        parsed = json.loads(data)

                        # 检查 finish_reason 标记结束（九天 API）
                        finish_reason = parsed.get("choices", [{}])[0].get(
                            "finish_reason"
                        )
                        if finish_reason == "stop" or finish_reason == "eos_token":
                            yield {"type": "done"}
                            return

                        content = (
                            parsed.get("choices", [{}])[0]
                            .get("delta", {})
                            .get("content", "")
                        )
                        if not content:
                            continue

                        while content:
                            if not in_think_block:
                                think_start = content.find(" <think> ")
                                if think_start == -1:
                                    if content:
                                        yield {
                                            "type": "chunk",
                                            "content": content,
                                            "content_type": "content",
                                        }
                                    break
                                else:
                                    if think_start > 0:
                                        before = content[:think_start]
                                        yield {
                                            "type": "chunk",
                                            "content": before,
                                            "content_type": "content",
                                        }
                                    in_think_block = True
                                    yield {
                                        "type": "chunk",
                                        "content": "",
                                        "content_type": "think_start",
                                    }
                                    content = content[think_start + 7 :]
                            else:
                                think_end = content.find("回答：")
                                if think_end == -1:
                                    if content:
                                        yield {
                                            "type": "chunk",
                                            "content": content,
                                            "content_type": "think",
                                        }
                                    break
                                else:
                                    think_text = content[:think_end]
                                    if think_text:
                                        yield {
                                            "type": "chunk",
                                            "content": think_text,
                                            "content_type": "think",
                                        }
                                    yield {
                                        "type": "chunk",
                                        "content": "",
                                        "content_type": "think_end",
                                    }
                                    in_think_block = False
                                    # 跳过 "回答：" 前缀
                                    content = content[think_end + 3 :]
                    except json.JSONDecodeError:
                        continue

                    data = line[6:]
                    if data == "[DONE]":
                        yield {"type": "done"}
                        return

                    try:
                        parsed = json.loads(data)
                        content = (
                            parsed.get("choices", [{}])[0]
                            .get("delta", {})
                            .get("content", "")
                        )
                        if not content:
                            continue

                        while content:
                            if not in_think_block:
                                think_start = content.find("<think>")
                                if think_start == -1:
                                    if content:
                                        yield {
                                            "type": "chunk",
                                            "content": content,
                                            "content_type": "content",
                                        }
                                    break
                                else:
                                    if think_start > 0:
                                        before = content[:think_start]
                                        yield {
                                            "type": "chunk",
                                            "content": before,
                                            "content_type": "content",
                                        }
                                    in_think_block = True
                                    yield {
                                        "type": "chunk",
                                        "content": "",
                                        "content_type": "think_start",
                                    }
                                    content = content[think_start + 7 :]
                            else:
                                think_end = content.find("</think>")
                                if think_end == -1:
                                    if content:
                                        yield {
                                            "type": "chunk",
                                            "content": content,
                                            "content_type": "think",
                                        }
                                    break
                                else:
                                    think_text = content[:think_end]
                                    if think_text:
                                        yield {
                                            "type": "chunk",
                                            "content": think_text,
                                            "content_type": "think",
                                        }
                                    yield {
                                        "type": "chunk",
                                        "content": "",
                                        "content_type": "think_end",
                                    }
                                    in_think_block = False
                                    content = content[think_end + 8 :]
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
