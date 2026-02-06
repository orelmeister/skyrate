"""
Test script for Gemini image generation
"""
import os
import sys
import base64
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
OUTPUT_DIR = Path(__file__).parent.parent / "assets" / "generated" / "test"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

print(f"API Key: {GEMINI_API_KEY[:20]}...")
print(f"Output: {OUTPUT_DIR}")

# Test 1: Try Imagen 4 API
def test_imagen():
    print("\n--- Testing Imagen 4 API ---")
    url = "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict"
    
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
    }
    
    prompt = """A modern, minimalist logo for a tech company called 'SkyRate'. 
    The logo should feature a stylized letter S combined with upward-pointing elements 
    suggesting growth and success. Use purple (#9333EA) and pink (#EC4899) colors. 
    Clean vector style on white background."""
    
    data = {
        "instances": [{"prompt": prompt}],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": "1:1",
            "safetySetting": "block_low_and_above"
        }
    }
    
    try:
        response = requests.post(url, headers=headers, json=data, timeout=120)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            if "predictions" in result and result["predictions"]:
                image_data = base64.b64decode(result["predictions"][0]["bytesBase64Encoded"])
                output_path = OUTPUT_DIR / "test_imagen.png"
                with open(output_path, 'wb') as f:
                    f.write(image_data)
                print(f"✅ Saved: {output_path}")
                return True
            else:
                print(f"No predictions in response: {result}")
        else:
            print(f"Error: {response.text[:500]}")
    except Exception as e:
        print(f"Exception: {e}")
    
    return False


# Test 2: Try Gemini 2.0 Flash Image Generation (experimental)
def test_gemini_flash():
    print("\n--- Testing Gemini 2.0 Flash Image Generation ---")
    
    # Use the correct model name from the list
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent"
    
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
    }
    
    prompt = """Create an image of a modern tech company logo. The logo should show 
    the letters 'SR' in a stylized design with purple and pink gradient colors. 
    Clean, minimalist, professional style suitable for a startup."""
    
    data = {
        "contents": [{
            "parts": [{"text": f"Generate an image: {prompt}"}]
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
                        output_path = OUTPUT_DIR / "test_gemini_flash.png"
                        with open(output_path, 'wb') as f:
                            f.write(image_data)
                        print(f"✅ Saved: {output_path}")
                        return True
                    elif "text" in part:
                        print(f"Text response: {part['text'][:200]}...")
            print("No image in response")
        else:
            error_text = response.text[:500]
            print(f"Error: {error_text}")
    except Exception as e:
        print(f"Exception: {e}")
    
    return False


# Test 3: List available models
def list_models():
    print("\n--- Listing Available Models ---")
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={GEMINI_API_KEY}"
    
    try:
        response = requests.get(url, timeout=30)
        if response.status_code == 200:
            models = response.json().get("models", [])
            image_models = [m for m in models if "image" in m.get("name", "").lower() or "imagen" in m.get("name", "").lower()]
            
            print(f"Found {len(models)} total models")
            print(f"Image-related models:")
            for m in image_models:
                print(f"  - {m.get('name')}: {m.get('displayName', 'N/A')}")
            
            if not image_models:
                print("  (No image models found - listing all for reference)")
                for m in models[:10]:
                    print(f"  - {m.get('name')}")
        else:
            print(f"Error listing models: {response.status_code}")
    except Exception as e:
        print(f"Exception: {e}")


# Test 3: Try Nano Banana (gemini-2.5-flash-image)
def test_nano_banana():
    print("\n--- Testing Nano Banana (gemini-2.5-flash-image) ---")
    
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent"
    
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
    }
    
    prompt = """Create an image of a modern tech company logo. The logo should show 
    the letters 'SR' in a stylized design with purple and pink gradient colors. 
    Clean, minimalist, professional style suitable for a startup."""
    
    data = {
        "contents": [{
            "parts": [{"text": f"Generate an image: {prompt}"}]
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
                        output_path = OUTPUT_DIR / "test_nano_banana.png"
                        with open(output_path, 'wb') as f:
                            f.write(image_data)
                        print(f"✅ Saved: {output_path}")
                        return True
                    elif "text" in part:
                        print(f"Text response: {part['text'][:200]}...")
            print("No image in response")
        else:
            error_text = response.text[:500]
            print(f"Error: {error_text}")
    except Exception as e:
        print(f"Exception: {e}")
    
    return False


if __name__ == "__main__":
    list_models()
    
    print("\n" + "="*50)
    print("Testing image generation methods...")
    print("="*50)
    
    # Test Imagen 4
    imagen_success = test_imagen()
    
    # Test Gemini Flash
    flash_success = test_gemini_flash()
    
    # Test Nano Banana
    nano_success = test_nano_banana()
    
    print("\n" + "="*50)
    print("RESULTS:")
    print(f"  Imagen 4 API: {'✅ Success' if imagen_success else '❌ Failed'}")
    print(f"  Gemini Flash Image: {'✅ Success' if flash_success else '❌ Failed'}")
    print(f"  Nano Banana: {'✅ Success' if nano_success else '❌ Failed'}")
    print("="*50)
