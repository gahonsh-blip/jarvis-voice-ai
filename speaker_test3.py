import pyttsx3

while True:

    text = input("Say: ")

    if text.lower() == "exit":
        break

    engine = pyttsx3.init()

    engine.say(text)

    engine.runAndWait()

    engine.stop()