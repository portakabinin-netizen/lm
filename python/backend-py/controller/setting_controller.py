"""
⚙️ Setting Controller
Python/FastAPI equivalent of controller/settingService.js
Corporate settings, admin user management, other user management.
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from bson import ObjectId
from datetime import datetime


def _serialize(doc) -> dict:
    if not doc:
        return {}
    doc["_id"] = str(doc["_id"])
    return doc


async def get_corporate(request: Request):
    try:
        models = request.state.tenant_models
        profile = await models["ProfileMaster"].find_one({})
        return JSONResponse({"success": True, "data": _serialize(profile)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def post_corporate(request: Request):
    try:
        body = await request.json()
        models = request.state.tenant_models
        await models["ProfileMaster"].update_one({}, {"$set": {**body, "updatedAt": datetime.utcnow()}}, upsert=True)
        return JSONResponse({"success": True, "message": "Corporate profile updated"})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def add_corporate(request: Request):
    try:
        body = await request.json()
        from utils.db_connector import db_connector
        main_db = await db_connector.get_main_connection()
        user = request.state.user
        await main_db["userMaster"].update_one(
            {"_id": ObjectId(user["_id"])},
            {"$addToSet": {"accessCorporate": body}}
        )
        return JSONResponse({"success": True, "message": "Corporate added"})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def get_admin_user(request: Request):
    try:
        from utils.db_connector import db_connector
        main_db = await db_connector.get_main_connection()
        user = request.state.user
        doc = await main_db["userMaster"].find_one({"_id": ObjectId(user["_id"])})
        return JSONResponse({"success": True, "data": _serialize(doc)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def post_admin_user(request: Request):
    try:
        body = await request.json()
        from utils.db_connector import db_connector
        main_db = await db_connector.get_main_connection()
        user = request.state.user
        body.pop("userPassword", None)  # never update password here
        await main_db["userMaster"].update_one(
            {"_id": ObjectId(user["_id"])},
            {"$set": {**body, "updatedAt": datetime.utcnow()}}
        )
        return JSONResponse({"success": True, "message": "User updated"})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def get_other_user(request: Request):
    try:
        from utils.db_connector import db_connector
        main_db = await db_connector.get_main_connection()
        db_name = request.state.tenant_db_name
        cursor = main_db["userMaster"].find(
            {"accessCorporate.dbName": db_name},
            {"userPassword": 0}
        )
        users = await cursor.to_list(length=None)
        for u in users:
            u["_id"] = str(u["_id"])
        return JSONResponse({"success": True, "data": users})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def get_other_user_by_id(request: Request, id: str):
    try:
        from utils.db_connector import db_connector
        main_db = await db_connector.get_main_connection()
        user = await main_db["userMaster"].find_one({"_id": ObjectId(id)}, {"userPassword": 0})
        return JSONResponse({"success": True, "data": _serialize(user)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def post_other_user(request: Request, id: str):
    try:
        body = await request.json()
        from utils.db_connector import db_connector
        main_db = await db_connector.get_main_connection()
        body.pop("userPassword", None)
        await main_db["userMaster"].update_one(
            {"_id": ObjectId(id)},
            {"$set": {**body, "updatedAt": datetime.utcnow()}}
        )
        return JSONResponse({"success": True, "message": "User updated"})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def search_user(request: Request):
    try:
        query = request.query_params.get("q", "")
        from utils.db_connector import db_connector
        import re
        main_db = await db_connector.get_main_connection()
        regex = re.compile(query, re.IGNORECASE)
        cursor = main_db["userMaster"].find(
            {"$or": [{"userDisplayName": regex}, {"userMobile": regex}, {"userEmail": regex}]},
            {"userPassword": 0}
        ).limit(20)
        users = await cursor.to_list(length=20)
        for u in users:
            u["_id"] = str(u["_id"])
        return JSONResponse({"success": True, "data": users})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def assign_corporate(request: Request, id: str):
    try:
        body = await request.json()
        from utils.db_connector import db_connector
        main_db = await db_connector.get_main_connection()
        await main_db["userMaster"].update_one(
            {"_id": ObjectId(id)},
            {"$addToSet": {"accessCorporate": body}}
        )
        return JSONResponse({"success": True, "message": "Corporate assigned"})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def unassign_corporate(request: Request, id: str):
    try:
        body = await request.json()
        from utils.db_connector import db_connector
        main_db = await db_connector.get_main_connection()
        await main_db["userMaster"].update_one(
            {"_id": ObjectId(id)},
            {"$pull": {"accessCorporate": {"dbName": body.get("dbName")}}}
        )
        return JSONResponse({"success": True, "message": "Corporate unassigned"})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)
