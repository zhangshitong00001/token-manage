"""
DeepSeek 平台支付网关
- 邮箱密码自动登录获取 Bearer Token
- Token 过期自动刷新
- 扫码支付下单 + 确认
"""
import json
import time
import requests
from datetime import datetime
from typing import Optional
from app.config import settings


class DeepSeekPayment:
    """DeepSeek 支付网关（自动刷新 Session Token）"""

    LOGIN_URL = "https://platform.deepseek.com/auth-api/v0/users/login"
    PAYMENT_URL = "https://platform.deepseek.com/api/v1/payments"
    BALANCE_URL = "https://api.deepseek.com/user/balance"

    def __init__(self):
        self._token: Optional[str] = None
        self._cookies: dict = {}
        self._expires_at: float = 0  # token 过期时间戳
        self._last_refresh: float = 0

    # ─── 登录 / 刷新 Token ───

    def _login(self) -> bool:
        """用邮箱密码登录 DeepSeek，获取 Bearer Token + Cookie"""
        email = settings.DEEPSEEK_EMAIL
        password = settings.DEEPSEEK_PASSWORD
        if not email or not password:
            raise ValueError("缺少 DEEPSEEK_EMAIL / DEEPSEEK_PASSWORD 配置")

        device_id = f"hermes_tokenmanager_{int(time.time())}"
        resp = requests.post(
            self.LOGIN_URL,
            json={
                "email": email,
                "mobile": "",
                "password": password,
                "area_code": "",
                "device_id": device_id,
                "os": "web",
            },
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                              "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            timeout=15,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"DeepSeek 登录失败: {resp.status_code} {resp.text[:200]}")

        data = resp.json()
        # Bearer Token 通常在 data.token 或 authorization 字段
        token = (data.get("data") or data).get("token") or data.get("access_token") or \
                resp.headers.get("authorization", "").replace("Bearer ", "")
        if not token:
            # 尝试从 cookie/header 取
            token = resp.cookies.get("token", "")

        self._token = token
        # 把 cookies 存起来（cf_clearance 等）
        self._cookies = dict(resp.cookies)
        # 默认保活 6 小时（保险起见 5 小时刷新一次）
        self._expires_at = time.time() + 5 * 3600
        self._last_refresh = time.time()
        return True

    def _ensure_token(self):
        """确保 Token 有效，过期则自动重登"""
        if self._token and time.time() < self._expires_at:
            return
        self._login()

    def _refresh_if_needed(self, response: requests.Response):
        """如果返回 401，自动重新登录并重试"""
        if response.status_code == 401:
            self._token = None
            self._login()
            return True
        return False

    # ─── 公共方法 ───

    def get_headers(self) -> dict:
        self._ensure_token()
        return {
            "authorization": f"Bearer {self._token}",
            "content-type": "application/json",
            "accept": "*/*",
            "x-app-version": "1.0.0",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        }

    def get_balance(self) -> dict:
        """查询 DeepSeek 账户余额"""
        api_key = settings.DEEPSEEK_API_KEY
        if api_key:
            # 有 API Key 的话用免登录接口
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
        # 降级：用 token 查（如果已登录）
        try:
            self._ensure_token()
            resp = requests.get(
                "https://platform.deepseek.com/api/v1/user/balance",
                headers=self.get_headers(),
                cookies=self._cookies,
                timeout=10,
            )
            if resp.ok:
                return resp.json()
        except Exception:
            pass
        return {"available": False, "error": "请配置 DEEPSEEK_API_KEY"}

    def create_qr_payment(self, amount_yuan: Optional[float] = None) -> dict:
        """
        创建扫码支付订单
        返回: { payment_id, qrcode_url, qrcode_base64, amount, status }
        """
        self._ensure_token()
        body = {}
        if amount_yuan:
            body["amount"] = amount_yuan

        resp = requests.post(
            f"{self.PAYMENT_URL}",
            json=body,
            headers=self.get_headers(),
            cookies=self._cookies,
            timeout=15,
        )
        if self._refresh_if_needed(resp):
            resp = requests.post(
                f"{self.PAYMENT_URL}",
                json=body,
                headers=self.get_headers(),
                cookies=self._cookies,
                timeout=15,
            )
        if not resp.ok:
            raise RuntimeError(f"创建支付失败: {resp.status_code} {resp.text[:300]}")
        return resp.json()

    def capture_payment(self, payment_id: str) -> dict:
        """
        确认扫码支付完成（用户扫码付款后调用）
        """
        self._ensure_token()
        resp = requests.post(
            f"{self.PAYMENT_URL}/{payment_id}/capture",
            headers=self.get_headers(),
            cookies=self._cookies,
            timeout=15,
        )
        if self._refresh_if_needed(resp):
            resp = requests.post(
                f"{self.PAYMENT_URL}/{payment_id}/capture",
                headers=self.get_headers(),
                cookies=self._cookies,
                timeout=15,
            )
        if not resp.ok:
            raise RuntimeError(f"确认支付失败: {resp.status_code} {resp.text[:300]}")
        return resp.json()

    def query_payment(self, payment_id: str) -> dict:
        """查询支付状态"""
        self._ensure_token()
        resp = requests.get(
            f"{self.PAYMENT_URL}/{payment_id}",
            headers=self.get_headers(),
            cookies=self._cookies,
            timeout=10,
        )
        if self._refresh_if_needed(resp):
            resp = requests.get(
                f"{self.PAYMENT_URL}/{payment_id}",
                headers=self.get_headers(),
                cookies=self._cookies,
                timeout=10,
            )
        if not resp.ok:
            raise RuntimeError(f"查询支付失败: {resp.status_code} {resp.text[:300]}")
        return resp.json()


# 全局单例
deepseek_payment = DeepSeekPayment()
