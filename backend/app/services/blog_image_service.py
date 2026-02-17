"""
Blog Image Generation Service
Uses Gemini (Nano Banana / gemini-2.5-flash-image) to generate hero and mid-article images
for blog posts. Same pipeline as scripts/enhance_icon.py but adapted for blog imagery.
"""

import os
import re
import base64
import logging
import requests
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# Gemini image generation endpoint
GEMINI_IMAGE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent"


def _get_api_key() -> str:
    """Get Gemini API key from environment."""
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY not set")
    return key


def _build_hero_prompt(title: str, category: str, meta_description: str = "") -> str:
    """Build a prompt for generating a hero/featured image for a blog post."""
    return f"""Create a professional, modern blog hero image for an article titled: "{title}"

Category: {category}
Context: {meta_description or title}

Design requirements:
- Clean, professional illustration style (NOT photorealistic, NOT stock photo style)
- Use a color palette of deep purple (#7c3aed), indigo (#4f46e5), slate blue, and white accents
- The image should be wide/landscape format (16:9 aspect ratio feel)
- Include subtle visual elements related to education, schools, technology, and funding
- Modern flat/semi-flat illustration style with gentle gradients
- NO text, watermarks, or logos in the image
- The image should feel premium, clean, and corporate
- Think: technology + education + finance visual metaphor
- Soft, professional lighting with a clean composition
"""


def _build_mid_prompt(title: str, content_summary: str, category: str) -> str:
    """Build a prompt for generating a mid-article illustration."""
    return f"""Create a small, clean illustration for inside a blog article about: "{title}"

Category: {category}
Article context: {content_summary[:300]}

Design requirements:
- Simple, clean illustration — like an infographic icon or spot illustration
- Use purple (#7c3aed), indigo (#4f46e5), and white color palette
- Should look like a professional editorial illustration
- NO text, watermarks, or logos
- Semi-flat design style with subtle gradients
- Visual metaphor related to the topic (education, funding, technology, compliance)
- Simple enough to work at smaller sizes within an article
- Think: editorial magazine spot illustration
"""


def _extract_content_summary(content_html: str) -> str:
    """Extract a text summary from HTML content for prompt generation."""
    # Strip HTML tags
    text = re.sub(r'<[^>]+>', ' ', content_html)
    # Clean up whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    # Take first ~300 chars
    return text[:300]


def generate_blog_image(prompt: str) -> Tuple[bytes, str]:
    """
    Generate an image using Gemini 2.5 Flash Image (Nano Banana).
    
    Returns: (image_bytes, mime_type)
    Raises: ValueError if generation fails
    """
    api_key = _get_api_key()
    
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }
    
    data = {
        "contents": [{
            "parts": [
                {"text": prompt}
            ]
        }],
        "generationConfig": {
            "responseModalities": ["IMAGE", "TEXT"]
        }
    }
    
    logger.info(f"Generating blog image with Nano Banana...")
    
    try:
        response = requests.post(
            GEMINI_IMAGE_URL,
            headers=headers,
            json=data,
            timeout=120,
        )
        
        if response.status_code != 200:
            error_text = response.text[:500]
            logger.error(f"Gemini image API error {response.status_code}: {error_text}")
            raise ValueError(f"Image generation failed (HTTP {response.status_code})")
        
        result = response.json()
        candidates = result.get("candidates", [])
        
        if not candidates:
            raise ValueError("No candidates in Gemini image response")
        
        for part in candidates[0].get("content", {}).get("parts", []):
            if "inlineData" in part:
                image_data = base64.b64decode(part["inlineData"]["data"])
                mime_type = part["inlineData"].get("mimeType", "image/png")
                logger.info(f"Blog image generated: {len(image_data)} bytes, {mime_type}")
                return image_data, mime_type
        
        raise ValueError("No image data found in Gemini response")
        
    except requests.exceptions.Timeout:
        raise ValueError("Image generation timed out (120s)")
    except requests.exceptions.RequestException as e:
        raise ValueError(f"Image generation request failed: {str(e)}")


def generate_hero_image(title: str, category: str, meta_description: str = "") -> Tuple[bytes, str, str]:
    """
    Generate a hero/featured image for a blog post.
    
    Returns: (image_bytes, mime_type, prompt_used)
    """
    prompt = _build_hero_prompt(title, category, meta_description)
    image_bytes, mime_type = generate_blog_image(prompt)
    return image_bytes, mime_type, prompt


def generate_mid_image(title: str, content_html: str, category: str) -> Tuple[bytes, str, str]:
    """
    Generate a mid-article illustration for a blog post.
    
    Returns: (image_bytes, mime_type, prompt_used)
    """
    summary = _extract_content_summary(content_html)
    prompt = _build_mid_prompt(title, summary, category)
    image_bytes, mime_type = generate_blog_image(prompt)
    return image_bytes, mime_type, prompt
