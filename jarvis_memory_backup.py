import os
import json
import pyautogui
from datetime import datetime
from ollama import chat

memory_file = r"C:\Jarvis\memory.json"

if not os.path.exists(memory_file):
    with open(memory_file, "w") as f:
        json.dump({}, f)

while True:
    command = input("You: ")
    command_lower = command.lower()

    if command_lower == "exit":
        print("Jarvis: Goodbye!")
        break

    elif command_lower.startswith("remember my name is "):
        name = command[20:]

        with open(memory_file, "r") as f:
            memory = json.load(f)

        memory["name"] = name

        with open(memory_file, "w") as f:
            json.dump(memory, f)

        print(f"Jarvis: I will remember your name is {name}")

    elif command_lower == "what is my name":

        with open(memory_file, "r") as f:
            memory = json.load(f)

        if "name" in memory:
            print(f"Jarvis: Your name is {memory['name']}")
        else:
            print("Jarvis: I do not know your name yet")

    elif command_lower == "what do you remember":

        with open(memory_file, "r") as f:
            memory = json.load(f)

        print("Jarvis Memory:")
        print(memory)

    elif command_lower == "open notepad":
        os.system("start notepad")
        print("Jarvis: Opening Notepad")

    elif command_lower == "open calculator":
        os.system("start calc")
        print("Jarvis: Opening Calculator")

    elif command_lower == "open paint":
        os.system("start mspaint")
        print("Jarvis: Opening Paint")

    elif command_lower == "open cmd":
        os.system("start cmd")
        print("Jarvis: Opening Command Prompt")

    elif command_lower == "open explorer":
        os.system("start explorer")
        print("Jarvis: Opening File Explorer")

    elif command_lower == "open chrome":
        chrome_path = os.path.expandvars(
            r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
        )
        os.startfile(chrome_path)
        print("Jarvis: Opening Chrome")

    elif command_lower == "open downloads":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Downloads"))
        print("Jarvis: Opening Downloads")

    elif command_lower == "open documents":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Documents"))
        print("Jarvis: Opening Documents")

    elif command_lower == "open desktop":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Desktop"))
        print("Jarvis: Opening Desktop")

    elif command_lower == "open music":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Music"))
        print("Jarvis: Opening Music")

    elif command_lower == "open videos":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Videos"))
        print("Jarvis: Opening Videos")

    elif command_lower == "take screenshot":

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
                {"role": "user", "content": command}
            ]
        )

        print("\nJarvis:", response["message"]["content"])