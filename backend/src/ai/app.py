from fastapi import FastAPI
from llm.region_builder import build_regions

app = FastAPI()

@app.post("/build-regions")
def build(payload: dict):
    destination = payload["destination"]
    places = payload["places"]
    return build_regions(destination, places)
