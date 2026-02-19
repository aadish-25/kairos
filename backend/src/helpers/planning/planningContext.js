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

// Sample output:
// {
//   constraints: {
//     days: 3,
//     budget: 5000,
//     source: "Chennai",
//     destination: "Goa",
//     preferences: null
//   },
//   metadata: {
//     createdAt: "2026-02-10T08:04:50.123Z",
//     requestType: "ITINERARY_PLANNING"
//   }
// }
