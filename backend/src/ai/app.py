from fastapi import FastAPI, HTTPException
from dotenv import load_dotenv
import os
import traceback

load_dotenv()

from llm.region_builder import build_regions

app = FastAPI()


@app.post("/build-regions")
def build(payload: dict):
    try:
        return build_regions(
            payload["destination"],
            payload["places"]
        )
    except Exception as e:
        with open("error.log", "w") as f:
            f.write(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
