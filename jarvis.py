import os
import json
import webbrowser
import pyautogui
from datetime import datetime
from ollama import chat

MEMORY_FILE = "memory.json"

# Memory Load
if os.path.exists(MEMORY_FILE):
    with open(MEMORY_FILE, "r") as f:
        memory = json.load(f)
else:
    memory = {}

while True:

    command = input("You: ").strip()
    lower_command = command.lower()

    if lower_command == "exit":
        print("Jarvis: Goodbye!")
        break

    # =========================
    # MEMORY
    # =========================

    elif lower_command.startswith("my name is"):

        name = command[10:].strip()

        memory["name"] = name

        with open(MEMORY_FILE, "w") as f:
            json.dump(memory, f)

        print("Jarvis: I will remember your name.")

    elif lower_command == "what is my name":

        if "name" in memory:
            print("Jarvis: Your name is", memory["name"])
        else:
            print("Jarvis: I do not know your name yet.")

    # =========================
    # PC AUTOMATION
    # =========================

    elif lower_command == "open notepad":
        os.system("start notepad")
        print("Jarvis: Opening Notepad")

    elif lower_command == "open calculator":
        os.system("start calc")
        print("Jarvis: Opening Calculator")

    elif lower_command == "open paint":
        os.system("start mspaint")
        print("Jarvis: Opening Paint")

    elif lower_command == "open cmd":
        os.system("start cmd")
        print("Jarvis: Opening CMD")

    elif lower_command == "open explorer":
        os.system("start explorer")
        print("Jarvis: Opening Explorer")

    elif lower_command == "open chrome":

        chrome_path = os.path.expandvars(
            r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
        )

        os.startfile(chrome_path)

        print("Jarvis: Opening Chrome")

    elif lower_command == "open downloads":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Downloads"))
        print("Jarvis: Opening Downloads")

    elif lower_command == "open documents":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Documents"))
        print("Jarvis: Opening Documents")

    elif lower_command == "open desktop":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Desktop"))
        print("Jarvis: Opening Desktop")

    elif lower_command == "open music":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Music"))
        print("Jarvis: Opening Music")

    elif lower_command == "open videos":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Videos"))
        print("Jarvis: Opening Videos")

    # =========================
    # SCREENSHOT
    # =========================

    elif lower_command == "take screenshot":

        folder = r"C:\Jarvis\Screenshots"

        if not os.path.exists(folder):
            os.makedirs(folder)

        filename = datetime.now().strftime("%Y-%m-%d_%H-%M-%S.png")

        path = os.path.join(folder, filename)

        screenshot = pyautogui.screenshot()
        screenshot.save(path)

        print("Jarvis: Screenshot Saved")
        print(path)

    # =========================
    # BROWSER CONTROL
    # =========================

    elif lower_command == "open google":

        webbrowser.open("https://www.google.com")

        print("Jarvis: Opening Google")

    elif lower_command == "open youtube":

        webbrowser.open("https://www.youtube.com")

        print("Jarvis: Opening YouTube")

    elif lower_command == "open gmail":

        webbrowser.open("https://mail.google.com")

        print("Jarvis: Opening Gmail")

    elif lower_command == "open chatgpt":

        webbrowser.open("https://chatgpt.com")

        print("Jarvis: Opening ChatGPT")

    elif lower_command.startswith("search "):

        query = command[7:]

        webbrowser.open(
            "https://www.google.com/search?q=" + query
        )

        print("Jarvis: Searching", query)

    # =========================
    # AI CHAT
    # =========================

    else:

        response = chat(
            model="gemma4-local:latest",
            messages=[
                {
                    "role": "user",
                    "content": command
                }
            ]
        )

        print("\nJarvis:", response["message"]["content"])