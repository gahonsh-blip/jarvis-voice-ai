import json
import os

memory_file = "memory.json"

if not os.path.exists(memory_file):
    with open(memory_file, "w") as f:
        json.dump({}, f)

with open(memory_file, "r") as f:
    memory = json.load(f)

memory["name"] = "Rahul"

with open(memory_file, "w") as f:
    json.dump(memory, f)

print("Memory Saved")

with open(memory_file, "r") as f:
    memory = json.load(f)

print("Stored Name:", memory["name"])