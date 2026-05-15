#!/usr/bin/env python3
"""每日同步脚本：从 Hermes Agent state.db 读取消耗数据，写入 TokenManager PostgreSQL

由 Hermes Cron 定时调用，推荐每日00:30执行，同步前一天数据。
"""
import sqlite3
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from urllib.request import Request, urlopen

# === 配置 ===
STATE_DB = os.path.expanduser("~/.hermes/state.db")
TOKENMANAGER_API = "https://120.77.10.212/token/api/admin/system-usage/sync"
# TokenManager 管理员凭证（从环境变量或 .env 读取）
ADMIN_TOKEN = ""

# 时区（Asia/Shanghai）
TZ = timezone(timedelta(hours=8))


def load_admin_token():
    """从 .env 读取管理员token"""
    env_path = os.path.expanduser("~/.hermes/.env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("TOKENMANAGER_ADMIN_TOKEN"):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    # 尝试从环境变量读取
    return os.environ.get("TOKENMANAGER_ADMIN_TOKEN", "")


def get_yesterday_data():
    """从 state.db 获取昨天的汇总数据"""
    if not os.path.exists(STATE_DB):
        print(f"ERROR: state.db not found at {STATE_DB}", file=sys.stderr)
        return None

    conn = sqlite3.connect(STATE_DB)
    conn.row_factory = sqlite3.Row
    
    now = datetime.now(TZ)
    yesterday_start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
    yesterday_end = yesterday_start + timedelta(days=1)
    
    start_ts = yesterday_start.timestamp()
    end_ts = yesterday_end.timestamp()
    
    cursor = conn.execute(
        "SELECT * FROM sessions WHERE started_at >= ? AND started_at < ?",
        (start_ts, end_ts)
    )
    sessions = cursor.fetchall()
    
    if not sessions:
        print(f"No sessions found for {yesterday_start.strftime('%Y-%m-%d')}")
        conn.close()
        return None
    
    total_input = 0
    total_output = 0
    total_cache_read = 0
    total_cache_write = 0
    total_reasoning = 0
    total_session = len(sessions)
    total_api_calls = 0
    total_tool_calls = 0
    total_cost = 0.0
    
    for row in sessions:
        d = dict(row)
        total_input += int(d.get('input_tokens', 0) or 0)
        total_output += int(d.get('output_tokens', 0) or 0)
        total_cache_read += int(d.get('cache_read_tokens', 0) or 0)
        total_cache_write += int(d.get('cache_write_tokens', 0) or 0)
        total_reasoning += int(d.get('reasoning_tokens', 0) or 0)
        total_api_calls += int(d.get('api_call_count', 0) or 0)
        total_tool_calls += int(d.get('tool_call_count', 0) or 0)
        total_cost += float(d.get('estimated_cost_usd', 0) or 0) or float(d.get('actual_cost_usd', 0) or 0)
    
    conn.close()
    
    stats_date = yesterday_start.strftime('%Y-%m-%d')
    
    # 如果 cost 为 0，尝试用 DeepSeek V4 Flash 的定价估算
    # Input: ~$0.25/M, Output: ~$1.00/M (基于 V4 Flash 行业定价)
    if total_cost == 0 and (total_input > 0 or total_output > 0):
        est_input_cost = total_input / 1_000_000 * 0.25
        est_output_cost = total_output / 1_000_000 * 1.00
        est_cache_cost = total_cache_read / 1_000_000 * 0.025
        total_cost = est_input_cost + est_output_cost + est_cache_cost
    
    payload = {
        "stats_date": stats_date,
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "total_cache_read_tokens": total_cache_read,
        "total_cache_write_tokens": total_cache_write,
        "total_reasoning_tokens": total_reasoning,
        "session_count": total_session,
        "api_call_count": total_api_calls,
        "tool_call_count": total_tool_calls,
        "estimated_cost_usd": round(total_cost, 6),
    }
    
    print(f"日报 {stats_date}: 输入={total_input:,} 输出={total_output:,} 缓存={total_cache_read:,} session={total_session}")
    print(f"  费用=${total_cost:.4f}")
    
    return payload


def sync_to_tokenmanager(payload):
    """将数据同步到 TokenManager"""
    token = ADMIN_TOKEN or load_admin_token()
    if not token:
        print("WARNING: No admin token configured, skipping sync", file=sys.stderr)
        print(f"Data would be: {json.dumps(payload, ensure_ascii=False)}")
        return False
    
    data = json.dumps(payload).encode('utf-8')
    req = Request(
        TOKENMANAGER_API,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    try:
        with urlopen(req, context=ctx, timeout=10) as resp:
            result = json.loads(resp.read().decode())
            print(f"Sync result: {result.get('message', 'OK')}")
            return True
    except Exception as e:
        print(f"ERROR syncing: {e}", file=sys.stderr)
        return False


def main():
    """主入口"""
    print(f"[{datetime.now(TZ).strftime('%Y-%m-%d %H:%M:%S')}] Starting daily sync...")
    
    payload = get_yesterday_data()
    if not payload:
        print("No data to sync.")
        return 0
    
    sync_to_tokenmanager(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
