"""
Hermes Agent 本地用量同步脚本

从 Hermes Agent 的 state.db 读取会话级别 Token 消耗，汇总写入 system_daily_usage 表。

用法:
  python scripts/sync_hermes_usage.py              # 同步所有未同步的日子
  python scripts/sync_hermes_usage.py --today      # 仅同步今天
  python scripts/sync_hermes_usage.py --date 2026-05-16  # 同步指定日期
  python scripts/sync_hermes_usage.py --backfill   # 回填所有历史数据

环境变量:
  DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
  HERMES_HOME   (默认 ~/.hermes)
"""
import os
import sys
import sqlite3
import argparse
import subprocess
from datetime import date, datetime, timedelta
from pathlib import Path


# ── 配置 ──
HERMES_HOME = Path(os.environ.get("HERMES_HOME", os.path.expanduser("~/.hermes")))
STATE_DB = HERMES_HOME / "state.db"

DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "127.0.0.1"),
    "port": int(os.environ.get("DB_PORT", "5432")),
    "dbname": os.environ.get("DB_NAME", "tokenmanager"),
    "user": os.environ.get("DB_USER", "zhangshitong"),
    "password": os.environ.get("DB_PASSWORD", "He0eDflzZBlu5zv9FD1V7LyA"),
}

# DeepSeek V4 Flash 官方计价 (USD per 1M tokens)
PRICING = {
    "deepseek-v4-flash": {
        "input": 0.35,
        "output": 1.40,
        "cache_read": 0.07,
    },
    "deepseek-v4-pro": {
        "input": 1.20,
        "output": 4.80,
        "cache_read": 0.24,
    },
}

DEFAULT_PRICING = {"input": 0.35, "output": 1.40, "cache_read": 0.07}


def estimate_cost(model: str, input_tokens: int, output_tokens: int, cache_read_tokens: int) -> float:
    """根据模型和 token 数估算费用 (USD)"""
    pricing = PRICING.get(model, DEFAULT_PRICING)
    # input_tokens 是总输入，减去缓存命中数得到实际输入
    non_cache_input = max(0, input_tokens - cache_read_tokens)
    total = (
        non_cache_input * pricing["input"] / 1_000_000
        + cache_read_tokens * pricing["cache_read"] / 1_000_000
        + output_tokens * pricing["output"] / 1_000_000
    )
    return round(total, 6)


def get_hermes_sessions(target_date: date) -> list[dict]:
    """从 Hermes state.db 获取指定日期的会话"""
    if not STATE_DB.exists():
        print(f"❌ Hermes state.db 不存在: {STATE_DB}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(str(STATE_DB))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    start_ts = datetime(target_date.year, target_date.month, target_date.day).timestamp()
    end_ts = start_ts + 86400

    cur.execute("""
        SELECT
            id, started_at, ended_at, model,
            input_tokens, output_tokens, cache_read_tokens,
            api_call_count, tool_call_count,
            estimated_cost_usd, actual_cost_usd
        FROM sessions
        WHERE started_at >= ? AND started_at < ?
          AND (input_tokens > 0 OR output_tokens > 0)
        ORDER BY started_at
    """, (start_ts, end_ts))

    sessions = [dict(row) for row in cur.fetchall()]
    conn.close()
    return sessions


def compute_daily(sessions: list[dict], target_date: date) -> dict:
    """汇总一天的会话数据"""
    result = {
        "stats_date": target_date.isoformat(),
        "total_input_tokens": 0,
        "total_output_tokens": 0,
        "total_cache_read_tokens": 0,
        "total_cache_write_tokens": 0,
        "total_reasoning_tokens": 0,
        "session_count": len(sessions),
        "api_call_count": 0,
        "tool_call_count": 0,
        "estimated_cost_usd": 0.0,
    }

    for s in sessions:
        model = s.get("model") or "deepseek-v4-flash"
        input_tok = int(s.get("input_tokens") or 0)
        output_tok = int(s.get("output_tokens") or 0)
        cache_read = int(s.get("cache_read_tokens") or 0)

        result["total_input_tokens"] += input_tok
        result["total_output_tokens"] += output_tok
        result["total_cache_read_tokens"] += cache_read
        result["api_call_count"] += int(s.get("api_call_count") or 0)
        result["tool_call_count"] += int(s.get("tool_call_count") or 0)

        # 费用估算
        result["estimated_cost_usd"] += estimate_cost(model, input_tok, output_tok, cache_read)

    result["estimated_cost_usd"] = round(result["estimated_cost_usd"], 6)
    return result


def upsert_to_db(records: list[dict]):
    """写入 PostgreSQL"""
    import psycopg2

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    sql = """
        INSERT INTO system_daily_usage
            (stats_date, total_input_tokens, total_output_tokens,
             total_cache_read_tokens, total_cache_write_tokens,
             total_reasoning_tokens, session_count, api_call_count,
             tool_call_count, estimated_cost_usd)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (stats_date)
        DO UPDATE SET
            total_input_tokens = EXCLUDED.total_input_tokens,
            total_output_tokens = EXCLUDED.total_output_tokens,
            total_cache_read_tokens = EXCLUDED.total_cache_read_tokens,
            total_cache_write_tokens = EXCLUDED.total_cache_write_tokens,
            total_reasoning_tokens = EXCLUDED.total_reasoning_tokens,
            session_count = EXCLUDED.session_count,
            api_call_count = EXCLUDED.api_call_count,
            tool_call_count = EXCLUDED.tool_call_count,
            estimated_cost_usd = EXCLUDED.estimated_cost_usd,
            updated_at = NOW()
    """

    count = 0
    for r in records:
        cur.execute(sql, (
            r["stats_date"],
            r["total_input_tokens"],
            r["total_output_tokens"],
            r["total_cache_read_tokens"],
            r["total_cache_write_tokens"],
            r["total_reasoning_tokens"],
            r["session_count"],
            r["api_call_count"],
            r["tool_call_count"],
            r["estimated_cost_usd"],
        ))
        count += 1

    conn.commit()
    cur.close()
    conn.close()
    return count


def get_dates_in_range(start: date, end: date) -> list[date]:
    """获取日期范围"""
    dates = []
    d = start
    while d <= end:
        dates.append(d)
        d += timedelta(days=1)
    return dates


def main():
    parser = argparse.ArgumentParser(description="Hermes Agent 本地用量同步")
    parser.add_argument("--date", type=str, default=None, help="指定日期 (YYYY-MM-DD)")
    parser.add_argument("--today", action="store_true", help="仅同步今天")
    parser.add_argument("--backfill", action="store_true", help="回填所有历史数据 (从最早有数据的日期到今天)")
    args = parser.parse_args()

    today = date.today()

    if args.date:
        target_date = date.fromisoformat(args.date)
        dates = [target_date]
    elif args.today:
        dates = [today]
    elif args.backfill:
        # 找到最早有数据的日期
        conn = sqlite3.connect(str(STATE_DB))
        cur = conn.cursor()
        cur.execute("SELECT MIN(date(datetime(started_at, 'unixepoch'))) FROM sessions WHERE started_at IS NOT NULL")
        earliest = cur.fetchone()[0]
        conn.close()
        if not earliest:
            print("ℹ️  Hermes state.db 中没有会话数据")
            return
        start = date.fromisoformat(earliest)
        dates = get_dates_in_range(start, today)
        print(f"📅 回填范围: {start} ~ {today} (共 {len(dates)} 天)")
    else:
        # 默认：从 state.db 最早有数据的日期到今天
        conn = sqlite3.connect(str(STATE_DB))
        cur = conn.cursor()
        cur.execute("SELECT MIN(date(datetime(started_at, 'unixepoch'))) FROM sessions WHERE started_at IS NOT NULL")
        earliest = cur.fetchone()[0]
        conn.close()
        if not earliest:
            print("ℹ️  Hermes state.db 中没有会话数据")
            return
        start = date.fromisoformat(earliest) if earliest else today
        dates = get_dates_in_range(start, today)

    all_records = []
    total_sessions = 0

    for d in dates:
        sessions = get_hermes_sessions(d)
        if not sessions:
            continue
        record = compute_daily(sessions, d)
        all_records.append(record)
        total_sessions += len(sessions)

        usd = record["estimated_cost_usd"]
        cny = round(usd * 7.2, 2)
        print(f"   {record['stats_date']}  "
              f"会话={record['session_count']:>3}  "
              f"输入={record['total_input_tokens']:>10,}  "
              f"缓存={record['total_cache_read_tokens']:>10,}  "
              f"输出={record['total_output_tokens']:>8,}  "
              f"请求={record['api_call_count']:>5}  "
              f"${usd:<8.4f} ≈ ¥{cny}")

    if not all_records:
        print("ℹ️  没有找到需要同步的数据")
        return

    print(f"\n💾 正在写入数据库 ({len(all_records)} 条记录)...")
    try:
        count = upsert_to_db(all_records)
        print(f"✅ 成功写入/更新 {count} 条记录 (共 {total_sessions} 个会话)")
    except Exception as e:
        print(f"❌ 写入数据库失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
