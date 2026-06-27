import sounddevice as sd
from scipy.io.wavfile import write

fs = 16000

print("Speak for 5 seconds...")

recording = sd.rec(
    int(5 * fs),
    samplerate=fs,
    channels=1,
    dtype="int16",
    device=1
)

sd.wait()

write("C:\\Jarvis\\test.wav", fs, recording)

print("Audio Saved")