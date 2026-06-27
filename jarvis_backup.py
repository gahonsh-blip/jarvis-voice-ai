import os
from ollama import chat

while True:
    command = input("You: ")

    if command.lower() == "exit":
        print("Jarvis: Goodbye!")
        break

    elif command.lower() == "open notepad":
        os.system("start notepad")
        print("Jarvis: Opening Notepad")

    elif command.lower() == "open calculator":
        os.system("start calc")
        print("Jarvis: Opening Calculator")

    else:
        response = chat(
            model="gemma4-local:latest",
            messages=[
                {"role": "user", "content": command}
            ]
        )

        print("\nJarvis:", response["message"]["content"])