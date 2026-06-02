# TokenManager 技术文档

> **项目名称：** TokenManager  
> **版本：** 1.0.0  
> **技术栈：** FastAPI + PostgreSQL + Redis + Vue3 (H5前端) + React (管理后台)  
> **核心功能：** AI Token 消耗监控、用户配额管理、DeepSeek 平台对接、自助充值、Claude Code 集成

---

## 目录

1. [项目概述](#1-项目概述)
2. [系统架构](#2-系统架构)
3. [技术栈](#3-技术栈)
4. [目录结构](#4-目录结构)
5. [数据库设计](#5-数据库设计)
6. [API 接口清单](#6-api-接口清单)
7. [核心模块详解](#7-核心模块详解)
8. [安全机制](#8-安全机制)
9. [部署与运维](#9-部署与运维)
10. [前端项目](#10-前端项目)
11. [辅助工具](#11-辅助工具)

---

## 1. 项目概述

TokenManager 是一个轻量级的 **AI Token 管理与监控平台**，主要解决以下场景：

- **Token 消耗追踪**：实时监控用户调用 AI API 的 Token 消耗
- **用户配额管理**：基于 Token 的用户余额体系，支持充值、扣费、套餐购买
- **DeepSeek 平台对接**：自动同步 DeepSeek 官方账单，支持扫码支付充值
- **Claude Code 集成**：提供 Web 端 AI 聊天、数据处理工作台、终端会话
- **管理后台**：用户管理、套餐管理、价格配置、系统用量报表

### 核心业务流程

```
用户注册/登录 → 获取 Token 余额（新用户赠送 10 万）
        ↓
调用 AI 服务（Chat / Workspace / Claude Terminal）
        ↓
Token 配额检查 → 余额充足则放行 → 调用完成后扣减
        ↓
余额不足时提示用户 → 购买套餐 / DeepSeek 扫码充值
        ↓
充值成功 → Token 余额增加 → 可继续使用
```

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    客户端 (Client)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  H5 移动端    │  │  管理后台     │  │  Claude Code  │  │
│  │  (Vue3)      │  │  (React)     │  │  (Terminal)   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
└─────────┼─────────────────┼─────────────────┼──────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────┐
│                    FastAPI 服务层                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ 认证模块  │ │ 用户模块  │ │ 订单模块  │ │ AI 聊天  │  │
│  │ (JWT)    │ │ (CRUD)   │ │ (支付)   │ │ (SSE)    │  │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤  │
│  │ 管理后台  │ │ 套餐模块  │ │ 消耗记录  │ │ 数据工作台│  │
│  │ (Admin)  │ │ (Package)│ │ (Usage)  │ │(Workspace)│  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│  PostgreSQL   │ │  Redis   │ │ DeepSeek API │
│  (持久化存储)  │ │  (缓存)  │ │ (外部服务)   │
└──────────────┘ └──────────┘ └──────────────┘
```

### 分层说明

| 层级 | 说明 |
|------|------|
| **API 路由层** | 11 个路由模块，处理 HTTP 请求/响应 |
| **核心服务层** | Token 配额管理、安全认证、速率限制、Redis 工具 |
| **数据模型层** | SQLAlchemy ORM 模型，9 张业务表 |
| **数据访问层** | 数据库连接池、会话管理 |
| **外部集成层** | DeepSeek 支付网关、163 邮箱 SMTP、Claude Code CLI |

---

## 3. 技术栈

### 后端

| 技术 | 用途 |
|------|------|
| **Python 3.12+** | 运行时 |
| **FastAPI** | Web 框架，异步支持 |
| **SQLAlchemy 2.0** | ORM 数据库操作 |
| **PostgreSQL** | 主数据库 |
| **Redis** | 缓存、速率限制、会话管理、验证码 |
| **Pydantic v2** | 数据验证与序列化 |
| **python-jose** | JWT 令牌生成与解析 |
| **passlib (bcrypt)** | 密码哈希 |
| **tiktoken** | Token 精确计数（cl100k_base） |
| **httpx / requests** | HTTP 客户端（调用 DeepSeek API） |
| **aiofiles** | 异步文件上传 |
| **websockets** | WebSocket 终端支持 |

### 前端

| 项目 | 技术 |
|------|------|
| **H5 移动端** | Vue 3 + Vite |
| **管理后台** | React + Vite |

### 基础设施

| 组件 | 说明 |
|------|------|
| **Uvicorn** | ASGI 服务器 |
| **Nginx** | 反向代理（生产环境） |
| **Hermes Agent** | Claude Code Agent 后端 |

---

## 4. 目录结构

```
TokenManager/
├── backend/                        # 后端服务
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI 主入口
│   │   ├── config.py               # 配置管理（Pydantic Settings）
│   │   ├── database.py             # 数据库连接管理
│   │   ├── middleware.py           # 请求日志中间件
│   │   ├── api/                    # API 路由模块
│   │   │   ├── auth.py             # 认证（注册/登录/验证码/密码重置）
│   │   │   ├── user.py             # 用户信息、消耗查询、模型切换
│   │   │   ├── usage.py            # Token 消耗记录（内部 API）
│   │   │   ├── mobile.py           # H5 移动端接口
│   │   │   ├── packages.py         # 套餐列表
│   │   │   ├── orders.py           # 订单与支付
│   │   │   ├── admin.py            # 管理后台
│   │   │   ├── log.py              # 前端操作日志上报
│   │   │   ├── chat.py             # Claude Code SSE 流式聊天
│   │   │   ├── workspace.py        # 数据工作台（AI 数据处理）
│   │   │   └── claude_terminal.py  # WebSocket 终端
│   │   ├── core/                   # 核心服务
│   │   │   ├── security.py         # JWT + 密码哈希 + Token 黑名单
│   │   │   ├── deps.py             # FastAPI 依赖注入
│   │   │   ├── token_quota.py      # Token 配额管理（检查/扣减/充值）
│   │   │   ├── token_counter.py    # Token 精确计数（tiktoken）
│   │   │   ├── rate_limiter.py     # 速率限制
│   │   │   ├── redis_client.py     # Redis 客户端 + 验证码/会话管理
│   │   │   ├── deepseek_payment.py # DeepSeek 支付网关
│   │   │   └── email_client.py     # 163 SMTP 邮件发送
│   │   ├── models/                 # SQLAlchemy 数据模型
│   │   │   ├── user.py             # 用户表
│   │   │   ├── token_usage.py      # Token 消耗明细
│   │   │   ├── package.py          # Token 套餐
│   │   │   ├── order.py            # 充值订单
│   │   │   ├── price_config.py     # 价格配置（单行表）
│   │   │   ├── system_daily_usage.py # 系统每日消耗汇总
│   │   │   ├── deepseek_invoice.py # DeepSeek 充值账单
│   │   │   ├── user_log.py         # 操作日志
│   │   │   └── chat_history.py     # 对话历史
│   │   ├── schemas/                # Pydantic 数据模型
│   │   │   └── __init__.py
│   │   └── services/               # 业务服务
│   │       ├── log_service.py      # 日志双写（文件+数据库）
│   │       └── token_calc.py       # Token 计价服务
│   ├── init_db.py                  # 数据库初始化脚本
│   ├── seed.py                     # 种子数据脚本
│   └── .env                        # 环境变量（模板）
├── mobile/                         # H5 移动端（Vue 3）
│   ├── src/
│   └── dist/
├── admin/                          # 管理后台（React）
│   ├── src/
│   └── dist/
├── docs/                           # 文档
│   ├── database-schema.md          # 数据库表结构文档
│   ├── schema.sql                  # 建表 DDL
│   └── technical-documentation.md  # 本文件
├── tests/                          # 测试
│   ├── conftest.py                 # Hermes Agent 测试夹具
│   ├── test_file_hash.py           # 文件哈希测试
│   └── test_validation.py          # 文件分类工具集成测试
├── tools/                          # 辅助工具
│   ├── classify_engine.py          # 文件分类引擎
│   ├── date_filter.py              # 日期过滤器
│   ├── file_manager_cli.py         # 文件管理 CLI
│   ├── report_generator.py         # 报告生成器
│   └── file_hash.py               # 文件哈希计算
├── scripts/                        # 运维脚本
│   ├── build-and-deploy.sh         # 构建部署脚本
│   └── sync_daily_usage.py         # 每日用量同步
├── sketches/                       # 原型设计
├── promo-assets/                   # 推广素材
├── video_assets/                   # 视频素材
├── user-outputs/                   # 用户生成文件输出目录
└── PROMO.md                        # 推广文案
```

---

## 5. 数据库设计

### 5.1 E-R 关系

```
┌─────────────┐       ┌──────────────────┐
│    users    │ 1──N  │  recharge_orders  │
│             │       │                   │
│             │ 1──N  │   token_usage     │
│             │       │                   │
│             │ 1──N  │   chat_history    │
└─────────────┘       └──────────────────┘

┌───────────────┐       ┌─────────────────┐
│ token_packages│ 1──N  │ recharge_orders  │
└───────────────┘       └─────────────────┘

┌───────────────┐
│ price_config  │ (单行表, 固定id=1)
└───────────────┘

┌──────────────────────┐
│ system_daily_usage   │ ← DeepSeek 官方同步
└──────────────────────┘

┌───────────────┐
│  user_logs    │ (审计日志, 关联user_id)
└───────────────┘

┌──────────────────────┐
│  deepseek_invoices   │ ← DeepSeek 账单同步
└──────────────────────┘
```

### 5.2 表结构总览

| 表名 | 说明 | 核心字段 |
|------|------|----------|
| **users** | 用户表 | id, phone, email, password_hash, token_balance, role, status |
| **token_packages** | Token 套餐 | id, name, token_amount, price_cent, is_active |
| **recharge_orders** | 充值订单 | id, user_id, order_no, amount_cent, token_granted, pay_status |
| **token_usage** | Token 消耗明细 | id, user_id, input_tokens, output_tokens, total_cost, request_id |
| **price_config** | 价格配置（单行） | id=1, input_price_per_k, output_price_per_k |
| **system_daily_usage** | 系统每日消耗汇总 | stats_date, total_input_tokens, total_output_tokens, estimated_cost_usd |
| **deepseek_invoices** | DeepSeek 充值账单 | payment_order_id, amount, status, paid_at |
| **user_logs** | 操作日志 | user_id, action, method, path, ip_address, duration_ms |
| **chat_history** | 对话历史 | user_id, conversation_id, role, content |

### 5.3 关键表详情

#### users — 用户表

| 字段 | 类型 | 约束 | 说明 |
|------|------|:----:|------|
| id | BIGSERIAL | PK | 用户ID |
| phone | VARCHAR(20) | UNIQUE | 手机号 |
| email | VARCHAR(100) | UNIQUE | 邮箱 |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt 哈希 |
| nickname | VARCHAR(50) | | 昵称 |
| deepseek_api_key | VARCHAR(255) | | 用户绑定的 DeepSeek Key |
| preferred_model | VARCHAR(50) | default 'deepseek-v4-flash' | 偏好模型 |
| token_balance | BIGINT | default 0 | Token 余额（个） |
| role | VARCHAR(20) | default 'user' | user / admin |
| status | SMALLINT | default 1 | 0禁用 1正常 |

#### token_usage — Token 消耗明细

| 字段 | 类型 | 约束 | 说明 |
|------|------|:----:|------|
| id | BIGSERIAL | PK | |
| user_id | BIGINT | NOT NULL, INDEX | 用户ID |
| agent_name | VARCHAR(50) | default 'hermes' | 来源：hermes/chat/workspace/claude-terminal |
| input_tokens | INT | | 输入 Token 数 |
| output_tokens | INT | | 输出 Token 数 |
| total_cost | INT | | 实际扣除的内部 Token 数 |
| usage_time | TIMESTAMP | INDEX | 消耗时间 |
| request_id | VARCHAR(64) | UNIQUE, NOT NULL | 幂等键 |

---

## 6. API 接口清单

### 6.1 认证模块 (`/api/auth`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| POST | `/api/auth/register` | 用户注册（需邮箱验证码） | ❌ |
| POST | `/api/auth/login` | 密码登录 | ❌ |
| POST | `/api/auth/send-code` | 发送邮箱验证码 | ❌ |
| POST | `/api/auth/code-login` | 验证码登录（自动创建用户） | ❌ |
| POST | `/api/auth/forgot-password/send-code` | 发送密码重置验证码 | ❌ |
| POST | `/api/auth/forgot-password/reset` | 验证码重置密码 | ❌ |
| POST | `/api/auth/admin/send-code` | 管理员邮箱验证码发送 | ❌ |
| POST | `/api/auth/admin/login` | 管理员验证码登录 | ❌ |

### 6.2 用户模块 (`/api/user`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| GET | `/api/user/profile` | 获取当前用户信息及余额 | ✅ |
| GET | `/api/user/my-usage` | 今日/本月消耗汇总 | ✅ |
| GET | `/api/user/my-usage-list` | 消耗记录列表（分页） | ✅ |
| GET | `/api/user/my-conversations` | 对话会话列表 | ✅ |
| PUT | `/api/user/deepseek-key` | 绑定 DeepSeek API Key | ✅ |
| PUT | `/api/user/model-pref` | 设置偏好模型 | ✅ |
| POST | `/api/user/hermes-model` | 切换 Hermes Agent 模型（管理员） | ✅ |
| GET | `/api/user/hermes-model` | 查询当前模型（管理员） | ✅ |
| GET | `/api/user/hermes-api-key` | 查询 API Key（脱敏） | ✅ |
| POST | `/api/user/hermes-api-key/reveal` | 获取完整 API Key | ✅ |

### 6.3 Token 消耗记录 (`/api/usage`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| POST | `/api/usage/record` | 记录 Token 消耗（内部 API） | API Key |
| GET | `/api/usage/daily` | 查询某日消耗汇总 | ✅ |

### 6.4 手机端 (`/api/mobile`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| GET | `/api/mobile/usage/today` | 今日累计消耗 | ✅ |
| GET | `/api/mobile/usage/trend` | 近N天消耗趋势 | ✅ |
| GET | `/api/mobile/deepseek/balance` | 查询 DeepSeek 账户余额 | ✅ |
| POST | `/api/mobile/deepseek/payment/create` | 创建充值二维码 | ✅ |
| POST | `/api/mobile/deepseek/payment/capture` | 确认支付完成 | ✅ |
| GET | `/api/mobile/deepseek/payment/status` | 查询支付状态 | ✅ |
| POST | `/api/mobile/deepseek/invoices/sync` | 同步 DeepSeek 账单 | ✅ |
| GET | `/api/mobile/deepseek/invoices` | 查询本地账单 | ✅ |
| GET | `/api/mobile/system/usage/daily` | 系统每日消耗明细 | ✅ |
| GET | `/api/mobile/system/usage/summary` | 系统消耗汇总 | ✅ |
| POST | `/api/mobile/upload` | 文件上传 | ✅ |

### 6.5 套餐 (`/api/packages`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| GET | `/api/packages` | 获取可用套餐列表 | ❌ |

### 6.6 订单 (`/api/order`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| POST | `/api/order/create` | 创建充值订单 | ✅ |
| POST | `/api/order/pay/{order_no}` | 确认支付（模拟） | ✅ |
| POST | `/api/order/admin-confirm/{order_no}` | 管理员手动确认支付 | ✅ |
| GET | `/api/order/status` | 查询订单状态 | ✅ |
| GET | `/api/order/my-orders` | 我的充值记录 | ✅ |

### 6.7 管理后台 (`/api/admin`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| GET | `/api/admin/statistics` | 仪表盘数据 | Admin |
| GET | `/api/admin/users` | 用户列表 | Admin |
| PUT | `/api/admin/users/{user_id}` | 更新用户 | Admin |
| POST | `/api/admin/users/{user_id}/add-tokens` | 为用户增加 Token | Admin |
| GET | `/api/admin/users/{user_id}/quota-usage` | 用户消耗记录 | Admin |
| GET | `/api/admin/packages` | 所有套餐 | Admin |
| POST | `/api/admin/packages` | 新增套餐 | Admin |
| PUT | `/api/admin/packages/{package_id}` | 编辑套餐 | Admin |
| GET | `/api/admin/price-config` | 价格配置 | Admin |
| PUT | `/api/admin/price-config` | 更新价格配置 | Admin |
| GET | `/api/admin/orders` | 订单列表 | Admin |
| GET | `/api/admin/ping` | 心跳（刷新10分钟会话） | Admin |
| POST | `/api/admin/force-logout` | 强制所有设备下线 | Admin |
| GET | `/api/admin/usage/list` | 消耗记录列表 | Admin |
| GET | `/api/admin/system-usage/daily` | 系统每日消耗 | Admin |
| GET | `/api/admin/system-usage/summary` | 系统消耗汇总 | Admin |
| POST | `/api/admin/system-usage/sync` | 手动同步某天数据 | Admin |
| GET | `/api/admin/system-usage/realtime` | Hermes Agent 实时消耗 | Admin |
| GET | `/api/admin/deepseek/balance` | DeepSeek 账户余额 | Admin |
| POST | `/api/admin/upload` | 文件上传 | Admin |
| GET | `/api/admin/deepseek/api-keys` | DeepSeek API Key 列表 | Admin |
| POST | `/api/admin/deepseek/api-keys/reveal` | 揭示完整 API Key | Admin |
| GET | `/api/admin/deepseek/usage` | DeepSeek 本月用量 | Admin |
| GET | `/api/admin/deepseek/summary` | DeepSeek 账户摘要 | Admin |
| GET | `/api/admin/deepseek/invoices` | DeepSeek 充值账单 | Admin |
| POST | `/api/admin/deepseek/invoices/sync` | 同步 DeepSeek 账单 | Admin |

### 6.8 操作日志 (`/api/log`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| POST | `/api/log/action` | 前端操作事件上报 | ✅ |

### 6.9 AI 聊天 (`/api/chat`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| POST | `/api/chat/stream` | SSE 流式聊天 | ✅ |
| POST | `/api/chat/download` | 下载文件（zip打包） | ✅ |
| GET | `/api/chat/download-output/{filename}` | 下载输出文件 | ✅ |
| GET | `/api/chat/my-files` | 列出用户生成的文件 | ✅ |
| DELETE | `/api/chat/my-files/{filename}` | 删除文件 | ✅ |
| POST | `/api/chat/upload` | 上传文件给 Claude 使用 | ✅ |
| GET | `/api/chat/stream-status` | 查询流式会话状态 | ✅ |
| GET | `/api/chat/health` | 健康检查 | ✅ |
| GET | `/api/chat/history` | 获取对话历史 | ✅ |
| POST | `/api/chat/history` | 保存对话历史 | ✅ |

### 6.10 数据工作台 (`/api/workspace`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| POST | `/api/workspace/process` | AI 数据处理（SSE） | ✅ |
| GET | `/api/workspace/output` | 列出输出文件 | ✅ |
| GET | `/api/workspace/download/{filename}` | 下载处理结果 | ✅ |

### 6.11 Claude 终端 (`/api/claude-terminal`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:----:|
| POST | `/api/claude-terminal/session/start` | 启动会话 | ✅ |
| POST | `/api/claude-terminal/session/{id}/stop` | 停止会话 | ✅ |
| GET | `/api/claude-terminal/sessions` | 列出所有会话 | ✅ |
| GET | `/api/claude-terminal/session/{id}` | 会话详情 | ✅ |
| POST | `/api/claude-terminal/session/{id}/write` | 写入输入 | ✅ |
| POST | `/api/claude-terminal/session/{id}/signal` | 发送信号 | ✅ |
| GET | `/api/claude-terminal/config/default` | 默认配置 | ✅ |
| WS | `/api/claude-terminal/ws/{session_id}` | WebSocket 终端 | ✅ |

### 6.12 静态文件与 SPA 回退

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 移动端首页 |
| GET | `/admin/{path}` | 管理后台 SPA 回退 |
| GET | `/{path}` | 移动端 SPA 回退 |

---

## 7. 核心模块详解

### 7.1 Token 配额管理 (`core/token_quota.py`)

Token 配额系统是整个平台的核心，采用 **双层计价模型**：

```
                  DeepSeek API 实际价格（元/千token）
                           ↓
                   计算实际金额（元）
                           ↓
           乘以 TOKENS_PER_YUAN（¥1 = 10,000 tokens）
                           ↓
                   内部 Token 扣除数
```

**关键参数：**
- `TOKENS_PER_YUAN = 10000`：1 元人民币可兑换 10,000 个内部 Token
- 价格配置：`input_price_per_k`（默认 0.0001 元/千token）、`output_price_per_k`（默认 0.0004 元/千token）

**核心函数：**

| 函数 | 说明 |
|------|------|
| `check_balance(user_id, db)` | 检查用户余额是否足够 |
| `deduct_balance(user_id, input_tokens, output_tokens, db)` | 按实际消耗扣减余额（幂等） |
| `add_tokens_from_recharge(user_id, amount_yuan, db)` | 充值后按比例增加余额 |
| `calc_cost_yuan(input_tokens, output_tokens, ...)` | 计算实际消耗金额 |
| `calc_internal_tokens(input_tokens, output_tokens, db)` | 计算应扣内部 Token 数 |

**幂等设计：** 每次扣减使用 `request_id` 作为幂等键，重复请求不会重复扣费。

### 7.2 安全认证 (`core/security.py`)

采用 **JWT (JSON Web Token)** + **Redis 黑名单** 的双层认证机制：

```
登录成功 → 生成 JWT（含用户ID、角色、过期时间）
    ↓
客户端携带 JWT 访问受保护接口
    ↓
服务端验证 JWT 签名 → 检查 Redis 黑名单 → 放行/拒绝
    ↓
登出/强制下线 → Token 加入 Redis 黑名单（剩余有效期自动过期）
```

**关键特性：**
- 密码使用 **bcrypt** 哈希存储
- JWT 支持 `remember_me` 模式（30 天有效期 vs 1 天）
- Token 黑名单基于 Redis 自动过期
- 管理员会话 10 分钟无操作自动过期
- 支持强制踢下线（清除 Redis 会话 + 设置强制下线标记）

### 7.3 速率限制 (`core/rate_limiter.py`)

基于 Redis 的滑动窗口速率限制：

| 限制项 | 阈值 | 窗口 |
|--------|:----:|:----:|
| 登录尝试（同一账号） | 10 次 | 5 分钟 |
| 注册（同一邮箱/手机） | 3 次 | 1 小时 |
| 验证码发送 | 3 次 | 5 分钟 |
| 管理员 API | 60 次 | 1 分钟 |
| 强制踢下线 | 3 次 | 1 分钟 |

### 7.4 DeepSeek 支付网关 (`core/deepseek_payment.py`)

自动化的 DeepSeek 平台支付集成：

```
创建支付请求 → 自动登录 DeepSeek 获取 Token
    ↓
生成支付二维码（微信/支付宝）
    ↓
用户扫码付款
    ↓
确认支付 → 自动增加用户 Token 余额
    ↓
同步账单到本地数据库
```

**特性：**
- 支持邮箱密码自动登录（Token 4 小时自动刷新）
- 支持持久化 User Token（从浏览器复制的长期 Token）
- 支持微信/支付宝扫码支付
- 自动处理业务错误（日限额、金额超限等）
- 账单同步到本地 `deepseek_invoices` 表

### 7.5 请求日志中间件 (`middleware.py`)

全局自动记录所有 API 请求：

```
每个请求 → 收集：用户、路径、参数、耗时、状态码、IP、UA
    ↓
脱敏处理（隐藏密码）
    ↓
双写：文件日志（logs/operations_YYYY-MM-DD.log）+ 数据库（user_logs 表）
```

### 7.6 AI 聊天模块 (`api/chat.py`)

基于 Claude Code 的 SSE 流式聊天：

```
用户发送消息 → 构建 Prompt（含上传文件内容）
    ↓
余额检查 → 启动 Claude Code 子进程（--bare 模式）
    ↓
流式解析 JSON 事件 → 推送给前端（SSE）
    ↓
处理完成 → 扣减 Token 余额 → 保存对话历史
```

**支持的事件类型：**
- `start`：开始
- `text`：文本内容（3-5 字小块推送）
- `tool_use`：工具调用信息
- `tool_result`：工具执行结果
- `done`：完成（含消耗统计、文件变更）
- `error`：错误信息

**超时机制：** 180 秒超时，自动中断并保存已有内容。

### 7.7 数据工作台 (`api/workspace.py`)

自然语言驱动的数据处理：

```
用户上传文件 + 描述需求 → 构建数据处理 Prompt
    ↓
Claude Code 执行数据处理（Python/pandas）
    ↓
流式返回处理过程
    ↓
结果保存到用户隔离目录 → 可下载
```

### 7.8 Claude 终端 (`api/claude_terminal.py`)

WebSocket + PTY 实时终端：

```
启动会话 → 创建 PTY → 启动 Claude Code 子进程
    ↓
WebSocket 双向通信（输入/输出）
    ↓
终端大小调整（resize）
    ↓
信号发送（Ctrl+C / Ctrl+D / Kill）
    ↓
会话结束 → 自动扣减 Token
```

**支持的模式：**
- `auto`：自动模式
- `plan`：计划模式
- `acceptEdits`：自动接受编辑
- `normal`：正常模式

### 7.9 管理后台 (`api/admin.py`)

完整的管理功能集合：

| 功能模块 | 说明 |
|----------|------|
| **仪表盘** | 今日消耗、今日充值、总用户数、活跃用户数 |
| **用户管理** | 列表、搜索、编辑余额/状态/角色、手动加 Token |
| **套餐管理** | 新增、编辑、上下架 |
| **价格配置** | 输入/输出 Token 单价配置 |
| **订单管理** | 订单列表、手动确认支付 |
| **系统消耗** | 每日消耗明细、汇总、实时消耗（直读 Hermes state.db）|
| **DeepSeek 数据** | 账户余额、API Key 列表（脱敏）、用量、摘要、账单 |
| **文件上传** | 管理员文件上传（最大 500MB） |
| **安全** | 强制踢下线 |

---

## 8. 安全机制

### 8.1 认证与授权

| 机制 | 说明 |
|------|------|
| **JWT 令牌** | 基于 HS256 签名，含用户 ID 和角色 |
| **密码哈希** | bcrypt 算法，自动加盐 |
| **Token 黑名单** | Redis 实现，支持主动踢下线 |
| **管理员会话** | Redis 会话，10 分钟无操作过期 |
| **角色校验** | `get_admin_user` 依赖注入验证管理员权限 |

### 8.2 速率限制

| 场景 | 限制 |
|------|:----:|
| 登录 | 10次/5分钟 |
| 验证码发送 | 3次/5分钟 |
| 注册 | 3次/1小时 |
| 管理员 API | 60次/分钟 |

### 8.3 数据安全

| 措施 | 说明 |
|------|------|
| **密码脱敏** | 日志中间件自动隐藏请求体中的 password 字段 |
| **API Key 脱敏** | 管理后台 API Key 列表自动脱敏（仅显示前后几位） |
| **路径穿越防护** | 文件上传/下载使用 `os.path.basename` 消毒文件名 |
| **CORS 限制** | 仅允许白名单域名跨域访问 |
| **幂等设计** | Token 扣减使用 request_id 幂等键防止重复扣费 |

### 8.4 其他安全措施

- 数据库连接池（pool_size=10, pool_pre_ping=True）
- 管理员邮箱固定，非管理员邮箱无法通过管理员登录接口
- 文件上传大小限制（500MB）
- 强制踢下线支持（清除所有设备登录状态）

---

## 9. 部署与运维

### 9.1 环境要求

| 组件 | 版本要求 |
|------|----------|
| Python | 3.12+ |
| PostgreSQL | 14+ |
| Redis | 6+ |
| Node.js | 18+（前端构建） |
| Claude Code CLI | 最新版 |

### 9.2 环境变量配置

```bash
# .env 文件配置
JWT_SECRET_KEY=<随机密钥>
MAIL_AUTH_CODE=<163邮箱授权码>
DATABASE_URL=postgresql+psycopg2://user:password@localhost:5432/tokenmanager
REDIS_URL=redis://:password@localhost:6379/1
DEEPSEEK_API_KEY=<DeepSeek API Key>
DEEPSEEK_EMAIL=<DeepSeek 登录邮箱>
DEEPSEEK_PASSWORD=<DeepSeek 登录密码>
DEEPSEEK_USER_TOKEN=<DeepSeek 持久化 Token>
DEEPSEEK_CF_CLEARANCE=<cf_clearance cookie>
USAGE_API_KEY=<内部 API Key>
```

### 9.3 启动流程

```bash
# 1. 安装后端依赖
cd backend
pip install -r requirements.txt

# 2. 初始化数据库
python init_db.py
python seed.py

# 3. 构建前端
cd ../mobile && npm install && npm run build
cd ../admin && npm install && npm run build

# 4. 启动服务
cd ../backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 9.4 运维脚本

| 脚本 | 说明 |
|------|------|
| `scripts/build-and-deploy.sh` | 全量构建部署 |
| `scripts/sync_daily_usage.py` | 同步每日系统用量到数据库 |

### 9.5 日志

日志文件位于 `logs/` 目录：

| 文件 | 说明 |
|------|------|
| `logs/operations_YYYY-MM-DD.log` | 每日操作日志（JSON 格式） |
| `logs/error.log` | 错误日志 |

---

## 10. 前端项目

### 10.1 H5 移动端 (`mobile/`)

- **技术栈：** Vue 3 + Vite
- **构建产物：** `mobile/dist/`
- **功能：** Token 消耗统计、充值、DeepSeek 账单、AI 聊天、数据工作台

### 10.2 管理后台 (`admin/`)

- **技术栈：** React + Vite
- **构建产物：** `admin/dist/`
- **功能：** 用户管理、套餐管理、价格配置、系统报表、DeepSeek 数据面板

### 10.3 静态文件服务

后端自动挂载前端构建产物：

```
/ → mobile/dist/ (移动端 SPA)
/admin → admin/dist/ (管理后台 SPA)
/assets/ → 共享静态资源目录
```

SPA 路由回退机制：所有非 API 路径请求返回对应前端的 `index.html`。

---

## 11. 辅助工具

### 11.1 文件管理工具 (`tools/`)

| 工具 | 说明 |
|------|------|
| `classify_engine.py` | 文件分类引擎（按扩展名分 8 类） |
| `date_filter.py` | 日期范围过滤器 |
| `file_manager_cli.py` | 命令行文件管理工具 |
| `report_generator.py` | 分类报告生成器 |
| `file_hash.py` | 文件哈希计算（MD5/SHA1/SHA256/SHA512） |

### 11.2 测试 (`tests/`)

| 文件 | 说明 |
|------|------|
| `conftest.py` | Hermes Agent 测试夹具（环境隔离、凭证过滤、超时保护） |
| `test_file_hash.py` | 文件哈希单元测试（正常/空/大文件/异常路径） |
| `test_validation.py` | 文件分类工具集成测试（8 个场景） |

---

## 附录

### A. 定价模型公式

```
实际金额(元) = (input_tokens / 1000) × input_price_per_k 
             + (output_tokens / 1000) × output_price_per_k

内部 Token 扣除数 = max(1, round(实际金额 × TOKENS_PER_YUAN))
```

### B. Token 消耗来源标识

| agent_name | 来源 |
|------------|------|
| `hermes` | Hermes Agent 主系统 |
| `chat` | AI 聊天模块 |
| `workspace` | 数据工作台 |
| `claude-terminal` | Claude Code 终端 |

### C. 请求 ID 格式

| 来源 | 格式 |
|------|------|
| 聊天 | `chat_{user_id}_{timestamp}` |
| 工作台 | `ws_{user_id}_{timestamp}` |
| 终端 | `ct_{user_id}_{timestamp}` |
| 配额系统 | `quota_{user_id}_{timestamp}_{random}` |
| 内部 API | 由调用方指定 |

### D. 默认套餐

| 名称 | Token 数量 | 价格 |
|------|:----------:|:----:|
| 10万 Token 体验包 | 100,000 | ¥1.00 |
| 100万 Token 基础包 | 1,000,000 | ¥5.00 |
| 1000万 Token 进阶包 | 10,000,000 | ¥30.00 |
| 1亿 Token 企业包 | 100,000,000 | ¥200.00 |

---

> **文档版本：** v1.0  
> **最后更新：** 2026-05-31  
> **项目路径：** `/root/TokenManager`

---

## 附录 E：功能可用性检查报告

基于生产环境运行日志（2026-05-31）及源码静态分析，以下是各功能的可用性评估：

### E.1 完全正常的功能

| 功能 | 说明 |
|------|------|
| **用户注册/登录** | 邮箱验证码登录正常工作，user_id=40 活跃使用中 |
| **用户信息查询** | `/api/user/profile` 返回 200，正常 |
| **Token消耗统计** | `/api/user/my-usage` 和 `/api/user/my-usage-list` 返回 200 |
| **H5移动端首页** | `/` 返回 200，SPA 正常加载 |
| **管理后台页面** | `/admin/dashboard`、`/admin/usage` 静态页面正常加载（200） |
| **静态资源服务** | JS/CSS 资源文件正常加载（200） |
| **文件上传** | `/api/chat/upload` 返回 200，上传正常 |
| **数据工作台** | `/api/workspace/process` 返回 200（SSE 流启动），`/api/workspace/output` 返回 200 |
| **操作日志系统** | 日志双写（文件+数据库）持续正常运行 |
| **请求日志中间件** | 所有请求均被正确记录到日志文件 |

### E.2 存在 Bug 的功能

| 功能 | Bug 详情 | 严重程度 | 原因 |
|------|----------|:--------:|------|
| **我的对话列表** (`/api/user/my-conversations`) | SQL 语法错误：`AND or(token_usage.request_id LIKE ...)` — `or()` 函数被错误地作为 SQL 关键字拼接 | 🔴 高 | `user.py:146` 行使用了 `from sqlalchemy import or_ as sa_or`，但 `sa_or(...)` 是 Python 函数调用，生成的 SQL 却是 `AND or(...)`，说明 SQLAlchemy 版本兼容问题或 `sa_or` 未被正确识别为 SQL 表达式 |
| **管理后台 API 调用** (`/api/admin/ping` 等) | 用户 user_id=40 持续返回 403 Forbidden | 🔴 高 | 用户已通过邮箱验证码登录（有 JWT），但 `get_admin_user` 依赖注入中的 Redis 会话检查失败（`has_admin_session` 返回 False），或者用户角色不是 admin |
| **Claude Code 聊天** (`/api/chat/stream`) | 启动时读取 `/root/.deepseek_key`，且依赖 `/usr/bin/claude` 二进制 | 🟡 中 | 如果 claude 二进制不存在或 DeepSeek Key 文件缺失，整个聊天功能不可用 |
| **Claude 终端** (`/api/claude-terminal`) | 同样依赖 `/usr/bin/claude` 和 `/root/.deepseek_key` | 🟡 中 | 同上 |

### E.3 潜在风险（未触发但代码层面存在问题）

| 问题 | 文件 | 说明 |
|------|------|------|
| **`or_` 导入问题** | `user.py:128` | `from sqlalchemy import ... or_ as sa_or` — 这种导入方式在 SQLAlchemy 2.x 中可能因 `or_` 不是顶级导出而失败。实际上 `or_` 在 `sqlalchemy.sql.expression` 中，正确导入应为 `from sqlalchemy import or_` |
| **硬编码文件路径** | `chat.py:31,33` | `open("/root/.deepseek_key")` 和 `CLAUDE_BIN = "/usr/bin/claude"` 硬编码，缺乏环境检测和友好的错误提示 |
| **`admin.py:192` 废弃 API** | `admin.py` | `data.dict()` 在 Pydantic v2 中已弃用，应使用 `data.model_dump()` |
| **`admin.py:209` 废弃 API** | `admin.py` | 同上，`data.dict(exclude_none=True)` 应改为 `data.model_dump(exclude_none=True)` |
| **SQLite 数据库文件** | `backend/token_manager.db` | 项目配置使用 PostgreSQL，但存在 SQLite 数据库文件，可能是开发/测试遗留 |
| **缺少 requirements.txt** | 项目根 | 没有依赖清单文件，新环境部署时需要手动排查依赖 |
| **`services/__init__.py` 和 `services/token_calc.py` 内容重复** | `services/` | 两个文件内容完全相同，存在重复代码 |
| **管理后台用户持续 403** | `deps.py` | `get_admin_user` 检查 Redis 会话 `has_admin_session`，但用户可能通过 httpOnly Cookie 登录（`auth.py:169-177` 设置了 Cookie），而 `get_admin_user` 依赖注入在 `get_current_user` 中回退到 Cookie，但 `get_admin_user` 额外检查 Redis 会话是否存在——如果用户登录时没有调用 `set_admin_session`（仅在 `admin/login` 和 `code-login` 中调用），则管理后台接口会拒绝访问 |

### E.4 功能可用性总结

```
✅ 完全正常:  10 项（用户系统、消耗统计、前端页面、文件上传、日志系统）
🔴 有 Bug:    2 项（我的对话列表、管理后台 API）
🟡 有风险:    2 项（AI 聊天、Claude 终端依赖外部二进制）
```

**最紧急的问题：**
1. **管理后台 403** — 用户已登录但无法调用管理接口，影响管理员使用
2. **我的对话列表 SQL 错误** — 接口返回 500，用户无法查看对话历史