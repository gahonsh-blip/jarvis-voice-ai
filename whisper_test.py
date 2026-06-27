import os

os.environ["PATH"] += os.pathsep + r"C:\Users\DELL\AppData\Local\Microsoft\WinGet\Links"

import whisper

print("Loading Whisper Model...")

model = whisper.load_model("base")

print("Converting Speech To Text...")

result = model.transcribe(r"C:\Jarvis\test.wav")

print("\nYou Said:")
print(result["text"])