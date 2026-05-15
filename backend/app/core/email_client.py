"""邮箱发送工具 - 通过 163 SMTP 发送管理员登录验证码"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import settings


def send_email_code(to_email: str, code: str) -> None:
    """发送登录验证码邮件"""
    subject = "TokenManager 管理后台登录验证码"
    body = f"""
<div style="max-width:480px;margin:0 auto;padding:24px;font-family:'Microsoft YaHei',sans-serif;background:#f8f9fc;border-radius:12px;">
  <div style="text-align:center;padding:24px 0;">
    <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#667eea,#764ba2);margin:0 auto 12px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;">🔐</div>
    <h2 style="margin:0;color:#333;font-size:20px;">TokenManager 管理后台</h2>
    <p style="color:#999;font-size:13px;margin:4px 0 0;">管理员登录验证</p>
  </div>
  <div style="background:#fff;border-radius:12px;padding:32px 24px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <p style="color:#666;font-size:14px;margin:0 0 16px;">您的登录验证码为：</p>
    <div style="font-size:42px;font-weight:700;letter-spacing:8px;color:#667eea;background:#f0f2ff;padding:16px 24px;border-radius:12px;display:inline-block;font-family:monospace;">{code}</div>
    <p style="color:#999;font-size:12px;margin:16px 0 0;">验证码 5 分钟内有效，请勿泄露给他人</p>
  </div>
  <p style="text-align:center;color:#bbb;font-size:11px;margin-top:24px;">此邮件由系统自动发送，请勿回复</p>
</div>
"""

    msg = MIMEMultipart("alternative")
    msg["From"] = settings.SMTP_USER
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "html", "utf-8"))

    # 获取密码：优先 mail_auth_code，回退 SMTP_PASSWORD
    password = settings.MAIL_AUTH_CODE or settings.SMTP_PASSWORD
    if not password:
        raise RuntimeError("SMTP 密码未配置，请在 .env 中设置 mail_auth_code")

    with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.login(settings.SMTP_USER, password)
        server.sendmail(settings.SMTP_USER, to_email, msg.as_string())
