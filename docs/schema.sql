-- ============================================================
-- TokenManager 完整建表脚本
-- 数据库: PostgreSQL
-- ============================================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE,
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nickname VARCHAR(50) DEFAULT '',
    deepseek_api_key VARCHAR(255) DEFAULT '',
    token_balance BIGINT DEFAULT 0,
    role VARCHAR(20) DEFAULT 'user',
    status SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Token 套餐表
CREATE TABLE IF NOT EXISTS token_packages (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    token_amount BIGINT NOT NULL,
    price_cent INT NOT NULL,
    sort_order INT DEFAULT 0,
    is_active INT DEFAULT 1
);

-- 充值订单表
CREATE TABLE IF NOT EXISTS recharge_orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    package_id INT NOT NULL,
    order_no VARCHAR(64) UNIQUE NOT NULL,
    amount_cent INT NOT NULL,
    token_granted BIGINT NOT NULL,
    pay_method VARCHAR(10) DEFAULT '',
    pay_status SMALLINT DEFAULT 0,
    pay_time TIMESTAMP,
    expire_time TIMESTAMP,
    create_time TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_recharge_orders_user_id ON recharge_orders(user_id);

-- Token 消耗明细表
CREATE TABLE IF NOT EXISTS token_usage (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    agent_name VARCHAR(50) DEFAULT 'hermes',
    input_tokens INT DEFAULT 0,
    output_tokens INT DEFAULT 0,
    total_cost INT DEFAULT 0,
    usage_time TIMESTAMP DEFAULT now(),
    request_id VARCHAR(64) UNIQUE NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_token_usage_user_id ON token_usage(user_id);
CREATE INDEX IF NOT EXISTS ix_token_usage_usage_time ON token_usage(usage_time);

-- 价格配置表（单行，固定 id=1）
CREATE TABLE IF NOT EXISTS price_config (
    id INT PRIMARY KEY DEFAULT 1,
    input_price_per_k DOUBLE PRECISION DEFAULT 0.0001,
    output_price_per_k DOUBLE PRECISION DEFAULT 0.0004
);

-- 系统每日 Token 消耗汇总表
CREATE TABLE IF NOT EXISTS system_daily_usage (
    id BIGSERIAL PRIMARY KEY,
    stats_date DATE UNIQUE NOT NULL,
    total_input_tokens BIGINT DEFAULT 0,
    total_output_tokens BIGINT DEFAULT 0,
    total_cache_read_tokens BIGINT DEFAULT 0,
    total_cache_write_tokens BIGINT DEFAULT 0,
    total_reasoning_tokens BIGINT DEFAULT 0,
    session_count INT DEFAULT 0,
    api_call_count INT DEFAULT 0,
    tool_call_count INT DEFAULT 0,
    estimated_cost_usd NUMERIC(12, 6) DEFAULT 0,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- 操作日志表
CREATE TABLE IF NOT EXISTS user_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT DEFAULT 0,
    action VARCHAR(100) NOT NULL,
    method VARCHAR(10) DEFAULT '',
    path VARCHAR(500) DEFAULT '',
    request_params TEXT DEFAULT '',
    response_status INT DEFAULT 0,
    response_body TEXT DEFAULT '',
    ip_address VARCHAR(45) DEFAULT '',
    user_agent TEXT DEFAULT '',
    duration_ms INT DEFAULT 0,
    detail TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_logs_user_id ON user_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_logs_action ON user_logs(action);
CREATE INDEX IF NOT EXISTS idx_user_logs_created_at ON user_logs(created_at);
