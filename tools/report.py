"""分类统计报告生成工具。"""

from pathlib import Path
from typing import Dict, List, Optional


def format_size(size_bytes: int) -> str:
    """将字节数转为人类可读格式（B / KB / MB / GB / TB）。"""
    if size_bytes < 0:
        raise ValueError(f"size_bytes must be non-negative, got {size_bytes}")

    units = ["B", "KB", "MB", "GB", "TB"]
    value = float(size_bytes)
    unit_idx = 0

    while value >= 1024 and unit_idx < len(units) - 1:
        value /= 1024.0
        unit_idx += 1

    if unit_idx == 0:
        return f"{int(value)} B"
    return f"{value:.2f} {units[unit_idx]}"


def generate_report(categorized: Dict[str, List[Path]]) -> str:
    """按类别分组生成统计报告。

    每组列出文件数量和总大小（人类可读格式），按文件数降序排列。

    Args:
        categorized: 类别名 → 文件路径列表 的映射。

    Returns:
        格式化后的报告字符串。
    """
    if not categorized:
        return "（无文件）"

    # 收集每组的统计信息
    stats: List[tuple[int, str, int]] = []  # (文件数, 类别名, 总字节数)
    for category, files in categorized.items():
        if not files:
            stats.append((0, category, 0))
            continue
        total_bytes = sum(f.stat().st_size for f in files if f.is_file())
        stats.append((len(files), category, total_bytes))

    # 按文件数降序排列
    stats.sort(key=lambda x: (-x[0], x[1]))

    lines: List[str] = []
    width = max(len(s[1]) for s in stats) if stats else 0

    for count, category, total_bytes in stats:
        size_str = format_size(total_bytes)
        lines.append(f"  {category:<{width}}  {count:>5} 个文件  {size_str:>10}")

    total_files = sum(s[0] for s in stats)
    total_bytes = sum(s[2] for s in stats)
    separator = "-" * (width + 28)
    lines.append(separator)
    lines.append(f"  {'合计':<{width}}  {total_files:>5} 个文件  {format_size(total_bytes):>10}")

    return "\n".join(lines)


def print_report(report: str, output_path: Optional[Path] = None) -> None:
    """输出报告。

    Args:
        report: 报告内容字符串。
        output_path: 若提供，将报告写入该文件；否则打印到控制台。
    """
    if output_path is not None:
        output_path.write_text(report, encoding="utf-8")
    else:
        print(report)
