"""
🛡️ Monitoring Router
Python/FastAPI equivalent of routes/monitoringRouter.js
Guard Alertness Monitoring
"""

from fastapi import APIRouter, Depends, Request
from middleware.tenant_middleware import get_tenant_context
from controller import monitoring_controller as ctrl

router = APIRouter(tags=["Monitoring"])

def get_ctx(request: Request, user: dict = Depends(get_tenant_context)):
    return user

# Guard-side routes
@router.post("/start")
async def start_monitoring(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.start_monitoring(request)

@router.post("/stop")
async def stop_monitoring(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.stop_monitoring(request)

@router.post("/heartbeat")
async def heartbeat(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.heartbeat(request)

@router.get("/challenge")
async def get_challenge(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_challenge(request)

@router.post("/respond")
async def respond_challenge(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.respond_challenge(request)

@router.post("/failure")
async def report_failure(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.report_failure(request)

# Supervisor-side routes
@router.get("/status")
async def get_status(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_status(request)
