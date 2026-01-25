"""
Application Configuration
Loads settings from environment variables
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # App
    APP_NAME: str = "SkyRate AI"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False
    PORT: int = 8000
    ENVIRONMENT: str = "development"
    
    # Database
    DATABASE_URL: str = "sqlite:///./skyrate.db"  # Default to SQLite for local dev
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    
    # JWT Authentication
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60  # 1 hour
    REFRESH_TOKEN_EXPIRE_DAYS: int = 90  # 90 days for persistent login
    
    # Google OAuth
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    
    # AI API Keys
    DEEPSEEK_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    GOOGLE_API_KEY: Optional[str] = None  # Alias for Gemini
    ANTHROPIC_API_KEY: Optional[str] = None
    
    # AI Model Names
    DEEPSEEK_MODEL: str = "deepseek-chat"
    GEMINI_MODEL: str = "gemini-2.0-flash"
    CLAUDE_MODEL: str = "claude-3-5-sonnet-latest"
    
    # Stripe
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None
    STRIPE_PUBLISHABLE_KEY: Optional[str] = None
    STRIPE_PRICE_MONTHLY: Optional[str] = None
    STRIPE_PRICE_YEARLY: Optional[str] = None
    STRIPE_CONSULTANT_MONTHLY_PRICE_ID: Optional[str] = None
    STRIPE_CONSULTANT_YEARLY_PRICE_ID: Optional[str] = None
    STRIPE_VENDOR_MONTHLY_PRICE_ID: Optional[str] = None
    STRIPE_VENDOR_YEARLY_PRICE_ID: Optional[str] = None
    
    # Email / SMTP
    GMAIL_USER: Optional[str] = None
    GMAIL_APP_PASSWORD: Optional[str] = None
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    EMAIL_FROM: Optional[str] = None
    
    # USAC / Socrata
    SOCRATA_APP_TOKEN: Optional[str] = None
    
    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000", "https://skyrate.ai", "https://*.skyrate.ai"]
    
    # Subscription Pricing (cents)
    # Consultants: $300/month or $3,000/year
    CONSULTANT_MONTHLY_PRICE: int = 30000   # $300
    CONSULTANT_YEARLY_PRICE: int = 300000   # $3,000
    # Vendors: $200/month or $2,000/year  
    VENDOR_MONTHLY_PRICE: int = 20000       # $200
    VENDOR_YEARLY_PRICE: int = 200000       # $2,000
    
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"  # Ignore extra environment variables
    )


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


settings = get_settings()
