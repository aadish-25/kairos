import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve logs directory at the root of the backend folder
const LOG_DIR = path.resolve(__dirname, '../../../logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

const SEPARATOR = '\n------------------------------------------------------------\n';

/**
 * Write a log to a specific category file with a separator snippet.
 * @param {string} category - e.g., 'ai', 'prompting', 'overpass', 'services', 'geo_api'
 * @param {string|object} content - The content to log
 */
export function writeLog(category, content) {
    try {
        const timestamp = new Date().toISOString();
        const logFilePath = path.join(LOG_DIR, `${category}.log`);

        let logString = `[${timestamp}]\n`;
        if (typeof content === 'object') {
            // Handle Error objects properly
            if (content instanceof Error) {
                logString += `${content.name}: ${content.message}\n${content.stack}`;
            } else {
                logString += JSON.stringify(content, null, 2);
            }
        } else {
            logString += content;
        }
        logString += SEPARATOR;

        fs.appendFileSync(logFilePath, logString, 'utf8');
    } catch (error) {
        console.error(`Failed to write to log ${category}:`, error);
    }
}

export default { writeLog };
