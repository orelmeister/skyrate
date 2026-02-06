"""
SkyRate AI Brand Asset Generator (Simplified)
Uses Gemini 2.0 Flash Image Generation
"""

import os
import sys
import base64
import json
import time
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

import requests

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
OUTPUT_DIR = Path(__file__).parent.parent / "assets" / "generated"

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

# Brand context for all prompts
BRAND = """For SkyRate AI - an E-Rate funding platform for schools.
Colors: Purple gradient (#9333EA to #EC4899), professional style.
Style: Modern, clean, tech-forward, trustworthy."""

# All prompts organized by category
PROMPTS = {
    "logos": [
        ("logo_main", f"{BRAND} Design a modern logo for 'SkyRate AI'. Wordmark with abstract icon showing growth/success. Purple gradient, white background."),
        ("logo_icon", f"{BRAND} Create a square app icon for SkyRate AI. Abstract symbol with upward graph or star. Purple gradient, works at small sizes."),
        ("logo_dark", f"{BRAND} Design SkyRate AI logo for dark backgrounds. Light text, purple gradient accent."),
        ("logo_horizontal", f"{BRAND} Create wide horizontal SkyRate AI logo. Compact, professional, purple gradient."),
    ],
    "icons": [
        ("icon_dashboard", f"{BRAND} Create a simple dashboard icon. Grid/chart design. Purple color, flat style, transparent bg."),
        ("icon_school", f"{BRAND} Create a school/education icon. Building or graduation cap. Purple, flat style."),
        ("icon_funding", f"{BRAND} Create a funding/money icon. Dollar sign with upward arrow. Green success color."),
        ("icon_appeal", f"{BRAND} Create an appeals/document icon. Paper with checkmark. Purple, professional."),
        ("icon_ai", f"{BRAND} Create an AI/sparkle icon. Brain or neural network. Purple gradient, modern."),
        ("icon_vendor", f"{BRAND} Create a vendor/business icon. Building or briefcase. Purple, corporate."),
        ("icon_consultant", f"{BRAND} Create a consultant/advisor icon. Person with chart. Purple, professional."),
        ("icon_notification", f"{BRAND} Create a notification/alert bell icon. Simple bell shape. Purple accent."),
    ],
    "backgrounds": [
        ("bg_hero", f"{BRAND} Create abstract hero background. Purple to pink gradient with subtle network pattern. Wide format."),
        ("bg_network", f"{BRAND} Create network visualization background. Connected dots forming educational network. Purple tones, dark."),
        ("bg_gradient", f"{BRAND} Create smooth gradient mesh background. Purple, pink, blue blend. Subtle, modern."),
        ("bg_data", f"{BRAND} Create data visualization background. Abstract charts and graphs. Purple tones, professional."),
    ],
    "illustrations": [
        ("illus_erate", f"{BRAND} Create illustration showing E-Rate concept. Schools connected to internet. Simple, friendly style."),
        ("illus_consultant", f"{BRAND} Create illustration of consultant helping schools. Friendly, diverse, professional."),
        ("illus_success", f"{BRAND} Create celebration illustration. Confetti, checkmarks, happy result. Purple and green tones."),
        ("illus_ai", f"{BRAND} Create AI analysis illustration. Charts with sparkles showing AI insights. Purple, modern."),
        ("illus_vendor", f"{BRAND} Create vendor leads illustration. Business growth chart with connections. Professional."),
    ],
    "marketing": [
        ("social_linkedin", f"{BRAND} Create LinkedIn banner for SkyRate AI. Wide format, logo, tagline 'E-Rate Intelligence Platform'."),
        ("social_twitter", f"{BRAND} Create Twitter header for SkyRate AI. Wide, engaging, brand colors."),
        ("og_image", f"{BRAND} Create social sharing preview image. Large logo, professional gradient background."),
    ],
}


def generate_image(prompt, name, output_dir):
    """Generate image using Gemini REST API"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key={GEMINI_API_KEY}"
    
    headers = {"Content-Type": "application/json"}
    
    data = {
        "contents": [{
            "parts": [{"text": f"Generate a high-quality image:\n{prompt}\n\nIMPORTANT: Create the actual image, professional quality."}]
        }],
        "generationConfig": {
            "responseModalities": ["IMAGE", "TEXT"]
        }
    }
    
    print(f"  Generating {name}...", end=" ", flush=True)
    
    try:
        response = requests.post(url, headers=headers, json=data, timeout=90)
        
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
                        print(f"OK ({size_kb:.0f}KB) -> {output_path.name}")
                        return output_path
            print("No image in response")
        else:
            error_msg = response.text[:100] if response.text else "Unknown error"
            print(f"API error {response.status_code}: {error_msg}")
        return None
        
    except requests.exceptions.Timeout:
        print("Timeout (90s)")
        return None
    except Exception as e:
        print(f"Error: {str(e)[:60]}")
        return None


def main():
    print("=" * 50)
    print("SkyRate AI Brand Asset Generator")
    print("=" * 50)
    
    if not GEMINI_API_KEY:
        print("ERROR: GEMINI_API_KEY not found!")
        return False
    
    print(f"API Key: {GEMINI_API_KEY[:15]}...")
    print(f"Output: {OUTPUT_DIR}\n")
    
    results = {}
    total = sum(len(p) for p in PROMPTS.values())
    done = 0
    
    for category, prompts in PROMPTS.items():
        print(f"\n[{category.upper()}] ({len(prompts)} items)")
        print("-" * 40)
        
        for name, prompt in prompts:
            done += 1
            print(f"[{done}/{total}]", end=" ")
            result = generate_image(prompt, name, DIRS[category])
            results[name] = result
            time.sleep(1)  # Rate limiting
    
    # Save log
    log_data = {
        "generated_at": datetime.now().isoformat(),
        "successful": sum(1 for r in results.values() if r),
        "failed": sum(1 for r in results.values() if not r),
        "files": {k: str(v) if v else None for k, v in results.items()}
    }
    
    log_path = OUTPUT_DIR / "generation_log.json"
    with open(log_path, 'w') as f:
        json.dump(log_data, f, indent=2)
    
    # Summary
    print("\n" + "=" * 50)
    print("SUMMARY")
    print("=" * 50)
    print(f"Successful: {log_data['successful']}")
    print(f"Failed: {log_data['failed']}")
    print(f"Output: {OUTPUT_DIR}")
    print(f"Log: {log_path}")
    
    return log_data['successful'] > 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
