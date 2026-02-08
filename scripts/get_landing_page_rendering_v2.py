"""
SkyRate AI - Second rendering attempt + Code suggestions from Gemini
"""

import os
import sys
import base64
import json
import requests
from pathlib import Path

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

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


def call_gemini_image(parts: list, name: str) -> Path | None:
    """Call Gemini image generation model."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key={GEMINI_API_KEY}"
    
    data = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseModalities": ["IMAGE", "TEXT"],
            "temperature": 0.9
        }
    }
    
    print(f"\n  Generating {name}...", flush=True)
    
    try:
        response = requests.post(url, headers={"Content-Type": "application/json"}, json=data, timeout=180)
        
        if response.status_code == 200:
            result = response.json()
            candidates = result.get("candidates", [])
            text_response = ""
            image_saved = None
            
            if candidates:
                for part in candidates[0].get("content", {}).get("parts", []):
                    if "inlineData" in part:
                        image_data = base64.b64decode(part["inlineData"]["data"])
                        output_path = OUTPUT_DIR / f"{name}.png"
                        with open(output_path, 'wb') as f:
                            f.write(image_data)
                        print(f"  Image: {output_path.name} ({len(image_data)/1024:.0f}KB)")
                        image_saved = output_path
                    elif "text" in part:
                        text_response += part["text"]
            
            if text_response:
                text_path = OUTPUT_DIR / f"{name}_notes.txt"
                with open(text_path, 'w', encoding='utf-8') as f:
                    f.write(text_response)
                print(f"  Notes: {text_path.name}")
            
            return image_saved
        else:
            print(f"  API error {response.status_code}: {response.text[:200]}")
            return None
        
    except Exception as e:
        print(f"  Error: {str(e)[:100]}")
        return None


def call_gemini_text(parts: list, name: str) -> str | None:
    """Call Gemini text model for code/design suggestions."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
    
    data = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 8192
        }
    }
    
    print(f"\n  Querying Gemini text model ({name})...", flush=True)
    
    try:
        response = requests.post(url, headers={"Content-Type": "application/json"}, json=data, timeout=120)
        
        if response.status_code == 200:
            result = response.json()
            candidates = result.get("candidates", [])
            if candidates:
                text = ""
                for part in candidates[0].get("content", {}).get("parts", []):
                    if "text" in part:
                        text += part["text"]
                
                if text:
                    text_path = OUTPUT_DIR / f"{name}.md"
                    with open(text_path, 'w', encoding='utf-8') as f:
                        f.write(text)
                    print(f"  Saved: {text_path.name} ({len(text)} chars)")
                    return text
        else:
            print(f"  API error {response.status_code}: {response.text[:200]}")
        return None
        
    except Exception as e:
        print(f"  Error: {str(e)[:100]}")
        return None


def main():
    print("=" * 60)
    print("SkyRate AI - Enhanced Landing Page Design")
    print("=" * 60)
    
    screenshot_b64 = load_image_base64(SCREENSHOT_PATH)
    logo_b64 = load_image_base64(MASTER_LOGO_PATH)
    if not screenshot_b64 or not logo_b64:
        return False
    
    # ─── RENDERING 2: Hero-focused close-up ───
    print("\n[1/3] HERO SECTION RENDERING")
    print("-" * 40)
    call_gemini_image([
        {"inlineData": {"mimeType": "image/png", "data": logo_b64}},
        {"text": """Create a HERO SECTION design for a SaaS landing page called "SkyRate AI".

The hero should have:
- DARK background (deep navy #0F172A to dark purple gradient)
- The SkyRate AI logo from the provided image in the top-left header  
- A LARGE bold headline: "Stop Leaving E-Rate Money on the Table" with "E-Rate Money" in a purple-to-indigo gradient
- Subtitle text in light gray
- TWO buttons: "Start Free Trial" (gradient purple) and "Watch Demo" (outlined)
- A FLOATING ISOMETRIC DASHBOARD MOCKUP on the right side showing analytics charts, data tables, graphs - rendered at an angle with subtle glow effects
- Glowing purple/blue orbs and mesh gradient in the background
- Small trust badge: "Trusted by 500+ E-Rate Professionals"
- Style: Like Linear.app or Vercel's dark hero sections
- Dimensions: Wide desktop format (16:9 aspect ratio)

This is for an AI-powered platform that helps schools get E-Rate federal funding (telecom/internet discounts).
Make it look PREMIUM and modern."""}
    ], "hero_section_v2")
    
    import time
    time.sleep(2)
    
    # ─── RENDERING 3: Features bento grid ───
    print("\n[2/3] FEATURES BENTO GRID RENDERING")
    print("-" * 40)
    call_gemini_image([
        {"inlineData": {"mimeType": "image/png", "data": logo_b64}},
        {"text": """Create a FEATURES SECTION design for SkyRate AI using a modern BENTO GRID layout.

Requirements:
- Light background (white to subtle gray)
- Section title: "Your Unfair Advantage" with purple gradient accent
- BENTO GRID: 4 feature cards in an asymmetric layout (2 large + 2 small, or 1 extra-large + 3 small)
- Feature 1 (LARGE): "Real-Time USAC Data" - show a mini data dashboard with charts
- Feature 2 (LARGE): "AI-Powered Analysis" - show an AI brain icon with neural network lines
- Feature 3 (SMALL): "Portfolio Management" - school/building icon
- Feature 4 (SMALL): "Instant Insights" - search/query icon with sparkles
- Each card has subtle shadows, rounded corners (16px), and a thin border
- Cards use glassmorphism (subtle frosted glass effect)
- Purple/indigo accent colors matching the SkyRate AI brand
- Style: Modern like Stripe's or Notion's feature sections
- Dimensions: Wide desktop format

Make the cards feel unique and visually distinct, not cookie-cutter."""}
    ], "features_bento_v2")
    
    time.sleep(2)
    
    # ─── CODE SUGGESTIONS from Gemini Text Model ───
    print("\n[3/3] CODE & IMPLEMENTATION SUGGESTIONS")
    print("-" * 40)
    call_gemini_text([
        {"inlineData": {"mimeType": "image/png", "data": screenshot_b64}},
        {"text": """I'm showing you a screenshot of our current SkyRate AI landing page built with Next.js 14, React, TypeScript, and Tailwind CSS.

The page is functional but looks GENERIC and UNINSPIRING. I need you to provide SPECIFIC Tailwind CSS and component architecture suggestions to transform it into a premium, modern SaaS landing page.

## Current Stack
- Next.js 14.1.0 (App Router, Server Components)
- React 18
- TypeScript
- Tailwind CSS
- next/image for images
- No UI library (pure Tailwind)

## Brand Colors
- Primary gradient: from-indigo-600 to-purple-600
- Dark background: slate-900 to slate-950
- Text: white on dark, slate-900 on light
- Accent: green-500 for success

## What I Need

Please provide SPECIFIC code suggestions for each section:

### 1. HERO SECTION
- Current: Light background, centered text, basic gradient headline
- Desired: Dark hero with floating dashboard mockup, mesh gradient background, glassmorphism elements
- Give me the Tailwind classes and component structure

### 2. FEATURES SECTION  
- Current: 4 equal cards in a grid on purple background
- Desired: Asymmetric bento grid with varying card sizes, glassmorphism, unique visuals per card
- Give me the grid layout classes

### 3. CONSULTANT/VENDOR SECTIONS
- Current: Two separate sections with feature lists and preview cards
- Desired: More visual, with actual UI mockup previews, tabbed or side-by-side layout, subtle animations
- Give me the layout approach

### 4. PRICING SECTION
- Current: 3 equal cards, basic styling
- Desired: Clean cards with the middle one elevated/highlighted, gradient border on popular plan
- Give me the card styling

### 5. OVERALL IMPROVEMENTS
- Suggest specific Tailwind utility classes for:
  - Glassmorphism effects
  - Mesh gradient backgrounds
  - Animated gradient text
  - Floating/hover card effects
  - Section transitions
  - Dark-to-light section flow

### 6. CSS PATTERNS
Give me reusable CSS classes or Tailwind @apply patterns for:
- `.glass-card` - Glassmorphism card
- `.gradient-text` - Animated gradient text
- `.mesh-bg` - Mesh gradient background
- `.glow` - Subtle glow effects

Provide the actual Tailwind CSS code, not just descriptions. Be specific with class names."""}
    ], "implementation_suggestions")
    
    print("\n" + "=" * 60)
    print("COMPLETE! Check screenshots/gemini_renderings/")
    print("=" * 60)
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
