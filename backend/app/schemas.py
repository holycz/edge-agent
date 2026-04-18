from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class ChatMessage(BaseModel):
    role: str
    content: str


class PageCookies(BaseModel):
    cookies: Optional[str] = None
    localStorage: Optional[Dict[str, Any]] = None
    sessionStorage: Optional[Dict[str, Any]] = None
    url: Optional[str] = None
    domain: Optional[str] = None


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    stream: bool = True
    enable_thinking: Optional[bool] = None
    page_cookies: Optional[PageCookies] = None


class ContextRequest(BaseModel):
    content: str
    metadata: Optional[dict] = None
    question: str
    action: Optional[str] = None


class ConfigUpdate(BaseModel):
    use_context: Optional[bool] = None
    context_length: Optional[int] = None
    max_total_chars: Optional[int] = None
    max_history_rounds: Optional[int] = None
    my_name: Optional[str] = None
    other_info: Optional[str] = None
