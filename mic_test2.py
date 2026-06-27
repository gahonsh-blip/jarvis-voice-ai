import sounddevice as sd

print("Checking microphone devices...\n")

devices = sd.query_devices()

for i, device in enumerate(devices):
    print(i, "-", device["name"])