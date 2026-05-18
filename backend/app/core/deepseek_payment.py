"""
DeepSeek 平台支付网关
- 邮箱密码自动登录获取 Bearer Token
- Token 过期自动刷新
- 扫码支付下单 + 确认
- 统一使用 requests.Session() 保活 cookie
"""
import json
import time
import logging
import base64
import requests
import qrcode
from io import BytesIO
from typing import Optional
from app.config import settings

logger = logging.getLogger(__name__)


class DeepSeekPayment:
    """DeepSeek 支付网关（自动刷新 Session Token）"""

    LOGIN_URL = "https://platform.deepseek.com/auth-api/v0/users/login"
    PAYMENT_URL = "https://platform.deepseek.com/api/v1/payments"
    INVOICE_URL = "https://platform.deepseek.com/auth-api/v0/users/get_all_invoice"
    BALANCE_URL = "https://api.deepseek.com/user/balance"
    # 用 .env 或在调用时可以注入的持久化 Token
    _PERSISTENT_TOKEN = ""  # 可在运行时设置

    UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

    def __init__(self):
        self._session = requests.Session()
        self._token: Optional[str] = None
        self._expires_at: float = 0

    # ─── 登录 / 刷新 ───

    def _login(self) -> bool:
        """用邮箱密码登录 DeepSeek，获取 Bearer Token（自动保持 cookie）"""
        email = settings.DEEPSEEK_EMAIL
        password = settings.DEEPSEEK_PASSWORD
        if not email or not password:
            raise ValueError("缺少 DEEPSEEK_EMAIL / DEEPSEEK_PASSWORD 配置")

        device_id = f"hermes_tm_{int(time.time())}"
        resp = self._session.post(
            self.LOGIN_URL,
            json={
                "email": email, "mobile": "", "password": password,
                "area_code": "", "device_id": device_id, "os": "web",
            },
            headers={"Content-Type": "application/json", "User-Agent": self.UA},
            timeout=15,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"DeepSeek 登录失败: status={resp.status_code}")

        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"DeepSeek 登录失败: code={data.get('code')} msg={data.get('msg','')}")

        biz = (data.get("data") or {}).get("biz_data") or {}
        inner = biz.get("biz_data") or biz
        user = inner.get("user") or inner
        token = user.get("token", "")
        if not token:
            raise RuntimeError("登录成功但未获取到 token")

        self._token = token
        self._expires_at = time.time() + 4 * 3600  # 4小时保活
        logger.info(f"DeepSeek 登录成功, token={token[:20]}...")
        # _session 自动保存 cookies（cf_clearance 等），后续请求自动带
        # 设置默认 headers
        self._session.headers.update({
            "authorization": f"Bearer {token}",
            "content-type": "application/json",
            "user-agent": self.UA,
        })
        return True

    def _ensure_token(self):
        """确保 Token 有效，过期则自动重登"""
        if self._token and time.time() < self._expires_at:
            return
        # 重新创建 session
        self._session = requests.Session()
        self._token = None
        self._login()

    # ─── 公共 API ───

    def get_balance(self) -> dict:
        """查询 DeepSeek 账户余额（优先用 API Key，免登录）"""
        api_key = settings.DEEPSEEK_API_KEY
        if api_key:
            resp = requests.get(
                self.BALANCE_URL,
                headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
                timeout=10,
            )
            if resp.ok:
                data = resp.json()
                balances = data.get("balance_infos", [])
                cny = next((b for b in balances if b.get("currency") == "CNY"), {})
                return {
                    "available": data.get("is_available", False),
                    "cny_balance": float(cny.get("total_balance", 0)),
                    "cny_granted": float(cny.get("granted_balance", 0)),
                    "cny_topped_up": float(cny.get("topped_up_balance", 0)),
                }
        # 走登录后查询
        self._ensure_token()
        try:
            resp = self._session.get(
                "https://platform.deepseek.com/api/v1/user/balance", timeout=10)
            if resp.ok:
                return resp.json()
        except Exception:
            pass
        return {"available": False, "error": "请配置 DEEPSEEK_API_KEY"}

    def create_qr_payment(self, amount_yuan: float = 10,
                          method: str = "WECHAT",
                          product_name: str = "API 充值") -> dict:
        """
        创建 DeepSeek 扫码支付
        method: WECHAT / ALIPAY
        返回: { payment_order_id, url, method }
        """
        self._ensure_token()
        body = {
            "order_info": {
                "amount": str(amount_yuan),
                "currency": "CNY",
                "payment_method_type": method,
                "product_name": product_name,
            }
        }
        resp = self._session.post(self.PAYMENT_URL, json=body, timeout=15)
        if resp.status_code == 401:
            self._expires_at = 0
            self._ensure_token()
            resp = self._session.post(self.PAYMENT_URL, json=body, timeout=15)
        if not resp.ok:
            self._raise_error(resp)
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"DeepSeek 支付创建失败: {data.get('msg', resp.text[:200])}")

        # 检查 biz_code 业务错误（即使 HTTP 200 + code=0）
        biz_data = data.get("data") or {}
        biz_code = biz_data.get("biz_code")
        biz_msg = biz_data.get("biz_msg", "")
        if biz_code and biz_code != 0:
            friendly = {
                "DAILY_LIMIT_EXCEEDED": "今日充值限额已用尽，请明天再试或联系 DeepSeek 客服",
                "AMOUNT_TOO_SMALL": "充值金额低于最低限额，请增加金额",
                "AMOUNT_TOO_LARGE": "充值金额超出上限，请降低金额",
            }
            msg = friendly.get(biz_msg) or f"DeepSeek 业务错误: {biz_msg}"
            logger.error(f"支付创建业务错误: code={biz_code} msg={biz_msg}")
            raise RuntimeError(msg)

        # data.data.biz_data 可能直接是结果，也可能嵌套了 biz_data
        biz = biz_data.get("biz_data") or {}
        if "biz_data" in biz and isinstance(biz["biz_data"], dict):
            biz = biz["biz_data"]

        payment_url = biz.get("url", "")
        # 如有 fallback URL 用 fallback（H5 唤醒支付宝APP需要）
        fallback_url = biz.get("fallback", "")
        qr_b64 = ""
        if payment_url:
            try:
                img = qrcode.make(payment_url)
                buf = BytesIO()
                img.save(buf, format="PNG")
                qr_b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
            except Exception as e:
                logger.warning(f"生成二维码失败: {e}")

        return {
            "payment_order_id": biz.get("payment_order_id", ""),
            "url": payment_url,
            "fallback_url": fallback_url or payment_url,
            "qrcode_base64": qr_b64,
            "method": method.lower(),
        }

    def capture_payment(self, payment_order_id: str) -> dict:
        """
        确认支付完成（用户付款后调用）
        返回: { status, paid_at, wallet_updated }
            status: CREATED / PAID / FAILED
        """
        resp = self._session.post(f"{self.PAYMENT_URL}/{payment_order_id}/capture", timeout=15)
        if resp.status_code == 401:
            self._expires_at = 0
            self._ensure_token()
            resp = self._session.post(f"{self.PAYMENT_URL}/{payment_order_id}/capture", timeout=15)
        if not resp.ok:
            self._raise_error(resp)
        data = resp.json()
        order = (((data.get("data") or {}).get("biz_data") or {}).get("order") or {})
        return {
            "status": order.get("status", "UNKNOWN"),
            "paid_at": order.get("paid_at"),
            "wallet_updated": order.get("wallet_updated", False),
        }

    def query_payment(self, payment_order_id: str) -> dict:
        """查询支付状态（仅能查询已支付订单）"""
        resp = self._session.get(f"{self.PAYMENT_URL}/{payment_order_id}", timeout=10)
        if resp.status_code == 401:
            self._expires_at = 0
            self._ensure_token()
            resp = self._session.get(f"{self.PAYMENT_URL}/{payment_order_id}", timeout=10)
        if not resp.ok:
            self._raise_error(resp)
        return resp.json()

    def get_invoices(self, override_token: str = "") -> list[dict]:
        """获取 DeepSeek 平台所有充值账单记录
        可传入 override_token 使用外部有效 Token（如用户从浏览器复制的）
        """
        token = override_token or self._PERSISTENT_TOKEN
        if token:
            # 用外部 Token 创建一个独立的 session 请求
            sess = requests.Session()
            sess.headers.update({
                "authorization": f"Bearer {token}",
                "content-type": "application/json",
                "user-agent": self.UA,
            })
            # 设置 cf_clearance cookie（get_all_invoice 接口需要）
            cf = settings.DEEPSEEK_CF_CLEARANCE
            if cf:
                sess.cookies.set("cf_clearance", cf)
        from datetime import datetime as dt
        headers = {
            "accept": "*/*",
            "pragma": "no-cache",
            "priority": "u=1, i",
            "referer": "https://platform.deepseek.com/transactions",
            "sec-ch-ua": '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-app-version": "1.0.0",
        }
        # 选择 session：外部 Token 用独立 session，否则用 self._session（含自动登录）
        use_session = sess if token else self._session

        merged = use_session.headers.copy()
        merged.update(headers)
        resp = use_session.get(self.INVOICE_URL, headers=merged, timeout=15)
        if resp.status_code == 401:
            if token:
                raise RuntimeError("DeepSeek Token 已过期，请重新获取")
            self._expires_at = 0
            self._ensure_token()
            resp = self._session.get(self.INVOICE_URL, headers=merged, timeout=15)
        if not resp.ok:
            self._raise_error(resp)
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"获取账单失败: {data.get('msg', resp.text[:200])}")
        orders = (((data.get("data") or {}).get("biz_data") or {})
                   .get("invoices") or {}).get("payment_orders") or []
        # 解析支付方式
        for o in orders:
            pid = o.get("payment_order_id", "")
            if pid.startswith("wechat"):
                o["_method"] = "wechat"
            elif pid.startswith("alipay"):
                o["_method"] = "alipay"
            elif pid.startswith("cmbUnionPay"):
                o["_method"] = "unionpay"
            else:
                o["_method"] = "other"
        return orders

    def _raise_error(self, resp: requests.Response):
        detail = resp.text[:300]
        try:
            detail = json.dumps(resp.json(), ensure_ascii=False)[:300]
        except Exception:
            pass
        raise RuntimeError(f"DeepSeek API {resp.status_code}: {detail}")


# 全局单例
deepseek_payment = DeepSeekPayment()
