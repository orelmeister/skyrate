"""
Application Configuration
Loads settings from environment variables with security validation
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List, Optional
from functools import lru_cache
import secrets


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # App
    APP_NAME: str = "SkyRate AI"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False
    PORT: int = 8000
    ENVIRONMENT: str = "development"
    
    # Database - Use environment variable DATABASE_URL
    # Production: mysql+pymysql://user:pass@host/database
    # Local dev: sqlite:///./skyrate.db
    DATABASE_URL: str = "sqlite:///./skyrate.db"  # Override with env var for production
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    
    # JWT Authentication
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    
    @field_validator('SECRET_KEY')
    @classmethod
    def validate_secret_key(cls, v: str, info) -> str:
        """Validate SECRET_KEY is secure in non-development environments"""
        # Get environment - need to handle this specially since validators run before full model validation
        import os
        env = os.environ.get('ENVIRONMENT', 'development')
        
        if env != 'development':
            default_keys = [
                "your-super-secret-key-change-in-production",
                "secret",
                "change-me",
                "your-secret-key"
            ]
            if v.lower() in [k.lower() for k in default_keys]:
                raise ValueError(
                    "SECRET_KEY must be changed in production! "
                    f"Generate a secure key with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
                )
            if len(v) < 32:
                raise ValueError("SECRET_KEY must be at least 32 characters for security")
        return v
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
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    FROM_EMAIL: str = "alerts@skyrate.ai"
    FROM_NAME: str = "SkyRate AI"
    FRONTEND_URL: str = "https://skyrate.ai"
    
    # Email sender aliases (all route through SMTP_USER)
    EMAIL_ALERTS: str = "alerts@skyrate.ai"
    EMAIL_NOREPLY: str = "noreply@skyrate.ai"
    EMAIL_BILLING: str = "billing@skyrate.ai"
    EMAIL_WELCOME: str = "welcome@skyrate.ai"
    EMAIL_SUPPORT: str = "support@skyrate.ai"
    EMAIL_NEWS: str = "news@skyrate.ai"
    
    # Web Push (VAPID)
    VAPID_PRIVATE_KEY: Optional[str] = None
    VAPID_PUBLIC_KEY: Optional[str] = None
    VAPID_CONTACT_EMAIL: str = "alerts@skyrate.ai"
    
    # Twilio (SMS + Phone Verification)
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_VERIFY_SERVICE_SID: Optional[str] = None
    TWILIO_FROM_NUMBER: Optional[str] = None  # Twilio phone number for sending SMS
    
    # USAC / Socrata
    SOCRATA_APP_TOKEN: Optional[str] = None
    
    # Hunter.io API for contact enrichment
    HUNTER_API_KEY: Optional[str] = None
    
    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000", "https://skyrate.ai", "https://*.skyrate.ai"]
    
    # Subscription Pricing (cents)
    # Consultants: $300/month or $3,000/year
    CONSULTANT_MONTHLY_PRICE: int = 30000   # $300
    CONSULTANT_YEARLY_PRICE: int = 300000   # $3,000
    # Vendors: $300/month or $3,000/year  
    VENDOR_MONTHLY_PRICE: int = 30000       # $300
    VENDOR_YEARLY_PRICE: int = 300000       # $3,000
    # Applicants: $200/month or $2,000/year
    APPLICANT_MONTHLY_PRICE: int = 20000    # $200
    APPLICANT_YEARLY_PRICE: int = 200000    # $2,000
    
    # Test/Demo Account Settings
    # Emails containing these patterns get free access (case-insensitive)
    TEST_EMAIL_PATTERNS: List[str] = ["test_", "test@", "demo@", "demo_"]
    # Specific test account emails (exact match, case-insensitive)
    TEST_ACCOUNT_EMAILS: List[str] = [
        "test_consultant@example.com",
        "test_vendor@example.com",
        "demo@skyrate.ai"
    ]
    # Coupon codes that bypass payment (case-insensitive)
    FREE_ACCESS_COUPONS: List[str] = ["SKYRATEFREE", "BETATESTER", "DEMO2024", "INTERNAL"]
    
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


def is_test_account(email: str) -> bool:
    """
    Check if an email address is a test/demo account that gets free access.
    
    Args:
        email: User's email address
        
    Returns:
        True if the account should get free access, False otherwise
    """
    if not email:
        return False
    
    email_lower = email.lower()
    
    # Check exact match with test account emails
    for test_email in settings.TEST_ACCOUNT_EMAILS:
        if email_lower == test_email.lower():
            return True
    
    # Check if email contains any test patterns
    for pattern in settings.TEST_EMAIL_PATTERNS:
        if pattern.lower() in email_lower:
            return True
    
    return False


def is_valid_coupon(coupon_code: str) -> bool:
    """
    Check if a coupon code grants free access.
    
    Args:
        coupon_code: The coupon code to validate
        
    Returns:
        True if the coupon grants free access, False otherwise
    """
    if not coupon_code:
        return False
    
    code_upper = coupon_code.strip().upper()
    return code_upper in [c.upper() for c in settings.FREE_ACCESS_COUPONS]
