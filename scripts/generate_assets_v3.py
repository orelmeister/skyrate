"""
SkyRate AI Brand Asset Generator V3
====================================
Uses the approved logo_horizontal.png as REFERENCE IMAGE
for all generated assets - ensuring brand consistency.

This version sends the master logo to Gemini's multimodal API
so all assets are based on the exact approved logo design.

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
OUTPUT_DIR = Path(__file__).parent.parent / "assets" / "generated" / "v3"

# Master logo path - the approved horizontal logo
MASTER_LOGO_PATH = Path(__file__).parent.parent / "assets" / "generated" / "logos" / "logo_horizontal.png"

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


def load_master_logo():
    """Load the master logo as base64 for use in prompts."""
    if not MASTER_LOGO_PATH.exists():
        print(f"ERROR: Master logo not found at {MASTER_LOGO_PATH}")
        return None
    
    with open(MASTER_LOGO_PATH, "rb") as f:
        image_data = f.read()
    
    base64_image = base64.b64encode(image_data).decode("utf-8")
    print(f"Loaded master logo: {MASTER_LOGO_PATH.name} ({len(image_data) / 1024:.0f}KB)")
    return base64_image


# =============================================================================
# PROMPT DEFINITIONS - All reference the master logo
# =============================================================================

LOGO_PROMPTS = [
    ("logo_icon_v3", """Looking at the provided SkyRate AI logo, create a SQUARE APP ICON version.

INSTRUCTIONS:
- Extract the key visual elements from this logo (icon/symbol part)
- Create a square format suitable for app icons (iOS, Android, favicon)
- Keep the exact same colors and style as the original logo
- The icon should work at small sizes (16px to 512px)
- DO NOT add new elements - simplify the existing logo into icon form
- Maintain the same color gradient and design language

OUTPUT: Square icon version of this logo, white background"""),

    ("logo_dark_v3", """Looking at the provided SkyRate AI logo, create a DARK MODE VERSION.

INSTRUCTIONS:
- Recreate this exact logo optimized for dark backgrounds
- Keep the same typography, layout, and icon design
- Adjust colors: make text white/light, keep gradient accents
- The logo should be clearly visible on dark slate (#0F172A) background
- Maintain exact same proportions and style

OUTPUT: Same logo adapted for dark backgrounds"""),

    ("logo_white_v3", """Looking at the provided SkyRate AI logo, create a WHITE/MONOCHROME VERSION.

INSTRUCTIONS:
- Recreate this exact logo in pure white
- Same typography, layout, and icon design
- Single color: white only
- Useful for overlaying on photos or colored backgrounds
- Maintain exact same proportions

OUTPUT: White monochrome version of this logo, transparent background"""),
]

ICON_PROMPTS = [
    ("icon_dashboard_v3", """Looking at the provided SkyRate AI logo, create a DASHBOARD ICON that matches its style.

INSTRUCTIONS:
- Create a dashboard/analytics grid icon
- Use the SAME color palette as the logo (extract the gradient colors)
- Match the visual style: same level of detail, same rounded corners if present
- NO text, NO logo text - just the icon symbol
- Simple, clean, professional

OUTPUT: Dashboard icon matching logo's color palette and style"""),

    ("icon_school_v3", """Looking at the provided SkyRate AI logo, create a SCHOOL ICON that matches its style.

INSTRUCTIONS:
- Create a school building or graduation cap icon
- Use the SAME color palette as the logo
- Match the visual style and design language
- NO text - pure icon symbol
- Educational, friendly, professional

OUTPUT: School icon matching logo's style"""),

    ("icon_funding_v3", """Looking at the provided SkyRate AI logo, create a FUNDING/MONEY ICON that matches its style.

INSTRUCTIONS:
- Create a dollar sign with growth arrow OR money/success symbol
- Use colors from the logo palette, with green (#22C55E) for money/success
- Match the visual style
- NO text - pure icon symbol
- Positive, successful feeling

OUTPUT: Funding icon matching logo's style"""),

    ("icon_appeal_v3", """Looking at the provided SkyRate AI logo, create an APPEALS/DOCUMENT ICON that matches its style.

INSTRUCTIONS:
- Create a document with checkmark or review symbol
- Use the SAME color palette as the logo
- Match the visual style and design language
- NO text - pure icon symbol
- Professional, legal/review feeling

OUTPUT: Appeals document icon matching logo's style"""),

    ("icon_ai_v3", """Looking at the provided SkyRate AI logo, create an AI/INTELLIGENCE ICON that matches its style.

INSTRUCTIONS:
- Create a brain, neural network, or sparkle/AI symbol
- Use the SAME color palette as the logo
- Match the visual style
- NO text - pure icon symbol
- Tech-forward, intelligent feeling

OUTPUT: AI icon matching logo's style"""),

    ("icon_vendor_v3", """Looking at the provided SkyRate AI logo, create a VENDOR/BUSINESS ICON that matches its style.

INSTRUCTIONS:
- Create a building, briefcase, or business partnership symbol
- Use the SAME color palette as the logo
- Match the visual style
- NO text - pure icon symbol
- Professional B2B feeling

OUTPUT: Vendor icon matching logo's style"""),

    ("icon_consultant_v3", """Looking at the provided SkyRate AI logo, create a CONSULTANT ICON that matches its style.

INSTRUCTIONS:
- Create a person with chart, advisor, or helper symbol
- Use the SAME color palette as the logo
- Match the visual style
- NO text - pure icon symbol
- Helpful, advisory feeling

OUTPUT: Consultant icon matching logo's style"""),

    ("icon_notification_v3", """Looking at the provided SkyRate AI logo, create a NOTIFICATION BELL ICON that matches its style.

INSTRUCTIONS:
- Create a notification bell with alert dot
- Use the SAME color palette as the logo
- Match the visual style
- NO text - pure icon symbol
- Alert notification style

OUTPUT: Notification icon matching logo's style"""),
]

BACKGROUND_PROMPTS = [
    ("bg_hero_v3", """Looking at the provided SkyRate AI logo, create a HERO SECTION BACKGROUND that complements it.

INSTRUCTIONS:
- Create an abstract gradient background
- Extract and use the EXACT colors from this logo
- Subtle waves, curves, or geometric patterns
- NO text, NO logos embedded
- The logo would look great placed on top of this background
- Wide format (16:9 aspect)

OUTPUT: Hero background using the logo's color palette"""),

    ("bg_network_v3", """Looking at the provided SkyRate AI logo, create a NETWORK VISUALIZATION BACKGROUND.

INSTRUCTIONS:
- Create connected dots and lines forming abstract network
- Use the colors from the logo for nodes and connections
- Dark slate background (#1E293B)
- NO text, NO logos
- Suggests connectivity and data flow

OUTPUT: Network background using logo's colors"""),

    ("bg_gradient_v3", """Looking at the provided SkyRate AI logo, create a GRADIENT MESH BACKGROUND.

INSTRUCTIONS:
- Create a flowing gradient using the EXACT colors from this logo
- Soft, organic shapes blending together
- NO text, NO logos
- Professional, modern feel
- Suitable for cards or page sections

OUTPUT: Gradient mesh using logo's color palette"""),

    ("bg_data_v3", """Looking at the provided SkyRate AI logo, create a DATA VISUALIZATION BACKGROUND.

INSTRUCTIONS:
- Create abstract charts, graphs, and data points
- Use the color palette from the logo
- Subtle, watermark style - not dominant
- NO text, NO readable numbers
- Suggests analytics and insights

OUTPUT: Data viz background using logo's colors"""),
]

ILLUSTRATION_PROMPTS = [
    ("illus_erate_v3", """Looking at the provided SkyRate AI logo, create an E-RATE CONCEPT ILLUSTRATION.

INSTRUCTIONS:
- Create an illustration showing schools connected to internet/cloud
- Use the SAME color palette as this logo throughout
- Match the visual style and feel of the logo
- NO text overlays, but you MAY include the logo in the scene
- Simple, friendly illustration style
- Show network connectivity for education

OUTPUT: E-Rate illustration matching logo's style and colors"""),

    ("illus_consultant_v3", """Looking at the provided SkyRate AI logo, create a CONSULTANT ILLUSTRATION.

INSTRUCTIONS:
- Create illustration of advisor helping school administrators
- Use the SAME color palette as this logo
- Match the professional yet friendly feel
- NO text overlays, but MAY include the logo in scene
- Business meeting or presentation setting

OUTPUT: Consultant illustration matching logo's style"""),

    ("illus_success_v3", """Looking at the provided SkyRate AI logo, create a SUCCESS/CELEBRATION ILLUSTRATION.

INSTRUCTIONS:
- Create celebration scene: confetti, checkmarks, achievement
- Use colors from the logo plus green for success accents
- Match the visual style
- Positive, achievement feeling
- NO text overlays

OUTPUT: Success illustration matching logo's colors"""),

    ("illus_ai_v3", """Looking at the provided SkyRate AI logo, create an AI ANALYSIS ILLUSTRATION.

INSTRUCTIONS:
- Create visualization of AI processing data into insights
- Use the SAME color palette as this logo
- Charts transforming, sparkles for AI magic
- Match the tech-forward feel of the logo
- NO text overlays

OUTPUT: AI illustration matching logo's style"""),

    ("illus_vendor_v3", """Looking at the provided SkyRate AI logo, create a VENDOR GROWTH ILLUSTRATION.

INSTRUCTIONS:
- Create business growth/partnership illustration
- Use colors from the logo
- Show connection between vendors and schools
- Professional B2B feeling
- NO text overlays

OUTPUT: Vendor illustration matching logo's style"""),
]

MARKETING_PROMPTS = [
    ("social_linkedin_v3", """Looking at the provided SkyRate AI logo, create a LINKEDIN COVER BANNER.

INSTRUCTIONS:
- Create wide banner (1584 x 396 aspect)
- INCLUDE THIS EXACT LOGO on the left side
- Add complementary abstract elements on right
- Use the logo's color palette for background/accents
- Add tagline area: "E-Rate Funding Intelligence Platform"
- Professional LinkedIn aesthetic

OUTPUT: LinkedIn banner featuring this exact logo"""),

    ("social_twitter_v3", """Looking at the provided SkyRate AI logo, create a TWITTER/X HEADER.

INSTRUCTIONS:
- Create wide banner (1500 x 500 aspect)
- INCLUDE THIS EXACT LOGO prominently
- Gradient background using logo's colors
- Subtle tech/data elements
- Tagline: "AI-Powered E-Rate Insights"
- Modern, engaging look

OUTPUT: Twitter header featuring this exact logo"""),

    ("og_image_v3", """Looking at the provided SkyRate AI logo, create an OG/SOCIAL SHARING IMAGE.

INSTRUCTIONS:
- Create standard OG image (1200 x 630 aspect)
- INCLUDE THIS EXACT LOGO large and centered
- Gradient background using logo's colors
- Subtitle: "E-Rate Funding Intelligence"
- Clean, recognizable when small
- Professional appearance

OUTPUT: OG image featuring this exact logo"""),
]


def generate_with_reference_image(prompt: str, name: str, output_dir: Path, logo_base64: str) -> Path | None:
    """Generate image using Gemini with the master logo as reference."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key={GEMINI_API_KEY}"
    
    headers = {"Content-Type": "application/json"}
    
    # Multimodal request with image + text
    data = {
        "contents": [{
            "parts": [
                {
                    "inlineData": {
                        "mimeType": "image/png",
                        "data": logo_base64
                    }
                },
                {
                    "text": f"""You are a brand designer. Use the attached logo image as your reference.

{prompt}

CRITICAL: Match the exact colors, style, and feel of the provided logo image.
Generate a high-quality professional image."""
                }
            ]
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
            error_msg = response.text[:150] if response.text else "Unknown error"
            print(f"API error {response.status_code}: {error_msg}")
        return None
        
    except requests.exceptions.Timeout:
        print("Timeout (120s)")
        return None
    except Exception as e:
        print(f"Error: {str(e)[:60]}")
        return None


def main():
    print("=" * 60)
    print("SkyRate AI Brand Asset Generator V3")
    print("Using Master Logo as Reference Image")
    print("=" * 60)
    
    if not GEMINI_API_KEY:
        print("ERROR: GEMINI_API_KEY not found!")
        return False
    
    print(f"\nAPI Key: {GEMINI_API_KEY[:15]}...")
    print(f"Output: {OUTPUT_DIR}")
    print(f"Master Logo: {MASTER_LOGO_PATH}")
    
    # Load master logo
    logo_base64 = load_master_logo()
    if not logo_base64:
        print("Cannot proceed without master logo!")
        return False
    
    print("\nV3 Approach:")
    print("  - Sending master logo as reference to Gemini")
    print("  - All assets will match the logo's exact style")
    print("  - Colors extracted from the actual logo image")
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
            result = generate_with_reference_image(prompt, name, output_dir, logo_base64)
            results[name] = result
            time.sleep(1)  # Rate limiting
    
    # Save generation log
    log_data = {
        "version": "v3",
        "generated_at": datetime.now().isoformat(),
        "master_logo": str(MASTER_LOGO_PATH),
        "approach": "Image-to-image: master logo sent as reference",
        "successful": sum(1 for r in results.values() if r),
        "failed": sum(1 for r in results.values() if not r),
        "files": {k: str(v) if v else None for k, v in results.items()}
    }
    
    log_path = OUTPUT_DIR / "generation_log_v3.json"
    with open(log_path, 'w') as f:
        json.dump(log_data, f, indent=2)
    
    # Summary
    print("\n" + "=" * 60)
    print("GENERATION COMPLETE")
    print("=" * 60)
    print(f"Successful: {log_data['successful']}/{total}")
    print(f"Failed: {log_data['failed']}/{total}")
    print(f"\nMaster Logo Used: {MASTER_LOGO_PATH.name}")
    print(f"Output: {OUTPUT_DIR}")
    print(f"Log: {log_path}")
    
    print("\nV3 Folder Structure:")
    for category, _, dir_path in all_categories:
        count = len(list(dir_path.glob("*.png")))
        print(f"  {dir_path.name}/  ({count} files)")
    
    return log_data['successful'] > 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
