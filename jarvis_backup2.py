import os
import pyautogui
from datetime import datetime
from ollama import chat

while True:
    command = input("You: ").lower()

    if command == "exit":
        print("Jarvis: Goodbye!")
        break

    elif command == "open notepad":
        os.system("start notepad")
        print("Jarvis: Opening Notepad")

    elif command == "open calculator":
        os.system("start calc")
        print("Jarvis: Opening Calculator")

    elif command == "open chrome":
        chrome_path = os.path.expandvars(
            r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
        )
        os.startfile(chrome_path)
        print("Jarvis: Opening Chrome")

    elif command == "open downloads":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Downloads"))
        print("Jarvis: Opening Downloads")

    elif command == "open documents":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Documents"))
        print("Jarvis: Opening Documents")

    elif command == "open desktop":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Desktop"))
        print("Jarvis: Opening Desktop")

    elif command == "open music":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Music"))
        print("Jarvis: Opening Music")

    elif command == "open videos":
        os.startfile(os.path.join(os.environ["USERPROFILE"], "Videos"))
        print("Jarvis: Opening Videos")

    elif command == "take screenshot":

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