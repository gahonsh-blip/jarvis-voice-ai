from ollama import chat

response = chat(
model="gemma4-local:latest",
messages=[
{
"role": "user",
"content": "What is 2+2?"
}
]
)

print(response["message"]["content"])
