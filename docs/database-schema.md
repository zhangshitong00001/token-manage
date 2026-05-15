# TokenManager 数据库表结构设计

## 概览

本项目使用 PostgreSQL，包含 7 张业务表。

---

## 1. users — 用户表

存储平台用户信息，支持手机号/邮箱注册，管理员角色。

| 字段 | 类型 | 约束 | 说明 |
|:---|:---|:---:|:---|
| id | bigint | PK, auto | 用户ID |
| phone | varchar(20) | UNIQUE | 手机号 |
| email | varchar(100) | UNIQUE | 邮箱 |
| password_hash | varchar(255) | NOT NULL | 密码哈希 |
| nickname | varchar(50) | | 昵称 |
| deepseek_api_key | varchar(255) | | DeepSeek API Key |
| token_balance | bigint | default 0 | 当前剩余Token额度（个） |
| role | varchar(20) | default 'user' | user / admin |
| status | smallint | default 1 | 0禁用 1正常 |
| created_at | timestamp | | 创建时间 |
| updated_at | timestamp | | 更新时间 |

**索引：** `phone` UNIQUE, `email` UNIQUE

---

## 2. token_packages — 套餐表

可购买的 Token 套餐，支持上下架管理。

| 字段 | 类型 | 约束 | 说明 |
|:---|:---|:---:|:---|
| id | int | PK, auto | 套餐ID |
| name | varchar(50) | NOT NULL | 套餐名称 |
| token_amount | bigint | NOT NULL | Token数量 |
| price_cent | int | NOT NULL | 价格（分） |
| sort_order | int | default 0 | 排序权重 |
| is_active | int | default 1 | 0下架 1上架 |

---

## 3. recharge_orders — 充值订单表

用户的充值记录，支持微信/支付宝支付。

| 字段 | 类型 | 约束 | 说明 |
|:---|:---|:---:|:---|
| id | bigint | PK, auto | 订单ID |
| user_id | bigint | NOT NULL, INDEX | 用户ID |
| package_id | int | NOT NULL | 套餐ID |
| order_no | varchar(64) | UNIQUE, NOT NULL | 唯一订单号 |
| amount_cent | int | NOT NULL | 实付金额（分） |
| token_granted | bigint | NOT NULL | 赠送Token数 |
| pay_method | varchar(10) | default '' | wechat / alipay |
| pay_status | smallint | default 0 | 0待支付 1成功 2失败 3退款 |
| pay_time | timestamp | nullable | 支付时间 |
| expire_time | timestamp | nullable | 过期时间 |
| create_time | timestamp | default now() | 创建时间 |

**索引：** `user_id`, `order_no` UNIQUE

---

## 4. token_usage — Token消耗明细表

记录每次 API 调用的 Token 消耗。

| 字段 | 类型 | 约束 | 说明 |
|:---|:---|:---:|:---|
| id | bigint | PK, auto | 记录ID |
| user_id | bigint | NOT NULL, INDEX | 用户ID |
| agent_name | varchar(50) | default 'hermes' | 代理名称 |
| input_tokens | int | default 0 | 输入Token数 |
| output_tokens | int | default 0 | 输出Token数 |
| total_cost | int | default 0 | 实际扣除的Token额度（个） |
| usage_time | timestamp | INDEX, default now() | 使用时间 |
| request_id | varchar(64) | UNIQUE, NOT NULL | 幂等键 |

**索引：** `user_id`, `usage_time`, `request_id` UNIQUE

---

## 5. price_config — 价格配置表

单行配置表，保存 Token 计价单位价格。

| 字段 | 类型 | 约束 | 说明 |
|:---|:---|:---:|:---|
| id | int | PK, default 1 | 固定为1 |
| input_price_per_k | float | default 0.0001 | 每千输入token价格（元） |
| output_price_per_k | float | default 0.0004 | 每千输出token价格（元） |

---

## 6. system_daily_usage — 系统级每日Token消耗汇总

从 DeepSeek 官方平台同步的每日总用量，用于管理后台报表展示。

| 字段 | 类型 | 约束 | 说明 |
|:---|:---|:---:|:---|
| id | bigint | PK, auto | 记录ID |
| stats_date | date | UNIQUE, NOT NULL | 统计日期 |
| total_input_tokens | bigint | default 0 | 总输入token（缓存未命中） |
| total_output_tokens | bigint | default 0 | 总输出token |
| total_cache_read_tokens | bigint | default 0 | 总缓存读取token（缓存命中） |
| total_cache_write_tokens | bigint | default 0 | 总缓存写入token |
| total_reasoning_tokens | bigint | default 0 | 总推理token |
| session_count | int | default 0 | 活跃session数 |
| api_call_count | int | default 0 | API调用次数 |
| tool_call_count | int | default 0 | 工具调用次数 |
| estimated_cost_usd | numeric(12,6) | default 0 | 估算费用(USD) |
| created_at | timestamp | default now() | 创建时间 |
| updated_at | timestamp | default now() | 更新时间 |

**索引：** `stats_date` UNIQUE

---

## 7. user_logs — 操作日志表

记录用户和后台的管理操作，用于审计。

| 字段 | 类型 | 约束 | 说明 |
|:---|:---|:---:|:---|
| id | bigint | PK, auto | 日志ID |
| user_id | bigint | INDEX, default 0 | 用户ID |
| action | varchar(100) | INDEX, NOT NULL | 操作名称 |
| method | varchar(10) | default '' | HTTP方法 |
| path | varchar(500) | default '' | 请求路径 |
| request_params | text | default '' | 请求参数 |
| response_status | int | default 0 | 响应状态码 |
| response_body | text | default '' | 响应内容(截断) |
| ip_address | varchar(45) | default '' | 客户端IP |
| user_agent | text | default '' | User-Agent |
| duration_ms | int | default 0 | 处理耗时(毫秒) |
| detail | text | default '' | 详细描述 |
| created_at | timestamp | INDEX, default now() | 创建时间 |

**索引：** `user_id`, `action`, `created_at`

---

## E-R 关系

```
┌─────────────┐       ┌──────────────────┐
│    users    │ 1──N  │  recharge_orders  │
│             │       │                   │
│             │ 1──N  │   token_usage     │
└─────────────┘       └──────────────────┘
                              │
                              │ (系统汇总, 无关联)
                              │
┌─────────────────────────────┘
│
┌──────────────────────┐
│ system_daily_usage   │ ← DeepSeek 官方同步
└──────────────────────┘

┌───────────────┐       ┌─────────────────┐
│ token_packages│ 1──N  │ recharge_orders  │
└───────────────┘       └─────────────────┘

┌───────────────┐
│ price_config  │ (单行表, 固定id=1)
└───────────────┘

┌───────────────┐
│  user_logs    │ (审计日志, 关联user_id)
└───────────────┘
```

## 建表 DDL

```sql
-- 用户表
CREATE TABLE users (
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

-- Token套餐表
CREATE TABLE token_packages (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    token_amount BIGINT NOT NULL,
    price_cent INT NOT NULL,
    sort_order INT DEFAULT 0,
    is_active INT DEFAULT 1
);

-- 充值订单表
CREATE TABLE recharge_orders (
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
CREATE INDEX ix_recharge_orders_user_id ON recharge_orders(user_id);

-- Token消耗明细表
CREATE TABLE token_usage (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    agent_name VARCHAR(50) DEFAULT 'hermes',
    input_tokens INT DEFAULT 0,
    output_tokens INT DEFAULT 0,
    total_cost INT DEFAULT 0,
    usage_time TIMESTAMP DEFAULT now(),
    request_id VARCHAR(64) UNIQUE NOT NULL
);
CREATE INDEX ix_token_usage_user_id ON token_usage(user_id);
CREATE INDEX ix_token_usage_usage_time ON token_usage(usage_time);

-- 价格配置表（单行）
CREATE TABLE price_config (
    id INT PRIMARY KEY DEFAULT 1,
    input_price_per_k DOUBLE PRECISION DEFAULT 0.0001,
    output_price_per_k DOUBLE PRECISION DEFAULT 0.0004
);

-- 系统每日消耗汇总表
CREATE TABLE system_daily_usage (
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
    estimated_cost_usd NUMERIC(12,6) DEFAULT 0,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- 操作日志表
CREATE TABLE user_logs (
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
CREATE INDEX idx_user_logs_user_id ON user_logs(user_id);
CREATE INDEX idx_user_logs_action ON user_logs(action);
CREATE INDEX idx_user_logs_created_at ON user_logs(created_at);
```
