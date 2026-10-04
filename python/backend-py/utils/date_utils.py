"""
🛠️ Date Utilities
Python equivalent of utils/dateUtils.js
Converts date preset strings into actual datetime objects.
"""

from datetime import datetime, timedelta


def resolve_date_preset(preset: str) -> datetime | None:
    """
    Converts strings like 'today', '7days', '30days' into datetime objects.
    Also accepts ISO date strings directly.
    """
    if not preset:
        return None

    now = datetime.now()
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)

    preset_lower = preset.lower()

    if preset_lower == "today":
        return start_of_day
    elif preset_lower == "7days":
        return start_of_day - timedelta(days=7)
    elif preset_lower == "30days":
        return start_of_day - timedelta(days=30)
    else:
        if preset in (None, "null", "undefined", "Invalid Date", ""):
            return None
        try:
            return datetime.fromisoformat(preset)
        except (ValueError, TypeError):
            return None
