import os
import sounddevice as sd
from scipy.io.wavfile import write
import whisper
import pyttsx3
from ollama import chat

# FFmpeg Path
os.environ["PATH"] += os.pathsep + r"C:\Users\DELL\AppData\Local\Microsoft\WinGet\Links"

# Voice Engine
engine = pyttsx3.init()

# Whisper Model
print("Loading Whisper Model...")
model = whisper.load_model("base")

print("Jarvis Voice Assistant Ready")

while True:

    print("\nSpeak for 5 seconds...")

    fs = 16000

    recording = sd.rec(
        int(5 * fs),
        samplerate=fs,
        channels=1,
        dtype="int16",
        device=1
    )

    sd.wait()

    write(r"C:\Jarvis\voice_input.wav", fs, recording)

    print("Converting Speech To Text...")

    result = model.transcribe(r"C:\Jarvis\voice_input.wav")

    user_text = result["text"].strip()

    print("\nYou Said:", user_text)

    if not user_text:
        print("No speech detected.")
        continue

    if "exit" in user_text.lower():
        print("Jarvis: Goodbye!")
        engine.say("Goodbye")
        engine.runAndWait()
        break

    response = chat(
        model="gemma4-local:latest",
        messages=[
            {
                "role": "user",
                "content": user_text
            }
        ]
    )

    answer = response["message"]["content"]

    print("\nJarvis:", answer)

    engine.say(answer)
    engine.runAndWait()