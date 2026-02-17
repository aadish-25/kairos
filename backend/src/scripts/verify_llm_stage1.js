import axios from "axios";

async function testStage1() {
    try {
        console.log("Testing Stage 1...");
        const res = await axios.post("http://localhost:9000/stage1", {
            destination: "Test Dest",
            places: []
        });
        console.log("Result:", res.data);
    } catch (err) {
        console.error("Error:", err.message);
        if (err.response) {
            console.error("Data:", err.response.data);
            console.error("Status:", err.response.status);
        }
    }
}

testStage1();
