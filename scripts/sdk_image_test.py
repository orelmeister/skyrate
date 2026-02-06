"""Test Gemini image generation using the official SDK"""
import os
import sys
import base64
from pathlib import Path

# Load API key from .env
env_path = Path(__file__).parent.parent / "backend" / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            if line.startswith("GEMINI_API_KEY="):
                os.environ["GEMINI_API_KEY"] = line.strip().split("=", 1)[1]
                break

import google.generativeai as genai

API_KEY = os.environ.get("GEMINI_API_KEY")
print(f"Using API key: {API_KEY[:15]}...")

genai.configure(api_key=API_KEY)

# Test with Gemini 2.0 Flash experimental (image generation)
print("\n=== Testing Gemini 2.0 Flash Experimental Image Generation ===")
try:
    model = genai.GenerativeModel("gemini-2.0-flash-exp-image-generation")
    
    prompt = """Create a simple, modern logo icon for a tech company called SkyRate. 
    The icon should be minimalist, using blue colors (#3B82F6 sky blue). 
    Show a simplified graph or chart icon combined with a small star or sparkle element.
    Clean white background, professional look."""
    
    print(f"Prompt: {prompt[:100]}...")
    print("Generating (this may take 30-60 seconds)...")
    
    response = model.generate_content(
        prompt,
        generation_config={
            "response_modalities": ["IMAGE", "TEXT"]
        }
    )
    
    print(f"Response received!")
    print(f"Candidates: {len(response.candidates)}")
    
    # Check for image in response
    for i, candidate in enumerate(response.candidates):
        print(f"\nCandidate {i}:")
        for j, part in enumerate(candidate.content.parts):
            if hasattr(part, 'inline_data') and part.inline_data:
                print(f"  Part {j}: IMAGE ({part.inline_data.mime_type})")
                # Save the image
                output_dir = Path(__file__).parent.parent / "assets" / "generated" / "test"
                output_dir.mkdir(parents=True, exist_ok=True)
                
                ext = "png" if "png" in part.inline_data.mime_type else "jpg"
                output_path = output_dir / f"test_logo.{ext}"
                
                with open(output_path, "wb") as f:
                    f.write(base64.b64decode(part.inline_data.data))
                print(f"  Saved to: {output_path}")
            elif hasattr(part, 'text') and part.text:
                print(f"  Part {j}: TEXT - {part.text[:200]}...")
                
    print("\n✓ SUCCESS!")
    
except Exception as e:
    print(f"\n✗ ERROR: {type(e).__name__}: {e}")

print("\n=== Test Complete ===")
