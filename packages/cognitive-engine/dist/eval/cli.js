import { readFileSync } from "node:fs";
import { evaluateRetrievalFixtures } from "./harness.js";
function main() {
    const filePath = process.argv[2];
    if (!filePath) {
        throw new Error("Usage: cognitive-eval <fixtures-and-predictions.json>");
    }
    const input = JSON.parse(readFileSync(filePath, "utf8"));
    const result = evaluateRetrievalFixtures({
        fixtures: input.fixtures ?? [],
        predictions: input.predictions ?? [],
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
main();
//# sourceMappingURL=cli.js.map