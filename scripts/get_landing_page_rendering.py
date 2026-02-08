"""
SkyRate AI - Landing Page Design Rendering via Gemini
=====================================================
Sends the current landing page screenshot + master logo to Gemini
and asks it to generate a professional landing page design rendering.

Author: SkyRate AI Team
Date: February 2026
"""

import os
import sys
import base64
import json
import requests
from pathlib import Path

# Configure UTF-8 output on Windows
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Load environment variables
env_path = Path(__file__).parent.parent / "backend" / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("GEMINI_API_KEY="):
                os.environ["GEMINI_API_KEY"] = line.split("=", 1)[1]
                break

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
SCREENSHOT_PATH = Path(__file__).parent.parent / "screenshots" / "current_landing_page_full.png"
MASTER_LOGO_PATH = Path(__file__).parent.parent / "assets" / "generated" / "logos" / "logo_horizontal.png"
OUTPUT_DIR = Path(__file__).parent.parent / "screenshots" / "gemini_renderings"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def load_image_base64(path: Path) -> str | None:
    if not path.exists():
        print(f"ERROR: Image not found at {path}")
        return None
    with open(path, "rb") as f:
        data = f.read()
    print(f"Loaded: {path.name} ({len(data) / 1024:.0f}KB)")
    return base64.b64encode(data).decode("utf-8")


def generate_rendering(screenshot_b64: str, logo_b64: str, prompt: str, name: str) -> Path | None:
    """Send screenshot + logo to Gemini and get a new landing page rendering."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key={GEMINI_API_KEY}"
    
    headers = {"Content-Type": "application/json"}
    
    data = {
        "contents": [{
            "parts": [
                {
                    "inlineData": {
                        "mimeType": "image/png",
                        "data": screenshot_b64
                    }
                },
                {
                    "inlineData": {
                        "mimeType": "image/png",
                        "data": logo_b64
                    }
                },
                {
                    "text": prompt
                }
            ]
        }],
        "generationConfig": {
            "responseModalities": ["IMAGE", "TEXT"],
            "temperature": 0.8
        }
    }
    
    print(f"\n  Sending to Gemini ({name})...", flush=True)
    
    try:
        response = requests.post(url, headers=headers, json=data, timeout=180)
        
        if response.status_code == 200:
            result = response.json()
            candidates = result.get("candidates", [])
            text_response = ""
            image_saved = None
            
            if candidates:
                for part in candidates[0].get("content", {}).get("parts", []):
                    if "inlineData" in part:
                        mime = part["inlineData"].get("mimeType", "image/png")
                        ext = "png" if "png" in mime else "jpg"
                        image_data = base64.b64decode(part["inlineData"]["data"])
                        output_path = OUTPUT_DIR / f"{name}.{ext}"
                        with open(output_path, 'wb') as f:
                            f.write(image_data)
                        size_kb = len(image_data) / 1024
                        print(f"  Image saved: {output_path.name} ({size_kb:.0f}KB)")
                        image_saved = output_path
                    elif "text" in part:
                        text_response += part["text"]
            
            # Save text response
            if text_response:
                text_path = OUTPUT_DIR / f"{name}_response.txt"
                with open(text_path, 'w', encoding='utf-8') as f:
                    f.write(text_response)
                print(f"  Text saved: {text_path.name}")
            
            return image_saved
        else:
            error_msg = response.text[:300] if response.text else "Unknown error"
            print(f"  API error {response.status_code}: {error_msg}")
            return None
        
    except requests.exceptions.Timeout:
        print("  Timeout (180s)")
        return None
    except Exception as e:
        print(f"  Error: {str(e)[:100]}")
        return None


# =============================================================================
# THE PROMPT - Detailed context for Gemini
# =============================================================================

LANDING_PAGE_PROMPT = """You are a world-class UI/UX designer and web developer specializing in modern SaaS landing pages.

I'm showing you TWO images:
1. IMAGE 1: A full-page screenshot of our CURRENT landing page (the one that needs redesigning)
2. IMAGE 2: Our MASTER LOGO (the approved brand logo for SkyRate AI)

## ABOUT THE PRODUCT
SkyRate AI is an AI-powered E-Rate funding intelligence platform. E-Rate is a $4+ billion FCC program that provides telecom and internet discounts to schools and libraries across the United States.

Our platform serves THREE audiences:
- **E-Rate Consultants**: Professionals who manage E-Rate applications for schools. They need portfolio management, AI-powered appeal generation, denial tracking.
- **E-Rate Vendors**: Service providers (ISPs, equipment companies) who bid on E-Rate contracts. They need Form 470 lead tracking, competitor analysis, market intelligence.
- **School/Library Applicants**: Institutions managing their own E-Rate applications. They need FRN tracking, status alerts, appeal help.

## BRAND IDENTITY
- **Brand colors**: Primary gradient from Indigo (#4F46E5) to Purple (#7C3AED). Secondary: deep navy slate backgrounds.
- **Logo**: The provided horizontal logo with the "SkyRate" text and AI branding (image 2)
- **Font style**: Clean, modern sans-serif (Inter for body, Montserrat for headings)
- **Tone**: Professional, trustworthy (government/education sector), but modern and tech-forward (AI company)

## CURRENT PAGE PROBLEMS
Looking at the screenshot (image 1), the current design has these issues:
1. **Generic SaaS feel** - Looks like every other template landing page, nothing unique or memorable
2. **Poor visual hierarchy** - Too many sections that all look the same, no clear visual flow
3. **Weak hero section** - The hero doesn't grab attention or convey the product's value immediately
4. **Background images feel flat** - The AI-generated backgrounds are used but don't integrate well
5. **Cards look basic** - The feature cards, pricing cards, and preview cards all look templated
6. **No emotional connection** - Doesn't convey the frustration of losing funding or the relief of SkyRate solving it
7. **The consultant/vendor sections are text-heavy** - Feature lists are boring, need more visual storytelling

## WHAT I NEED FROM YOU
Generate a STUNNING, modern, professional landing page design rendering for SkyRate AI that:

1. **Hero Section**: 
   - Large, bold headline with gradient text
   - A compelling visual element - maybe an isometric dashboard preview, floating UI cards, or an abstract data visualization
   - The purple-to-indigo brand gradient should be prominent
   - Trust badges or social proof

2. **Problem/Solution Flow**:
   - Create visual contrast between the "problem" (red/warning tones) and "solution" (brand gradient, success green)
   - Use icons or mini-illustrations, not just text

3. **Features Section**:
   - Modern bento grid layout (asymmetric, not boring equal cards)
   - Mix of large feature cards and smaller supporting ones
   - Each card should feel unique, not repetitive

4. **For Consultants / For Vendors**:
   - Side-by-side or tabbed approach with real dashboard mockups
   - Show actual UI previews, not just feature lists
   - Use glassmorphism or subtle depth effects

5. **Social Proof / Stats**:
   - Large, bold numbers with subtle animation feel
   - Gradient accents on the numbers

6. **Pricing**:
   - Clean 3-column layout with the "Popular" plan highlighted with brand gradient
   - Subtle background pattern

7. **CTA**:
   - Full-width gradient banner with compelling copy
   - Floating elements or particles for visual interest

8. **Footer**:
   - Dark slate background, clean columns, brand logo

## STYLE REFERENCES
- Think: Linear.app, Vercel, Stripe, Notion - modern, clean, with subtle glassmorphism, smooth gradients, and sophisticated typography
- Use the brand's purple-to-indigo gradient as the primary accent throughout
- Incorporate subtle mesh gradients, glass effects, and depth
- Make it feel premium and trustworthy (this handles $4B+ in federal funding)

## CRITICAL REQUIREMENTS
- MUST include the exact SkyRate AI logo from image 2
- MUST use the purple/indigo brand gradient palette
- Design should be for a DESKTOP viewport (1280px wide, full scroll)
- Make it a complete, cohesive design from header to footer
- Show actual content, not placeholder lorem ipsum

Generate a high-quality, photorealistic UI rendering of this landing page. This should look like a Figma/Dribbble quality design mockup."""


def main():
    print("=" * 60)
    print("SkyRate AI - Landing Page Design via Gemini")
    print("=" * 60)
    
    if not GEMINI_API_KEY:
        print("ERROR: GEMINI_API_KEY not found!")
        return False
    
    print(f"\nAPI Key: {GEMINI_API_KEY[:15]}...")
    print(f"Screenshot: {SCREENSHOT_PATH}")
    print(f"Master Logo: {MASTER_LOGO_PATH}")
    print(f"Output: {OUTPUT_DIR}")
    
    # Load images
    screenshot_b64 = load_image_base64(SCREENSHOT_PATH)
    if not screenshot_b64:
        print("Cannot proceed without screenshot!")
        return False
    
    logo_b64 = load_image_base64(MASTER_LOGO_PATH)
    if not logo_b64:
        print("Cannot proceed without master logo!")
        return False
    
    # Generate the rendering
    print("\n" + "-" * 60)
    print("GENERATING LANDING PAGE RENDERING")
    print("-" * 60)
    
    result = generate_rendering(screenshot_b64, logo_b64, LANDING_PAGE_PROMPT, "landing_page_redesign")
    
    if result:
        print(f"\n{'=' * 60}")
        print("SUCCESS! Rendering saved to:")
        print(f"  Image: {result}")
        
        # Check for text response
        text_path = OUTPUT_DIR / "landing_page_redesign_response.txt"
        if text_path.exists():
            print(f"  Text: {text_path}")
            print(f"\n{'=' * 60}")
            print("GEMINI'S DESIGN NOTES:")
            print("=" * 60)
            with open(text_path, 'r', encoding='utf-8') as f:
                print(f.read())
        
        return True
    else:
        print("\nFailed to generate rendering.")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
