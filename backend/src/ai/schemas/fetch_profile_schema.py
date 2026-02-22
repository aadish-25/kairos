from typing import List, Literal, Optional
from pydantic import BaseModel, Field, validator


# Valid OSM tag keys we support
VALID_OSM_KEYS = {
    "natural", "historic", "tourism", "amenity",
    "leisure", "waterway", "man_made", "shop"
}

# Valid values per key (curated menu — LLM picks from these)
VALID_OSM_VALUES = {
    "natural": {"beach", "peak", "cave_entrance", "water"},
    "historic": {"fort", "castle", "monument", "ruins", "palace"},
    "tourism": {"attraction", "museum", "viewpoint", "zoo", "camp_site"},
    "amenity": {"restaurant", "cafe", "fast_food", "ice_cream", "bar",
                "nightclub", "pub", "place_of_worship"},
    "leisure": {"park", "nature_reserve", "garden", "spa"},
    "waterway": {"waterfall"},
    "man_made": {"ghat"},
    "shop": {"bakery", "mall"},
}


class OsmTagEntry(BaseModel):
    key: str
    value: str
    priority: Literal["high", "medium", "low"] = "medium"

    @validator("key")
    def validate_key(cls, v):
        if v not in VALID_OSM_KEYS:
            raise ValueError(f"Invalid OSM key: {v}. Must be one of {VALID_OSM_KEYS}")
        return v

    @validator("value")
    def validate_value(cls, v, values):
        key = values.get("key")
        if key and key in VALID_OSM_VALUES:
            if v not in VALID_OSM_VALUES[key]:
                raise ValueError(f"Invalid value '{v}' for key '{key}'. Valid: {VALID_OSM_VALUES[key]}")
        return v


class FetchProfile(BaseModel):
    destination_type: str = Field(
        min_length=1,
        description="Short label like 'beach_heritage', 'adventure_spiritual', 'pilgrimage_cultural'"
    )
    anchor_tags: List[OsmTagEntry] = Field(
        min_items=1, max_items=8,
        description="Landmark/attraction types to fetch"
    )
    lifestyle_tags: List[OsmTagEntry] = Field(
        min_items=1, max_items=5,
        description="Food and cafe types"
    )
    extras_tags: List[OsmTagEntry] = Field(
        default=[],
        description="Nightlife, wellness, camping, etc."
    )
    anchor_limit: int = Field(default=250, ge=50, le=1000)
    lifestyle_limit: int = Field(default=200, ge=50, le=500)
    extras_limit: int = Field(default=100, ge=0, le=300)
