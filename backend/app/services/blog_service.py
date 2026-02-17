"""
Blog Service
AI-powered blog generation and management for SkyRate AI.

HARD RULES for blog content:
1. Never give too much actionable advice — keep it informational, not step-by-step DIY
2. Always guide readers to sign up for SkyRate AI or contact us for help
3. Position SkyRate as the expert solution — readers should feel they need us
4. Include disclaimers: "This is for informational purposes only, not legal/regulatory advice"
5. Internal links to feature pages and /sign-up throughout
"""

import re
import logging
from typing import Optional, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)


# ==================== BLOG GENERATION PROMPT ====================

BLOG_SYSTEM_PROMPT = """You are a content writer for SkyRate AI (https://skyrate.ai), an AI-powered E-Rate Funding Intelligence Platform.

## YOUR ROLE
Write SEO-optimized blog posts about E-Rate funding (the federal program managed by USAC/FCC that provides schools and libraries discounts on telecommunications and internet services).

## HARD RULES — FOLLOW THESE EXACTLY

1. **DO NOT give step-by-step instructions that would let someone do it without SkyRate.** You can explain concepts, mention what's involved at a high level, but never provide complete DIY guides. The goal is for readers to realize they need professional help or software.

2. **ALWAYS include a disclaimer** at the start of the article: "This article is for informational purposes only and does not constitute legal, regulatory, or compliance advice. For specific guidance on your E-Rate application, consult with a qualified E-Rate consultant or use SkyRate AI's tools."

3. **DRIVE SIGNUPS** — Every post should make readers feel:
   - "This is too complex to handle alone"
   - "I need a tool/platform like SkyRate to manage this"
   - "I should contact SkyRate for help"
   Include 2-3 natural CTAs throughout the article (not just at the end).

4. **CONTACT US messaging** — For readers who are confused or overwhelmed, always include language like:
   - "Not sure where to start? Our team can help — contact us at support@skyrate.ai"
   - "SkyRate AI handles this automatically so you don't have to"
   - "Let our AI do the heavy lifting"

5. **Internal links** — Include these naturally throughout the content:
   - /features/appeal-generator — for appeal-related content
   - /features/denial-analysis — for denial-related content
   - /features/form-470-tracking — for Form 470/vendor content
   - /features/frn-monitoring — for FRN tracking content
   - /features/consultants — for consultant content
   - /features/vendors — for vendor content
   - /features/applicants — for applicant content
   - /pricing — when mentioning trying the platform
   - /sign-up — for CTA buttons
   - /contact — for "get help" messaging

6. **SEO best practices:**
   - Use the target keyword in H1, first paragraph, and 2-3 H2s
   - Write 800-1200 words
   - Use H2 and H3 subheadings every 150-200 words
   - Write a compelling meta description (150-160 chars)
   - Include the keyword naturally 5-8 times

7. **Tone:** Authoritative but approachable. Write like a knowledgeable E-Rate advisor who genuinely wants to help but knows the reader needs professional tools/support.

## OUTPUT FORMAT
Return valid HTML content (no <html>, <head>, or <body> tags — just the article content).
Use these HTML elements:
- <p> for paragraphs
- <h2> for main sections
- <h3> for subsections
- <ul>/<li> for bullet lists
- <ol>/<li> for numbered lists
- <strong> for emphasis
- <a href="/path"> for internal links (use relative paths)
- <blockquote> for important callouts or disclaimers

Start with a <blockquote> disclaimer, then launch into the content.
End with a strong CTA section encouraging sign-up or contact.

Do NOT include the H1 title — that's handled separately.
Do NOT include any markdown — output pure HTML only.
"""


def generate_blog_prompt(topic: str, target_keyword: str, additional_instructions: str = "") -> str:
    """Build the user prompt for blog generation."""
    return f"""Write a blog post for SkyRate AI's website.

**Topic:** {topic}
**Target SEO Keyword:** {target_keyword}
{f"**Additional Instructions:** {additional_instructions}" if additional_instructions else ""}

Remember:
- 800-1200 words of HTML content
- Include the disclaimer at the start
- 2-3 CTAs driving to /sign-up or /contact
- Internal links to relevant feature pages
- Make readers feel they need SkyRate AI or professional help
- Do NOT give away so much advice that they can do it alone
- Output HTML only (no markdown, no H1, no html/body tags)
"""


def slugify(title: str) -> str:
    """Convert a title to a URL-friendly slug."""
    slug = title.lower().strip()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[-\s]+', '-', slug)
    slug = slug.strip('-')
    return slug


def estimate_read_time(html_content: str) -> int:
    """Estimate reading time from HTML content (assumes 200 words/minute)."""
    text = re.sub(r'<[^>]+>', '', html_content)
    word_count = len(text.split())
    return max(1, round(word_count / 200))


async def generate_blog_with_ai(
    topic: str,
    target_keyword: str,
    additional_instructions: str = "",
    preferred_model: str = "gemini"
) -> Dict[str, Any]:
    """
    Generate a blog post using AI.
    
    Returns dict with: title, slug, content_html, meta_description, category, ai_model_used
    """
    from utils.ai_models import AIModelManager
    
    manager = AIModelManager()
    user_prompt = generate_blog_prompt(topic, target_keyword, additional_instructions)
    
    # Also ask AI to suggest title and meta description
    full_prompt = f"""{user_prompt}

ALSO, at the very end of your response, on separate lines, include:
TITLE: [Your suggested SEO-optimized title for this post]
META: [A 150-160 character meta description]
CATEGORY: [One of: Guide, Analysis, Strategy, Industry, News]
"""
    
    content = ""
    model_used = ""
    
    if preferred_model == "gemini" and manager.is_model_available(manager._models and True):
        try:
            import google.generativeai as genai
            import os
            genai.configure(api_key=os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY'))
            model = genai.GenerativeModel('gemini-2.0-flash')
            response = model.generate_content(
                f"{BLOG_SYSTEM_PROMPT}\n\n{full_prompt}"
            )
            content = response.text
            model_used = "gemini-2.0-flash"
        except Exception as e:
            logger.error(f"Gemini blog generation failed: {e}")
    
    if not content and preferred_model == "deepseek":
        try:
            content = manager.call_deepseek([
                {"role": "system", "content": BLOG_SYSTEM_PROMPT},
                {"role": "user", "content": full_prompt}
            ])
            model_used = "deepseek-chat"
        except Exception as e:
            logger.error(f"DeepSeek blog generation failed: {e}")
    
    if not content:
        # Fallback chain
        for model_name, call_fn in [
            ("gemini", lambda: manager.call_gemini(f"{BLOG_SYSTEM_PROMPT}\n\n{full_prompt}")),
            ("deepseek", lambda: manager.call_deepseek([
                {"role": "system", "content": BLOG_SYSTEM_PROMPT},
                {"role": "user", "content": full_prompt}
            ])),
        ]:
            try:
                content = call_fn()
                model_used = model_name
                if content and not content.startswith("[AI"):
                    break
            except Exception:
                continue
    
    if not content:
        raise ValueError("All AI models failed to generate blog content")
    
    # Parse out title, meta, category from the end of the content
    title = topic  # fallback
    meta_description = f"Learn about {topic} with SkyRate AI's E-Rate intelligence platform."
    category = "Guide"
    
    lines = content.strip().split('\n')
    content_lines = []
    for line in lines:
        if line.strip().startswith('TITLE:'):
            title = line.split('TITLE:', 1)[1].strip()
        elif line.strip().startswith('META:'):
            meta_description = line.split('META:', 1)[1].strip()
        elif line.strip().startswith('CATEGORY:'):
            category = line.split('CATEGORY:', 1)[1].strip()
        else:
            content_lines.append(line)
    
    content_html = '\n'.join(content_lines).strip()
    
    # Clean up any markdown code fences the AI might have added
    content_html = re.sub(r'^```html?\s*', '', content_html)
    content_html = re.sub(r'\s*```$', '', content_html)
    
    slug = slugify(title)
    read_time = estimate_read_time(content_html)
    
    return {
        "title": title,
        "slug": slug,
        "content_html": content_html,
        "meta_description": meta_description[:500],
        "category": category,
        "author_name": "SkyRate AI Team",
        "read_time_minutes": read_time,
        "ai_model_used": model_used,
        "ai_prompt_used": user_prompt,
    }
