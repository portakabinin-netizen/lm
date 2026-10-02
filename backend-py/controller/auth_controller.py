"""
🔑 Auth Controller
Python/FastAPI equivalent of controller/authController.js
Stub implementations — mirror all function signatures from the JS controller.
"""

import os
import re
import random
from datetime import datetime, timedelta
from fastapi import Request
from fastapi.responses import JSONResponse
from jose import jwt
from dotenv import load_dotenv

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "hipk2025-26").strip()
JWT_EXPIRE_DAYS = 180

from utils.db_connector import db_connector
from models.user_master import get_user_master_collection, hash_password, verify_password
from utils.tenant_security import encode_db_name


def _make_token(payload: dict) -> str:
    exp = datetime.utcnow() + timedelta(days=JWT_EXPIRE_DAYS)
    return jwt.encode({**payload, "exp": exp}, JWT_SECRET, algorithm="HS256")


async def health_check(request: Request):
    return JSONResponse({"success": True, "message": "Auth service is healthy"})


async def send_otp(request: Request):
    """Send OTP via WhatsApp or SMS."""
    try:
        body = await request.json()
        mobile = str(body.get("mobile", "")).strip()
        db_name = body.get("dbName")

        if not mobile:
            return JSONResponse({"success": False, "message": "Mobile is required"}, status_code=400)

        otp = str(random.randint(100000, 999999))

        # Store OTP in main DB with 5-min TTL
        main_db = await db_connector.get_main_connection()
        await main_db["otpStore"].update_one(
            {"mobile": mobile},
            {"$set": {"otp": otp, "createdAt": datetime.utcnow(), "dbName": db_name}},
            upsert=True,
        )

        # Send OTP via messaging service
        config = None
        if db_name:
            tenant_db = await db_connector.get_tenant_connection(db_name)
            profile = await tenant_db["ProfileMaster"].find_one({})
            config = profile.get("messagingConfig") if profile else None

        from utils.messaging_service import send_otp as _send_otp
        channel = body.get("channel", "whatsapp")
        result = await _send_otp(mobile, otp, channel=channel, config=config)

        return JSONResponse({"success": True, "message": "OTP sent", "channel": channel, **result})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def verify_otp(request: Request):
    """Verify OTP and return JWT."""
    try:
        body = await request.json()
        mobile = str(body.get("mobile", "")).strip()
        otp = str(body.get("otp", "")).strip()

        main_db = await db_connector.get_main_connection()
        record = await main_db["otpStore"].find_one({"mobile": mobile})

        if not record:
            return JSONResponse({"success": False, "message": "OTP not found or expired"}, status_code=400)

        # 5-minute expiry
        age = (datetime.utcnow() - record["createdAt"]).total_seconds()
        if age > 300:
            return JSONResponse({"success": False, "message": "OTP expired"}, status_code=400)

        if record["otp"] != otp:
            return JSONResponse({"success": False, "message": "Invalid OTP"}, status_code=400)

        # Clean up
        await main_db["otpStore"].delete_one({"mobile": mobile})

        # Find user
        users = get_user_master_collection(main_db)
        user = await users.find_one({"userMobile": mobile})
        if not user:
            return JSONResponse({"success": False, "message": "User not found. Please register."}, status_code=404)

        token = _make_token({
            "userId": str(user["_id"]),
            "userRole": user.get("userRole"),
            "dbName": (user.get("accessCorporate") or [{}])[0].get("dbName"),
            "userDisplayName": user.get("userDisplayName"),
            "userEmail": user.get("userEmail"),
        })
        return JSONResponse({"success": True, "token": token, "user": {
            "_id": str(user["_id"]),
            "userDisplayName": user.get("userDisplayName"),
            "userRole": user.get("userRole"),
        }})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def register(request: Request):
    """Register a new user."""
    try:
        body = await request.json()
        main_db = await db_connector.get_main_connection()
        users = get_user_master_collection(main_db)

        mobile = str(body.get("userMobile", "")).strip()
        if await users.find_one({"userMobile": mobile}):
            return JSONResponse({"success": False, "message": "Mobile already registered"}, status_code=409)

        hashed = hash_password(body.get("userPassword", ""))
        doc = {
            "userDisplayName": body.get("userDisplayName", ""),
            "userEmail": body.get("userEmail", "").lower().strip(),
            "userMobile": mobile,
            "userPassword": hashed,
            "userRole": body.get("userRole", "userAdmin"),
            "userActive": True,
            "accessCorporate": [],
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
        }
        result = await users.insert_one(doc)
        return JSONResponse({"success": True, "message": "Registered successfully", "userId": str(result.inserted_id)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def login(request: Request):
    """Login with mobile + password."""
    try:
        body = await request.json()
        mobile = str(body.get("userMobile") or body.get("mobile", "")).strip()
        password = body.get("userPassword", "")

        main_db = await db_connector.get_main_connection()
        users = get_user_master_collection(main_db)
        user = await users.find_one({"userMobile": mobile})

        if not user:
            return JSONResponse({"success": False, "message": "User not found"}, status_code=404)

        if not verify_password(password, user.get("userPassword", "")):
            return JSONResponse({"success": False, "message": "Invalid credentials"}, status_code=401)

        corps = user.get("accessCorporate", [])
        active_corp = next((c for c in corps if c.get("isActive")), corps[0] if corps else {})

        token = _make_token({
            "userId": str(user["_id"]),
            "userRole": user.get("userRole"),
            "dbName": active_corp.get("dbName"),
            "corporateName": active_corp.get("corporateName"),
            "corporateIds": [str(c.get("_id", "")) for c in corps],
            "userDisplayName": user.get("userDisplayName"),
            "userEmail": user.get("userEmail"),
            "ownMobile": mobile,
        })
        return JSONResponse({"success": True, "token": token})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def search_link_corp(request: Request):
    """Search for a corporate by PAN/name."""
    try:
        body = await request.json()
        query = body.get("query", "")
        main_db = await db_connector.get_main_connection()
        regex = re.compile(query, re.IGNORECASE)
        cursor = main_db["corporateMaster"].find(
            {"$or": [{"corporateName": regex}, {"corporatePAN": regex}]},
            {"corporateName": 1, "corporatePAN": 1, "dbName": 1}
        ).limit(20)
        results = await cursor.to_list(length=20)
        for r in results:
            r["_id"] = str(r["_id"])
        return JSONResponse({"success": True, "data": results})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def check_unique(request: Request):
    """Check if mobile/email is unique."""
    try:
        body = await request.json()
        main_db = await db_connector.get_main_connection()
        users = get_user_master_collection(main_db)
        query = {}
        if body.get("userMobile"):
            query["userMobile"] = body["userMobile"]
        elif body.get("userEmail"):
            query["userEmail"] = body["userEmail"].lower()
        if not query:
            return JSONResponse({"success": False, "message": "Provide mobile or email"}, status_code=400)
        exists = await users.find_one(query)
        return JSONResponse({"success": True, "isUnique": not bool(exists)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def unregistered_login(request: Request):
    """Allow login without registration (guest mode)."""
    try:
        body = await request.json()
        mobile = str(body.get("mobile", "")).strip()
        db_name = body.get("dbName")
        token = _make_token({
            "userId": f"guest_{mobile}",
            "userRole": "Guest",
            "dbName": db_name,
            "ownMobile": mobile,
        })
        return JSONResponse({"success": True, "token": token, "role": "Guest"})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def verify_identity(request: Request):
    return JSONResponse({"success": True, "message": "Identity verified"})


async def reset_password(request: Request):
    try:
        body = await request.json()
        mobile = str(body.get("mobile", "")).strip()
        new_password = body.get("newPassword", "")

        main_db = await db_connector.get_main_connection()
        users = get_user_master_collection(main_db)
        hashed = hash_password(new_password)
        result = await users.update_one(
            {"userMobile": mobile},
            {"$set": {"userPassword": hashed, "updatedAt": datetime.utcnow()}}
        )
        if result.matched_count == 0:
            return JSONResponse({"success": False, "message": "User not found"}, status_code=404)
        return JSONResponse({"success": True, "message": "Password reset successfully"})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def resolve_guest_role(request: Request):
    return JSONResponse({"success": True, "message": "Guest role resolved"})


async def switch_corporate(request: Request):
    try:
        body = await request.json()
        user = request.state.user
        db_name = body.get("dbName")
        corp_name = body.get("corporateName", "")

        token = _make_token({
            "userId": user.get("userId"),
            "userRole": user.get("userRole"),
            "dbName": db_name,
            "corporateName": corp_name,
            "userDisplayName": user.get("userDisplayName"),
            "userEmail": user.get("userEmail"),
            "ownMobile": user.get("ownMobile"),
        })
        return JSONResponse({"success": True, "token": token})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def update_profile_image(request: Request):
    return JSONResponse({"success": True, "message": "Profile image updated"})


async def delete_profile_image(request: Request):
    return JSONResponse({"success": True, "message": "Profile image deleted"})


async def get_profile_history(request: Request):
    return JSONResponse({"success": True, "data": []})


async def api_urls_configure_save(request: Request, id: str):
    return JSONResponse({"success": True, "message": "URL config saved"})


async def provision_tenant(request: Request):
    """Provision a new tenant database."""
    try:
        body = await request.json()
        pan = body.get("corporatePAN", "").strip().upper()
        if not pan:
            return JSONResponse({"success": False, "message": "corporatePAN is required"}, status_code=400)

        db_name = encode_db_name(pan)
        tenant_db = await db_connector.get_tenant_connection(db_name)
        # Create default profile
        existing = await tenant_db["ProfileMaster"].find_one({})
        if not existing:
            await tenant_db["ProfileMaster"].insert_one({
                "corporateName": body.get("corporateName", ""),
                "corporatePAN": pan,
                "createdAt": datetime.utcnow(),
            })
        return JSONResponse({"success": True, "dbName": db_name, "message": "Tenant provisioned"})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def send_message(request: Request):
    try:
        body = await request.json()
        mobile = body.get("mobile", "")
        message = body.get("message", "")
        config = None
        tenant_models = getattr(request.state, "tenant_models", {})
        profile_col = tenant_models.get("ProfileMaster")
        if profile_col is not None:
            profile = await profile_col.find_one({})
            if profile:
                config = profile.get("messagingConfig")

        from utils.messaging_service import send_sms
        result = await send_sms(mobile, message, config)
        return JSONResponse(result)
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)
