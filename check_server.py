#!/usr/bin/env python
"""Check if the standalone test works"""
import subprocess
import sys
import time

# Start the backend server
print(f"Python: {sys.executable}")
print(f"Starting backend server on port 8001...")

server_process = subprocess.Popen(
    [sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8001'],
    cwd='c:\\Dev\\skyrate\\backend',
    env={'PYTHONPATH': 'c:\\Dev\\skyrate\\backend'},
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True
)

# Read startup output
print("\nServer startup output:")
startup_done = False
for i in range(30):  # 30 lines or 5 seconds
    try:
        line = server_process.stdout.readline()
        print(f"  {line.rstrip()}")
        if "Application startup complete" in line:
            startup_done = True
            break
        if "error" in line.lower() or "traceback" in line.lower():
            break
    except:
        break

if not startup_done:
    print("\nWaiting a bit more for startup...")
    time.sleep(2)

poll = server_process.poll()
print(f"\nServer process status: {poll}")

if poll is not None:
    print("Server exited prematurely!")
    # Read remaining output
    remaining = server_process.stdout.read()
    if remaining:
        print("Remaining output:")
        print(remaining)
else:
    print("Server is running!")
    # Give it a moment
    time.sleep(1)
    # Try to terminate gracefully
    server_process.terminate()
    try:
        server_process.wait(timeout=2)
    except:
        server_process.kill()
