import os
import json
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

    command = input("You: ")

    if command.lower() == "exit":
        print("Jarvis: Goodbye!")
        break

    # Save Name
    elif command.lower().startswith("my name is"):

        name = command[10:].strip()

        memory["name"] = name

        with open(MEMORY_FILE, "w") as f:
            json.dump(memory, f)

        print("Jarvis: I will remember your name.")

    # Read Name
    elif command.lower() == "what is my name":

        if "name" in memory:
            print("Jarvis: Your name is", memory["name"])
        else:
            print("Jarvis: I do not know your name yet.")

    elif command.lower() == "open notepad":
        os.system("start notepad")
        print("Jarvis: Opening Notepad")

    elif command.lower() == "open calculator":
        os.system("start calc")
        print("Jarvis: Opening Calculator")

    elif command.lower() == "open paint":
        os.system("start mspaint")
        print("Jarvis: Opening Paint")

    elif command.lower() == "open cmd":
        os.system("start cmd")
        print("Jarvis: Opening CMD")

    elif command.lower() == "open explorer":
        os.system("start explorer")
        print("Jarvis: Opening Explorer")

    elif command.lower() == "open chrome":

        chrome_path = os.path.expandvars(
            r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
        )

        os.startfile(chrome_path)

        print("Jarvis: Opening Chrome")

    elif command.lower() == "open downloads":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Downloads"))
        print("Jarvis: Opening Downloads")

    elif command.lower() == "open documents":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Documents"))
        print("Jarvis: Opening Documents")

    elif command.lower() == "open desktop":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Desktop"))
        print("Jarvis: Opening Desktop")

    elif command.lower() == "take screenshot":

        folder = r"C:\Jarvis\Screenshots"

        if not os.path.exists(folder):
            os.makedirs(folder)

        filename = datetime.now().strftime("%Y-%m-%d_%H-%M-%S.png")

        path = os.path.join(folder, filename)

        screenshot = pyautogui.screenshot()

        screenshot.save(path)

        print("Jarvis: Screenshot Saved")
        print(path)

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