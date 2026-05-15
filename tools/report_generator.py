"""
报告生成模块：生成分类统计报告

遍历分类结果，统计每个类别的文件数量和总大小。
支持输出到控制台或写入文件。
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional


def _format_size(size_bytes: int) -> str:
    if size_bytes < 0:
        return "0 B"
    value = float(size_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(value) < 1024.0:
            return f"{value:.2f} {unit}"
        value /= 1024.0
    return f"{value:.2f} PB"


def _summarize_files(files: List[Path]) -> tuple[int, int]:
    count = 0
    total = 0
    for f in files:
        try:
            total += f.stat().st_size
            count += 1
        except OSError:
            pass
    return count, total


def generate_report(
    classified: Dict[str, List[Path]],
    sort_by: str = "count",
) -> str:
    """生成分类统计报告文本。"""
    stats: List[tuple[str, int, int]] = []
    for cat, files in classified.items():
        count, total = _summarize_files(files)
        stats.append((cat, count, total))
    # 排序
    if sort_by == "count":
        stats.sort(key=lambda x: (-x[1], x[0]))
    elif sort_by == "name":
        stats.sort(key=lambda x: x[0])
    elif sort_by == "size":
        stats.sort(key=lambda x: (-x[2], x[0]))
    else:
        stats.sort(key=lambda x: (-x[1], x[0]))

    total_files = sum(s[1] for s in stats)
    total_size = sum(s[2] for s in stats)

    lines: List[str] = []
    lines.append(f"{'类别':<12} {'数量':>6} {'大小':>12}")
    lines.append("-" * 34)
    for cat_name, count, size_bytes in stats:
        if count == 0:
            lines.append(f"{cat_name:<12} {count:>6} {'-':>12}")
        else:
            lines.append(f"{cat_name:<12} {count:>6} {_format_size(size_bytes):>12}")
    lines.append("-" * 34)
    lines.append(f"{'总计':<12} {total_files:>6} {_format_size(total_size):>12}")
    return "\n".join(lines)


def write_report(
    classified: Dict[str, List[Path]],
    output_path: Path,
    sort_by: str = "count",
) -> None:
    """将报告写入文件。"""
    report = generate_report(classified, sort_by=sort_by)
    output_path.write_text(report, encoding="utf-8")


def print_report(
    report: str,
    output_path: Optional[Path] = None,
) -> None:
    """输出报告到控制台或文件。"""
    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(report, encoding="utf-8")
    else:
        print(report)
