"""
✅ Validate Auth Middleware
Python/FastAPI equivalent of middleware/validateAuth.js
Validates mobile, email, password, Aadhar, PAN, GST using regex patterns.
"""

import re
from fastapi import Request, HTTPException
from datetime import datetime

# ── Regex Patterns ─────────────────────────────────────────────────────────────
REGEX = {
    "name":     re.compile(r"^[A-Za-z0-9 .,@'\-]+$"),
    "mobile":   re.compile(r"^[6-9]\d{9}$"),
    "email":    re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$"),
    "pan":      re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$"),
    "gst":      re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"),
    "aadhar":   re.compile(r"^\d{12}$"),
    "pin":      re.compile(r"^\d{6}$"),
    "password": re.compile(r"^(?=.*[A-Z])(?=.*[!@#$%^&*()\-_=+{}\[\]|;:'\",.<>/?]).{8,}$"),
    "url":      re.compile(r"^https?://[^\s/$.?#].[^\s]*$", re.IGNORECASE),
}


def format_date(date) -> str:
    """Format date to DD-MM-YYYY string."""
    if not date:
        return ""
    try:
        if isinstance(date, str):
            d = datetime.fromisoformat(date)
        elif isinstance(date, datetime):
            d = date
        else:
            return ""
        return d.strftime("%d-%m-%Y")
    except Exception:
        return ""


def format_mobile(mobile) -> dict | None:
    """Normalize mobile number, returns dict with plain/with91/withPlus91 or None."""
    if not mobile:
        return None
    m = re.sub(r"\D", "", str(mobile))
    if len(m) == 12 and m.startswith("91"):
        m = m[2:]
    if len(m) == 11 and m.startswith("0"):
        m = m[1:]
    if len(m) != 10:
        return None
    return {
        "plain": m,
        "with91": f"91{m}",
        "withPlus91": f"+91{m}",
    }


async def validate_auth(request: Request):
    """
    FastAPI dependency that validates common auth request fields.
    Raises HTTP 422 with an errors list on validation failure.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    user_email = body.get("userEmail")
    user_mobile = body.get("userMobile")
    user_aadhar = body.get("userAadhar")
    user_password = body.get("userPassword")
    corporate_pan = body.get("corporatePAN")
    corporate_gst = body.get("corporateGST")
    mobile = body.get("mobile")  # for login/otp

    errors = []

    phone_to_test = user_mobile or mobile
    if phone_to_test and not REGEX["mobile"].match(str(phone_to_test)):
        errors.append("Invalid mobile number. 10 digits starting with 6-9 required.")

    if user_email and not REGEX["email"].match(str(user_email)):
        errors.append("Invalid email format.")

    if user_password and not REGEX["password"].match(str(user_password)):
        errors.append("Password must be 8+ chars, 1 uppercase, and 1 special char.")

    if user_aadhar and not REGEX["aadhar"].match(str(user_aadhar)):
        errors.append("Aadhar must be exactly 12 digits.")

    if corporate_pan and not REGEX["pan"].match(str(corporate_pan)):
        errors.append("Invalid PAN card format.")

    if corporate_gst and corporate_gst != "Un-Registered":
        if not REGEX["gst"].match(str(corporate_gst)):
            errors.append("Invalid GST number format.")

    if errors:
        raise HTTPException(status_code=422, detail={"success": False, "errors": errors})
