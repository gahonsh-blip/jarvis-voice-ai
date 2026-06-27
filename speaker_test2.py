import pyttsx3

engine = pyttsx3.init()

while True:

    text = input("Say: ")

    if text.lower() == "exit":
        break

    engine.say(text)
    engine.runAndWait()