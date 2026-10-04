"""
🧱 User Master Model Helpers
Python/Motor equivalent of models/userMaster.js (mainDatabase collection).
Includes bcrypt password hashing.
"""

import os
from passlib.context import CryptContext
from motor.motor_asyncio import AsyncIOMotorDatabase

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_user_master_collection(main_db: AsyncIOMotorDatabase):
    """Return the userMaster Motor collection."""
    return main_db["userMaster"]


def hash_password(plain: str) -> str:
    """Hash a plain-text password (bcrypt, 10 rounds)."""
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify plain password against bcrypt hash."""
    return pwd_context.verify(plain, hashed)
