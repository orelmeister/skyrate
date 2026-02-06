"""
SkyRate AI Brand Asset Generator
================================
Uses Google's Gemini/Imagen AI to generate brand assets including:
- Logo designs
- Icons and UI elements  
- Background images
- Marketing illustrations

Uses the Nano Banana (Gemini native image generation) and Imagen models.

Author: SkyRate AI Team
Date: February 2026
"""

import os
import sys
import base64
import json
import time
import requests
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List, Any
from dotenv import load_dotenv

# Load environment variables
load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

# Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
OUTPUT_DIR = Path(__file__).parent.parent / "assets" / "generated"

# Create output subdirectories
LOGO_DIR = OUTPUT_DIR / "logos"
ICON_DIR = OUTPUT_DIR / "icons"
BACKGROUND_DIR = OUTPUT_DIR / "backgrounds"
ILLUSTRATION_DIR = OUTPUT_DIR / "illustrations"
MARKETING_DIR = OUTPUT_DIR / "marketing"

for directory in [LOGO_DIR, ICON_DIR, BACKGROUND_DIR, ILLUSTRATION_DIR, MARKETING_DIR]:
    directory.mkdir(parents=True, exist_ok=True)


# =============================================================================
# SKYRATE AI BRAND CONTEXT
# =============================================================================

BRAND_CONTEXT = """
SkyRate AI is an E-Rate funding intelligence platform that helps American schools, 
libraries, and educational institutions maximize their federal funding for telecommunications 
and internet connectivity.

MISSION: Empowering educational institutions with AI-powered insights to secure funding 
that ensures every child has access to modern technology and internet connectivity.

TARGET AUDIENCE:
- School administrators and IT directors
- E-Rate consultants managing multiple school districts  
- Telecommunications vendors (ISPs, network equipment providers)
- Educational technology professionals

BRAND VALUES:
- Trustworthy & Professional (handling federal funding programs)
- Educational Focus (serving children's connectivity needs)
- Innovative (AI-powered analysis and insights)
- Supportive & Helpful (guiding institutions to success)
- Accessible (making complex E-Rate data understandable)

BRAND PERSONALITY:
- Modern and tech-forward
- Warm and supportive (not cold/corporate)
- Intelligent but approachable
- Reliable and dependable

COLOR PALETTE:
- Primary: Purple/Violet gradient (#9333EA to #EC4899) - Innovation & Trust
- Secondary: Slate grays for text and UI (#1E293B, #475569, #94A3B8)
- Accent Success: Green (#22C55E) - Funded applications
- Accent Warning: Yellow/Amber (#F59E0B) - Pending items
- Accent Error: Red (#EF4444) - Denied applications
- Background: Clean whites and light slate (#F8FAFC)

VISUAL STYLE:
- Clean, modern, professional
- Subtle gradients (purple to pink)
- Rounded corners (friendly feel)
- Ample whitespace
- Data visualization friendly
- Accessible and readable
"""


# =============================================================================
# PROMPT TEMPLATES
# =============================================================================

LOGO_PROMPTS = [
    {
        "name": "logo_main_gradient",
        "prompt": """Design a modern, professional logo for "SkyRate AI" - an E-Rate funding intelligence platform for schools.

CONCEPT: The logo should convey trust, innovation, and educational support.

DESIGN REQUIREMENTS:
- Clean, minimalist wordmark with abstract icon
- Icon could incorporate: ascending graph/stars (representing "sky" and success), network nodes, or graduation cap subtle reference
- Uses gradient from purple (#9333EA) to pink (#EC4899)
- Modern sans-serif typography for "SkyRate" with "AI" subtly differentiated
- Must work on white and dark backgrounds
- Professional enough for government/education sector
- Simple enough to work as app icon when simplified

STYLE: Flat design, no 3D effects, vector-style, tech startup aesthetic
OUTPUT: Logo centered on transparent/white background, high resolution"""
    },
    {
        "name": "logo_icon_only",
        "prompt": """Create a standalone app icon/symbol for SkyRate AI - an E-Rate funding platform for schools.

CONCEPT: An abstract icon representing success, growth, and connectivity for education.

DESIGN REQUIREMENTS:
- Abstract symbol combining: upward movement (success), connection/network, and subtle education reference
- Uses purple to pink gradient (#9333EA to #EC4899)
- Must work at small sizes (16x16 up to 512x512)
- Geometric and modern, not clipart-style
- Could incorporate: stylized "S", ascending bars, connected dots, or abstract star/sky element
- Clean, recognizable silhouette

STYLE: Flat vector design, modern app icon aesthetic, suitable for iOS/Android/Web favicon
OUTPUT: Square icon, centered, on white background"""
    },
    {
        "name": "logo_dark_mode",
        "prompt": """Design a logo variation of "SkyRate AI" optimized for dark backgrounds.

CONCEPT: The same brand identity adapted for dark mode interfaces.

DESIGN REQUIREMENTS:
- "SkyRate AI" text logo with accompanying icon
- Light/white text with purple-to-pink gradient accent
- Icon uses the brand gradient (#9333EA to #EC4899)
- Must be clearly visible on dark backgrounds (#1E293B, #0F172A)
- Maintains the professional, educational tech aesthetic
- Modern sans-serif typography

STYLE: Clean, minimal, tech-forward
OUTPUT: Logo on dark slate background (#0F172A)"""
    },
    {
        "name": "logo_horizontal",
        "prompt": """Create a horizontal layout logo for "SkyRate AI" for headers and navigation bars.

CONCEPT: A compact horizontal logo for website headers and app navigation.

DESIGN REQUIREMENTS:
- Icon on left, "SkyRate AI" text on right
- Balanced proportions for header use
- Purple/pink gradient for icon (#9333EA to #EC4899)
- Text in dark slate (#1E293B) for light backgrounds
- Clean sans-serif typography
- Height around 40-50px conceptually
- Educational technology company feel

STYLE: Corporate tech, clean and professional
OUTPUT: Horizontal layout on white background"""
    },
]

ICON_PROMPTS = [
    {
        "name": "icon_dashboard",
        "prompt": """Design a modern dashboard icon for a data analytics platform.

STYLE: Flat vector icon, single color (use purple #9333EA)
CONCEPT: Four quadrants or panels representing analytics dashboard
SIZE: Simple enough to work at 24x24px
OUTPUT: Icon on white background, centered"""
    },
    {
        "name": "icon_school",
        "prompt": """Create a modern school/institution icon for an education technology platform.

STYLE: Flat vector icon, single color (use purple #9333EA)  
CONCEPT: Modern school building or graduation cap, not childish
SIZE: Simple enough to work at 24x24px
OUTPUT: Icon on white background, centered"""
    },
    {
        "name": "icon_funding",
        "prompt": """Design an icon representing funding/money for educational grants.

STYLE: Flat vector icon, single color (use green #22C55E for success)
CONCEPT: Dollar sign with upward arrow, or coins with growth
SIZE: Simple enough to work at 24x24px
OUTPUT: Icon on white background, centered"""
    },
    {
        "name": "icon_appeal",
        "prompt": """Create an icon for "appeals" in a legal/administrative context.

STYLE: Flat vector icon, single color (use amber #F59E0B)
CONCEPT: Scales of justice, gavel, or document with arrow
SIZE: Simple enough to work at 24x24px
OUTPUT: Icon on white background, centered"""
    },
    {
        "name": "icon_ai_analysis",
        "prompt": """Design an AI/machine learning analysis icon.

STYLE: Flat vector icon, single color (use purple #9333EA)
CONCEPT: Brain with circuit patterns, or neural network nodes, or sparkle with gear
SIZE: Simple enough to work at 24x24px
OUTPUT: Icon on white background, centered"""
    },
    {
        "name": "icon_vendor",
        "prompt": """Create an icon representing vendors/service providers.

STYLE: Flat vector icon, single color (use slate #475569)
CONCEPT: Briefcase, handshake, or building with service lines
SIZE: Simple enough to work at 24x24px
OUTPUT: Icon on white background, centered"""
    },
    {
        "name": "icon_consultant",
        "prompt": """Design an icon for E-Rate consultants.

STYLE: Flat vector icon, single color (use purple #9333EA)
CONCEPT: Person with chart, or professional with data visualization
SIZE: Simple enough to work at 24x24px
OUTPUT: Icon on white background, centered"""
    },
    {
        "name": "icon_notification",
        "prompt": """Create a notification/alert bell icon.

STYLE: Flat vector icon, single color (use pink #EC4899)
CONCEPT: Modern notification bell, subtle and professional
SIZE: Simple enough to work at 24x24px
OUTPUT: Icon on white background, centered"""
    },
]

BACKGROUND_PROMPTS = [
    {
        "name": "bg_hero_abstract",
        "prompt": """Create an abstract background for a technology company hero section.

DESIGN:
- Subtle purple to pink gradient (#9333EA to #EC4899) at 10-15% opacity
- Abstract geometric shapes: flowing lines, soft curves, or subtle grid patterns
- Light, airy feel with lots of whitespace
- Data visualization elements in the background (subtle nodes, connections)
- Professional and modern, suitable for education/government sector

STYLE: Abstract, minimalist, corporate tech aesthetic
OUTPUT: Wide format (16:9 ratio), suitable for hero section behind text"""
    },
    {
        "name": "bg_network_pattern",
        "prompt": """Design a subtle network/connectivity pattern background.

DESIGN:
- Connected dots and lines representing network topology
- Very light purple tint (#9333EA at 5-10% opacity)
- Clean, geometric pattern
- Represents internet connectivity and data connections
- Should not distract from foreground content

STYLE: Subtle, repeatable pattern, tech-forward
OUTPUT: Square pattern that can tile, light background"""
    },
    {
        "name": "bg_gradient_mesh",
        "prompt": """Create a soft gradient mesh background for dashboard pages.

DESIGN:
- Very subtle blend of white, light purple, and soft pink
- Soft, organic blob shapes with gradient fills
- Professional and calming
- Works well behind data tables and charts
- Light and airy feel

STYLE: Soft gradient mesh, modern UI background
OUTPUT: 1920x1080, very subtle and professional"""
    },
    {
        "name": "bg_data_visualization",
        "prompt": """Design an abstract data visualization background.

DESIGN:
- Faded bar charts, line graphs, and pie charts in the background
- Uses very light purple and gray tones
- Represents analytics and data intelligence
- Professional and subtle
- Should not interfere with foreground content

STYLE: Abstract data art, very subtle
OUTPUT: Wide format, suitable for dashboard background"""
    },
]

ILLUSTRATION_PROMPTS = [
    {
        "name": "illust_erate_concept",
        "prompt": """Create an illustration explaining E-Rate funding for schools.

CONCEPT: Show the flow of funding from government to schools for technology.

ELEMENTS:
- Federal building or official seal (subtle)
- Network/internet symbols
- School building or students with technology
- Dollar signs or funding flow arrows
- Connected devices (computers, wifi)

STYLE: Flat illustration, isometric or 2.5D, modern vector style
COLORS: Purple, pink, white, with green for success
OUTPUT: Horizontal illustration, educational infographic style"""
    },
    {
        "name": "illust_consultant_working",
        "prompt": """Illustrate an E-Rate consultant helping a school administrator.

CONCEPT: Professional collaboration over funding data.

ELEMENTS:
- Two people looking at a dashboard/computer screen
- Charts and data visualizations on screen
- Professional office/meeting setting
- School imagery in background (subtle)

STYLE: Modern flat illustration, diverse characters, professional
COLORS: Brand colors (purple, pink accents), neutral backgrounds
OUTPUT: Square illustration, suitable for about page or features section"""
    },
    {
        "name": "illust_success_celebration",
        "prompt": """Create an illustration of funding approval success.

CONCEPT: Celebration of receiving E-Rate funding.

ELEMENTS:
- Happy school administrator or IT director
- Computer showing "Approved" or success message
- Confetti or celebration elements (subtle)
- School building or students with new technology
- Green checkmarks and success indicators

STYLE: Uplifting, modern flat illustration
COLORS: Green for success, brand purples as accents
OUTPUT: Square illustration for success states and marketing"""
    },
    {
        "name": "illust_ai_analysis",
        "prompt": """Illustrate AI-powered data analysis for E-Rate applications.

CONCEPT: AI helping analyze and improve funding applications.

ELEMENTS:
- Abstract AI/robot element (friendly, not scary)
- Data flowing through analysis
- Documents being processed
- Insights and recommendations appearing
- Charts and improvement metrics

STYLE: Modern tech illustration, abstract but approachable
COLORS: Purple gradient, with blue/cyan for AI elements
OUTPUT: Wide illustration for features section"""
    },
    {
        "name": "illust_vendor_leads",
        "prompt": """Create an illustration for vendor lead generation.

CONCEPT: Service providers finding school opportunities.

ELEMENTS:
- Map with school locations highlighted
- Lead/opportunity indicators
- Vendor representative (professional)
- Connection lines between vendors and schools
- Search/discovery visual metaphor

STYLE: Modern flat illustration, business-focused
COLORS: Brand colors with warm accents for opportunities
OUTPUT: Horizontal illustration for vendor portal page"""
    },
]

MARKETING_PROMPTS = [
    {
        "name": "social_linkedin_cover",
        "prompt": """Design a LinkedIn company page cover image for SkyRate AI.

REQUIREMENTS:
- 1584 x 396 pixels ratio
- "SkyRate AI" logo area on left
- "E-Rate Intelligence Platform" tagline
- Abstract tech/education imagery
- Professional and trustworthy
- Purple to pink brand gradient

STYLE: Corporate LinkedIn aesthetic, modern tech company
OUTPUT: Wide banner format for LinkedIn cover"""
    },
    {
        "name": "social_twitter_header",
        "prompt": """Create a Twitter/X header banner for SkyRate AI.

REQUIREMENTS:
- 1500 x 500 pixels ratio
- Brand logo and tagline
- "Empowering Schools with AI-Powered Funding Intelligence"
- Abstract network/education imagery
- Modern and engaging

STYLE: Tech startup Twitter presence
OUTPUT: Wide banner format for Twitter header"""
    },
    {
        "name": "og_image_default",
        "prompt": """Design a default Open Graph image for SkyRate AI website.

REQUIREMENTS:
- 1200 x 630 pixels ratio
- Large SkyRate AI logo centered
- "E-Rate Funding Intelligence" subtitle
- Professional gradient background
- Clean and recognizable when shared on social

STYLE: Clean OG image, social media preview optimized
OUTPUT: Standard OG image dimensions, professional"""
    },
]


# =============================================================================
# IMAGE GENERATION FUNCTIONS
# =============================================================================

def generate_with_gemini_flash(prompt: str, name: str, output_dir: Path) -> Optional[Path]:
    """
    Generate image using Gemini 2.0 Flash with native image generation.
    This uses the Nano Banana capability.
    """
    try:
        # Try using google-generativeai SDK
        import google.generativeai as genai
        
        genai.configure(api_key=GEMINI_API_KEY)
        
        # Enhanced prompt for image generation
        full_prompt = f"""Generate a high-quality image based on this description:

{prompt}

IMPORTANT: Generate the actual image, not text describing it. Create a professional, 
high-resolution visual asset suitable for a technology company's brand materials."""
        
        # Try with imagen model (Imagen 4)
        try:
            model = genai.ImageGenerationModel("imagen-4.0-generate-001")
            response = model.generate_images(
                prompt=full_prompt,
                number_of_images=1,
                aspect_ratio="1:1",
            )
            
            if response.images:
                image = response.images[0]
                output_path = output_dir / f"{name}.png"
                image._pil_image.save(output_path)
                print(f"✅ Generated (Imagen): {output_path}")
                return output_path
        except Exception as imagen_err:
            print(f"   Imagen not available: {str(imagen_err)[:100]}")
        
        # Fallback to text model that may describe what to create
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content(full_prompt)
        
        # Check for image in response
        if response.candidates:
            for part in response.candidates[0].content.parts:
                if hasattr(part, 'inline_data') and part.inline_data:
                    # Save the image
                    image_data = base64.b64decode(part.inline_data.data)
                    output_path = output_dir / f"{name}.png"
                    with open(output_path, 'wb') as f:
                        f.write(image_data)
                    print(f"✅ Generated: {output_path}")
                    return output_path
        
        print(f"⚠️  No image in response for {name}")
        return None
        
    except ImportError as ie:
        print(f"google-generativeai SDK issue: {ie}. Trying REST API...")
        return generate_with_rest_api(prompt, name, output_dir)
    except Exception as e:
        print(f"❌ Error generating {name}: {e}")
        return None


def generate_with_imagen(prompt: str, name: str, output_dir: Path) -> Optional[Path]:
    """
    Generate image using Imagen API through REST.
    """
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict"
        
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY
        }
        
        data = {
            "instances": [
                {"prompt": prompt}
            ],
            "parameters": {
                "sampleCount": 1,
                "aspectRatio": "1:1",
                "personGeneration": "dont_allow",
                "safetySetting": "block_low_and_above"
            }
        }
        
        response = requests.post(url, headers=headers, json=data, timeout=120)
        
        if response.status_code == 200:
            result = response.json()
            if "predictions" in result and len(result["predictions"]) > 0:
                image_data = base64.b64decode(result["predictions"][0]["bytesBase64Encoded"])
                output_path = output_dir / f"{name}.png"
                with open(output_path, 'wb') as f:
                    f.write(image_data)
                print(f"✅ Generated (Imagen): {output_path}")
                return output_path
        else:
            print(f"⚠️  Imagen API error for {name}: {response.status_code} - {response.text[:200]}")
            
    except Exception as e:
        print(f"❌ Imagen error for {name}: {e}")
    
    return None


def generate_with_rest_api(prompt: str, name: str, output_dir: Path) -> Optional[Path]:
    """
    Fallback: Generate using Gemini REST API directly.
    """
    try:
        # Try gemini-2.0-flash with image output (experimental image generation)
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent"
        
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY
        }
        
        data = {
            "contents": [{
                "parts": [{
                    "text": f"Generate an image: {prompt}"
                }]
            }],
            "generationConfig": {
                "responseModalities": ["IMAGE", "TEXT"]
            }
        }
        
        response = requests.post(url, headers=headers, json=data, timeout=120)
        
        if response.status_code == 200:
            result = response.json()
            candidates = result.get("candidates", [])
            if candidates:
                for part in candidates[0].get("content", {}).get("parts", []):
                    if "inlineData" in part:
                        image_data = base64.b64decode(part["inlineData"]["data"])
                        output_path = output_dir / f"{name}.png"
                        with open(output_path, 'wb') as f:
                            f.write(image_data)
                        print(f"✅ Generated (REST): {output_path}")
                        return output_path
        
        print(f"⚠️  REST API: No image generated for {name}")
        return None
        
    except Exception as e:
        print(f"❌ REST API error for {name}: {e}")
        return None


def generate_image(prompt_data: Dict, output_dir: Path) -> Optional[Path]:
    """
    Try multiple generation methods in order of preference.
    """
    name = prompt_data["name"]
    prompt = f"{BRAND_CONTEXT}\n\n{prompt_data['prompt']}"
    
    print(f"\n🎨 Generating: {name}")
    print(f"   Prompt preview: {prompt_data['prompt'][:100]}...")
    
    # Try Imagen first (best quality for images)
    result = generate_with_imagen(prompt_data['prompt'], name, output_dir)
    if result:
        return result
    
    # Try Gemini Flash with image output
    result = generate_with_gemini_flash(prompt, name, output_dir)
    if result:
        return result
    
    # Fallback to REST API
    result = generate_with_rest_api(prompt, name, output_dir)
    if result:
        return result
    
    print(f"❌ All methods failed for {name}")
    return None


def save_prompts_log(all_prompts: List[Dict], results: Dict[str, Optional[Path]]):
    """Save a log of all prompts and their results."""
    log_path = OUTPUT_DIR / "generation_log.json"
    
    log_data = {
        "generated_at": datetime.now().isoformat(),
        "total_prompts": len(all_prompts),
        "successful": sum(1 for r in results.values() if r),
        "failed": sum(1 for r in results.values() if not r),
        "prompts": []
    }
    
    for prompt_data in all_prompts:
        name = prompt_data["name"]
        log_data["prompts"].append({
            "name": name,
            "prompt": prompt_data["prompt"],
            "success": results.get(name) is not None,
            "output_path": str(results.get(name)) if results.get(name) else None
        })
    
    with open(log_path, 'w') as f:
        json.dump(log_data, f, indent=2)
    
    print(f"\n📋 Log saved to: {log_path}")


# =============================================================================
# MAIN EXECUTION
# =============================================================================

def main():
    """Main execution function."""
    # Set encoding for Windows console
    import sys
    if sys.platform == 'win32':
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    
    print("=" * 60)
    print("[ART] SkyRate AI Brand Asset Generator")
    print("=" * 60)
    print(f"\n[DIR] Output directory: {OUTPUT_DIR}")
    
    if not GEMINI_API_KEY:
        print("❌ ERROR: GEMINI_API_KEY not found in environment!")
        sys.exit(1)
    
    print(f"✅ Gemini API Key found: {GEMINI_API_KEY[:20]}...")
    
    # Combine all prompts
    all_prompts = []
    prompt_dirs = [
        (LOGO_PROMPTS, LOGO_DIR, "Logos"),
        (ICON_PROMPTS, ICON_DIR, "Icons"),
        (BACKGROUND_PROMPTS, BACKGROUND_DIR, "Backgrounds"),
        (ILLUSTRATION_PROMPTS, ILLUSTRATION_DIR, "Illustrations"),
        (MARKETING_PROMPTS, MARKETING_DIR, "Marketing"),
    ]
    
    results = {}
    
    for prompts, output_dir, category in prompt_dirs:
        print(f"\n{'='*40}")
        print(f"📦 Category: {category} ({len(prompts)} items)")
        print(f"{'='*40}")
        
        for prompt_data in prompts:
            all_prompts.append(prompt_data)
            result = generate_image(prompt_data, output_dir)
            results[prompt_data["name"]] = result
            
            # Rate limiting
            time.sleep(2)
    
    # Save log
    save_prompts_log(all_prompts, results)
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 GENERATION SUMMARY")
    print("=" * 60)
    
    successful = sum(1 for r in results.values() if r)
    failed = sum(1 for r in results.values() if not r)
    
    print(f"✅ Successful: {successful}")
    print(f"❌ Failed: {failed}")
    print(f"📁 Output: {OUTPUT_DIR}")
    
    if successful > 0:
        print("\n🎉 Assets ready for review in:")
        for prompts, output_dir, category in prompt_dirs:
            count = sum(1 for p in prompts if results.get(p["name"]))
            if count > 0:
                print(f"   - {output_dir} ({count} files)")
    
    return successful > 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

