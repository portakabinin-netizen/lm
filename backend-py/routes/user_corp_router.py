"""
🏢 UserCorp Router
Python/FastAPI equivalent of routes/UserCorpRouter.js
CRM Leads, HR Employees, Catalog, Parties, Staff, Chat, Profile
"""

from fastapi import APIRouter, Depends, Request, UploadFile, File
from middleware.tenant_middleware import get_tenant_context
from controller import user_corp_controller as ctrl
from controller import chat_controller as chat_ctrl
from controller import finance_controller as finance_ctrl

router = APIRouter(tags=["UserCorp"])

# ── Public routes ──────────────────────────────────────────────────────────────
@router.post("/leads/public-inquiry")
async def web_inquiry(request: Request):
    return await ctrl.web_inquiry(request)

# ── All other routes require auth + tenant ─────────────────────────────────────
def get_ctx(request: Request, user: dict = Depends(get_tenant_context)):
    return user

# --- 🎯 LEADS (CRM) ---
@router.get("/leads/list")
async def leads_list(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.leads_list(request)

@router.post("/leads/addMany")
async def leads_add_many(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.leads_add_many(request)

@router.get("/leads/search")
async def leads_search(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.leads_search_by_mobile(request)

@router.get("/leads/analytics")
async def leads_analytics(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.leads_analytics(request)

@router.get("/leads/all/gallery")
async def leads_all_gallery(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.leads_get_all_gallery(request)

@router.get("/leads/project-active")
async def leads_project_active(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.leads_get_project_active(request)

@router.get("/leads/project-gallery")
async def leads_project_gallery(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.leads_get_project_gallery(request)

@router.get("/leads/status/{status}")
async def leads_by_status(status: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.leads_get_by_status(request, status)

@router.get("/leads/export/excel")
async def leads_export(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.leads_download(request)

@router.post("/email/readInbox")
async def read_inbox(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.leads_read_inbox(request)

@router.get("/leads/{id}/shifts")
async def get_site_shifts(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.leads_get_site_shifts(request, id)

@router.put("/leads/{id}/shifts")
async def update_site_shifts(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.leads_update_site_shifts(request, id)

@router.get("/leads/{id}")
async def lead_get(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.lead_get(request, id)

@router.post("/leads/create")
async def lead_create(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.lead_create(request)

@router.put("/leads/{id}")
async def lead_update(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.lead_update(request, id)

@router.delete("/leads/{id}")
async def lead_delete(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.lead_delete(request, id)

@router.post("/leads/{id}/activity")
async def add_activity(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.lead_add_activity(request, id)

@router.put("/leads/{lead_id}/activity/{activity_id}")
async def update_activity(lead_id: str, activity_id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.lead_update_activity(request, lead_id, activity_id)

@router.delete("/leads/{lead_id}/activity/{activity_id}")
async def delete_activity(lead_id: str, activity_id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.lead_delete_activity(request, lead_id, activity_id)

@router.post("/leads/{id}/site-client-check")
async def add_site_client_check(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.lead_add_site_client_check(request, id)

@router.post("/leads/{id}/site-visit")
async def log_site_visit(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.lead_log_site_visit(request, id)

# --- 📦 CATALOG (Inventory) ---
@router.get("/catalog/template")
async def catalog_template(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.catalog_generate_template(request)

@router.post("/catalog/bulk")
async def catalog_bulk_upload(request: Request, file: UploadFile = File(...), _: dict = Depends(get_ctx)):
    return await ctrl.catalog_upload_bulk(request, file)

@router.get("/catalog/products")
async def products_list(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.products_list(request)

@router.post("/catalog/products")
async def products_create(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.products_create(request)

@router.put("/catalog/products/{id}")
async def products_update(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.products_update(request, id)

@router.delete("/catalog/products/{id}")
async def products_delete(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.products_delete(request, id)

# --- 👷 HR (Employees & Attendance) ---
@router.get("/hr/employees")
async def employees_list(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.employees_list(request)

@router.get("/hr/employees/{id}")
async def employee_get(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.employee_get(request, id)

@router.post("/hr/employees")
async def employee_create(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.employee_create(request)

@router.put("/hr/employees/{id}")
async def employee_update(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.employee_update(request, id)

@router.delete("/hr/employees/{id}")
async def employee_delete(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.employee_delete(request, id)

@router.get("/hr/attendance")
async def list_attendance(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.list_attendance(request)

@router.get("/hr/attendance-dashboard")
async def attendance_dashboard(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_attendance_dashboard(request)

@router.get("/hr/attendance/bulk-template")
async def attendance_bulk_template(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.generate_attendance_template(request)

@router.post("/hr/attendance/bulk-upload")
async def attendance_bulk_upload(request: Request, file: UploadFile = File(...), _: dict = Depends(get_ctx)):
    return await ctrl.bulk_import_attendance(request, file)

@router.get("/hr/attendance/active")
async def get_active_attendance(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_active_attendance(request)

@router.get("/hr/attendance/active-staff")
async def list_active_staff(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.list_active_staff(request)

@router.get("/hr/attendance/roster-suggestion")
async def roster_suggestion(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_roster_suggestion(request)

@router.post("/hr/attendance/toggle")
async def toggle_attendance(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.toggle_attendance(request)

@router.post("/hr/attendance/emergency-end-employee")
async def emergency_end_employee(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.emergency_end_employee(request)

@router.post("/hr/attendance/continue-shift")
async def continue_shift(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.continue_shift(request)

@router.post("/hr/broadcast")
async def send_broadcast(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.send_broadcast(request)

@router.post("/hr/attendance/lock-worker")
async def lock_worker(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.lock_worker_attendance(request)

@router.post("/hr/attendance")
async def mark_attendance(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.mark_attendance(request)

@router.post("/hr/attendance/mark-paid")
async def mark_paid(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.mark_paid(request)

@router.post("/hr/attendance/clean-reconcile")
async def clean_reconcile(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.clean_and_reconcile_attendance(request)

@router.post("/hr/attendance/{id}/geo-compact")
async def upload_geo_compact(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.upload_geo_compact(request, id)

@router.put("/hr/attendance/{id}")
async def update_attendance(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.update_attendance(request, id)

@router.delete("/hr/attendance/{id}")
async def delete_attendance(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.delete_attendance(request, id)

@router.get("/hr/rate-lookup")
async def rate_lookup(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_rate_lookup(request)

# --- 👥 PARTIES ---
@router.get("/parties/clients")
async def clients_list(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.clients_list(request)

@router.post("/parties/clients")
async def clients_create(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.clients_create(request)

@router.put("/parties/clients/{id}")
async def clients_update(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.clients_update(request, id)

@router.delete("/parties/clients/{id}")
async def clients_delete(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.clients_delete(request, id)

@router.get("/parties/suppliers")
async def suppliers_list(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.suppliers_list(request)

@router.post("/parties/suppliers")
async def suppliers_create(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.suppliers_create(request)

@router.put("/parties/suppliers/{id}")
async def suppliers_update(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.suppliers_update(request, id)

@router.delete("/parties/suppliers/{id}")
async def suppliers_delete(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.suppliers_delete(request, id)

# --- 👤 STAFF ---
@router.get("/staff")
async def staff_list(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.staff_list(request)

@router.post("/staff")
async def staff_create(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.staff_create(request)

@router.put("/staff/{id}")
async def staff_update(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.staff_update(request, id)

@router.delete("/staff/{id}")
async def staff_delete(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.staff_delete(request, id)

# --- 💬 CHAT ---
@router.post("/chat/send")
async def chat_send(request: Request, _: dict = Depends(get_ctx)):
    return await chat_ctrl.send_message(request)

@router.get("/chat/latest-request")
async def chat_latest_request(request: Request, _: dict = Depends(get_ctx)):
    return await chat_ctrl.get_latest_request(request)

@router.put("/chat/requests/status")
async def chat_update_request_status(request: Request, _: dict = Depends(get_ctx)):
    return await chat_ctrl.update_request_status(request)

@router.get("/chat/messages")
async def chat_get_messages(request: Request, _: dict = Depends(get_ctx)):
    return await chat_ctrl.get_messages(request)

@router.put("/chat/seen")
async def chat_mark_seen(request: Request, _: dict = Depends(get_ctx)):
    return await chat_ctrl.mark_as_seen(request)

@router.post("/chat/groups")
async def chat_create_group(request: Request, _: dict = Depends(get_ctx)):
    return await chat_ctrl.create_group(request)

@router.get("/chat/groups")
async def chat_get_groups(request: Request, _: dict = Depends(get_ctx)):
    return await chat_ctrl.get_groups(request)

@router.put("/chat/groups/member")
async def chat_add_member(request: Request, _: dict = Depends(get_ctx)):
    return await chat_ctrl.add_group_member(request)

@router.delete("/chat/groups/member")
async def chat_remove_member(request: Request, _: dict = Depends(get_ctx)):
    return await chat_ctrl.remove_group_member(request)

# --- 🏢 CORPORATE PROFILE ---
@router.get("/profile")
async def profile_get(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.profile_get(request)

@router.put("/profile")
async def profile_update(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.profile_update(request)

# --- 📊 FINANCE SERVICE ADAPTERS ---
@router.get("/finance/ledgers")
async def get_ledger_transactions(request: Request, _: dict = Depends(get_ctx)):
    return await finance_ctrl.get_ledger_transactions(request)

@router.put("/finance/ledgers/{id}")
async def update_ledger_by_service(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await finance_ctrl.manage_ledgers_update(request, id)
