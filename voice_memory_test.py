import os
import json
import sounddevice as sd
from scipy.io.wavfile import write
import whisper
import pyttsx3

MEMORY_FILE = "memory.json"

os.environ["PATH"] += os.pathsep + r"C:\Users\DELL\AppData\Local\Microsoft\WinGet\Links"

engine = pyttsx3.init()

print("Loading Whisper Model...")
model = whisper.load_model("base")

if os.path.exists(MEMORY_FILE):
    with open(MEMORY_FILE, "r") as f:
        memory = json.load(f)
else:
    memory = {}

print("Voice Memory Test Ready")

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

    result = model.transcribe(
        r"C:\Jarvis\voice_input.wav",
        fp16=False
    )

    text = result["text"].strip()

    print("\nYou Said:", text)

    if not text:
        continue

    lower_text = text.lower()

    if "exit" in lower_text:
        engine.say("Goodbye")
        engine.runAndWait()
        break

    elif lower_text.startswith("my name is"):

        name = text[10:].strip()

        memory["name"] = name

        with open(MEMORY_FILE, "w") as f:
            json.dump(memory, f)

        answer = f"I will remember your name {name}"

        print("Jarvis:", answer)

        engine.say(answer)
        engine.runAndWait()

    elif "what is my name" in lower_text:

        if "name" in memory:
            answer = f"Your name is {memory['name']}"
        else:
            answer = "I do not know your name yet"

        print("Jarvis:", answer)

        engine.say(answer)
        engine.runAndWait()

    else:

        answer = "Memory command not recognized"

        print("Jarvis:", answer)

        engine.say(answer)
        engine.runAndWait()