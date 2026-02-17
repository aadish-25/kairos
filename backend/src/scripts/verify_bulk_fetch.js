
import { fetchRawPlacesForDestination } from '../helpers/data/fetchRawPlacesForDestination.js';
import fs from 'fs';
import path from 'path';

const DESTINATIONS = ["Goa", "Manali", "Pondicherry"];
const OUTPUT_FILE = path.join(process.cwd(), 'docs', 'FETCH_TEST_RESULTS.md');

async function runBulkTest() {
    let report = `# Bulk Fetch Verification Report (Quality Sorted)\nGenerated on: ${new Date().toISOString()}\n\n`;
    report += `**Strategy**: High-Fetch (3500+) -> Anchor Priority -> **Quality Sort (Wiki/Web)** -> Generic Chain Filter -> Cap (200)\n\n`;

    for (const dest of DESTINATIONS) {
        console.log(`Processing ${dest}...`);
        try {
            const start = Date.now();
            const places = await fetchRawPlacesForDestination(dest);
            const duration = (Date.now() - start) / 1000;

            // Stats
            const categories = {};
            places.forEach(p => { categories[p.category] = (categories[p.category] || 0) + 1; });

            // Generic Chain Check
            const chains = ["Cafe Coffee Day", "Dominos", "KFC", "McDonald's", "Starbucks", "Subway", "Pizza Hut"];
            const foundChains = places.filter(p => {
                const n = p.name ? p.name.toLowerCase() : "";
                return chains.some(c => n.includes(c.toLowerCase()));
            });

            // Specific Check for Goa Beaches (North vs South)
            let beachCheck = "";
            if (dest === "Goa") {
                const targets = ["baga", "calangute", "anjuna", "candolim", "vagator", "colva", "palolem"];

                const foundTargets = places.filter(p => targets.some(t => p.name.toLowerCase().includes(t)));
                const missingTargets = targets.filter(t => !places.some(p => p.name.toLowerCase().includes(t)));

                beachCheck = `\n**Key Landmark Check:**\n- Found: ${foundTargets.map(p => p.name).join(', ')}\n`;
                if (missingTargets.length > 0) beachCheck += `- ⚠️ MISSING: ${missingTargets.join(', ')}\n`;
                else beachCheck += `- ✅ All Major Beaches Present\n`;
            }

            report += `## 📍 ${dest}\n`;
            report += `- **Total Places**: ${places.length}\n`;
            report += `- **Fetch Time**: ${duration.toFixed(2)}s\n`;
            report += `- **Generic Chains Found**: ${foundChains.length} ${foundChains.length > 0 ? `(${foundChains.map(p => p.name).join(', ')})` : '✅'}\n`;
            if (beachCheck) report += beachCheck;

            report += `\n### 📊 Category Distribution\n`;
            Object.entries(categories).forEach(([cat, count]) => {
                report += `- **${cat}**: ${count}\n`;
            });

            report += `\n### 📝 Place List (Ranked by Quality)\n`;
            report += `<details><summary>Click to view all ${places.length} places</summary>\n\n`;

            // We want to see the order they came back in (which should be Quality Sorted)
            // But for the report, maybe alphabetical is better? 
            // The user wants to see "what operations performed". 
            // I'll leave them in order returned to show the Quality Sort working (Top items should be famous)

            places.forEach((p, index) => {
                const score = p.quality_score || 0;
                report += `${index + 1}. [${p.category}] **${p.name}** (QS: ${score})\n`;
            });
            report += `\n</details>\n\n---\n\n`;

        } catch (err) {
            report += `## ❌ ${dest} (FAILED)\nError: ${err.message}\n\n---\n\n`;
            console.error(`Failed ${dest}:`, err.message);
        }
    }

    fs.writeFileSync(OUTPUT_FILE, report);
    console.log(`\n✅ Report written to: ${OUTPUT_FILE}`);
}

runBulkTest();
