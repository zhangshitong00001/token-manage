#!/usr/bin/env python3
"""文件分类整理工具 - CLI 入口

按文件类型分类指定目录中的文件，支持日期范围过滤和报告输出。

用法:
    python file_manager_cli.py /path/to/dir
    python file_manager_cli.py . --start-date 2025-01-01 --end-date 2025-12-31
    python file_manager_cli.py /path/to/dir -o report.txt --sort-by size

退出码:
    0  - 成功
    1  - 参数错误（目录不存在、日期格式错误等）
    2  - 运行时错误（IO 异常、权限不足等）

依赖关系:
  - classify_engine (任务2: 分类引擎)
  - date_filter     (任务3: 日期过滤)
  - report_generator (任务4: 报告生成)
"""

from __future__ import annotations

import argparse
import datetime
import sys
from pathlib import Path
from typing import Optional, Sequence

from classify_engine import classify_files
from date_filter import filter_by_date as filter_by_date_dict


def _path_type(s: str) -> Path:
    """argparse 类型工厂：将字符串转为 pathlib.Path。"""
    return Path(s)


def _date_type(s: str) -> datetime.date:
    """解析 YYYY-MM-DD 格式的日期字符串。"""
    try:
        return datetime.date.fromisoformat(s)
    except ValueError:
        raise argparse.ArgumentTypeError(
            f"无效日期格式: '{s}'，请使用 YYYY-MM-DD 格式（如 2025-01-15）"
        )


def build_parser() -> argparse.ArgumentParser:
    """构建带完整帮助信息的命令行参数解析器。"""
    parser = argparse.ArgumentParser(
        prog="file_manager_cli",
        description="文件分类整理工具 — 按文件类型分类目录文件，支持日期过滤与统计报告",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""使用示例:
  %(prog)s                                 扫描当前目录
  %(prog)s /home/user/Downloads            扫描指定目录
  %(prog)s . --start-date 2025-01-01       仅统计 2025-01-01 后修改的文件
  %(prog)s /tmp --end-date 2024-12-31      仅统计 2024-12-31 前修改的文件
  %(prog)s /path -o report.txt             输出报告到文件
  %(prog)s /path --sort-by name            按类别名称排序
  %(prog)s /path --start-date 2025-01-01 --end-date 2025-12-31 --sort-by size
  %(prog)s /path --use-ctime               使用 ctime 而非 mtime 过滤
        """,
    )

    parser.add_argument(
        "source_dir",
        type=_path_type,
        default=Path("."),
        nargs="?",
        metavar="SOURCE_DIR",
        help="要扫描的源目录路径（默认: 当前目录 .）",
    )

    parser.add_argument(
        "--start-date",
        type=_date_type,
        metavar="YYYY-MM-DD",
        default=None,
        dest="start_date",
        help="起始日期（包含），仅保留该日期及之后修改的文件",
    )

    parser.add_argument(
        "--end-date",
        type=_date_type,
        metavar="YYYY-MM-DD",
        default=None,
        dest="end_date",
        help="截止日期（包含），仅保留该日期及之前修改的文件",
    )

    parser.add_argument(
        "--use-ctime",
        action="store_true",
        default=False,
        dest="use_ctime",
        help="日期过滤时使用 ctime（状态变更时间）而非 mtime（修改时间）",
    )

    parser.add_argument(
        "-o",
        "--output",
        type=_path_type,
        metavar="PATH",
        default=None,
        dest="output",
        help="将统计报告写入指定文件路径（默认打印到控制台）",
    )

    parser.add_argument(
        "--sort-by",
        type=str,
        choices=["size", "name"],
        default="size",
        dest="sort_by",
        help="报告排序方式: size（按文件总大小降序）或 name（按类别名称字母序，默认: size）",
    )

    parser.add_argument(
        "--follow-symlinks",
        action="store_true",
        default=False,
        dest="follow_symlinks",
        help="跟随符号链接扫描（默认跳过符号链接）",
    )

    return parser


def _human_size(size_bytes: int) -> str:
    """将字节数格式化为人类可读形式，如 12.34 MB。"""
    units = [("B", 0), ("KB", 1), ("MB", 2), ("GB", 3), ("TB", 4)]
    value = float(size_bytes)
    unit_label = units[0][0]
    for label, _ in units[1:]:
        if value < 1024.0:
            break
        value /= 1024.0
        unit_label = label
    return f"{value:.2f} {unit_label}"


def _compute_stats(categorized: dict[str, list[Path]]) -> list[tuple[str, int, int]]:
    """对每个类别计算文件数和总字节数。"""
    stats: list[tuple[str, int, int]] = []
    for cat, files in categorized.items():
        count = len(files)
        byte_size = sum(f.stat().st_size for f in files if f.is_file())
        stats.append((cat, count, byte_size))
    return stats


def _sort_stats(stats: list[tuple[str, int, int]], sort_by: str) -> list[tuple[str, int, int]]:
    """按策略排序统计结果：size 按总大小降序，name 按类别名升序。"""
    if sort_by == "name":
        stats.sort(key=lambda x: x[0])
    else:
        stats.sort(key=lambda x: x[2], reverse=True)
    return stats


def generate_report_sorted(categorized: dict[str, list[Path]], sort_by: str = "size") -> str:
    """生成统计报告，支持按总大小或类别名排序。

    Args:
        categorized: 类别名到文件路径列表的映射。
        sort_by: "size"（按总大小降序）或 "name"（按类别名升序）。

    Returns:
        格式化后的纯文本报告字符串。
    """
    if not categorized:
        return "（无数据）"

    stats = _compute_stats(categorized)
    stats = _sort_stats(stats, sort_by)

    total_files = sum(s[1] for s in stats)
    total_bytes = sum(s[2] for s in stats)

    lines: list[str] = [
        f"总计: {total_files} 个文件, {_human_size(total_bytes)}",
        "",
        f"{'类别':<20} {'文件数':>8} {'总大小':>12}",
        "-" * 42,
    ]
    for cat, count, byte_size in stats:
        lines.append(f"{cat:<20} {count:>8} {_human_size(byte_size):>12}")

    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    """CLI 主入口函数。

    整合分类引擎、日期过滤、报告生成三个模块。
    """
    parser = build_parser()

    try:
        args = parser.parse_args(argv)
    except SystemExit as e:
        return e.code

    try:
        source_dir: Path = args.source_dir

        classified = classify_files(
            source_dir=source_dir,
            follow_symlinks=args.follow_symlinks,
        )

        if args.start_date is not None or args.end_date is not None:
            classified = filter_by_date_dict(
                classified,
                start_date=args.start_date,
                end_date=args.end_date,
                use_ctime=args.use_ctime,
            )

        report = generate_report_sorted(classified, sort_by=args.sort_by)

        if args.output is not None:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(report, encoding="utf-8")
            print(f"报告已写入: {args.output}", file=sys.stderr)
        else:
            print(report)

        return 0

    except NotADirectoryError as e:
        print(f"错误: {e}", file=sys.stderr)
        return 1
    except PermissionError as e:
        print(f"错误: {e}", file=sys.stderr)
        return 2
    except OSError as e:
        print(f"IO 错误: {e}", file=sys.stderr)
        return 2
    except Exception as e:
        print(f"运行时错误: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
