"""
👷 Staff Router
Python/FastAPI equivalent of routes/staffRouter.js
"""

from fastapi import APIRouter, Depends, Request
from middleware.tenant_middleware import get_tenant_context
from controller import legacy_finance_adapter as ctrl

router = APIRouter(tags=["Staff"])

def get_ctx(request: Request, user: dict = Depends(get_tenant_context)):
    return user

@router.get("/picker")
async def get_staff_picker(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_staff_picker(request)

@router.post("/contact/add")
async def add_contact(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.add_contact(request)

@router.get("/contact/ledger/{mobile}")
async def get_contact_ledger(mobile: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_contact_ledger(request, mobile)

@router.get("/contact/ledger-by-id/{id}")
async def get_employee_ledger_by_id(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_employee_ledger_by_id(request, id)
