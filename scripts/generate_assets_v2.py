"""
SkyRate AI Brand Asset Generator V2
====================================
Creative Director Approach:
- Purple-to-BLUE gradient (professional, trustworthy)
- Consistent logo style across all marketing assets
- Icons/backgrounds WITHOUT logos for flexibility
- Based on approved horizontal logo style

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

# Configure UTF-8 output on Windows
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Load environment variables
env_path = Path(__file__).parent.parent / "backend" / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            if line.startswith("GEMINI_API_KEY="):
                os.environ["GEMINI_API_KEY"] = line.strip().split("=", 1)[1]
                break

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
OUTPUT_DIR = Path(__file__).parent.parent / "assets" / "generated" / "v2"

# Create output directories
DIRS = {
    "logos": OUTPUT_DIR / "logos",
    "icons": OUTPUT_DIR / "icons",
    "backgrounds": OUTPUT_DIR / "backgrounds",
    "illustrations": OUTPUT_DIR / "illustrations",
    "marketing": OUTPUT_DIR / "marketing"
}
for d in DIRS.values():
    d.mkdir(parents=True, exist_ok=True)


# =============================================================================
# BRAND GUIDELINES V2 - Creative Director Approved
# =============================================================================

BRAND_V2 = """
SKYRATE AI BRAND GUIDELINES V2
==============================

BRAND IDENTITY:
- Name: SkyRate AI
- Tagline: "E-Rate Funding Intelligence Platform"
- Industry: EdTech / Government Funding (E-Rate program)

TARGET AUDIENCE:
- School administrators and IT directors
- E-Rate consultants managing multiple districts
- Telecommunications vendors
- Government/education professionals

COLOR PALETTE (Purple to Blue):
- Primary Gradient: Violet #8B5CF6 transitioning to Blue #3B82F6
- This conveys: Innovation (purple) + Trust/Reliability (blue)
- Perfect for government/education sector
- Avoid pink tones - use blue instead

LOGO STYLE (Based on Approved Horizontal Logo):
- Modern, clean horizontal wordmark
- "SkyRate" in clean sans-serif typography
- "AI" subtly differentiated (lighter weight or color)
- May include small abstract icon (upward graph, star, data point)
- Professional, not playful - suitable for government contexts

VISUAL STYLE:
- Clean, modern, professional
- Smooth gradients (purple to blue)
- Rounded corners for approachability
- Ample whitespace
- Data visualization friendly
- Accessible and readable
"""

# Master logo description for consistency
MASTER_LOGO_DESC = """
The SkyRate AI logo is a modern horizontal wordmark. 
'SkyRate' appears in clean, bold sans-serif typography (like Inter, Poppins, or similar).
'AI' is subtly differentiated - either lighter weight, smaller, or with the blue accent color.
A small abstract icon may accompany the text - representing upward growth, data, or sky.
Colors: Gradient from violet (#8B5CF6) to blue (#3B82F6).
Overall aesthetic: Professional tech company serving education/government sector.
"""


# =============================================================================
# PROMPT DEFINITIONS
# =============================================================================

LOGO_PROMPTS = [
    ("logo_main_v2", f"""Create a modern, professional logo for 'SkyRate AI' - an E-Rate funding platform.

REQUIREMENTS:
- Horizontal wordmark layout
- 'SkyRate' in clean, bold sans-serif font
- 'AI' subtly differentiated (lighter or accent color)
- Small abstract icon element (upward graph, star, or data visualization)
- Gradient from violet (#8B5CF6) to blue (#3B82F6)
- White/light background
- Professional enough for government/education sector
- Clean, modern tech company aesthetic

STYLE: Flat design, vector-style, no 3D effects, tech startup look
OUTPUT: Logo centered on white background, high resolution"""),

    ("logo_icon_v2", f"""Create a square app icon for SkyRate AI.

REQUIREMENTS:
- Square format, works at small sizes (favicon to app icon)
- Abstract symbol representing: growth, data, sky, or upward movement
- Could be: stylized 'S', ascending bars, connected dots, abstract star
- Gradient from violet (#8B5CF6) to blue (#3B82F6)
- NO text - icon symbol only
- Simple, recognizable silhouette
- Modern, geometric design

STYLE: Flat vector, app icon aesthetic (iOS/Android style)
OUTPUT: Square icon on white background"""),

    ("logo_dark_v2", f"""Create the SkyRate AI logo optimized for dark backgrounds.

REQUIREMENTS:
- Horizontal wordmark: 'SkyRate AI'
- Light/white text for visibility on dark
- Gradient accent from violet (#8B5CF6) to blue (#3B82F6) on icon or 'AI'
- Small abstract icon element (upward trend, star)
- Clean sans-serif typography
- Professional tech aesthetic

STYLE: Modern, clean, suitable for dark mode UI
OUTPUT: Logo on dark slate background (#0F172A)"""),

    ("logo_wordmark_v2", f"""Create a text-only wordmark for SkyRate AI.

REQUIREMENTS:
- 'SkyRate AI' text only, no icon
- Clean, modern sans-serif typography
- Gradient text effect from violet (#8B5CF6) to blue (#3B82F6)
- 'AI' slightly differentiated
- Horizontal layout
- Professional, corporate feel

STYLE: Typography-focused, minimal, professional
OUTPUT: Wordmark on transparent/white background"""),
]

# Icons - NO text, NO logo, symbols only
ICON_PROMPTS = [
    ("icon_dashboard_v2", """Create a dashboard/analytics icon.

REQUIREMENTS:
- Grid or chart layout symbol
- Gradient from violet (#8B5CF6) to blue (#3B82F6)
- NO text, NO letters, NO logo
- Pure icon symbol only
- Flat design, simple shapes
- Works at 24px to 128px sizes

STYLE: Flat UI icon, modern, minimal
OUTPUT: Icon only, transparent or white background"""),

    ("icon_school_v2", """Create a school/education building icon.

REQUIREMENTS:
- Simple school building silhouette OR graduation cap
- Gradient from violet (#8B5CF6) to blue (#3B82F6)
- NO text, NO letters, NO logo
- Pure icon symbol only
- Friendly but professional
- Simple geometric shapes

STYLE: Flat UI icon, educational feel
OUTPUT: Icon only, transparent background"""),

    ("icon_funding_v2", """Create a funding/money/success icon.

REQUIREMENTS:
- Dollar sign with upward arrow OR coins with growth chart
- Green accent (#22C55E) for success/money theme
- With violet/blue accents
- NO text, NO letters, NO logo
- Pure icon symbol only
- Positive, successful feeling

STYLE: Flat UI icon, financial/success theme
OUTPUT: Icon only, transparent background"""),

    ("icon_appeal_v2", """Create an appeals/document review icon.

REQUIREMENTS:
- Document with checkmark OR paper with magnifying glass
- Gradient from violet (#8B5CF6) to blue (#3B82F6)
- NO text, NO letters, NO logo
- Pure icon symbol only
- Professional, legal/review feeling

STYLE: Flat UI icon, document-focused
OUTPUT: Icon only, transparent background"""),

    ("icon_ai_v2", """Create an AI/artificial intelligence icon.

REQUIREMENTS:
- Brain with circuit patterns OR sparkle/star with neural network
- Gradient from violet (#8B5CF6) to blue (#3B82F6)
- NO text, NO letters, NO logo
- Pure icon symbol only
- Modern, tech-forward feeling
- Suggests intelligence and automation

STYLE: Flat UI icon, AI/tech aesthetic
OUTPUT: Icon only, transparent background"""),

    ("icon_vendor_v2", """Create a vendor/business partner icon.

REQUIREMENTS:
- Building/storefront OR briefcase with handshake
- Gradient from violet (#8B5CF6) to blue (#3B82F6)
- NO text, NO letters, NO logo
- Pure icon symbol only
- Professional, B2B feeling

STYLE: Flat UI icon, business/corporate
OUTPUT: Icon only, transparent background"""),

    ("icon_consultant_v2", """Create a consultant/advisor icon.

REQUIREMENTS:
- Person silhouette with chart OR headset with speech bubble
- Gradient from violet (#8B5CF6) to blue (#3B82F6)
- NO text, NO letters, NO logo
- Pure icon symbol only
- Helpful, advisory feeling

STYLE: Flat UI icon, professional services
OUTPUT: Icon only, transparent background"""),

    ("icon_notification_v2", """Create a notification/alert bell icon.

REQUIREMENTS:
- Simple bell shape with notification dot
- Gradient from violet (#8B5CF6) to blue (#3B82F6)
- Small red or orange dot for alert indicator
- NO text, NO letters, NO logo
- Pure icon symbol only

STYLE: Flat UI icon, notification style
OUTPUT: Icon only, transparent background"""),
]

# Backgrounds - NO text, NO logo, patterns only
BACKGROUND_PROMPTS = [
    ("bg_hero_v2", """Create an abstract hero section background.

REQUIREMENTS:
- Smooth gradient from violet (#8B5CF6) to blue (#3B82F6)
- Subtle abstract shapes: waves, curves, or geometric patterns
- NO text, NO logos, NO watermarks
- Suitable as website hero background
- Light, airy feel with depth
- Wide format (16:9 aspect)

STYLE: Abstract, modern, gradient mesh
OUTPUT: Wide background image, no text"""),

    ("bg_network_v2", """Create a network visualization background.

REQUIREMENTS:
- Connected dots and lines forming abstract network
- Violet (#8B5CF6) and blue (#3B82F6) nodes and connections
- Dark background (slate #1E293B)
- NO text, NO logos, NO watermarks
- Suggests connectivity and data flow
- Subtle, not overwhelming

STYLE: Data visualization, tech aesthetic
OUTPUT: Background pattern, no text"""),

    ("bg_gradient_v2", """Create a smooth gradient mesh background.

REQUIREMENTS:
- Flowing gradient: violet, blue, with hints of teal
- Colors: #8B5CF6, #3B82F6, #06B6D4
- Soft, organic shapes blending together
- NO text, NO logos, NO watermarks
- Professional, modern feel
- Suitable for cards or sections

STYLE: Gradient mesh, smooth transitions
OUTPUT: Abstract background, no text"""),

    ("bg_data_v2", """Create an abstract data visualization background.

REQUIREMENTS:
- Abstract charts, graphs, and data points
- Violet to blue color palette (#8B5CF6 to #3B82F6)
- Faded/watermark style - subtle, not dominant
- NO text, NO logos, NO readable numbers
- Suggests analytics and insights
- Light background version

STYLE: Abstract data viz, subtle pattern
OUTPUT: Background pattern, no text"""),
]

# Illustrations - NO embedded logo (user can composite)
ILLUSTRATION_PROMPTS = [
    ("illus_erate_v2", """Create an illustration showing E-Rate/school connectivity concept.

REQUIREMENTS:
- School buildings connected to internet/cloud
- Network connections visualized (wifi symbols, cables)
- Happy, successful feeling
- Color palette: violet (#8B5CF6), blue (#3B82F6), slate grays
- NO text overlays, NO logos embedded
- Simple, friendly illustration style
- Diverse representation if showing people

STYLE: Modern flat illustration, tech meets education
OUTPUT: Scene illustration, no text"""),

    ("illus_consultant_v2", """Create an illustration of consultant helping schools.

REQUIREMENTS:
- Person (consultant) presenting to school administrators
- Charts/data visualization on screen
- Professional office/school setting
- Color palette: violet, blue, slate
- NO text overlays, NO logos embedded
- Friendly, helpful feeling
- Diverse representation

STYLE: Modern flat illustration, business meeting
OUTPUT: Scene illustration, no text"""),

    ("illus_success_v2", """Create a celebration/success illustration.

REQUIREMENTS:
- Celebration theme: confetti, checkmarks, thumbs up
- Green accents (#22C55E) for success
- With violet/blue brand colors
- NO text overlays, NO logos embedded
- Positive, achievement feeling
- Abstract or with simplified people

STYLE: Modern flat illustration, celebration
OUTPUT: Celebratory scene, no text"""),

    ("illus_ai_v2", """Create an AI analysis/insights illustration.

REQUIREMENTS:
- Abstract visualization of AI processing data
- Charts transforming into insights
- Sparkles or stars indicating AI magic
- Color palette: violet to blue gradient
- NO text overlays, NO logos embedded
- Modern, intelligent feeling
- Tech-forward aesthetic

STYLE: Modern flat illustration, AI/tech theme
OUTPUT: Concept illustration, no text"""),

    ("illus_vendor_v2", """Create a vendor/business growth illustration.

REQUIREMENTS:
- Business growth chart with upward trend
- Connection between vendors and schools
- Professional B2B feeling
- Color palette: violet, blue, green accents
- NO text overlays, NO logos embedded
- Success and partnership theme

STYLE: Modern flat illustration, business growth
OUTPUT: Business concept illustration, no text"""),
]

# Marketing - WITH consistent logo description
MARKETING_PROMPTS = [
    ("social_linkedin_v2", f"""Create a LinkedIn cover banner for SkyRate AI.

REQUIREMENTS:
- Wide format: 1584 x 396 pixels aspect ratio
- Left side: SkyRate AI logo (horizontal wordmark, violet-to-blue gradient)
- Right side: Abstract network/data visualization
- Tagline area: 'E-Rate Funding Intelligence Platform'
- Color gradient: violet (#8B5CF6) to blue (#3B82F6)
- Professional, corporate LinkedIn aesthetic

LOGO STYLE: {MASTER_LOGO_DESC}

STYLE: Corporate LinkedIn banner, professional tech company
OUTPUT: Wide banner format"""),

    ("social_twitter_v2", f"""Create a Twitter/X header banner for SkyRate AI.

REQUIREMENTS:
- Wide format: 1500 x 500 pixels aspect ratio
- SkyRate AI logo prominently displayed (horizontal wordmark)
- Gradient background: violet (#8B5CF6) to blue (#3B82F6)
- Subtle abstract tech/data elements
- Tagline: 'AI-Powered E-Rate Insights'
- Modern, engaging look

LOGO STYLE: {MASTER_LOGO_DESC}

STYLE: Tech startup Twitter header, engaging
OUTPUT: Wide banner format"""),

    ("og_image_v2", f"""Create an Open Graph / social sharing image for SkyRate AI.

REQUIREMENTS:
- Standard OG format: 1200 x 630 pixels aspect ratio
- Large SkyRate AI logo centered (horizontal wordmark)
- Gradient background: violet (#8B5CF6) to blue (#3B82F6)
- Subtitle: 'E-Rate Funding Intelligence'
- Clean, recognizable when small (social preview)
- Professional appearance

LOGO STYLE: {MASTER_LOGO_DESC}

STYLE: OG image, social media preview optimized
OUTPUT: Standard OG dimensions"""),
]


# =============================================================================
# IMAGE GENERATION FUNCTION
# =============================================================================

def generate_image(prompt: str, name: str, output_dir: Path) -> Path | None:
    """Generate image using Gemini REST API"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key={GEMINI_API_KEY}"
    
    headers = {"Content-Type": "application/json"}
    
    # Prepend brand context to prompt
    full_prompt = f"""Generate a high-quality image based on these specifications:

{BRAND_V2}

SPECIFIC REQUIREMENTS:
{prompt}

IMPORTANT: Create the actual image, professional quality. Follow the color palette exactly."""

    data = {
        "contents": [{
            "parts": [{"text": full_prompt}]
        }],
        "generationConfig": {
            "responseModalities": ["IMAGE", "TEXT"]
        }
    }
    
    print(f"  Generating {name}...", end=" ", flush=True)
    
    try:
        response = requests.post(url, headers=headers, json=data, timeout=120)
        
        if response.status_code == 200:
            result = response.json()
            candidates = result.get("candidates", [])
            if candidates:
                for part in candidates[0].get("content", {}).get("parts", []):
                    if "inlineData" in part:
                        mime = part["inlineData"].get("mimeType", "image/png")
                        ext = "png" if "png" in mime else "jpg"
                        image_data = base64.b64decode(part["inlineData"]["data"])
                        output_path = output_dir / f"{name}.{ext}"
                        with open(output_path, 'wb') as f:
                            f.write(image_data)
                        size_kb = len(image_data) / 1024
                        print(f"OK ({size_kb:.0f}KB)")
                        return output_path
            print("No image in response")
        else:
            error_msg = response.text[:100] if response.text else "Unknown error"
            print(f"API error {response.status_code}: {error_msg}")
        return None
        
    except requests.exceptions.Timeout:
        print("Timeout (120s)")
        return None
    except Exception as e:
        print(f"Error: {str(e)[:60]}")
        return None


# =============================================================================
# MAIN EXECUTION
# =============================================================================

def main():
    print("=" * 60)
    print("SkyRate AI Brand Asset Generator V2")
    print("Creative Director: Purple-to-Blue, Consistent Branding")
    print("=" * 60)
    
    if not GEMINI_API_KEY:
        print("ERROR: GEMINI_API_KEY not found!")
        return False
    
    print(f"\nAPI Key: {GEMINI_API_KEY[:15]}...")
    print(f"Output: {OUTPUT_DIR}")
    print("\nBrand Changes in V2:")
    print("  - Colors: Purple to BLUE (not pink)")
    print("  - Icons: NO text/logos (symbols only)")
    print("  - Backgrounds: NO text/logos (patterns only)")
    print("  - Marketing: Consistent logo description")
    print()
    
    # All prompts organized
    all_categories = [
        ("LOGOS", LOGO_PROMPTS, DIRS["logos"]),
        ("ICONS", ICON_PROMPTS, DIRS["icons"]),
        ("BACKGROUNDS", BACKGROUND_PROMPTS, DIRS["backgrounds"]),
        ("ILLUSTRATIONS", ILLUSTRATION_PROMPTS, DIRS["illustrations"]),
        ("MARKETING", MARKETING_PROMPTS, DIRS["marketing"]),
    ]
    
    total = sum(len(prompts) for _, prompts, _ in all_categories)
    done = 0
    results = {}
    
    for category_name, prompts, output_dir in all_categories:
        print(f"\n[{category_name}] ({len(prompts)} items)")
        print("-" * 50)
        
        for name, prompt in prompts:
            done += 1
            print(f"[{done}/{total}]", end=" ")
            result = generate_image(prompt, name, output_dir)
            results[name] = result
            time.sleep(1)  # Rate limiting
    
    # Save generation log
    log_data = {
        "version": "v2",
        "generated_at": datetime.now().isoformat(),
        "brand_changes": [
            "Purple to Blue gradient (#8B5CF6 to #3B82F6)",
            "Icons without text/logos",
            "Backgrounds without text/logos", 
            "Consistent logo description in marketing"
        ],
        "successful": sum(1 for r in results.values() if r),
        "failed": sum(1 for r in results.values() if not r),
        "files": {k: str(v) if v else None for k, v in results.items()}
    }
    
    log_path = OUTPUT_DIR / "generation_log_v2.json"
    with open(log_path, 'w') as f:
        json.dump(log_data, f, indent=2)
    
    # Summary
    print("\n" + "=" * 60)
    print("GENERATION COMPLETE")
    print("=" * 60)
    print(f"Successful: {log_data['successful']}/{total}")
    print(f"Failed: {log_data['failed']}/{total}")
    print(f"\nOutput: {OUTPUT_DIR}")
    print(f"Log: {log_path}")
    
    print("\nV2 Folder Structure:")
    for category, _, dir_path in all_categories:
        count = len(list(dir_path.glob("*.png")))
        print(f"  {dir_path.name}/  ({count} files)")
    
    return log_data['successful'] > 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
