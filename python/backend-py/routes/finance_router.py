"""
💰 Finance Router
Python/FastAPI equivalent of routes/FinanceRouter.js
"""

from fastapi import APIRouter, Depends, Request, UploadFile, File
from middleware.tenant_middleware import get_tenant_context
from controller import finance_controller as ctrl

router = APIRouter(tags=["Finance"])

# All finance routes require auth + tenant
def get_ctx(request: Request, user: dict = Depends(get_tenant_context)):
    return user

# --- 📊 MASTER ---
@router.get("/master")
async def get_accounting_master(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_accounting_master(request)

@router.get("/analytics")
async def get_analytics(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_analytics(request)

# --- 📑 GROUPS ---
@router.get("/groups")
async def list_groups(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_groups_list(request)

@router.post("/groups")
async def create_group(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_groups_create(request)

@router.put("/groups/{id}")
async def update_group(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_groups_update(request, id)

@router.delete("/groups/{id}")
async def delete_group(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_groups_delete(request, id)

# --- 📖 LEDGERS ---
@router.get("/ledgers")
async def list_ledgers(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_ledgers_list(request)

@router.get("/ledgers/lookup")
async def lookup_entities(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_ledgers_lookup_entities(request)

@router.post("/ledgers")
async def create_ledger(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_ledgers_create(request)

@router.put("/ledgers/{id}")
async def update_ledger(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_ledgers_update(request, id)

@router.delete("/ledgers/{id}")
async def delete_ledger(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_ledgers_delete(request, id)

@router.get("/petty-cash/balances")
async def get_petty_cash_balances(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_petty_cash_balances(request)

@router.get("/petty-cash/transactions")
async def get_petty_cash_transactions(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_petty_cash_transactions(request)

@router.post("/contra/approve")
async def approve_contra_voucher(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.approve_contra_voucher(request)

# --- 🎫 VOUCHERS ---
@router.get("/vouchers/bulk-template")
async def generate_voucher_template(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.generate_voucher_template(request)

@router.post("/vouchers/bulk-upload")
async def bulk_import_vouchers(request: Request, file: UploadFile = File(...), _: dict = Depends(get_ctx)):
    return await ctrl.bulk_import_vouchers(request, file)

@router.get("/vouchers/salary-enrollment-template")
async def generate_salary_template(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.generate_salary_dues_by_enrollment_template(request)

@router.post("/vouchers/salary-enrollment-upload")
async def bulk_import_salary(request: Request, file: UploadFile = File(...), _: dict = Depends(get_ctx)):
    return await ctrl.bulk_import_salary_by_enrollment(request, file)

@router.get("/vouchers")
async def list_vouchers(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_vouchers_list(request)

@router.get("/vouchers/ledger/{ledger_id}")
async def get_by_ledger(ledger_id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_vouchers_get_by_ledger(request, ledger_id)

@router.post("/vouchers/temp-save")
async def save_temp_voucher(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.save_temp_voucher(request)

@router.post("/vouchers/temp-post")
async def post_from_temp_voucher(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.post_from_temp_voucher(request)

@router.post("/vouchers")
async def create_voucher(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_vouchers_create(request)

@router.put("/vouchers/{id}")
async def update_voucher(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_vouchers_update(request, id)

@router.delete("/vouchers/{id}")
async def delete_voucher(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_vouchers_delete(request, id)

# --- 💸 SALARY & PAYROLL ---
@router.get("/salary/voucher")
async def get_salary_voucher(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_salary_voucher(request)

@router.post("/salary/post-journal")
async def post_salary_journal(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.post_salary_journal(request)

@router.post("/salary/post-payment")
async def post_salary_payment(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.post_salary_payment(request)

# --- 📄 QUOTATIONS ---
@router.get("/quotations")
async def list_quotations(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_quotations_list(request)

@router.get("/quotations/{id}")
async def get_quotation(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_quotations_get(request, id)

@router.post("/quotations")
async def create_quotation(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_quotations_create(request)

@router.put("/quotations/{id}")
async def update_quotation(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_quotations_update(request, id)

@router.delete("/quotations/{id}")
async def delete_quotation(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_quotations_delete(request, id)

# --- 📄 PURCHASE ORDERS ---
@router.get("/pos")
async def list_pos(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_purchase_orders_list(request)

@router.get("/pos/{id}")
async def get_po(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_purchase_orders_get(request, id)

@router.post("/pos")
async def create_po(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_purchase_orders_create(request)

@router.put("/pos/{id}")
async def update_po(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_purchase_orders_update(request, id)

@router.delete("/pos/{id}")
async def delete_po(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_purchase_orders_delete(request, id)

# --- 📄 TAX INVOICES ---
@router.get("/invoices")
async def list_invoices(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_tax_invoices_list(request)

@router.get("/invoices/{id}")
async def get_invoice(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_tax_invoices_get(request, id)

@router.post("/invoices")
async def create_invoice(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_tax_invoices_create(request)

@router.put("/invoices/{id}")
async def update_invoice(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_tax_invoices_update(request, id)

@router.delete("/invoices/{id}")
async def delete_invoice(id: str, request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.manage_tax_invoices_delete(request, id)

# --- Ledger transactions (service adapter) ---
@router.get("/ledger-transactions")
async def get_ledger_transactions(request: Request, _: dict = Depends(get_ctx)):
    return await ctrl.get_ledger_transactions(request)
