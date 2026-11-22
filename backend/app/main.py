import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.core.config import settings
from backend.app.db.session import engine, Base
from backend.app.api.endpoints import router as api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables without automatic demo seeding
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(
    title="Paymo Payment Sentinel API",
    description="Backend services for Paymo: Assist, Resolve, and Developer chaos & telemetry.",
    version="2.0.0",
    lifespan=lifespan
)

# CORS configuration restricted strictly to local dev origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Register top-level and prefixed routes
app.include_router(api_router, prefix="/api")
app.include_router(api_router) # also mount at root for /health
