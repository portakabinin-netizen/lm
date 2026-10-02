"""
⚙️ Setting Router
Python/FastAPI equivalent of routes/settingRouter.js
"""

from fastapi import APIRouter, Depends, Request
from middleware.tenant_middleware import get_tenant_context
from controller import setting_controller

router = APIRouter(tags=["Setting"])

# All routes require auth + tenant (get_tenant_context already includes auth)

@router.get("/update/corporate")
async def get_corporate(request: Request, user: dict = Depends(get_tenant_context)):
    return await setting_controller.get_corporate(request)

@router.put("/update/corporate")
async def post_corporate(request: Request, user: dict = Depends(get_tenant_context)):
    return await setting_controller.post_corporate(request)

@router.post("/update/add-corporate")
async def add_corporate(request: Request, user: dict = Depends(get_tenant_context)):
    return await setting_controller.add_corporate(request)

@router.get("/update/user")
async def get_admin_user(request: Request, user: dict = Depends(get_tenant_context)):
    return await setting_controller.get_admin_user(request)

@router.put("/update/user")
async def post_admin_user(request: Request, user: dict = Depends(get_tenant_context)):
    return await setting_controller.post_admin_user(request)

@router.get("/update/other-user")
async def get_other_user(request: Request, user: dict = Depends(get_tenant_context)):
    return await setting_controller.get_other_user(request)

@router.get("/update/other-user/{id}")
async def get_other_user_by_id(id: str, request: Request, user: dict = Depends(get_tenant_context)):
    return await setting_controller.get_other_user_by_id(request, id)

@router.put("/update/other-user/{id}")
async def post_other_user(id: str, request: Request, user: dict = Depends(get_tenant_context)):
    return await setting_controller.post_other_user(request, id)

@router.get("/search/user")
async def search_user(request: Request, user: dict = Depends(get_tenant_context)):
    return await setting_controller.search_user(request)

@router.put("/assign-corporate/{id}")
async def assign_corporate(id: str, request: Request, user: dict = Depends(get_tenant_context)):
    return await setting_controller.assign_corporate(request, id)

@router.delete("/assign-corporate/{id}")
async def unassign_corporate(id: str, request: Request, user: dict = Depends(get_tenant_context)):
    return await setting_controller.unassign_corporate(request, id)
