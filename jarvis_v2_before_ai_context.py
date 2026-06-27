from modules.memory_module import *
from modules.intent_module import detect_intent
from modules.browser_module import execute_browser
import os

print("================================")
print("      Jarvis V2 Started")
print("================================")

while True:

    command = input("You: ").strip()

    if not command:
        continue

    if command.lower() == "exit":
        print("Jarvis: Goodbye!")
        break

    intent = detect_intent(command)

    browser_intents = [
        "open_google",
        "open_youtube",
        "open_gmail",
        "open_chatgpt",
        "google_search"
    ]

    if intent in browser_intents:

        response = execute_browser(intent, command)

        if response:
            print("Jarvis:", response)

    elif intent == "open_chrome":

        os.system("start chrome")

        print("Jarvis: Opening Chrome")

    elif intent == "open_calculator":

        os.system("calc")

        print("Jarvis: Opening Calculator")

    elif intent == "open_notepad":

        os.system("notepad")

        print("Jarvis: Opening Notepad")

    elif intent == "save_name":

        name = command.replace(
            "remember my name is",
            ""
        ).strip()

        set_user_name(name)

        print("Jarvis: Name saved.")

    elif intent == "get_name":

        print("Jarvis:", get_user_name())

    elif intent == "add_task":

        task = command.replace(
            "add task",
            ""
        ).strip()

        add_task(task)

        print("Jarvis: Task added.")

    elif intent == "show_tasks":

        tasks = get_tasks()

        if not tasks:
            print("Jarvis: No tasks found.")

        else:

            print("\nTasks:")

            for i, task in enumerate(tasks, start=1):
                print(f"{i}. {task}")

    elif intent == "add_note":

        note = command.replace(
            "add note",
            ""
        ).strip()

        add_note(note)

        print("Jarvis: Note saved.")

    elif intent == "show_notes":

        notes = get_notes()

        if not notes:
            print("Jarvis: No notes found.")

        else:

            print("\nNotes:")

            for i, note in enumerate(notes, start=1):
                print(f"{i}. {note}")

    elif intent == "show_memory":

        print(show_memory())

    else:

        print("Jarvis: Command not recognized yet.")