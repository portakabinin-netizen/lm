"""
📤 Upload Router
Python/FastAPI equivalent of routes/uploadRouter.js
Secure, tenant-aware file uploads via Cloudinary.
"""

import os
from fastapi import APIRouter, Depends, Request, UploadFile, File
from middleware.tenant_middleware import get_tenant_context

router = APIRouter(tags=["Upload"])

def get_ctx(request: Request, user: dict = Depends(get_tenant_context)):
    return user

@router.post("/")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(get_ctx),
):
    """Upload a file to Cloudinary (tenant-scoped folder)."""
    import cloudinary
    import cloudinary.uploader

    cloudinary.config(
        cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key=os.getenv("CLOUDINARY_API_KEY"),
        api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    )

    try:
        contents = await file.read()
        db_name = getattr(request.state, "tenant_db_name", "shared")
        folder = f"hipk/{db_name}"

        result = cloudinary.uploader.upload(
            contents,
            folder=folder,
            resource_type="auto",
            public_id=file.filename,
            overwrite=True,
        )

        return {
            "success": True,
            "url": result.get("secure_url"),
            "public_id": result.get("public_id"),
            "message": "File uploaded successfully",
        }
    except Exception as e:
        return {"success": False, "message": str(e)}
