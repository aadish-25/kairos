import destinations from "../data/destinations.json" assert { type: "json" };
import ApiError from "../utils/ApiError.js";

function getDestinationContext(destinationName) {
    if (!destinationName || typeof destinationName !== "string") {
        throw new ApiError(400, "Destination name is required");
    }

    const destination = destinations[destinationName.toLowerCase().trim()]
    if (!destination) throw new ApiError(404, "Destination information not found")

    return destination
}

export { getDestinationContext }