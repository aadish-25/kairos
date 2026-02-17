import axios from "axios";

async function testStage3() {
    try {
        console.log("Testing Stage 3...");

        // Mock Curated Output (Stage 2 Output)
        const curated = {
            name: "Test Dest",
            regions: [
                {
                    id: "region_1",
                    name: "Central Hub",
                    places: [
                        { name: "Place A", category: "food", priority: "main" },
                        { name: "Place B", category: "heritage", priority: "main" }
                    ]
                }
            ]
        };

        const res = await axios.post("http://localhost:9000/stage3", curated);

        console.log("Result:", JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error("Error:", err.message);
        if (err.response) {
            console.error("Data:", err.response.data);
        }
    }
}

testStage3();
