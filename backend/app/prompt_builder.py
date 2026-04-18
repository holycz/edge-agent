"""
提示词构建器
处理不同类型的提示词构建逻辑
"""

from typing import List, Dict, Any, Optional
from app.config import get_env, DEFAULT_MAX_TOTAL_CHARS, DEFAULT_MAX_HISTORY_ROUNDS
from app.prompts import FEATURE_PROMPTS


class PromptBuilder:
    """提示词构建器"""

    def __init__(
        self,
        max_total_chars: int = DEFAULT_MAX_TOTAL_CHARS,
        max_history_rounds: int = DEFAULT_MAX_HISTORY_ROUNDS,
    ):
        self.max_total_chars = max_total_chars
        self.max_history_rounds = max_history_rounds
        self.messages: List[Dict[str, str]] = []

    def build(
        self,
        action: Optional[str] = None,
        selected_text: str = "",
        page_content: str = "",
        page_metadata: Dict[str, Any] = None,
        user_question: str = "",
        conversation_history: List[Dict[str, str]] = None,
    ) -> "PromptBuilder":
        """根据 action 构建提示词"""
        page_metadata = page_metadata or {}
        conversation_history = conversation_history or []

        # 页面总结类功能
        if action in ("summarizePage", "summarizeLeaderComments") and page_content:
            self._build_page_summary(action, page_content)
        # 文本处理类功能
        elif action in ("summarize", "rewrite", "proofread") and selected_text:
            self._build_text_processing(action, selected_text)
        # 对话问答类
        elif user_question:
            self._build_conversation(
                user_question, page_content, page_metadata, conversation_history
            )
        else:
            # 纯历史对话
            self._add_history(conversation_history)

        # 截断处理
        self._truncate_if_needed()

        return self

    def _build_page_summary(self, action: str, page_content: str) -> None:
        """构建页面总结提示词"""
        feature = FEATURE_PROMPTS.get(action)
        if not feature:
            return

        system_prompt = self._get_system_prompt(feature)

        if action == "summarizeLeaderComments":
            system_prompt = self._inject_user_info(system_prompt)

        self.messages.append(
            {"role": "system", "content": f"{system_prompt}\n\n{page_content}"}
        )

    def _build_text_processing(self, action: str, selected_text: str) -> None:
        """构建文本处理提示词（润色、稽核等）"""
        feature = FEATURE_PROMPTS.get(action)
        if not feature:
            return

        self.messages.append({"role": "system", "content": feature["system_prompt"]})
        self.messages.append({"role": "user", "content": selected_text})

    def _build_conversation(
        self,
        user_question: str,
        page_content: str,
        page_metadata: Dict[str, Any],
        conversation_history: List[Dict[str, str]],
    ) -> None:
        """构建对话提示词"""
        if page_content:
            self._add_page_context(page_content, page_metadata)

        self._add_history(conversation_history)
        self.messages.append({"role": "user", "content": user_question})

    def _add_page_context(
        self, page_content: str, page_metadata: Dict[str, Any]
    ) -> None:
        """添加页面上下文"""
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

        self.messages.append(
            {
                "role": "system",
                "content": (
                    f"以下是一篇网页的内容，用户的提问可能基于这些内容：\n\n"
                    f"--- 网页内容 ---\n{context_header}\n{page_content}\n--- 内容结束 ---\n\n{instructions}"
                ),
            }
        )

    def _add_history(self, conversation_history: List[Dict[str, str]]) -> None:
        """添加历史对话"""
        self.messages.extend(conversation_history[-self.max_history_rounds * 2 :])

    def _get_system_prompt(self, feature: Dict[str, Any]) -> str:
        """获取系统提示词"""
        return feature.get("system_prompt_template") or feature.get("system_prompt", "")

    def _inject_user_info(self, system_prompt: str) -> str:
        """注入用户信息（用于领导批示总结）"""
        my_name = get_env("MY_NAME")
        other_info = get_env("OTHER_INFO")

        user_info = ""
        if my_name:
            user_info = f"我的姓名：{my_name}"
        if other_info:
            if user_info:
                user_info += "；"
            user_info += other_info

        if not user_info:
            raise ValueError(
                "请先在后台配置个人身份信息（MY_NAME / OTHER_INFO），以便准确识别相关批示。"
            )

        return system_prompt.replace("{USER_INFO}", user_info)

    def _truncate_if_needed(self) -> None:
        """如果消息总长度超过限制，进行截断"""
        total_chars = sum(len(m.get("content", "")) for m in self.messages)

        if total_chars <= self.max_total_chars:
            return

        # 分离系统消息和其他消息
        system_msgs = [m for m in self.messages if m.get("role") == "system"]
        other_msgs = [m for m in self.messages if m.get("role") != "system"]

        system_chars = sum(len(m.get("content", "")) for m in system_msgs)
        remaining = self.max_total_chars - system_chars

        # 如果剩余空间不足，压缩系统消息
        if remaining < 1000:
            system_msgs = [
                {**m, "content": m["content"][: int(self.max_total_chars * 0.6)]}
                for m in system_msgs
            ]
            system_chars = sum(len(m.get("content", "")) for m in system_msgs)
            remaining = self.max_total_chars - system_chars
            other_msgs = other_msgs[-2:]

        # 从后往前添加消息，直到达到限制
        result = list(system_msgs)
        current_chars = system_chars

        for i in range(len(other_msgs) - 1, -1, -1):
            msg_chars = len(other_msgs[i].get("content", ""))

            if current_chars + msg_chars <= self.max_total_chars:
                result.insert(len(system_msgs), other_msgs[i])
                current_chars += msg_chars
            else:
                # 尝试部分添加
                available = self.max_total_chars - current_chars - 100
                if available > 200:
                    truncated = (
                        other_msgs[i]["content"][:available] + "\n...(内容已截断)"
                    )
                    result.insert(
                        len(system_msgs), {**other_msgs[i], "content": truncated}
                    )
                break

        self.messages = result

    def get_messages(self) -> List[Dict[str, str]]:
        """获取构建好的消息列表"""
        return self.messages
