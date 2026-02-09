"""
Quick script to regenerate logo icon v3 via Nano Banana (Gemini 2.5 Flash Image).
Makes the S bigger and edges darker for better icon visibility.
"""
import os, sys, base64, requests
from pathlib import Path

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("❌ GEMINI_API_KEY not set"); sys.exit(1)

# Read existing icon
input_path = Path("assets/generated/v3/logos/logo_icon_v3.png")
if not input_path.exists():
    print(f"❌ {input_path} not found"); sys.exit(1)

with open(input_path, "rb") as f:
    image_b64 = base64.b64encode(f.read()).decode()

print(f"📤 Sending {input_path} ({input_path.stat().st_size // 1024}KB) to Nano Banana...")

url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent"
headers = {"Content-Type": "application/json", "x-goog-api-key": API_KEY}

prompt = """Look at this logo icon. It contains a stylized letter "S" for the brand SkyRate.AI.
I need you to create a NEW version of this same icon with these specific changes:
1. Make it SHINY and GLOSSY - add highlights, reflections, and a polished metallic/glass look
2. Change the color scheme to use rich PURPLE and INDIGO tones - specifically deep purple (#7c3aed), indigo (#4f46e5), and violet (#8b5cf6) as the primary colors, with lighter purple highlights for the shiny effect
3. Keep the dark defined edges/outline around the S
4. The S should FILL THE ENTIRE IMAGE with minimal whitespace/padding
5. Keep the same 3D ribbon-style S shape but make it look premium, glossy, and luxurious
The overall feel should be a shiny purple gemstone or glass S letter."""

data = {
    "contents": [{
        "parts": [
            {"inlineData": {"mimeType": "image/png", "data": image_b64}},
            {"text": prompt}
        ]
    }],
    "generationConfig": {
        "responseModalities": ["IMAGE", "TEXT"]
    }
}

try:
    response = requests.post(url, headers=headers, json=data, timeout=120)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        candidates = result.get("candidates", [])
        if candidates:
            for part in candidates[0].get("content", {}).get("parts", []):
                if "inlineData" in part:
                    image_data = base64.b64decode(part["inlineData"]["data"])
                    output_path = Path("assets/generated/v3/logos/logo_icon_v3_enhanced.png")
                    with open(output_path, "wb") as f:
                        f.write(image_data)
                    print(f"✅ Saved: {output_path} ({len(image_data) // 1024}KB)")
                    
                    # Also copy to public folder for immediate use
                    public_path = Path("frontend/public/images/logos/logo-icon-enhanced.png")
                    with open(public_path, "wb") as f:
                        f.write(image_data)
                    print(f"✅ Copied to: {public_path}")
                    sys.exit(0)
                elif "text" in part:
                    print(f"Text: {part['text'][:300]}")
        print("❌ No image in response")
    else:
        print(f"❌ Error: {response.text[:500]}")
except Exception as e:
    print(f"❌ Exception: {e}")
