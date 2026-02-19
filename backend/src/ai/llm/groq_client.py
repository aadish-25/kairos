from langchain_groq import ChatGroq
from dotenv import load_dotenv

load_dotenv()

def get_groq_llm():
    # return ChatGroq(model="llama-3.1-8b-instant", temperature=0.2, max_tokens=4000)
    return ChatGroq(model="llama-3.3-70b-versatile", temperature=0.2, max_tokens=4000)
