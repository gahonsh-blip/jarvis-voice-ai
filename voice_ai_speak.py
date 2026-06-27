import os
import webbrowser
import pyautogui
from datetime import datetime
import time

import sounddevice as sd
from scipy.io.wavfile import write
import whisper
import pyttsx3

from ollama import chat

# आवश्यक फोल्डर्स बनाना
os.makedirs(r"C:\Jarvis\Screenshots", exist_ok=True)

# FFmpeg Path
os.environ["PATH"] += os.pathsep + r"C:\Users\DELL\AppData\Local\Microsoft\WinGet\Links"

# Voice Engine
engine = pyttsx3.init()

# Whisper Model
print("Loading Whisper Model...")
model = whisper.load_model("base")

# AI चैट मेमोरी हिस्ट्री
chat_history = []

def speak_response(text):
    """Jarvis को बुलवाने और प्रिंट करने का फंक्शन"""
    print(f"\nJarvis: {text}")
    try:
        engine.say(text)
        engine.runAndWait()
    except:
        pass

def ask_ai_for_intent(user_speech):
    """Gemma4 से यूजर के इरादे (Intent) को सटीक पहचानना"""
    prompt = f"""
    You are the routing brain of a voice assistant. Analyze the user's input and classify it into one of these strict categories:
    - 'open_chrome' (if they want to open chrome, browser, internet, net surfing etc.)
    - 'open_notepad' (if they want to open notepad, text editor etc.)
    - 'open_calculator' (if they want to calculate, open calc, math etc.)
    - 'take_screenshot' (if they want to capture screen, photo of screen etc.)
    - 'create_file' (if they want to create a new file, write notes into a file, text file creation etc.)
    - 'volume_up' (increase volume, louder, आवाज बढ़ाओ)
    - 'volume_down' (decrease volume, quieter, आवाज कम करो)
    - 'pc_shutdown' (turn off pc, shutdown, कंप्यूटर बंद करो)
    - 'pc_restart' (restart pc, रीस्टार्ट करो)
    - 'chat' (if it's just a regular question, greeting, or casual talk)

    User Input: "{user_speech}"
    Respond with ONLY the category name. No other text.
    """
    try:
        response = chat(
            model="gemma4-local:latest",
            messages=[{"role": "user", "content": prompt}]
        )
        return response["message"]["content"].strip().lower()
    except:
        return "chat"

print("Jarvis Voice Assistant v1.0 (System Core Control) Ready")

while True:
    print("\nSpeak for 5 seconds...")
    
    fs = 16000
    recording = sd.rec(int(5 * fs), samplerate=fs, channels=1, dtype="int16")
    sd.wait()
    
    audio_path = r"C:\Jarvis\voice_input.wav"
    write(audio_path, fs, recording)
    
    print("Converting Speech To Text...")
    result = model.transcribe(audio_path, fp16=False, language="hi")
    user_text = result["text"].strip()
    
    print("\nYou Said:", user_text)
    
    if not user_text:
        continue
        
    command = user_text.lower()
    
    # 1. EXIT COMMAND
    if "exit" in command or "बंद करो" in command or "बाय" in command:
        speak_response("Goodbye!")
        break
        
    # 2. STRICT MATCHING (तेज रिस्पॉन्स के लिए सीधा मैच)
    if "open chrome" in command or "क्रोम खोलो" in command:
        os.startfile(os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"))
        speak_response("Opening Chrome")
        continue
        
    elif "open notepad" in command or "नोटपैड खोलो" in command:
        os.startfile("notepad.exe")
        speak_response("Opening Notepad")
        continue

    elif "open calculator" in command or "कैलकुलेटर खोलो" in command:
        os.startfile("calc.exe")
        speak_response("Opening Calculator")
        continue
        
    elif "take screenshot" in command or "स्क्रीनशॉट लो" in command:
        folder = r"C:\Jarvis\Screenshots"
        filename = datetime.now().strftime("%Y-%m-%d_%H-%M-%S.png")
        pyautogui.screenshot().save(os.path.join(folder, filename))
        speak_response("Screenshot Saved")
        continue

    # 3. SMART INTENT MATCHING (सिस्टम कंट्रोल और फाइल क्रिएशन)
    print("Analyzing intent...")
    intent = ask_ai_for_intent(user_text)
    
    if "open_chrome" in intent:
        os.startfile(os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"))
        speak_response("Opening Chrome.")
        continue
        
    elif "open_notepad" in intent:
        os.startfile("notepad.exe")
        speak_response("Opening Notepad.")
        continue
        
    elif "open_calculator" in intent:
        os.startfile("calc.exe")
        speak_response("Opening Calculator.")
        continue
        
    elif "take_screenshot" in intent:
        folder = r"C:\Jarvis\Screenshots"
        filename = datetime.now().strftime("%Y-%m-%d_%H-%M-%S.png")
        pyautogui.screenshot().save(os.path.join(folder, filename))
        speak_response("Screenshot taken.")
        continue

    elif "volume_up" in intent:
        for _ in range(5):  # 5 बार वॉल्यूम बढ़ाएगा
            pyautogui.press("volumeup")
        speak_response("Increasing volume.")
        continue

    elif "volume_down" in intent:
        for _ in range(5):  # 5 बार वॉल्यूम घटाएगा
            pyautogui.press("volumedown")
        speak_response("Decreasing volume.")
        continue

    elif "pc_shutdown" in intent:
        speak_response("Shutting down the computer in 5 seconds. Save your work.")
        time.sleep(5)
        os.system("shutdown /s /t 1")
        break

    elif "pc_restart" in intent:
        speak_response("Restarting the computer in 5 seconds.")
        time.sleep(5)
        os.system("shutdown /r /t 1")
        break

    elif "create_file" in intent:
        # डेस्कटॉप पर नोट्स फाइल बनाना
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        file_path = os.path.join(desktop, "Jarvis_Notes.txt")
        
        with open(file_path, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {user_text}\n")
            
        speak_response("मैने आपके नोट्स डेस्कटॉप पर Jarvis_Notes फ़ाइल में सेव कर दिए हैं।")
        os.startfile(file_path)  # फाइल को तुरंत खोलकर दिखाएगा
        continue
        
    # 4. STANDARD AI CHAT (अगर कोई पीसी कमांड नहीं है, तो सामान्य बातचीत)
    print("Thinking...")
    chat_history.append({"role": "user", "content": user_text})
    if len(chat_history) > 10:
        chat_history.pop(0)
        
    try:
        response = chat(model="gemma4-local:latest", messages=chat_history)
        answer = response["message"]["content"]
        chat_history.append({"role": "assistant", "content": answer})
        speak_response(answer)
            
    except Exception as e:
        print(f"Ollama AI से कनेक्ट करने में समस्या: {e}")