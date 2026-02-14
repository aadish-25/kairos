import json
import re
from langchain_core.messages import HumanMessage
from llm.groq_client import get_groq_llm
from llm.prompts import STAGE1_STRUCTURER_PROMPT, STAGE2_CURATOR_PROMPT, STAGE3_STRATEGIST_PROMPT

def invoke_llm(prompt: str, input_data: dict) -> dict:
    llm = get_groq_llm()
    response = llm.invoke([
        HumanMessage(content=f"{prompt}\n\nINPUT:\n{json.dumps(input_data, default=str)}")
    ])
    
    content = response.content.strip()
    match = re.search(r'(\{[\s\S]*\})', content)
    if match:
        content = match.group(1)
        
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        raise ValueError(f"AI returned invalid JSON. Content: {content[:500]}")

def structure_regions(destination: str, raw_places: list) -> dict:
    return invoke_llm(STAGE1_STRUCTURER_PROMPT, {
        "destination": destination,
        "places": raw_places
    })

def curate_regions(structured_data: dict, full_metadata: list) -> dict:
    # We pass the structure + metadata so the LLM can see tags/details
    return invoke_llm(STAGE2_CURATOR_PROMPT, {
        "structure": structured_data,
        "metadata_pool": full_metadata
    })

def strategize_trip(curated_data: dict) -> dict:
    return invoke_llm(STAGE3_STRATEGIST_PROMPT, curated_data)
