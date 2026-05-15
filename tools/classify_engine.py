"""
核心分类引擎：文件类型识别与分组

遍历 source_dir 下的所有非目录文件，按扩展名映射到预定义类别。
返回 {类别名: [文件路径列表]}。

依赖关系：
  - 依赖任务1的分类映射表（CATEGORY_MAP）
  - 默认内置一份通用映射表，可通过 classify_files(category_map=...) 注入外部表

规范：
  - 使用 pathlib.Path.rglob 遍历
  - 100% 类型标注
  - 处理无扩展名文件和符号链接
  - 返回 dict[str, list[Path]]
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional, Set


# ── 默认分类映射表（通用版）────────────────────────────────────────────
# 可被 classify_files(category_map=...) 覆盖，以配合前序调研任务产出的映射表
DEFAULT_CATEGORY_MAP: Dict[str, Set[str]] = {
    "图片": {
        ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg",
        ".ico", ".tiff", ".tif", ".avif", ".heic", ".heif", ".raw",
        ".psd", ".ai", ".eps",
    },
    "文档": {
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
        ".txt", ".md", ".csv", ".tsv", ".rtf", ".odt", ".ods", ".odp",
        ".epub", ".mobi", ".html", ".htm", ".xml", ".json", ".yaml",
        ".yml", ".toml", ".ini", ".cfg", ".conf", ".log",
    },
    "代码": {
        ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".c", ".cpp",
        ".h", ".hpp", ".hxx", ".cxx", ".cc", ".go", ".rs", ".rb",
        ".php", ".swift", ".kt", ".kts", ".scala", ".clj", ".cljs",
        ".sh", ".bash", ".zsh", ".pl", ".pm", ".lua", ".sql",
        ".css", ".scss", ".less", ".styl", ".vue", ".svelte",
        ".ml", ".mli", ".r", ".dart", ".groovy", ".gradle",
        ".cmake", ".makefile", ".dockerfile",
    },
    "视频": {
        ".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv", ".webm",
        ".m4v", ".ts", ".mts", ".m2ts", ".3gp", ".ogv", ".vob",
        ".mpeg", ".mpg", ".rm", ".rmvb",
    },
    "音频": {
        ".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma", ".m4a",
        ".opus", ".ac3", ".aiff", ".alac", ".mid", ".midi",
        ".ape", ".wv", ".dsf", ".dsd",
    },
    "压缩包": {
        ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar",
        ".tgz", ".tar.gz", ".tar.bz2", ".tar.xz", ".tar.zst",
        ".tar.lz", ".tar.lzma",
        ".zst", ".lz", ".lzma", ".br", ".z", ".arj",
        ".cab", ".iso", ".dmg",
    },
    "可执行文件": {
        ".exe", ".msi", ".bin", ".app", ".deb", ".rpm",
        ".bat", ".cmd", ".ps1", ".com",
    },
}

# ── 与默认映射表互斥的条目备忘 ──────────────────────────────────────
# .json / .xml / .yaml / .yml / .toml / .sh / .html / .htm 同时出现在
# "文档" 和 "代码" 中。用户可按实际项目需求在注入的映射表中决定归属。
# 默认归类策略：保留在上述两个类别中——classify_files 只取第一个匹配的类别。
# 若需严格互斥，请在 category_map 中去重。

_UNCATEGORIZED_LABEL: str = "其他"


def _suffix_key(path: Path) -> str:
    """提取统一小写的扩展名用作字典键。

    对形如 ``.tar.gz``、``.tar.bz2`` 等复合扩展名优先匹配完整后缀。
    返回空字符串表示无扩展名。
    """
    name = path.name
    # 尝试匹配已知的复合扩展名
    for composite in {".tar.gz", ".tar.bz2", ".tar.xz", ".tar.zst", ".tar.lz", ".tar.lzma"}:
        if name.lower().endswith(composite):
            return composite
    return path.suffix.lower()


def classify_files(
    source_dir: Path,
    category_map: Optional[Dict[str, Set[str]]] = None,
    follow_symlinks: bool = False,
) -> Dict[str, List[Path]]:
    """遍历 source_dir，按扩展名将文件分组到预定义类别。

    Parameters
    ----------
    source_dir : Path
        要扫描的根目录。必须是已存在的目录。
    category_map : dict[str, set[str]] | None
        自定义分类映射表，结构同 DEFAULT_CATEGORY_MAP。
        为 None 时使用内置默认表。
    follow_symlinks : bool
        是否跟随符号链接指向的文件。默认 False — 跳过符号链接，
        因为符号链接可能指向目录外或已删除的文件，引入不确定性。

    Returns
    -------
    dict[str, list[Path]]
        分类结果，形如::

            {
                "图片": [Path("a.jpg"), Path("b.png")],
                "文档": [Path("c.pdf")],
                "其他": [Path("no_ext_file")],
            }

        所有类别键保证存在（包括可能为空的类别和 "其他"）。

    Raises
    ------
    NotADirectoryError
        当 source_dir 不存在或不是目录时抛出。
    PermissionError
        当 source_dir 不可读时抛出。

    Examples
    --------
    >>> result = classify_files(Path("/tmp/test"))
    >>> result.keys()
    dict_keys(['图片', '文档', '代码', '视频', '音频', '压缩包', '可执行文件', '其他'])
    """
    # ── 校验输入 ────────────────────────────────────────────────────
    source_dir = source_dir.resolve()
    if not source_dir.exists():
        raise NotADirectoryError(f"路径不存在: {source_dir}")
    if not source_dir.is_dir():
        raise NotADirectoryError(f"不是目录: {source_dir}")

    # ── 准备好映射表 ────────────────────────────────────────────────
    table: Dict[str, Set[str]] = (
        category_map if category_map is not None else DEFAULT_CATEGORY_MAP
    )
    # 确保所有类别键都存在
    category_order: List[str] = [
        "图片", "文档", "代码", "视频", "音频",
        "压缩包", "可执行文件", "其他",
    ]
    # 如果传入的映射表有额外类别，也保留
    extra_categories = [k for k in table if k not in category_order]
    ordered_categories = category_order + extra_categories

    # 预初始化结果字典
    result: Dict[str, List[Path]] = {cat: [] for cat in ordered_categories}
    # 如果 "其他" 不在 ordered_categories 中，补上
    if "其他" not in result:
        result["其他"] = []

    # ── 遍历文件 ────────────────────────────────────────────────────
    for entry in source_dir.rglob("*"):
        # 跳过目录自身（rglob("*") 会返回 source_dir 自身）
        if entry == source_dir:
            continue

        try:
            # 只处理文件（不是目录）
            if not entry.is_file():
                continue

            # 符号链接处理
            if entry.is_symlink():
                if not follow_symlinks:
                    continue
                # follow_symlinks=True: 检查链接目标是否存在
                if not entry.exists():
                    continue

            # 跳过大小为 0 的空文件（可选，视需求决定）
            # if entry.stat().st_size == 0:
            #     continue

        except (OSError, PermissionError) as exc:
            # 遇到权限不足或损坏的链接等，跳过该文件
            continue

        # ── 匹配类别 ────────────────────────────────────────────────
        suffix = _suffix_key(entry)
        assigned: bool = False

        for cat_name in category_order:
            exts = table.get(cat_name, set())
            if suffix in exts:
                result[cat_name].append(entry)
                assigned = True
                break  # 第一个匹配的类别即归属

        if not assigned:
            result["其他"].append(entry)

    return result


# ── 便捷工具 ──────────────────────────────────────────────────────────


def print_classification(result: Dict[str, List[Path]], verbose: bool = False) -> None:
    """友好打印分类结果。

    Parameters
    ----------
    result : dict[str, list[Path]]
        classify_files 的返回值。
    verbose : bool
        True 时打印每个类别的完整文件列表；False 时只打印计数。
    """
    print(f"{'类别':<10}  数量")
    print("-" * 24)
    for cat, files in result.items():
        print(f"{cat:<10}  {len(files)}")
        if verbose and files:
            for f in files:
                print(f"    └─ {f.name}")
    total = sum(len(v) for v in result.values())
    print("-" * 24)
    print(f"{'总计':<10}  {total}")


# ── 演示 / 自测 ───────────────────────────────────────────────────────


if __name__ == "__main__":
    import tempfile

    # 创建临时目录结构用于演示
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        # 创建一些测试文件
        (root / "photo.jpg").touch()
        (root / "doc.pdf").touch()
        (root / "script.py").touch()
        (root / "video.mp4").touch()
        (root / "music.mp3").touch()
        (root / "archive.zip").touch()
        (root / "setup.exe").touch()
        (root / "README").touch()  # 无扩展名
        (root / "data.tar.gz").touch()  # 复合扩展名
        (root / "subdir").mkdir()
        (root / "subdir" / "nested.txt").touch()

        # 符号链接（指向已有文件）
        (root / "link_to_photo.jpg").symlink_to(root / "photo.jpg")

        result = classify_files(root, follow_symlinks=False)
        print_classification(result, verbose=True)
        print()

        # 验证
        assert len(result["图片"]) == 1  # photo.jpg（跳过 link_to_photo.jpg）
        assert len(result["文档"]) == 2  # doc.pdf + nested.txt
        assert len(result["代码"]) == 1  # script.py
        assert len(result["视频"]) == 1  # video.mp4
        assert len(result["音频"]) == 1  # music.mp3
        assert len(result["压缩包"]) == 2  # archive.zip + data.tar.gz
        assert len(result["可执行文件"]) == 1  # setup.exe
        assert len(result["其他"]) == 1  # README（无扩展名）

        print("所有断言通过 ✅")
