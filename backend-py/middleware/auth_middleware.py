"""
🔒 Auth Middleware
Python/FastAPI equivalent of middleware/authMiddleware.js
Verifies JWT Bearer token and attaches normalized user context to request.state.user
"""

import os
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from dotenv import load_dotenv

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "hipk2025-26").strip()
security = HTTPBearer()


def get_auth_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    Dependency: validates Bearer token, returns normalized user dict.
    Raises HTTP 401 / 403 on failure.
    """
    token = credentials.credentials
    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return {
            "_id": decoded.get("userId"),
            "userId": decoded.get("userId"),
            "userRole": decoded.get("userRole"),
            "dbName": decoded.get("dbName"),
            "corporateIds": decoded.get("corporateIds", []),
            "corporateName": decoded.get("corporateName"),
            "userEmail": decoded.get("userEmail"),
            "userDisplayName": decoded.get("userDisplayName"),
            "ownMobile": decoded.get("ownMobile"),
        }
    except JWTError as e:
        print(f"❌ JWT ERROR: {e}")
        raise HTTPException(status_code=403, detail="Invalid or expired token")


class AuthMiddleware:
    """
    Optional middleware form — use get_auth_user dependency for route-level auth.
    This class form attaches user to request.state for Socket.IO / manual use.
    """

    @staticmethod
    async def __call__(request: Request, call_next):
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]
            try:
                decoded = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
                request.state.user = {
                    "_id": decoded.get("userId"),
                    "userId": decoded.get("userId"),
                    "userRole": decoded.get("userRole"),
                    "dbName": decoded.get("dbName"),
                    "corporateIds": decoded.get("corporateIds", []),
                    "corporateName": decoded.get("corporateName"),
                    "userEmail": decoded.get("userEmail"),
                    "userDisplayName": decoded.get("userDisplayName"),
                    "ownMobile": decoded.get("ownMobile"),
                }
            except JWTError:
                request.state.user = None
        else:
            request.state.user = None
        return await call_next(request)
