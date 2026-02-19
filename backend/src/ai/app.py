from fastapi import FastAPI, HTTPException
from dotenv import load_dotenv
import os
import traceback
from llm.region_builder import structure_regions, curate_regions, strategize_trip

load_dotenv()

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

# Stage 1: Takes raw places and groups them into geographic regions (e.g. North Goa, South Goa)
@app.post("/stage1")
def stage1(payload: dict):
    try:
        return structure_regions(payload["destination"], payload["places"])
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Stage 2: Takes each region and picks the best places for it (sets priority, category, best_time)
@app.post("/stage2")
def stage2(payload: dict):
    try:
        return curate_regions(payload["structure"], payload["metadata_pool"])
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Stage 3: Takes all curated regions and builds a travel profile (spread, min_days, split_stay)
@app.post("/stage3")
def stage3(payload: dict):
    try:
        return strategize_trip(payload)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
