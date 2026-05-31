"""
将 Hermes state.db 的会话消耗同步到 PostgreSQL token_usage 表。

映射规则:
- weixin 来源 → 平台用户映射到 internal user_id
- cron/api_server/cli → 归到 admin (user_id=1)
"""

import os
import sys
import sqlite3
import psycopg2
from datetime import datetime
from pathlib import Path

HERMES_HOME = Path(os.environ.get("HERMES_HOME", os.path.expanduser("~/.hermes")))
STATE_DB = HERMES_HOME / "state.db"

DB = {
    "host": os.environ.get("DB_HOST", "127.0.0.1"),
    "port": int(os.environ.get("DB_PORT", "5432")),
    "dbname": os.environ.get("DB_NAME", "tokenmanager"),
    "user": os.environ.get("DB_USER", "zhangshitong"),
    "password": os.environ.get("DB_PASSWORD", "Qq981997@"),
}

# 平台 user_id → PostgreSQL user_id 映射
# weixin/qqbot 平台的 user_id 是 platform id，需要映射到内部 user_id
# 默认：所有 non-cron 会话归 admin(user_id=1)，mapping 表可扩展
PLATFORM_USER_MAP = {
    "o9cq80-x57nbTTzMy-yHAKM-4WC4@im.wechat": 1,  # admin 的微信
    "998CC4C1E9B1077DE6E63FE01BF57DB8": 1,  # admin 的 QQ
}

def get_platform_user_id(platform_uid: str) -> int | None:
    """根据平台用户 ID 查找 PostgreSQL 用户 ID"""
    return PLATFORM_USER_MAP.get(platform_uid)

def generate_request_id(source: str, sid: str) -> str:
    """生成唯一 request_id（用完整 session id 的 hash）"""
    import hashlib
    short = hashlib.md5(sid.encode()).hexdigest()[:12]
    return f"sync_{source}_{short}"

def main():
    if not STATE_DB.exists():
        print(f"❌ state.db 不存在: {STATE_DB}")
        sys.exit(1)

    conn = sqlite3.connect(str(STATE_DB))
    conn.row_factory = sqlite3.Row

    # 获取所有有 Token 消耗的会话
    cur = conn.execute("""
        SELECT id, source, user_id, input_tokens, output_tokens,
               estimated_cost_usd, started_at
        FROM sessions
        WHERE (input_tokens > 0 OR output_tokens > 0)
        ORDER BY started_at ASC
    """)
    sessions = [dict(r) for r in cur.fetchall()]
    conn.close()

    print(f"📊 state.db 共 {len(sessions)} 个有消耗的会话")

    # 连接 PostgreSQL
    pg = psycopg2.connect(**DB)
    pg_cursor = pg.cursor()

    # 查找已存在的 request_id（避免重复）
    pg_cursor.execute("SELECT request_id FROM token_usage")
    existing_ids = {r[0] for r in pg_cursor.fetchall()}

    inserted = 0
    skipped = 0
    no_user = 0

    for s in sessions:
        source = s["source"] or "unknown"
        platform_uid = s["user_id"] or ""
        input_tok = int(s["input_tokens"] or 0)
        output_tok = int(s["output_tokens"] or 0)
        total_cost = input_tok + output_tok

        # 确定 PostgreSQL user_id
        user_id = None
        if platform_uid:
            user_id = get_platform_user_id(platform_uid)
        if user_id is None:
            # 非平台会话（cron/api/cli）归 admin
            user_id = 1

        request_id = generate_request_id(source, s["id"])

        if request_id in existing_ids:
            skipped += 1
            continue

        # usage_time from started_at timestamp
        usage_time = datetime.fromtimestamp(s["started_at"]) if s["started_at"] else datetime.now()

        pg_cursor.execute("""
            INSERT INTO token_usage
                (user_id, agent_name, input_tokens, output_tokens, total_cost, usage_time, request_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            user_id, source,
            input_tok, output_tok, total_cost,
            usage_time, request_id,
        ))
        inserted += 1

    pg.commit()
    pg_cursor.close()
    pg.close()

    print(f"✅ 新增 {inserted} 条记录")
    if skipped:
        print(f"⏭️  跳过 {skipped} 条（已存在）")

    # 显示汇总
    print("\n📋 按来源分布:")
    pg = psycopg2.connect(**DB)
    pg_cursor = pg.cursor()
    pg_cursor.execute("""
        SELECT agent_name as source, COUNT(*) as cnt,
               SUM(input_tokens) as total_in, SUM(output_tokens) as total_out
        FROM token_usage WHERE request_id LIKE 'sync_%%'
        GROUP BY agent_name ORDER BY cnt DESC
    """)
    for row in pg_cursor.fetchall():
        print(f"   {row[0]:15s}  {row[1]:>4} 条  输入 {row[2]:>10,}  输出 {row[3]:>8,}")
    pg_cursor.close()
    pg.close()


if __name__ == "__main__":
    main()
