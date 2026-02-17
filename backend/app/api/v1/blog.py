"""
Blog API Endpoints
Public: list published posts, get single post, dynamic sitemap
Admin: CRUD, AI generation, publish/unpublish
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from ...core.database import get_db
from ...core.security import get_current_user, require_role
from ...models.blog import BlogPost, BlogStatus
from ...models.user import User

router = APIRouter(prefix="/blog", tags=["Blog"])


# ==================== SCHEMAS ====================

class BlogGenerateRequest(BaseModel):
    topic: str
    target_keyword: str
    additional_instructions: Optional[str] = ""
    preferred_model: Optional[str] = "gemini"


class BlogCreateRequest(BaseModel):
    title: str
    slug: str
    content_html: str
    meta_description: Optional[str] = None
    category: Optional[str] = "Guide"
    author_name: Optional[str] = "SkyRate AI Team"
    status: Optional[str] = "draft"


class BlogUpdateRequest(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    content_html: Optional[str] = None
    meta_description: Optional[str] = None
    category: Optional[str] = None
    author_name: Optional[str] = None
    og_title: Optional[str] = None
    og_description: Optional[str] = None
    status: Optional[str] = None


# ==================== PUBLIC ENDPOINTS ====================

@router.get("/posts")
def list_published_posts(
    limit: int = 50,
    offset: int = 0,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List all published blog posts (public, no auth required)"""
    query = db.query(BlogPost).filter(BlogPost.status == BlogStatus.PUBLISHED.value)
    
    if category:
        query = query.filter(BlogPost.category == category)
    
    total = query.count()
    posts = query.order_by(desc(BlogPost.published_at)).offset(offset).limit(limit).all()
    
    return {
        "success": True,
        "posts": [p.to_summary() for p in posts],
        "total": total,
    }


@router.get("/posts/{slug}")
def get_published_post(slug: str, db: Session = Depends(get_db)):
    """Get a single published blog post by slug (public)"""
    post = db.query(BlogPost).filter(
        BlogPost.slug == slug,
        BlogPost.status == BlogStatus.PUBLISHED.value
    ).first()
    
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    
    return {
        "success": True,
        "post": post.to_dict(),
    }


@router.get("/sitemap")
def get_blog_sitemap(db: Session = Depends(get_db)):
    """Return all published blog post slugs for sitemap generation"""
    posts = db.query(BlogPost.slug, BlogPost.published_at).filter(
        BlogPost.status == BlogStatus.PUBLISHED.value
    ).order_by(desc(BlogPost.published_at)).all()
    
    return {
        "success": True,
        "urls": [
            {
                "slug": p.slug,
                "published_at": p.published_at.isoformat() if p.published_at else None,
            }
            for p in posts
        ],
    }


# ==================== ADMIN ENDPOINTS ====================

@router.get("/admin/posts")
def admin_list_posts(
    limit: int = 50,
    offset: int = 0,
    status_filter: Optional[str] = None,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """List all blog posts (admin — includes drafts/archived)"""
    query = db.query(BlogPost)
    
    if status_filter:
        query = query.filter(BlogPost.status == status_filter)
    
    total = query.count()
    posts = query.order_by(desc(BlogPost.created_at)).offset(offset).limit(limit).all()
    
    return {
        "success": True,
        "posts": [p.to_summary() for p in posts],
        "total": total,
    }


@router.get("/admin/posts/{post_id}")
def admin_get_post(
    post_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Get full blog post by ID (admin)"""
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    
    return {
        "success": True,
        "post": post.to_dict(),
    }


@router.post("/admin/posts")
def admin_create_post(
    data: BlogCreateRequest,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Create a new blog post manually (admin)"""
    # Check slug uniqueness
    existing = db.query(BlogPost).filter(BlogPost.slug == data.slug).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Slug '{data.slug}' already exists")
    
    post = BlogPost(
        title=data.title,
        slug=data.slug,
        content_html=data.content_html,
        meta_description=data.meta_description,
        category=data.category or "Guide",
        author_name=data.author_name or "SkyRate AI Team",
        status=data.status or BlogStatus.DRAFT.value,
        canonical_url=f"https://skyrate.ai/blog/{data.slug}",
        og_title=data.title,
        og_description=data.meta_description,
    )
    
    if data.status == BlogStatus.PUBLISHED.value:
        post.published_at = datetime.utcnow()
    
    db.add(post)
    db.commit()
    db.refresh(post)
    
    return {
        "success": True,
        "post": post.to_dict(),
        "message": "Blog post created",
    }


@router.put("/admin/posts/{post_id}")
def admin_update_post(
    post_id: int,
    data: BlogUpdateRequest,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Update an existing blog post (admin)"""
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    
    update_data = data.dict(exclude_unset=True)
    
    # Check slug uniqueness if changing
    if "slug" in update_data and update_data["slug"] != post.slug:
        existing = db.query(BlogPost).filter(BlogPost.slug == update_data["slug"]).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Slug '{update_data['slug']}' already exists")
    
    # Handle publish/unpublish
    if "status" in update_data:
        if update_data["status"] == BlogStatus.PUBLISHED.value and post.status != BlogStatus.PUBLISHED.value:
            post.published_at = datetime.utcnow()
        elif update_data["status"] != BlogStatus.PUBLISHED.value:
            post.published_at = None
    
    for key, value in update_data.items():
        setattr(post, key, value)
    
    # Update canonical URL if slug changed
    if "slug" in update_data:
        post.canonical_url = f"https://skyrate.ai/blog/{post.slug}"
    
    db.commit()
    db.refresh(post)
    
    return {
        "success": True,
        "post": post.to_dict(),
        "message": "Blog post updated",
    }


@router.delete("/admin/posts/{post_id}")
def admin_delete_post(
    post_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Delete a blog post (admin)"""
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    
    db.delete(post)
    db.commit()
    
    return {
        "success": True,
        "message": f"Blog post '{post.title}' deleted",
    }


@router.post("/admin/posts/{post_id}/publish")
def admin_publish_post(
    post_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Publish a draft blog post (admin)"""
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    
    post.status = BlogStatus.PUBLISHED.value
    post.published_at = datetime.utcnow()
    db.commit()
    db.refresh(post)
    
    return {
        "success": True,
        "post": post.to_summary(),
        "message": f"Blog post '{post.title}' published",
    }


@router.post("/admin/posts/{post_id}/unpublish")
def admin_unpublish_post(
    post_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Unpublish a blog post (admin)"""
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    
    post.status = BlogStatus.DRAFT.value
    post.published_at = None
    db.commit()
    db.refresh(post)
    
    return {
        "success": True,
        "post": post.to_summary(),
        "message": f"Blog post '{post.title}' unpublished",
    }


@router.post("/admin/generate")
async def admin_generate_blog(
    data: BlogGenerateRequest,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Generate a blog post using AI (admin). Creates as draft for review."""
    from ...services.blog_service import generate_blog_with_ai, slugify
    
    try:
        result = await generate_blog_with_ai(
            topic=data.topic,
            target_keyword=data.target_keyword,
            additional_instructions=data.additional_instructions or "",
            preferred_model=data.preferred_model or "gemini",
        )
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")
    
    # Ensure unique slug
    base_slug = result["slug"]
    slug = base_slug
    counter = 1
    while db.query(BlogPost).filter(BlogPost.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1
    
    post = BlogPost(
        title=result["title"],
        slug=slug,
        content_html=result["content_html"],
        meta_description=result.get("meta_description"),
        category=result.get("category", "Guide"),
        author_name=result.get("author_name", "SkyRate AI Team"),
        read_time_minutes=result.get("read_time_minutes", 8),
        status=BlogStatus.DRAFT.value,
        ai_model_used=result.get("ai_model_used"),
        ai_prompt_used=result.get("ai_prompt_used"),
        canonical_url=f"https://skyrate.ai/blog/{slug}",
        og_title=result["title"],
        og_description=result.get("meta_description"),
    )
    
    db.add(post)
    db.commit()
    db.refresh(post)
    
    return {
        "success": True,
        "post": post.to_dict(),
        "message": f"Blog post generated as draft. Review and publish when ready.",
    }


# ==================== IMAGE ENDPOINTS ====================

class ImageGenerateRequest(BaseModel):
    image_type: str = "hero"  # "hero" or "mid"
    custom_prompt: Optional[str] = None


@router.get("/posts/{slug}/hero-image")
def get_hero_image(slug: str, db: Session = Depends(get_db)):
    """Serve the hero image for a published blog post (public)"""
    post = db.query(BlogPost).filter(
        BlogPost.slug == slug,
        BlogPost.status == BlogStatus.PUBLISHED.value,
    ).first()
    
    if not post or not post.hero_image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    return Response(
        content=post.hero_image,
        media_type=post.hero_image_mime or "image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/posts/{slug}/mid-image")
def get_mid_image(slug: str, db: Session = Depends(get_db)):
    """Serve the mid-article image for a published blog post (public)"""
    post = db.query(BlogPost).filter(
        BlogPost.slug == slug,
        BlogPost.status == BlogStatus.PUBLISHED.value,
    ).first()
    
    if not post or not post.mid_image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    return Response(
        content=post.mid_image,
        media_type=post.mid_image_mime or "image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/admin/posts/{post_id}/hero-image")
def admin_get_hero_image(
    post_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Serve the hero image for any blog post (admin preview)"""
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post or not post.hero_image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    return Response(
        content=post.hero_image,
        media_type=post.hero_image_mime or "image/png",
        headers={"Cache-Control": "no-cache"},
    )


@router.get("/admin/posts/{post_id}/mid-image")
def admin_get_mid_image(
    post_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Serve the mid-article image for any blog post (admin preview)"""
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post or not post.mid_image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    return Response(
        content=post.mid_image,
        media_type=post.mid_image_mime or "image/png",
        headers={"Cache-Control": "no-cache"},
    )


@router.post("/admin/posts/{post_id}/generate-image")
async def admin_generate_image(
    post_id: int,
    data: ImageGenerateRequest,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Generate a hero or mid-article image for a blog post using AI (admin)"""
    from ...services.blog_image_service import generate_hero_image, generate_mid_image
    
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    
    try:
        if data.image_type == "hero":
            image_bytes, mime_type, prompt = generate_hero_image(
                title=post.title,
                category=post.category or "Guide",
                meta_description=post.meta_description or "",
            )
            post.hero_image = image_bytes
            post.hero_image_mime = mime_type
            post.hero_image_prompt = data.custom_prompt or prompt
        elif data.image_type == "mid":
            image_bytes, mime_type, prompt = generate_mid_image(
                title=post.title,
                content_html=post.content_html or "",
                category=post.category or "Guide",
            )
            post.mid_image = image_bytes
            post.mid_image_mime = mime_type
            post.mid_image_prompt = data.custom_prompt or prompt
        else:
            raise HTTPException(status_code=400, detail="image_type must be 'hero' or 'mid'")
        
        db.commit()
        db.refresh(post)
        
        return {
            "success": True,
            "image_type": data.image_type,
            "size_bytes": len(image_bytes),
            "mime_type": mime_type,
            "prompt_used": data.custom_prompt or prompt,
            "message": f"{data.image_type.title()} image generated successfully",
        }
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")


@router.delete("/admin/posts/{post_id}/hero-image")
def admin_delete_hero_image(
    post_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Remove the hero image from a blog post (admin)"""
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    
    post.hero_image = None
    post.hero_image_mime = None
    post.hero_image_prompt = None
    db.commit()
    
    return {"success": True, "message": "Hero image removed"}


@router.delete("/admin/posts/{post_id}/mid-image")
def admin_delete_mid_image(
    post_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Remove the mid-article image from a blog post (admin)"""
    post = db.query(BlogPost).filter(BlogPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    
    post.mid_image = None
    post.mid_image_mime = None
    post.mid_image_prompt = None
    db.commit()
    
    return {"success": True, "message": "Mid-article image removed"}
