"""Get code implementation suggestions from Gemini text model."""
import os, sys, base64, requests, json
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
OUTPUT_DIR = Path(__file__).parent.parent / "screenshots" / "gemini_renderings"

with open(SCREENSHOT_PATH, "rb") as f:
    screenshot_b64 = base64.b64encode(f.read()).decode("utf-8")

print("Sending screenshot to Gemini for code suggestions...")

url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"

data = {
    "contents": [{"parts": [
        {"inlineData": {"mimeType": "image/png", "data": screenshot_b64}},
        {"text": """I'm showing you a screenshot of our current SkyRate AI landing page built with Next.js 14, React, TypeScript, and Tailwind CSS.

The page is functional but looks GENERIC and UNINSPIRING. I need you to provide SPECIFIC Tailwind CSS and component architecture suggestions to transform it into a premium, modern SaaS landing page like Linear.app, Vercel, or Stripe.

## Current Stack
- Next.js 14.1.0 (App Router, Server Components)
- React 18, TypeScript, Tailwind CSS
- next/image for images, No UI library (pure Tailwind)

## Brand Colors
- Primary gradient: from-indigo-600 to-purple-600
- Dark background: slate-900 to slate-950
- Text: white on dark, slate-900 on light
- Accent: green-500 for success

## Provide SPECIFIC code suggestions for:

### 1. HERO SECTION
- Current: Light background, centered text, basic gradient headline
- Desired: Dark hero with mesh gradient background, floating dashboard mockup, glassmorphism elements
- Provide the complete JSX + Tailwind classes for a transformed hero

### 2. FEATURES SECTION (BENTO GRID)
- Current: 4 equal cards on purple background
- Desired: Asymmetric bento grid with varying card sizes, glassmorphism
- Provide the grid layout with Tailwind grid-cols and row-span classes

### 3. CONSULTANT/VENDOR SECTIONS
- Current: Two separate long sections with feature lists
- Desired: More visual with dashboard mockup previews, glassmorphism cards
- Provide the layout approach

### 4. PRICING SECTION
- Current: 3 equal cards, basic styling
- Desired: Middle card elevated/highlighted with gradient border
- Provide the card styling classes

### 5. GLOBAL CSS PATTERNS
Provide reusable Tailwind/CSS patterns I can add to globals.css:
- Glassmorphism cards
- Animated gradient text
- Mesh gradient backgrounds
- Subtle glow/shadow effects
- Floating animation keyframes

### 6. SECTION FLOW
- Current: All sections feel the same weight
- Suggest a dark→light→dark section alternation pattern with specific bg colors

Provide ACTUAL Tailwind CSS code and JSX, not just descriptions. Be very specific."""}
    ]}],
    "generationConfig": {"temperature": 0.7, "maxOutputTokens": 8192}
}

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
                out_path = OUTPUT_DIR / "implementation_suggestions.md"
                with open(out_path, 'w', encoding='utf-8') as f:
                    f.write(text)
                print(f"Saved: {out_path} ({len(text)} chars)")
                print("\n" + "=" * 60)
                print("GEMINI'S CODE SUGGESTIONS:")
                print("=" * 60)
                # Print first 3000 chars
                print(text[:3000])
                if len(text) > 3000:
                    print(f"\n... ({len(text) - 3000} more chars in file)")
    else:
        print(f"API error {response.status_code}: {response.text[:300]}")
except Exception as e:
    print(f"Error: {e}")
