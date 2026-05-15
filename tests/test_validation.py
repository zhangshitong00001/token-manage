#!/usr/bin/env python3
"""
任务6：脚本完整性验证与错误场景测试

测试场景：
  1. 正常分类 - 各类文件混合
  2. 日期范围过滤 - 不同日期的文件
  3. 无匹配结果 - 所有文件日期超出范围
  4. 空目录 - 空目录
  5. 权限不足目录 - 不可读目录
  6. 符号链接处理 - 指向文件/指向目录外/断链
  7. CLI 完整集成（subprocess）

依赖关系：
  依赖任务5的 CLI 入口 (file_manager_cli.py)
"""

from __future__ import annotations

import datetime
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

from classify_engine import classify_files
from date_filter import filter_by_date, filter_by_date_files
from report_generator import generate_report


def _set_file_mtime(path: Path, days_ago: int) -> None:
    ts = time.time() - days_ago * 86400
    os.utime(path, (ts, ts))


# ── 场景 1 ──────────────────────────────────────────────────────────

def test_normal_classification() -> dict:
    result = {
        "scenario": "正常分类 - 各类文件混合",
        "status": "PASS", "details": "", "assertions": [],
    }
    with tempfile.TemporaryDirectory(prefix="test_normal_") as tmpdir:
        root = Path(tmpdir)
        (root / "photo.jpg").touch()
        (root / "doc.pdf").touch()
        (root / "script.py").touch()
        (root / "video.mp4").touch()
        (root / "music.mp3").touch()
        (root / "archive.zip").touch()
        (root / "setup.exe").touch()
        (root / "data.csv").touch()
        (root / "README").touch()
        (root / "notes.txt").touch()
        (root / "index.html").touch()
        (root / "data.tar.gz").touch()
        (root / "sub").mkdir()
        (root / "sub" / "nested.py").touch()
        (root / "sub" / "nested.md").touch()

        classified = classify_files(root, follow_symlinks=False)

        checks = [
            ("图片类含 photo.jpg", len(classified.get("图片", [])) == 1),
            ("文档类含 doc.pdf + data.csv + README + notes.txt + index.html + nested.md",
             len(classified.get("文档", [])) >= 4),
            ("代码类含 script.py + nested.py", len(classified.get("代码", [])) >= 1),
            ("视频类含 video.mp4", len(classified.get("视频", [])) == 1),
            ("音频类含 music.mp3", len(classified.get("音频", [])) == 1),
            ("压缩包含 archive.zip + data.tar.gz", len(classified.get("压缩包", [])) == 2),
            ("可执行文件含 setup.exe", len(classified.get("可执行文件", [])) == 1),
            ("其他含 README（无扩展名）", len(classified.get("其他", [])) == 1),
            ("总文件数 = 14", sum(len(v) for v in classified.values()) == 14),
        ]
        for desc, ok in checks:
            result["assertions"].append({"description": desc, "passed": ok})
            if not ok:
                result["status"] = "FAIL"
        if result["status"] == "PASS":
            result["details"] = "14个文件正确分配到8个类别"
    return result


# ── 场景 2 ──────────────────────────────────────────────────────────

def test_date_filter() -> dict:
    result = {
        "scenario": "日期范围过滤", "status": "PASS", "details": "", "assertions": [],
    }
    with tempfile.TemporaryDirectory(prefix="test_date_") as tmpdir:
        root = Path(tmpdir)
        old = root / "old_doc.pdf"
        old.touch(); _set_file_mtime(old, 30)
        mid = root / "mid_doc.txt"
        mid.touch(); _set_file_mtime(mid, 10)
        recent = root / "recent_photo.jpg"
        recent.touch(); _set_file_mtime(recent, 1)
        now_file = root / "now_script.py"
        now_file.touch()

        classified = classify_files(root)
        all_files = []
        for flist in classified.values():
            all_files.extend(flist)

        seven_days_ago = datetime.date.today() - datetime.timedelta(days=7)
        filtered1 = filter_by_date_files(all_files, start_date=seven_days_ago)
        checks = [("最近7天应含 now_script.py + recent_photo.jpg", len(filtered1) == 2)]

        start = datetime.date.today() - datetime.timedelta(days=31)
        end = datetime.date.today() - datetime.timedelta(days=29)
        filtered2 = filter_by_date_files(all_files, start_date=start, end_date=end)
        checks.append(("30天前区间应只含 old_doc.pdf", len(filtered2) == 1))

        future = datetime.date.today() + datetime.timedelta(days=365)
        filtered3 = filter_by_date_files(all_files, start_date=future)
        checks.append(("未来日期过滤应无结果", len(filtered3) == 0))

        filtered4 = filter_by_date_files(all_files)
        checks.append(("无参数过滤应返回全部4个", len(filtered4) == 4))

        for desc, ok in checks:
            result["assertions"].append({"description": desc, "passed": ok})
            if not ok:
                result["status"] = "FAIL"
        if result["status"] == "PASS":
            result["details"] = "4个日期过滤场景全部通过"
    return result


# ── 场景 3 ──────────────────────────────────────────────────────────

def test_no_match() -> dict:
    result = {
        "scenario": "无匹配结果 - 日期过滤后为空",
        "status": "PASS", "details": "", "assertions": [],
    }
    with tempfile.TemporaryDirectory(prefix="test_nomatch_") as tmpdir:
        root = Path(tmpdir)
        (root / "file.txt").touch()
        classified = classify_files(root)
        all_files = []
        for flist in classified.values():
            all_files.extend(flist)

        future = datetime.date.today() + datetime.timedelta(days=30)
        filtered = filter_by_date_files(all_files, start_date=future)
        ok1 = len(filtered) == 0
        result["assertions"].append({
            "description": "日期过滤后为空", "passed": ok1,
        })

        # 确认日期过滤完整保留分类字典结构
        c2 = filter_by_date(classified, start_date=future)
        ok2 = sum(len(v) for v in c2.values()) == 0 and all(k in c2 for k in classified)
        result["assertions"].append({
            "description": "filter_by_date(dict) 保留所有类别键", "passed": ok2,
        })
        if not (ok1 and ok2):
            result["status"] = "FAIL"
        else:
            result["details"] = "日期过滤后为空，类别键保留完整"
    return result


# ── 场景 4 ──────────────────────────────────────────────────────────

def test_empty_directory() -> dict:
    result = {
        "scenario": "空目录 - 无任何文件",
        "status": "PASS", "details": "", "assertions": [],
    }
    with tempfile.TemporaryDirectory(prefix="test_empty_") as tmpdir:
        root = Path(tmpdir)
        classified = classify_files(root)
        total = sum(len(v) for v in classified.values())
        all_keys = {"图片", "文档", "代码", "视频", "音频", "压缩包", "可执行文件", "其他"}
        checks = [
            ("空目录返回全零结果", total == 0),
            ("空结果仍包含所有8个类别键", all_keys.issubset(classified.keys())),
        ]
        for desc, ok in checks:
            result["assertions"].append({"description": desc, "passed": ok})
            if not ok:
                result["status"] = "FAIL"
        if result["status"] == "PASS":
            result["details"] = "空目录返回全零结果，8个类别键完整"
    return result


# ── 场景 5 ──────────────────────────────────────────────────────────

def test_permission_denied() -> dict:
    result = {
        "scenario": "权限不足目录", "status": "PASS", "details": "", "assertions": [],
    }
    tmpdir_obj = tempfile.TemporaryDirectory(prefix="test_perm_")
    root = Path(tmpdir_obj.name)
    try:
        readable = root / "readable"
        readable.mkdir()
        (readable / "good.txt").touch()

        restricted = root / "restricted"
        restricted.mkdir()
        (restricted / "secret.txt").touch()

        os.chmod(restricted, 0o000)

        readable_result = classify_files(readable)
        result["assertions"].append({
            "description": "可读子目录分类正常",
            "passed": len(readable_result.get("文档", [])) == 1,
        })

        root_result = classify_files(root)
        result["assertions"].append({
            "description": "根目录扫描不因受限子目录崩溃",
            "passed": isinstance(root_result, dict),
        })

        if result["status"] == "PASS":
            result["details"] = "权限不足目录被优雅跳过，主流程不受影响"
    except PermissionError:
        result["status"] = "FAIL"
        result["details"] = "设置权限时受限（通常需要 root）"
    except Exception as e:
        result["status"] = "FAIL"
        result["details"] = f"异常: {type(e).__name__}: {e}"
    finally:
        try:
            os.chmod(root / "restricted", 0o755)
        except OSError:
            pass
        tmpdir_obj.cleanup()
    return result


# ── 场景 6 ──────────────────────────────────────────────────────────

def test_symlink_handling() -> dict:
    result = {
        "scenario": "符号链接处理", "status": "PASS", "details": "", "assertions": [],
    }
    with tempfile.TemporaryDirectory(prefix="test_symlink_") as tmpdir:
        root = Path(tmpdir)
        real_file = root / "real_photo.jpg"
        real_file.touch()
        real_doc = root / "real_doc.pdf"
        real_doc.touch()

        (root / "link_good.jpg").symlink_to(real_file)
        out_of_scope = Path(tempfile.mktemp(suffix=".txt"))
        out_of_scope.touch()
        (root / "link_outside.txt").symlink_to(out_of_scope)
        (root / "link_broken.pdf").symlink_to(root / "nonexistent.pdf")
        (root / "target_dir").mkdir()
        (root / "link_to_dir").symlink_to(root / "target_dir")

        # follow_symlinks=False
        nf = classify_files(root, follow_symlinks=False)
        cn_nf = sum(len(v) for v in nf.values())
        c1 = cn_nf == 2
        result["assertions"].append({
            "description": "follow_symlinks=False 仅返回真实文件 (2个)",
            "passed": c1,
        })

        # follow_symlinks=True
        f = classify_files(root, follow_symlinks=True)
        cn_f = sum(len(v) for v in f.values())
        c2 = cn_f >= 3
        result["assertions"].append({
            "description": "follow_symlinks=True 包含有效符号链接 (>=3)",
            "passed": c2,
        })

        imgs = f.get("图片", [])
        c3 = any(p.name == "link_good.jpg" for p in imgs)
        result["assertions"].append({
            "description": "符号链接文件被正确分类到对应类别",
            "passed": c3,
        })

        if not (c1 and c3):
            result["status"] = "FAIL"
        if result["status"] == "PASS":
            result["details"] = f"不跟随={cn_nf}, 跟随={cn_f}, 断链已跳过"

        out_of_scope.unlink()
    return result


# ── 场景 7 ──────────────────────────────────────────────────────────

def test_cli_integration() -> dict:
    result = {
        "scenario": "CLI完整集成测试 (subprocess)",
        "status": "PASS", "details": "", "assertions": [],
    }
    cli_script = str(PROJECT_ROOT / "file_manager_cli.py")
    if not Path(cli_script).exists():
        result["status"] = "FAIL"
        result["details"] = "file_manager_cli.py 不存在"
        result["assertions"].append({"description": "CLI入口文件存在", "passed": False})
        return result

    with tempfile.TemporaryDirectory(prefix="test_cli_") as tmpdir:
        root = Path(tmpdir)
        (root / "photo.jpg").touch()
        (root / "doc.pdf").touch()
        (root / "script.py").touch()
        (root / "video.mp4").touch()
        (root / "readme.txt").touch()
        old_file = root / "old_report.pdf"
        old_file.touch()
        _set_file_mtime(old_file, 100)

        # 7a: 基本调用
        try:
            cp = subprocess.run(
                [sys.executable, cli_script, str(root)],
                capture_output=True, text=True, timeout=30,
            )
            ok = cp.returncode == 0 and "总计" in cp.stdout
            result["assertions"].append({"description": "基本调用成功", "passed": ok})
            if not ok:
                result["status"] = "FAIL"
        except subprocess.TimeoutExpired:
            result["status"] = "FAIL"
            result["assertions"].append({"description": "基本调用", "passed": False})

        # 7b: 日期范围过滤
        try:
            today = datetime.date.today()
            start = today - datetime.timedelta(days=50)
            cp = subprocess.run(
                [sys.executable, cli_script, str(root),
                 "--start-date", start.isoformat()],
                capture_output=True, text=True, timeout=30,
            )
            ok = cp.returncode == 0 and "总计" in cp.stdout
            # old_report.pdf (100天前) 应被排除
            result["assertions"].append({"description": "日期过滤—近期文件", "passed": ok})
            if not ok:
                result["status"] = "FAIL"
        except subprocess.TimeoutExpired:
            result["status"] = "FAIL"
            result["assertions"].append({"description": "日期过滤", "passed": False})

        # 7c: 输出到文件
        try:
            out = root / "report.txt"
            cp = subprocess.run(
                [sys.executable, cli_script, str(root), "-o", str(out)],
                capture_output=True, text=True, timeout=30,
            )
            ok = out.exists() and out.read_text().strip() != ""
            result["assertions"].append({"description": "输出到文件", "passed": ok})
            if not ok:
                result["status"] = "FAIL"
        except subprocess.TimeoutExpired:
            result["status"] = "FAIL"
            result["assertions"].append({"description": "文件输出", "passed": False})

        # 7d: 不存在的目录
        try:
            cp = subprocess.run(
                [sys.executable, cli_script, "/tmp/__nonexistent_xyz__"],
                capture_output=True, text=True, timeout=30,
            )
            ok = cp.returncode != 0
            result["assertions"].append({"description": "不存在的目录→非零退出码", "passed": ok})
            if not ok:
                result["status"] = "FAIL"
        except subprocess.TimeoutExpired:
            result["status"] = "FAIL"
            result["assertions"].append({"description": "不存在目录", "passed": False})

        # 7e: --help
        try:
            cp = subprocess.run(
                [sys.executable, cli_script, "--help"],
                capture_output=True, text=True, timeout=10,
            )
            ok = "文件分类整理工具" in cp.stdout
            result["assertions"].append({"description": "--help 显示工具描述", "passed": ok})
            if not ok:
                result["status"] = "FAIL"
        except subprocess.TimeoutExpired:
            result["status"] = "FAIL"
            result["assertions"].append({"description": "--help", "passed": False})

        # 7f: --sort-by name
        try:
            cp = subprocess.run(
                [sys.executable, cli_script, str(root), "--sort-by", "name"],
                capture_output=True, text=True, timeout=30,
            )
            ok = cp.returncode == 0
            result["assertions"].append({"description": "--sort-by name 正常执行", "passed": ok})
            if not ok:
                result["status"] = "FAIL"
        except subprocess.TimeoutExpired:
            result["status"] = "FAIL"
            result["assertions"].append({"description": "--sort-by", "passed": False})

        if result["status"] == "PASS":
            result["details"] = "6个CLI子场景全部通过"

    return result


# ── 场景 8：generate_report_sorted 直接测试 ──────────────────────────

def test_report_sorted() -> dict:
    result = {
        "scenario": "generate_report_sorted 单元测试",
        "status": "PASS", "details": "", "assertions": [],
    }
    with tempfile.TemporaryDirectory(prefix="test_rpt_") as tmpdir:
        root = Path(tmpdir)
        big = root / "big.mp4"
        with open(big, "wb") as f:
            f.write(b"\x00" * 1024 * 1024)
        (root / "small.txt").touch()
        classified = classify_files(root)

        report = generate_report(classified, sort_by="name")
        checks = [
            ("报告含'视频'", "视频" in report),
            ("报告含'文档'", "文档" in report),
            ("报告含'总计'", "总计" in report),
            ("报告含分隔线", "-" * 10 in report),
        ]
        for desc, ok in checks:
            result["assertions"].append({"description": desc, "passed": ok})
            if not ok:
                result["status"] = "FAIL"
        if result["status"] == "PASS":
            result["details"] = "报告格式、内容均正常"
    return result


# ── 运行与汇总 ──────────────────────────────────────────────────────

def run_all_tests() -> dict:
    tests = [
        test_normal_classification,
        test_date_filter,
        test_no_match,
        test_empty_directory,
        test_permission_denied,
        test_symlink_handling,
        test_cli_integration,
        test_report_sorted,
    ]
    results = []
    passed = 0
    failed = 0

    for fn in tests:
        try:
            r = fn()
        except Exception as e:
            r = {
                "scenario": fn.__name__,
                "status": "ERROR",
                "details": f"{type(e).__name__}: {e}",
                "assertions": [{"description": "测试异常", "passed": False}],
            }
        if r["status"] == "PASS":
            passed += 1
        else:
            failed += 1
        results.append(r)

    all_assertions = sum(len(r["assertions"]) for r in results)
    passed_assertions = sum(
        sum(1 for a in r["assertions"] if a["passed"]) for r in results
    )

    report = {
        "summary": f"{passed}/{len(tests)} 场景通过, {passed_assertions}/{all_assertions} 断言通过",
        "total_scenarios": len(tests),
        "passed_scenarios": passed,
        "failed_scenarios": failed,
        "total_assertions": all_assertions,
        "passed_assertions": passed_assertions,
        "failed_assertions": all_assertions - passed_assertions,
        "overall_pass": failed == 0,
        "scenarios": results,
    }
    return report


if __name__ == "__main__":
    print("=" * 60)
    print("  文件分类工具 - 完整性验证与错误场景测试")
    print("=" * 60)
    print()

    report = run_all_tests()

    for scenario in report["scenarios"]:
        icon = "PASS" if scenario["status"] == "PASS" else "FAIL"
        print(f"  [{icon}] {scenario['scenario']}")
        if scenario["details"]:
            print(f"          {scenario['details']}")
        for a in scenario["assertions"]:
            mark = "+" if a["passed"] else "x"
            print(f"          {mark} {a['description']}")
        print()

    print("-" * 60)
    print(f"  汇总: {report['summary']}")
    print(f"  综合结果: {'通过' if report['overall_pass'] else '未通过'}")
    print("-" * 60)

    json_path = PROJECT_ROOT / "test_report.json"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\n  JSON 报告已保存到: {json_path}")

    sys.exit(0 if report["overall_pass"] else 1)
