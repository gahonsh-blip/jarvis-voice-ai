from modules.memory_module import *
from modules.intent_module import detect_intent
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

    # इरादा पहचानना (Intent Detection)
    intent = detect_intent(command)

    if intent == "open_chrome":
        os.system("start chrome")

    elif intent == "open_calculator":
        os.system("calc")

    elif intent == "open_notepad":
        os.system("notepad")

    elif intent == "save_name":
        # अगर सीधा मैच न हो तो 'is' के बाद का नाम उठाएगा
        if "is" in command.lower():
            name = command.lower().split("is")[-1].strip().capitalize()
        else:
            name = command.replace("remember my name", "").strip()
        
        if name:
            set_user_name(name)
            print(f"Jarvis: Name saved as {name}.")
        else:
            print("Jarvis: Please provide a valid name.")

    elif intent == "get_name":
        name = get_user_name()
        if name:
            print("Jarvis:", name)
        else:
            print("Jarvis: I do not know your name yet.")

    elif intent == "add_task":
        # 'add task' शब्द को हटाकर बाकी का पूरा टेक्स्ट टास्क मान लेगा
        task = command.lower().replace("add task", "").strip()
        if task:
            add_task(task)
            print("Jarvis: Task added.")
        else:
            print("Jarvis: Please enter a task.")

    elif intent == "show_tasks":
        tasks = get_tasks()
        if not tasks:
            print("Jarvis: No tasks found.")
        else:
            print("\nTasks:")
            for i, task in enumerate(tasks, start=1):
                print(f"{i}. {task}")

    elif intent == "add_note":
        # 'add note' शब्द को हटाकर बाकी का टेक्स्ट नोट मान लेगा
        note = command.lower().replace("add note", "").strip()
        if note:
            add_note(note)
            print("Jarvis: Note saved.")
        else:
            print("Jarvis: Please enter a note.")

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