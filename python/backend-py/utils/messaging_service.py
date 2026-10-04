"""
📡 Messaging Service (MSG91)
Python/httpx equivalent of utils/messagingService.js
Handles SMS and WhatsApp (Transaction & OTP) via MSG91 and Meta Direct API.
"""

import json
import httpx


async def send_sms(mobile: str, message: str, config: dict = None) -> dict:
    """Send SMS via MSG91. Config must come from profileMaster."""
    try:
        msg91_config = (config or {}).get("msg91")
        if not msg91_config or not msg91_config.get("isActive"):
            return {
                "success": False,
                "message": "SMS (MSG91) is not configured or active for this corporate"
            }

        auth_key = msg91_config.get("authkey")
        sender_id = msg91_config.get("sender_id")
        if not auth_key or not sender_id:
            return {"success": False, "message": "SMS configuration is incomplete in profileMaster"}

        url = msg91_config.get("url", "https://api.msg91.com/api/v2/sendsms")
        payload = {
            "sender": sender_id,
            "route": "4",
            "country": "91",
            "sms": [{"message": message, "to": [mobile]}],
        }

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json", "authkey": auth_key},
            )
            data = resp.json()

        return {
            "success": data.get("type") == "success",
            "message": data.get("message", "SMS sent"),
        }
    except Exception as e:
        return {"success": False, "message": str(e)}


async def send_whatsapp(mobile: str, template_id: str,
                        placeholders: dict = None, config: dict = None) -> dict:
    """Send WhatsApp message via Meta Direct API."""
    try:
        meta_config = (config or {}).get("whatsapp_meta")
        if not meta_config or not meta_config.get("isActive"):
            return {
                "success": False,
                "message": "WhatsApp (Meta) is not configured or active for this corporate"
            }

        token = meta_config.get("token")
        phone_number_id = (meta_config.get("phone_number_id") or "").strip().replace("+", "")
        base_url = meta_config.get("url", "https://graph.facebook.com/v25.0")

        if not token or not phone_number_id:
            return {"success": False, "message": "WhatsApp Meta configuration is incomplete"}

        recipient = mobile if mobile.startswith("91") else f"91{mobile}"
        url = f"{base_url}/{phone_number_id}/messages"

        payload: dict = {
            "messaging_product": "whatsapp",
            "to": recipient,
            "type": "template",
            "template": {
                "name": template_id,
                "language": {"code": "en_US" if template_id == "hello_world" else "en"},
            },
        }

        placeholders = placeholders or {}
        if template_id != "hello_world" and placeholders:
            otp_value = str(placeholders.get("1") or next(iter(placeholders.values()), ""))
            payload["template"]["components"] = [
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": otp_value}],
                },
                {
                    "type": "button",
                    "sub_type": "url",
                    "index": 0,
                    "parameters": [{"type": "text", "text": otp_value}],
                },
            ]

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {token}",
                },
            )
            data = resp.json()

        if "error" in data:
            return {
                "success": False,
                "message": f"{data['error'].get('message', 'Error')} (Template: {template_id})"
            }

        messages = data.get("messages", [])
        msg_id = messages[0].get("id") if messages else None
        return {
            "success": True,
            "channel": "whatsapp",
            "message": "WhatsApp message sent via Meta API",
            "messageId": msg_id,
        }
    except Exception as e:
        return {"success": False, "message": str(e)}


async def send_otp(mobile: str, otp: str, channel: str = "whatsapp",
                   config: dict = None, purpose: str = "register") -> dict:
    """Send OTP via WhatsApp (primary) or MSG91 SMS (fallback)."""
    try:
        if channel == "whatsapp":
            templates = (config or {}).get("whatsapp_meta", {}).get("templates", [])
            template_id = next(
                (t.get("template_id") for t in templates if t.get("purpose") == purpose),
                None
            )
            if not template_id:
                template_id = (
                    (config or {}).get("msg91", {}).get("whatsapp_template_id")
                    or "hipk_singup"
                )
            return await send_whatsapp(mobile, template_id, {"1": otp}, config)

        # SMS fallback via MSG91
        msg91_config = (config or {}).get("msg91")
        if not msg91_config or not msg91_config.get("isActive"):
            return {"success": False, "message": "SMS fallback is not configured or active"}

        auth_key = msg91_config.get("authkey")
        template_id = msg91_config.get("template_id")
        if not auth_key or not template_id:
            return {"success": False, "message": "SMS fallback configuration is incomplete"}

        payload = {
            "template_id": template_id,
            "mobile": mobile,
            "otp": otp,
            "otp_length": "6",
            "otp_expiry": "5",
        }
        url = msg91_config.get("url", "https://api.msg91.com/api/v5/otp")

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json", "Authkey": auth_key},
            )
            data = resp.json()

        return {
            "success": data.get("type") == "success",
            "channel": "sms",
            "message": "OTP sent via SMS" if data.get("type") == "success" else data.get("message"),
        }
    except Exception as e:
        return {"success": False, "message": str(e)}
