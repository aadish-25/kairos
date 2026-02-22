import json
import re
from langchain_core.messages import HumanMessage
from llm.groq_client import get_groq_llm
from llm.prompts import STAGE0_FETCH_PROFILE_PROMPT, STAGE1_STRUCTURER_PROMPT, STAGE2_CURATOR_PROMPT, STAGE3_STRATEGIST_PROMPT
from schemas.fetch_profile_schema import FetchProfile
from utils.logger import write_log

def invoke_llm(prompt: str, input_data: dict) -> dict:
    llm = get_groq_llm()
    prompt_text = f"{prompt}\n\nINPUT:\n{json.dumps(input_data, default=str)}"
    
    write_log("prompting", f"Invoking LLM with Prompt:\n{prompt_text}")
    
    response = llm.invoke([
        HumanMessage(content=prompt_text)
    ])
    
    content = response.content.strip()
    write_log("prompting", f"LLM Match Response:\n{content}")
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

# Default fallback profile (covers most Indian destinations)
DEFAULT_FETCH_PROFILE = {
    "destination_type": "general_tourism",
    "anchor_tags": [
        {"key": "natural", "value": "beach", "priority": "medium"},
        {"key": "historic", "value": "fort", "priority": "medium"},
        {"key": "historic", "value": "monument", "priority": "medium"},
        {"key": "tourism", "value": "attraction", "priority": "medium"},
        {"key": "tourism", "value": "museum", "priority": "medium"},
        {"key": "tourism", "value": "viewpoint", "priority": "medium"},
        {"key": "amenity", "value": "place_of_worship", "priority": "medium"},
    ],
    "lifestyle_tags": [
        {"key": "amenity", "value": "restaurant", "priority": "medium"},
        {"key": "amenity", "value": "cafe", "priority": "medium"},
    ],
    "extras_tags": [
        {"key": "amenity", "value": "bar", "priority": "low"},
        {"key": "leisure", "value": "spa", "priority": "low"},
    ],
    "anchor_limit": 400,
    "lifestyle_limit": 200,
    "extras_limit": 80,
}

def build_fetch_profile(destination: str) -> dict:
    """Stage 0: Ask LLM what types of places to fetch for this destination."""
    try:
        raw = invoke_llm(STAGE0_FETCH_PROFILE_PROMPT, {"destination": destination})
        
        # Validate against Pydantic schema
        profile = FetchProfile(**raw)
        write_log("ai", f"[Stage0] Generated fetch profile for {destination}: {profile.destination_type}")
        return profile.dict()
    except Exception as e:
        write_log("ai_errors", f"[Stage0] WARNING: LLM profile failed for {destination}: {e}\n[Stage0] Using default fallback profile")
        return DEFAULT_FETCH_PROFILE

