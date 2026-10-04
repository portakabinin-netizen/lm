"""
💳 Payment Router
Python/FastAPI equivalent of routes/paymentRouter.js
"""

from fastapi import APIRouter, Depends, Request
from middleware.tenant_middleware import get_tenant_context
from controller import legacy_finance_adapter as ctrl

router = APIRouter(tags=["Payment"])

def get_ctx(request: Request, user: dict = Depends(get_tenant_context)):
    return user

# Lead-linked endpoints
@router.get("/leads-picker")
async def get_leads_for_picker(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_leads_for_picker(request)

@router.get("/lead-ledger/{lead_id}")
async def get_lead_ledger(lead_id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_lead_ledger(request, lead_id)

@router.get("/by-lead/{lead_id}")
async def get_transactions_by_lead(lead_id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_transactions_by_lead(request, lead_id)

# CRUD
@router.post("/voucher/create")
async def create_voucher(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.create_voucher(request)

@router.post("/create")
async def create_transaction(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.create_transaction(request)

@router.get("/list")
async def list_transactions(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.list_transactions(request)

@router.get("/summary")
async def get_payment_summary(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_payment_summary(request)

@router.get("/{id}")
async def get_transaction(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_transaction(request, id)

@router.put("/{id}")
async def update_transaction(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.update_transaction(request, id)

@router.delete("/{id}")
async def delete_transaction(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.delete_transaction(request, id)
