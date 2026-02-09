import ApiError from './ApiError.js'

function validateItineraryInput(input) {
    if (!input || typeof input !== "object") {
        throw new ApiError(400, "Invalid request body");
    }

    const { source, destination, days, budget } = input;

    if (days === undefined || days === null) {
        throw new ApiError(400, "Days are required");
    }

    const parsedDays = Number(days);
    if (Number.isNaN(parsedDays) || parsedDays <= 0) {
        throw new ApiError(400, "Days must be a number greater than 0");
    }

    let parsedBudget = null;
    if (budget !== undefined && budget !== null) {
        parsedBudget = Number(budget);
        if (Number.isNaN(parsedBudget) || parsedBudget <= 0) {
            throw new ApiError(400, "Budget must be a number greater than 0");
        }
    }
    
    let refinedSource = null;
    if (typeof source === "string" && source.trim().length > 0) {
        refinedSource = source.trim();
    }

    let refinedDestination = null;
    if (typeof destination === "string" && destination.trim().length > 0) {
        refinedDestination = destination.trim();
    }

    return {
        days: parsedDays,
        budget: parsedBudget,
        source: refinedSource,
        destination: refinedDestination
    };
}

export { validateItineraryInput };