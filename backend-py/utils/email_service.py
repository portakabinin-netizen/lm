"""
📧 Email Service
Python/aiosmtplib equivalent of utils/emailService.js
Handles SMTP email sending using tenant or environment configuration.
"""

import os
import re
import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from dotenv import load_dotenv

load_dotenv()

APP_NAME = os.getenv("APP_NAME", "HIPK")


async def send_email(to: str, subject: str, body: str, config: dict = None) -> dict:
    """
    Send email via SMTP. Config format mirrors profileMaster.mailConfigure.
    Falls back to environment variables if config is None.
    """
    try:
        mail_cfg = (config or {}).get("mailConfigure") or {
            "host": os.getenv("MAIL_HOST", "smtp.gmail.com"),
            "port": int(os.getenv("MAIL_PORT", 587)),
            "secure": os.getenv("MAIL_SECURE", "false").lower() == "true",
            "auth": {
                "user": os.getenv("MAIL_USER"),
                "pass": os.getenv("MAIL_PASS"),
            },
        }

        auth = mail_cfg.get("auth", {})
        if not auth.get("user") or not auth.get("pass"):
            return {"success": False, "message": "Email configuration incomplete"}

        # Strip HTML for plain text fallback
        plain_text = re.sub(r"<[^>]*>", "", body)

        msg = MIMEMultipart("alternative")
        msg["From"] = f"{APP_NAME} <{auth['user']}>"
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(plain_text, "plain"))
        msg.attach(MIMEText(body, "html"))

        use_tls = mail_cfg.get("secure", False)
        use_starttls = not use_tls and int(mail_cfg.get("port", 587)) == 587

        await aiosmtplib.send(
            msg,
            hostname=mail_cfg.get("host", "smtp.gmail.com"),
            port=int(mail_cfg.get("port", 587)),
            username=auth["user"],
            password=auth["pass"],
            use_tls=use_tls,
            start_tls=use_starttls,
        )

        return {"success": True, "message": "Email sent successfully"}
    except Exception as e:
        print(f"🔴 Email Service Error: {e}")
        return {"success": False, "message": str(e)}
