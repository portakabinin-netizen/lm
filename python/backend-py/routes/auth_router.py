"""
🔑 Auth Router
Python/FastAPI equivalent of routes/authRouterNew.js
"""

import os
import shutil
from fastapi import APIRouter, Depends, File, UploadFile, Request
from fastapi.responses import JSONResponse

from middleware.auth_middleware import get_auth_user
from middleware.validate_auth import validate_auth
from middleware.tenant_middleware import get_tenant_context
from controller import auth_controller

router = APIRouter(tags=["Auth"])

# ── Ensure uploads directory exists ────────────────────────────────────────────
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

# =========================================
# PUBLIC ROUTES (No Authorization Required)
# =========================================

@router.get("/health-check")
async def health_check(request: Request):
    return await auth_controller.health_check(request)

@router.post("/send-otp")
async def send_otp(request: Request):
    return await auth_controller.send_otp(request)

@router.post("/search")
async def search_link_corp(request: Request):
    return await auth_controller.search_link_corp(request)

@router.post("/verify-otp")
async def verify_otp(request: Request):
    return await auth_controller.verify_otp(request)

@router.post("/check-unique")
async def check_unique(request: Request):
    return await auth_controller.check_unique(request)

@router.post("/register")
async def register(request: Request, _: None = Depends(validate_auth)):
    return await auth_controller.register(request)

@router.post("/login")
async def login(request: Request, _: None = Depends(validate_auth)):
    return await auth_controller.login(request)

@router.post("/unregistered-login")
async def unregistered_login(request: Request):
    return await auth_controller.unregistered_login(request)

@router.post("/verify-identity")
async def verify_identity(request: Request, _: None = Depends(validate_auth)):
    return await auth_controller.verify_identity(request)

@router.post("/reset-password")
async def reset_password(request: Request):
    return await auth_controller.reset_password(request)

# ===========================================
# PROTECTED ROUTES (JWT Required)
# ===========================================

@router.post("/resolve-guest")
async def resolve_guest(request: Request, user: dict = Depends(get_auth_user)):
    request.state.user = user
    return await auth_controller.resolve_guest_role(request)

@router.post("/switch-corporate")
async def switch_corporate(request: Request, user: dict = Depends(get_auth_user)):
    request.state.user = user
    return await auth_controller.switch_corporate(request)

@router.post("/update-profile-image")
async def update_profile_image(
    request: Request,
    user: dict = Depends(get_tenant_context),
):
    return await auth_controller.update_profile_image(request)

@router.post("/delete-profile-image")
async def delete_profile_image(
    request: Request,
    user: dict = Depends(get_tenant_context),
):
    return await auth_controller.delete_profile_image(request)

@router.get("/get-profile-history")
async def get_profile_history(
    request: Request,
    user: dict = Depends(get_tenant_context),
):
    return await auth_controller.get_profile_history(request)

@router.put("/url-configure/{id}")
async def api_urls_configure_save(
    id: str,
    request: Request,
    user: dict = Depends(get_tenant_context),
):
    return await auth_controller.api_urls_configure_save(request, id)

@router.post("/provision-tenant")
async def provision_tenant(request: Request, user: dict = Depends(get_auth_user)):
    request.state.user = user
    return await auth_controller.provision_tenant(request)

@router.post("/send-message")
async def send_message(
    request: Request,
    user: dict = Depends(get_tenant_context),
):
    return await auth_controller.send_message(request)
