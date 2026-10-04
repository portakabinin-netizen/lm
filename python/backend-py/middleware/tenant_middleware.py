"""
🏢 Tenant Middleware
Python/FastAPI equivalent of middleware/tenantMiddleware.js
Resolves tenant DB connection and attaches models + location hierarchy to request.state
"""

import time
from fastapi import Request, HTTPException, Depends
from utils.db_connector import db_connector
from models.tenant_models import get_tenant_models
from middleware.auth_middleware import get_auth_user

# ── Location-hierarchy cache ─────────────────────────────────────────────────
# Key: "{dbName}:{userId}" → { "accessibleLocationIds": [...], "expiresAt": float }
_location_cache: dict = {}
LOCATION_CACHE_TTL = 5 * 60  # 5 minutes in seconds


def _prune_location_cache():
    now = time.time()
    stale = [k for k, v in _location_cache.items() if v["expiresAt"] < now]
    for k in stale:
        _location_cache.pop(k, None)


def _get_child_ids(locations: list, parent_id: str) -> list:
    """Recursively collect a location and all its children."""
    result = [str(parent_id)]
    for loc in locations:
        if str(loc.get("parentId", "")) == str(parent_id):
            result.extend(_get_child_ids(locations, loc["_id"]))
    return result


async def get_tenant_context(
    request: Request,
    user: dict = Depends(get_auth_user),
):
    """
    FastAPI dependency that:
    1. Resolves the tenant DB name (header > body > query > token)
    2. Fetches tenant Motor DB
    3. Attaches tenant_models and tenant_db_name to request.state
    4. Resolves location hierarchy for non-CorpAdmin users
    """
    _prune_location_cache()

    # 1. Identify tenant
    db_name = (
        request.headers.get("x-tenant-id")
        or request.headers.get("x-db-name")
        or (await _try_get_body_field(request, "dbName"))
        or request.query_params.get("dbName")
        or user.get("dbName")
    )

    if not db_name:
        raise HTTPException(
            status_code=400,
            detail="Tenant resolution failed. dbName required in token or body."
        )

    # 2. Get tenant DB
    try:
        tenant_db = await db_connector.get_tenant_connection(db_name)
    except Exception as e:
        print(f"🔴 Tenant Middleware Error: {e}")
        raise HTTPException(status_code=500, detail="Multi-tenant routing failed")

    # 3. Attach to request state
    request.state.tenant_db = tenant_db
    request.state.tenant_db_name = db_name
    request.state.tenant_models = get_tenant_models(tenant_db)
    request.state.user = user

    # 4. Resolve location hierarchy
    if user:
        if user.get("userRole") == "CorpAdmin":
            user["accessibleLocationIds"] = []
        else:
            user_id = str(user.get("_id") or user.get("userId") or "")
            cache_key = f"{db_name}:{user_id}"
            cached = _location_cache.get(cache_key)

            if cached and cached["expiresAt"] > time.time():
                user["accessibleLocationIds"] = cached["accessibleLocationIds"]
            else:
                profile = await tenant_db["ProfileMaster"].find_one(
                    {}, {"locations": 1}
                )
                locations = profile.get("locations", []) if profile else []
                my_loc_id = user.get("locationId")

                if not my_loc_id:
                    accessible = None
                else:
                    my_loc = next(
                        (l for l in locations if str(l.get("_id", "")) == str(my_loc_id)),
                        None
                    )
                    loc_type = my_loc.get("locationType", "BO") if my_loc else "BO"
                    if loc_type == "HO":
                        accessible = []
                    elif loc_type == "RO":
                        accessible = _get_child_ids(locations, my_loc_id)
                    else:
                        accessible = [str(my_loc_id)]

                _location_cache[cache_key] = {
                    "accessibleLocationIds": accessible,
                    "expiresAt": time.time() + LOCATION_CACHE_TTL,
                }
                user["accessibleLocationIds"] = accessible

    return user


async def _try_get_body_field(request: Request, field: str):
    """Safely attempt to read a JSON body field without consuming the body."""
    try:
        body = await request.json()
        return body.get(field)
    except Exception:
        return None
