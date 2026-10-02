# backend-py — Python Backend

Python/FastAPI rewrite of the Node.js `backend/` folder.

## Stack Equivalents

| Node.js | Python |
|---------|--------|
| Express | FastAPI |
| Mongoose | Motor (async MongoDB) |
| socket.io | python-socketio |
| jsonwebtoken | python-jose |
| bcryptjs | passlib[bcrypt] |
| nodemailer | aiosmtplib |
| fetch / axios | httpx |
| multer | python-multipart |
| helmet + cors | FastAPI middleware |
| express-rate-limit | slowapi |
| compression | GZipMiddleware |
| node-cron / setInterval | APScheduler |
| exceljs | openpyxl |
| dotenv | python-dotenv |
| cloudinary npm | cloudinary pip |
| twilio npm | twilio pip |

## Project Structure

```
backend-py/
├── main.py                  ← Entry point (FastAPI + Socket.IO ASGI app)
├── .env                     ← Environment variables (same as backend/.env)
├── requirements.txt         ← pip dependencies
├── controller/
│   ├── auth_controller.py
│   ├── setting_controller.py
│   ├── user_corp_controller.py
│   ├── finance_controller.py
│   ├── legacy_finance_adapter.py
│   ├── chat_controller.py
│   └── monitoring_controller.py
├── middleware/
│   ├── auth_middleware.py   ← JWT Bearer verification
│   ├── tenant_middleware.py ← Multi-tenant DB routing + location cache
│   └── validate_auth.py     ← Input regex validation
├── models/
│   ├── user_master.py       ← mainDatabase userMaster helpers
│   ├── worker_location.py   ← WorkerLocations with 2dsphere geofencing
│   └── tenant_models.py     ← Returns Motor collections for a tenant DB
├── routes/
│   ├── auth_router.py
│   ├── setting_router.py
│   ├── user_corp_router.py
│   ├── finance_router.py
│   ├── payment_router.py
│   ├── staff_router.py
│   ├── monitoring_router.py
│   └── upload_router.py
└── utils/
    ├── db_connector.py          ← Multi-tenant Motor connection manager
    ├── realtime_broadcaster.py  ← Socket.IO + Pusher hybrid broadcaster
    ├── email_service.py         ← Async SMTP email via aiosmtplib
    ├── messaging_service.py     ← SMS/WhatsApp via MSG91 + Meta API
    ├── tenant_security.py       ← PAN → hex DB name encoding
    └── date_utils.py            ← Date preset resolver
```

## Setup & Run

```bash
cd backend-py

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Run development server (port 5002 by default)
python main.py
# or
uvicorn main:combined_app --reload --host 0.0.0.0 --port 5002
```

## API Docs

Swagger UI available at: `http://localhost:5002/docs`  
ReDoc available at: `http://localhost:5002/redoc`

## Key Design Decisions

- **PORT 5002** by default so both Node (`5001`) and Python (`5002`) backends can run simultaneously for gradual migration.
- **Motor** (async MongoDB driver) is used instead of PyMongo for full async/await compatibility with FastAPI.
- **APScheduler** replaces `setInterval` for the idle connection reaper.
- **FastAPI `Depends()`** replaces Express middleware — `get_auth_user` and `get_tenant_context` are injected as dependencies.
- **request.state** is used to pass tenant DB, models, and user context between dependencies and handlers (equivalent to Express `req.user` / `req.tenantModels`).
