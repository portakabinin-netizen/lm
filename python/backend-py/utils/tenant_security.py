"""
🔒 Tenant Security Utilities
Python equivalent of utils/tenantSecurity.js
Handles encoding of database names and passwords based on Corporate PAN and Date.
"""

import binascii
from datetime import datetime


def encode_db_name(pan: str) -> str:
    """Encode a Corporate PAN into hex for use as a database name."""
    if not pan:
        raise ValueError("PAN is required for encoding database name")
    return pan.upper().encode().hex()


def encode_db_password(pan: str, date) -> str:
    """Encode PAN + Date into hex for use as a database password."""
    if not pan or not date:
        raise ValueError("PAN and Date are required for encoding database password")

    if isinstance(date, datetime):
        date_str = date.strftime("%d%m%Y")
    else:
        import re
        date_str = re.sub(r"\D", "", str(date))

    combined = f"{pan.upper()}{date_str}"
    return combined.encode().hex()


def decode_hex(hex_str: str) -> str:
    """Decode a hex string back to the original string."""
    return bytes.fromhex(hex_str).decode()
