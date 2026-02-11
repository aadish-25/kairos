from typing import List, Literal, Optional
from pydantic import BaseModel, Field, validator


class Place(BaseModel):
    name: str = Field(min_length=1)
    priority: Literal["main", "optional"]
    category: str = "other"       # High-level: nature, food, heritage, etc.
    subcategory: str = "other"    # Specific: beach, temple, cafe, fort, market
    specialty: List[str] = []     # Unique traits: sunset, seafood, live music. Empty if generic.
    best_time: str = "anytime"
    lat: Optional[float] = None
    lon: Optional[float] = None


class Region(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    density: Literal["high", "medium", "low"]
    recommended_days: int = Field(ge=0, default=1)
    places: List[Place]

    @validator("places")
    def must_have_places(cls, v):
        if not v:
            raise ValueError("region must contain at least one place")
        return v


class TravelProfile(BaseModel):
    spread: Literal["compact", "wide"]
    needs_split_stay: bool
    min_days: int = Field(ge=1)
    ideal_days: int = Field(ge=1)

    @validator("ideal_days")
    def ideal_not_less_than_min(cls, v, values):
        if "min_days" in values and v < values["min_days"]:
            raise ValueError("ideal_days must be >= min_days")
        return v


class DestinationContext(BaseModel):
    name: str = Field(min_length=1)
    regions: List[Region]
    travel_profile: TravelProfile

    @validator("regions")
    def must_have_regions(cls, v):
        if not v:
            raise ValueError("destination must have at least one region")
        return v
