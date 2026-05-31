"""准确的 Token 计数工具（基于 tiktoken cl100k_base，与 DeepSeek 兼容）"""

import tiktoken

_ENCODING = None

def _get_enc():
    global _ENCODING
    if _ENCODING is None:
        _ENCODING = tiktoken.get_encoding("cl100k_base")
    return _ENCODING


def count_tokens(text: str) -> int:
    """返回文本的实际 token 数（与 DeepSeek API 一致）"""
    if not text:
        return 0
    return len(_get_enc().encode(text, disallowed_special=()))
