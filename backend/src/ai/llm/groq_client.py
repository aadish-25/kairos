from langchain_groq import ChatGroq

def get_groq_llm():
    return ChatGroq(
        model="llama-3.1-70b-versatile",
        temperature=0.2,
        max_tokens=4000
    )
