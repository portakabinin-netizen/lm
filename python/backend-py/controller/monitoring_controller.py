"""
🛡️ Monitoring Controller
Python/FastAPI equivalent of controller/monitoringController.js
Guard Alertness Monitoring — start/stop sessions, heartbeat, challenge/respond
"""

import random
from fastapi import Request
from fastapi.responses import JSONResponse
from bson import ObjectId
from datetime import datetime


async def start_monitoring(request: Request):
    try:
        body = await request.json()
        models = request.state.tenant_models
        user = request.state.user

        doc = {
            "employeeId": user.get("_id"),
            "employeeName": user.get("userDisplayName"),
            "status": "active",
            "startedAt": datetime.utcnow(),
            "lastHeartbeat": datetime.utcnow(),
            "dbName": request.state.tenant_db_name,
            **body,
        }
        result = await models["GuardMonitoring"].insert_one(doc)
        return JSONResponse({"success": True, "sessionId": str(result.inserted_id)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def stop_monitoring(request: Request):
    try:
        body = await request.json()
        models = request.state.tenant_models
        session_id = body.get("sessionId")

        await models["GuardMonitoring"].update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"status": "ended", "endedAt": datetime.utcnow()}}
        )
        return JSONResponse({"success": True, "message": "Monitoring session ended"})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def heartbeat(request: Request):
    try:
        body = await request.json()
        models = request.state.tenant_models
        session_id = body.get("sessionId")

        await models["GuardMonitoring"].update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"lastHeartbeat": datetime.utcnow(), "status": "active"}}
        )
        return JSONResponse({"success": True, "timestamp": datetime.utcnow().isoformat()})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def get_challenge(request: Request):
    try:
        session_id = request.query_params.get("sessionId")
        models = request.state.tenant_models

        session = await models["GuardMonitoring"].find_one({"_id": ObjectId(session_id)})
        if not session:
            return JSONResponse({"success": False, "message": "Session not found"}, status_code=404)

        challenge = session.get("activeChallenge")
        return JSONResponse({"success": True, "challenge": challenge})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def respond_challenge(request: Request):
    try:
        body = await request.json()
        models = request.state.tenant_models
        session_id = body.get("sessionId")
        answer = body.get("answer")

        session = await models["GuardMonitoring"].find_one({"_id": ObjectId(session_id)})
        if not session:
            return JSONResponse({"success": False, "message": "Session not found"}, status_code=404)

        challenge = session.get("activeChallenge", {})
        correct = str(challenge.get("answer", "")) == str(answer)

        await models["GuardMonitoring"].update_one(
            {"_id": ObjectId(session_id)},
            {
                "$set": {"activeChallenge": None, "lastResponse": datetime.utcnow()},
                "$push": {"responses": {"answer": answer, "correct": correct, "at": datetime.utcnow()}}
            }
        )
        return JSONResponse({"success": True, "correct": correct})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def report_failure(request: Request):
    try:
        body = await request.json()
        models = request.state.tenant_models
        session_id = body.get("sessionId")

        await models["GuardMonitoring"].update_one(
            {"_id": ObjectId(session_id)},
            {
                "$set": {"status": "failed"},
                "$push": {"failures": {"reason": body.get("reason"), "at": datetime.utcnow()}}
            }
        )
        return JSONResponse({"success": True, "message": "Failure reported"})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def get_status(request: Request):
    try:
        models = request.state.tenant_models
        cursor = models["GuardMonitoring"].find({"status": "active"})
        sessions = await cursor.to_list(length=None)
        for s in sessions:
            s["_id"] = str(s["_id"])
        return JSONResponse({"success": True, "data": sessions, "count": len(sessions)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)
