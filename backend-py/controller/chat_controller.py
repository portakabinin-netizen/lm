"""
💬 Chat Controller
Python/FastAPI equivalent of controller/chatController.js
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from bson import ObjectId
from datetime import datetime


def _id(doc):
    if doc:
        doc["_id"] = str(doc["_id"])
    return doc


async def send_message(request: Request):
    try:
        body = await request.json()
        models = request.state.tenant_models
        user = request.state.user

        doc = {
            **body,
            "senderId": user.get("_id"),
            "senderName": user.get("userDisplayName"),
            "createdAt": datetime.utcnow(),
            "seen": False,
        }
        result = await models["ChatMessages"].insert_one(doc)

        # Emit via Socket.IO
        io = getattr(request.app.state, "io", None)
        if io:
            db_name = request.state.tenant_db_name
            await io.to(db_name).emit("chat:new_message", {**doc, "_id": str(result.inserted_id)})

        return JSONResponse({"success": True, "messageId": str(result.inserted_id)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def get_latest_request(request: Request):
    try:
        models = request.state.tenant_models
        doc = await models["ChatRequests"].find_one({}, sort=[("createdAt", -1)])
        return JSONResponse({"success": True, "data": _id(doc)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def update_request_status(request: Request):
    try:
        body = await request.json()
        models = request.state.tenant_models
        await models["ChatRequests"].update_one(
            {"_id": ObjectId(body["_id"])},
            {"$set": {"status": body.get("status"), "updatedAt": datetime.utcnow()}}
        )
        return JSONResponse({"success": True, "message": "Status updated"})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def get_messages(request: Request):
    try:
        models = request.state.tenant_models
        group_id = request.query_params.get("groupId")
        query = {"groupId": group_id} if group_id else {}
        cursor = models["ChatMessages"].find(query).sort("createdAt", 1).limit(200)
        msgs = await cursor.to_list(length=200)
        for m in msgs:
            m["_id"] = str(m["_id"])
        return JSONResponse({"success": True, "data": msgs})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def mark_as_seen(request: Request):
    try:
        body = await request.json()
        models = request.state.tenant_models
        ids = [ObjectId(i) for i in body.get("ids", [])]
        await models["ChatMessages"].update_many(
            {"_id": {"$in": ids}},
            {"$set": {"seen": True}}
        )
        return JSONResponse({"success": True})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def create_group(request: Request):
    try:
        body = await request.json()
        models = request.state.tenant_models
        doc = {**body, "createdAt": datetime.utcnow()}
        result = await models["ChatGroups"].insert_one(doc)
        return JSONResponse({"success": True, "groupId": str(result.inserted_id)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def get_groups(request: Request):
    try:
        models = request.state.tenant_models
        cursor = models["ChatGroups"].find({})
        groups = await cursor.to_list(length=None)
        for g in groups:
            g["_id"] = str(g["_id"])
        return JSONResponse({"success": True, "data": groups})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def add_group_member(request: Request):
    try:
        body = await request.json()
        models = request.state.tenant_models
        await models["ChatGroups"].update_one(
            {"_id": ObjectId(body["groupId"])},
            {"$addToSet": {"members": body.get("memberId")}}
        )
        return JSONResponse({"success": True})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def remove_group_member(request: Request):
    try:
        body = await request.json()
        models = request.state.tenant_models
        await models["ChatGroups"].update_one(
            {"_id": ObjectId(body["groupId"])},
            {"$pull": {"members": body.get("memberId")}}
        )
        return JSONResponse({"success": True})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)
