"""
DeepSeek 官方用量同步脚本

从 DeepSeek 平台拉取 Token 消耗数据并写入 system_daily_usage 表。

用法:
  python scripts/sync_deepseek_usage.py                  # 同步本月
  python scripts/sync_deepseek_usage.py --month 5 --year 2026
  python scripts/sync_deepseek_usage.py --today          # 仅同步今天

环境变量:
  DEEPSEEK_AUTH_TOKEN   DeepSeek 平台 Bearer Token（必填）
"""

import os
import sys
import json
import argparse
from datetime import date, datetime

import requests

# ── 数据库配置 ──
DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 5432,
    "dbname": "tokenmanager",
    "user": "zhangshitong",
    "password": "123456",
}

DEEPSEEK_BASE = "https://platform.deepseek.com/api/v0/usage"


def get_deepseek_data(endpoint: str, month: int, year: int, token: str) -> dict:
    """从 DeepSeek API 获取用量/费用数据"""
    url = f"{DEEPSEEK_BASE}/{endpoint}?month={month}&year={year}"
    headers = {
        "authorization": f"Bearer {token}",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "referer": "https://platform.deepseek.com/usage",
        "x-app-version": "1.0.0",
    }
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json()


def compute_daily_usage(amount_data: dict, cost_data: dict) -> list[dict]:
    """
    合并 amount（token数）和 cost（费用）数据，按天输出

    返回 [{
        "stats_date": "2026-05-01",
        "total_input_tokens": int,         # 缓存未命中
        "total_cache_read_tokens": int,    # 缓存命中
        "total_output_tokens": int,        # 输出
        "api_call_count": int,             # 请求次数
        "estimated_cost_usd": float,       # 费用(USD)
    }, ...]
    """

    # 构建 cost 索引: date -> model -> type -> amount
    cost_index = {}
    for day in cost_data.get("data", {}).get("biz_data", [{}])[0].get("days", []):
        d = day["date"]
        cost_index[d] = {}
        for me in day.get("data", []):
            model = me["model"]
            cost_index[d][model] = {u["type"]: float(u["amount"]) for u in me.get("usage", [])}

    results = []
    for day in amount_data.get("data", {}).get("biz_data", {}).get("days", []):
        d = day["date"]
        total_cache_hit = 0
        total_cache_miss = 0
        total_response = 0
        total_requests = 0
        total_usd = 0.0

        for me in day.get("data", []):
            model = me["model"]
            usage = {u["type"]: int(u["amount"]) for u in me.get("usage", [])}
            total_cache_hit += usage.get("PROMPT_CACHE_HIT_TOKEN", 0)
            total_cache_miss += usage.get("PROMPT_CACHE_MISS_TOKEN", 0)
            total_response += usage.get("RESPONSE_TOKEN", 0)
            total_requests += usage.get("REQUEST", 0)

            # 费用
            cm = cost_index.get(d, {}).get(model, {})
            total_usd += sum(cm.values())

        # 跳过无数据的天
        if total_cache_hit + total_cache_miss + total_response == 0:
            continue

        results.append({
            "stats_date": d,
            "total_input_tokens": total_cache_miss,
            "total_cache_read_tokens": total_cache_hit,
            "total_output_tokens": total_response,
            "api_call_count": total_requests,
            "estimated_cost_usd": round(total_usd, 6),
        })

    return results


def upsert_to_db(records: list[dict]):
    """写入 PostgreSQL"""
    import psycopg2

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    sql = """
        INSERT INTO system_daily_usage
            (stats_date, total_input_tokens, total_cache_read_tokens,
             total_output_tokens, api_call_count, estimated_cost_usd)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (stats_date)
        DO UPDATE SET
            total_input_tokens = EXCLUDED.total_input_tokens,
            total_cache_read_tokens = EXCLUDED.total_cache_read_tokens,
            total_output_tokens = EXCLUDED.total_output_tokens,
            api_call_count = EXCLUDED.api_call_count,
            estimated_cost_usd = EXCLUDED.estimated_cost_usd
    """

    for r in records:
        cur.execute(sql, (
            r["stats_date"],
            r["total_input_tokens"],
            r["total_cache_read_tokens"],
            r["total_output_tokens"],
            r["api_call_count"],
            r["estimated_cost_usd"],
        ))

    conn.commit()
    cur.close()
    conn.close()
    return len(records)


def main():
    parser = argparse.ArgumentParser(description="DeepSeek 官方用量同步")
    parser.add_argument("--month", type=int, default=None, help="月份 (默认当前月)")
    parser.add_argument("--year", type=int, default=None, help="年份 (默认当前年)")
    parser.add_argument("--today", action="store_true", help="仅同步今天")
    args = parser.parse_args()

    token = os.environ.get("DEEPSEEK_AUTH_TOKEN")
    if not token:
        print("❌ 请设置 DEEPSEEK_AUTH_TOKEN 环境变量", file=sys.stderr)
        sys.exit(1)

    today = date.today()
    month = args.month or today.month
    year = args.year or today.year

    print(f"📡 正在从 DeepSeek 拉取 {year}年{month}月 数据...")

    try:
        amount_data = get_deepseek_data("amount", month, year, token)
        cost_data = get_deepseek_data("cost", month, year, token)
    except Exception as e:
        print(f"❌ 请求 DeepSeek API 失败: {e}", file=sys.stderr)
        sys.exit(1)

    records = compute_daily_usage(amount_data, cost_data)

    if args.today:
        today_str = today.isoformat()
        records = [r for r in records if r["stats_date"] == today_str]
        if not records:
            print(f"ℹ️  今天 ({today_str}) 暂无数据")
            return

    print(f"📊 共 {len(records)} 天有数据:")
    for r in records:
        usd = r["estimated_cost_usd"]
        cny = round(usd * 7.2, 2)
        print(f"   {r['stats_date']}  "
              f"输入={r['total_input_tokens']:>10,}  "
              f"缓存={r['total_cache_read_tokens']:>10,}  "
              f"输出={r['total_output_tokens']:>8,}  "
              f"请求={r['api_call_count']:>5}  "
              f"${usd:<8.4f} ≈ ¥{cny}")

    print(f"💾 正在写入数据库...")
    try:
        count = upsert_to_db(records)
        print(f"✅ 成功写入/更新 {count} 条记录")
    except Exception as e:
        print(f"❌ 写入数据库失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
