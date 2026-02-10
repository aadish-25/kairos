import json
from langchain_core.messages import HumanMessage
from llm.groq_client import get_groq_llm
from llm.prompts import REGION_BUILDER_PROMPT
from schemas.destination_schema import DestinationContext


def build_regions(destination: str, raw_places: list) -> dict:
    llm = get_groq_llm()

    payload = {
        "destination": destination,
        "places": raw_places
    }

    response = llm([
        HumanMessage(
            content=f"{REGION_BUILDER_PROMPT}\n\nINPUT:\n{json.dumps(payload)}"
        )
    ])

    # 1) Parse JSON
    try:
        data = json.loads(response.content)
    except json.JSONDecodeError:
        raise ValueError("AI returned invalid JSON")

    # 2) Validate schema (hard gate)
    validated = DestinationContext(**data)

    # 3) Return planner-safe dict
    return validated.model_dump()
