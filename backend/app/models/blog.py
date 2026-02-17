"""
Blog Post Model
Stores AI-generated and manually-created blog content
"""

from sqlalchemy import Column, Integer, String, Text, LargeBinary, Boolean, DateTime, Enum
from datetime import datetime
import enum

from ..core.database import Base


class BlogStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class BlogPost(Base):
    __tablename__ = "blog_posts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    slug = Column(String(500), unique=True, index=True, nullable=False)
    meta_description = Column(String(500), nullable=True)
    category = Column(String(100), default="Guide")
    
    # Content stored as HTML
    content_html = Column(Text, nullable=False)
    
    # SEO fields
    og_title = Column(String(500), nullable=True)
    og_description = Column(String(500), nullable=True)
    canonical_url = Column(String(500), nullable=True)
    
    # Author info
    author_name = Column(String(200), default="SkyRate AI Team")
    read_time_minutes = Column(Integer, default=8)
    
    # Status
    status = Column(String(50), default=BlogStatus.DRAFT.value, index=True)
    
    # Images (stored as binary, served via API)
    hero_image = Column(LargeBinary, nullable=True)
    hero_image_mime = Column(String(50), default="image/png")
    hero_image_prompt = Column(Text, nullable=True)
    mid_image = Column(LargeBinary, nullable=True)
    mid_image_mime = Column(String(50), default="image/png")
    mid_image_prompt = Column(Text, nullable=True)
    
    # AI generation metadata
    ai_model_used = Column(String(100), nullable=True)
    ai_prompt_used = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = Column(DateTime, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "slug": self.slug,
            "meta_description": self.meta_description,
            "category": self.category,
            "content_html": self.content_html,
            "og_title": self.og_title,
            "og_description": self.og_description,
            "canonical_url": self.canonical_url,
            "author_name": self.author_name,
            "read_time_minutes": self.read_time_minutes,
            "status": self.status,
            "ai_model_used": self.ai_model_used,
            "has_hero_image": self.hero_image is not None,
            "hero_image_prompt": self.hero_image_prompt,
            "has_mid_image": self.mid_image is not None,
            "mid_image_prompt": self.mid_image_prompt,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "published_at": self.published_at.isoformat() if self.published_at else None,
        }

    def to_summary(self) -> dict:
        """Return minimal data for list views (no full content)"""
        return {
            "id": self.id,
            "title": self.title,
            "slug": self.slug,
            "meta_description": self.meta_description,
            "category": self.category,
            "author_name": self.author_name,
            "read_time_minutes": self.read_time_minutes,
            "status": self.status,
            "has_hero_image": self.hero_image is not None,
            "has_mid_image": self.mid_image is not None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "published_at": self.published_at.isoformat() if self.published_at else None,
        }
