import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import ApiResponse from "../utils/ApiResponse.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getDocs = (req, res) => {
    try {
        const specPath = path.join(__dirname, "../docs/openapi.json");
        const spec = JSON.parse(readFileSync(specPath, "utf8"));

        return res.status(200).json(
            new ApiResponse(200, spec, "API Documentation retrieved successfully")
        );
    } catch (error) {
        console.error("Docs Controller Error: ", error);
        return res.status(500).json(
            new ApiResponse(500, null, "Failed to load API documentation")
        );
    }
};
