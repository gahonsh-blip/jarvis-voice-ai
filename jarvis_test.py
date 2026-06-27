from ollama import chat

while True:
    q = input("You: ")

    if q.lower() == "exit":
        break

    response = chat(
        model="gemma4-local:latest",
        messages=[
            {
                "role": "user",
                "content": q
            }
        ]
    )

    print("\nJarvis:", response["message"]["content"])
    print()