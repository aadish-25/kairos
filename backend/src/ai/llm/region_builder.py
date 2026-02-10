from langchain_core.messages import HumanMessage
from llm.groq_client import get_groq_llm
from llm.prompts import REGION_BUILDER_PROMPT

def build_regions(destination, raw_places):
    llm = get_groq_llm()

    payload = {
        "destination": destination,
        "places": raw_places
    }

    response = llm([
        HumanMessage(content=f"{REGION_BUILDER_PROMPT}\n\nINPUT:\n{payload}")
    ])

    return response.content
