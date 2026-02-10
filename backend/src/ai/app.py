from fastapi import FastAPI, HTTPException
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
        raise HTTPException(status_code=500, detail=str(e))
