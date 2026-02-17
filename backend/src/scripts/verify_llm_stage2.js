import axios from "axios";

async function testStage2() {
    try {
        console.log("Testing Stage 2...");

        // Mock Structure (Stage 1 Output)
        const structure = {
            name: "Test Dest",
            regions: [
                {
                    id: "region_1",
                    name: "Central Hub",
                    places: [
                        { name: "Place A" },
                        { name: "Place B" }
                    ]
                }
            ]
        };

        // Mock Metadata (Raw Places)
        const metadata = [
            { name: "Place A", tags: { amenity: "restaurant", cuisine: "italian" }, lat: 10, lon: 10 },
            { name: "Place B", tags: { tourism: "museum" }, lat: 10.1, lon: 10.1 }
        ];

        const res = await axios.post("http://localhost:9000/stage2", {
            structure: structure,
            metadata_pool: metadata
        });

        console.log("Result:", JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error("Error:", err.message);
        if (err.response) {
            console.error("Data:", err.response.data);
            console.error("Status:", err.response.status);
        }
    }
}

testStage2();
