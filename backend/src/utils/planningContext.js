function buildPlanningContext(validatedInput) {
    const { days, budget, source, destination } = validatedInput;

    return {
        constraints: {
            days,
            budget,
            source,
            destination,
            preferences: null
        },
        metadata: {
            createdAt: new Date().toISOString(),
            requestType: "ITINERARY_PLANNING"
        }
    };
}

export { buildPlanningContext };
