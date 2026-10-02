"""
💳 Legacy Finance Adapter
Python/FastAPI equivalent of controller/LegacyFinanceAdapter.js
Payment book transactions, lead ledger, staff picker
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from bson import ObjectId
from datetime import datetime


def _s(doc):
    if doc:
        doc["_id"] = str(doc.get("_id", ""))
    return doc or {}

def _sl(docs):
    for d in docs:
        d["_id"] = str(d.get("_id", ""))
    return docs


async def get_leads_for_picker(request: Request):
    try:
        models = request.state.tenant_models
        docs = await models["Leads"].find({}, {"name": 1, "mobile": 1, "status": 1}).to_list(length=None)
        return JSONResponse({"success": True, "data": _sl(docs)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def get_lead_ledger(request: Request, lead_id: str):
    try:
        models = request.state.tenant_models
        vouchers = await models["Vouchers"].find({"leadId": lead_id}).to_list(length=None)
        return JSONResponse({"success": True, "data": _sl(vouchers)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def get_transactions_by_lead(request: Request, lead_id: str):
    try:
        models = request.state.tenant_models
        docs = await models["Vouchers"].find({"leadId": lead_id}).to_list(length=None)
        return JSONResponse({"success": True, "data": _sl(docs)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def create_voucher(request: Request):
    try:
        body = await request.json()
        models = request.state.tenant_models
        result = await models["Vouchers"].insert_one({**body, "createdAt": datetime.utcnow()})
        return JSONResponse({"success": True, "id": str(result.inserted_id)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def create_transaction(request: Request):
    try:
        body = await request.json()
        models = request.state.tenant_models
        result = await models["Vouchers"].insert_one({**body, "createdAt": datetime.utcnow(), "type": "payment"})
        return JSONResponse({"success": True, "id": str(result.inserted_id)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def list_transactions(request: Request):
    try:
        models = request.state.tenant_models
        docs = await models["Vouchers"].find({}).to_list(length=500)
        return JSONResponse({"success": True, "data": _sl(docs)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def get_payment_summary(request: Request):
    try:
        models = request.state.tenant_models
        total = await models["Vouchers"].count_documents({})
        return JSONResponse({"success": True, "data": {"total": total}})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def get_transaction(request: Request, id: str):
    try:
        models = request.state.tenant_models
        doc = await models["Vouchers"].find_one({"_id": ObjectId(id)})
        return JSONResponse({"success": True, "data": _s(doc)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def update_transaction(request: Request, id: str):
    try:
        body = await request.json()
        models = request.state.tenant_models
        await models["Vouchers"].update_one({"_id": ObjectId(id)}, {"$set": {**body, "updatedAt": datetime.utcnow()}})
        return JSONResponse({"success": True})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def delete_transaction(request: Request, id: str):
    try:
        models = request.state.tenant_models
        await models["Vouchers"].delete_one({"_id": ObjectId(id)})
        return JSONResponse({"success": True})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def get_staff_picker(request: Request):
    try:
        models = request.state.tenant_models
        employees = await models["Employees"].find({}, {"name": 1, "mobile": 1}).to_list(length=None)
        return JSONResponse({"success": True, "data": _sl(employees)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def add_contact(request: Request):
    try:
        body = await request.json()
        models = request.state.tenant_models
        result = await models["Clients"].insert_one({**body, "createdAt": datetime.utcnow()})
        return JSONResponse({"success": True, "id": str(result.inserted_id)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def get_contact_ledger(request: Request, mobile: str):
    try:
        models = request.state.tenant_models
        import re
        docs = await models["Vouchers"].find({"mobile": re.compile(mobile[-10:] + "$")}).to_list(length=None)
        return JSONResponse({"success": True, "data": _sl(docs)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


async def get_employee_ledger_by_id(request: Request, id: str):
    try:
        models = request.state.tenant_models
        docs = await models["Vouchers"].find({"employeeId": id}).to_list(length=None)
        return JSONResponse({"success": True, "data": _sl(docs)})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)
