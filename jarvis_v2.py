from modules.memory_module import *
from modules.intent_module import detect_intent
from modules.browser_module import execute_browser
from modules.ai_module import ai_chat
from modules.logic_module import autonomous_code_handler
import os
import subprocess

print("================================")
print("      Jarvis V2 Started (Autonomous Ready)")
print("================================")

while True:
    command = input("You: ").strip()

    if not command:
        continue
    if command.lower() == "exit":
        print("Jarvis: Goodbye!")
        break

    # 1. ??? ????? ??? ?? ??????? ???? ?? ??? ????? ?? ???
    if "upgrade" in command.lower() or "??? ?? ??????" in command.lower():
        response = autonomous_code_handler(command, is_emergency=True)
        print(response)
        continue

    # 2. ???? ?????? ????
    intent = detect_intent(command)
    browser_intents = ["open_google", "open_youtube", "open_gmail", "open_chatgpt", "google_search"]
    
    if intent in browser_intents:
        response = execute_browser(intent, command)
        if response: print(f"Jarvis: {response}")
    elif intent == "open_chrome": os.system("start chrome")
    elif intent == "open_calculator": os.system("calc")
    elif intent == "open_notepad": os.system("notepad")
    else:
        # ??? ??? ?????? ????? ?? ?? ???? AI ???
        response = ai_chat(command)
        print(f"Jarvis: {response}")
