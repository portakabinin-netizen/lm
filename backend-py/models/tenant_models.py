"""
🧱 Tenant Models
Python/Motor equivalent of models/TenantModels.js
Returns a dict of Motor collections for a given tenant database.
Collections are accessed via db[collection_name] which is already cached by Motor.
"""

from motor.motor_asyncio import AsyncIOMotorDatabase


def get_tenant_models(db: AsyncIOMotorDatabase) -> dict:
    """
    Returns a dict mapping model names → Motor collections for a tenant db.
    Motor caches collection objects per database, so this is O(1) after the
    first call (equivalent to Mongoose model() idempotent behavior).
    """
    return {
        # CRM / Leads
        "Leads": db["Leads"],
        "Activities": db["Activities"],
        "SiteVisits": db["SiteVisits"],

        # HR
        "Employees": db["Employees"],
        "Attendance": db["Attendance"],

        # Finance / Accounting
        "LedgerVoucherMaster": db["LedgerVoucherMaster"],
        "AccountingGroups": db["AccountingGroups"],
        "Ledgers": db["Ledgers"],
        "Vouchers": db["Vouchers"],
        "Quotations": db["Quotations"],
        "PurchaseOrders": db["PurchaseOrders"],
        "TaxInvoices": db["TaxInvoices"],
        "TempVouchers": db["TempVouchers"],

        # Parties
        "Clients": db["Clients"],
        "Suppliers": db["Suppliers"],

        # Catalog / Products
        "Products": db["Products"],

        # Staff / Users
        "StaffUsers": db["StaffUsers"],

        # Corporate Profile
        "ProfileMaster": db["ProfileMaster"],

        # Chat
        "ChatMessages": db["ChatMessages"],
        "ChatGroups": db["ChatGroups"],
        "ChatRequests": db["ChatRequests"],

        # Monitoring
        "GuardMonitoring": db["GuardMonitoring"],
        "StaffMonitoring": db["StaffMonitoring"],
    }
