import time
import logging
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
from app.schemas import ChatMessage

logger = logging.getLogger(__name__)


@dataclass
class DialogSession:
    """对话会话"""

    dialog_id: str
    messages: List[ChatMessage] = field(default_factory=list)
    page_context: Optional[str] = None  # 保存页面上下文，供后续对话使用
    created_at: float = field(default_factory=time.time)
    last_accessed: float = field(default_factory=time.time)

    def add_message(self, role: str, content: str) -> None:
        """添加消息到对话历史"""
        self.messages.append(ChatMessage(role=role, content=content))
        self.last_accessed = time.time()

    def set_page_context(self, context: str) -> None:
        """设置页面上下文"""
        self.page_context = context
        self.last_accessed = time.time()

    def get_messages_for_api(self) -> List[ChatMessage]:
        """获取用于 API 调用的消息列表（包含页面上下文作为 system 消息）"""
        result = []
        if self.page_context:
            # 页面上下文作为系统提示词
            result.append(
                ChatMessage(
                    role="system",
                    content=f"以下是你需要参考的网页内容，请基于这些内容回答用户问题：\n\n{self.page_context}",
                )
            )
        result.extend(self.messages)
        return result


class DialogManager:
    """
    对话管理器
    根据 dialogId 管理对话上下文
    """

    def __init__(self, max_session_age: int = 3600, max_sessions: int = 1000):
        """
        Args:
            max_session_age: 会话最大存活时间（秒），默认1小时
            max_sessions: 最大会话数，超过时会清理最旧的
        """
        self._sessions: Dict[str, DialogSession] = {}
        self._max_session_age = max_session_age
        self._max_sessions = max_sessions

    def get_or_create_session(self, dialog_id: str) -> DialogSession:
        """获取或创建对话会话"""
        self._cleanup_expired()

        if dialog_id not in self._sessions:
            logger.info(f"[DialogManager] 创建新会话: {dialog_id}")
            self._sessions[dialog_id] = DialogSession(dialog_id=dialog_id)

        session = self._sessions[dialog_id]
        session.last_accessed = time.time()
        return session

    def _cleanup_expired(self) -> None:
        """清理过期会话"""
        now = time.time()
        expired = [
            dialog_id
            for dialog_id, session in self._sessions.items()
            if now - session.last_accessed > self._max_session_age
        ]
        for dialog_id in expired:
            del self._sessions[dialog_id]
            logger.info(f"[DialogManager] 清理过期会话: {dialog_id}")

        # 如果会话数超过限制，清理最旧的
        if len(self._sessions) > self._max_sessions:
            sorted_sessions = sorted(
                self._sessions.items(), key=lambda x: x[1].last_accessed
            )
            to_remove = len(self._sessions) - self._max_sessions
            for dialog_id, _ in sorted_sessions[:to_remove]:
                del self._sessions[dialog_id]
                logger.info(f"[DialogManager] 清理旧会话: {dialog_id}")


# 全局对话管理器实例
dialog_manager = DialogManager()
