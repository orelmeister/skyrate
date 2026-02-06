"""Quick Nano Banana test - gemini-2.5-flash-image"""
import os
import base64
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / "backend" / ".env")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

print(f"Testing Nano Banana with key: {GEMINI_API_KEY[:15]}...")

# Try Nano Banana (gemini-2.5-flash-image) with generateContent
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key={GEMINI_API_KEY}"

headers = {
    "Content-Type": "application/json"
}

data = {
    "contents": [{
        "parts": [{"text": "Generate an image of a simple purple and pink gradient logo for a tech company called SkyRate. Minimalist, modern design on white background."}]
    }],
    "generationConfig": {
        "responseModalities": ["IMAGE", "TEXT"]
    }
}

print("Sending request to Nano Banana...")
try:
    response = requests.post(url, headers=headers, json=data, timeout=120)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Response keys: {list(result.keys())}")
        candidates = result.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            print(f"Found {len(parts)} parts")
            for i, part in enumerate(parts):
                if "inlineData" in part:
                    print(f"Part {i}: Image data found!")
                    mime_type = part["inlineData"].get("mimeType", "image/png")
                    image_data = base64.b64decode(part["inlineData"]["data"])
                    ext = "png" if "png" in mime_type else "jpg"
                    output_path = Path(__file__).parent.parent / "assets" / "generated" / "test" / f"nano_banana_test.{ext}"
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(output_path, 'wb') as f:
                        f.write(image_data)
                    print(f"SUCCESS: Saved to {output_path}")
                elif "text" in part:
                    print(f"Part {i}: Text - {part['text'][:100]}...")
        else:
            print(f"No candidates in response")
            print(f"Full response: {str(result)[:500]}")
    else:
        print(f"Error response: {response.text[:500]}")
except requests.exceptions.Timeout:
    print("Request timed out after 120 seconds")
except Exception as e:
    print(f"Exception: {type(e).__name__}: {e}")
