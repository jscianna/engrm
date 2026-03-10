import { readFileSync } from "node:fs";
import { evaluateRetrievalFixtures } from "./harness.js";
import type { RetrievalEvalFixture, RetrievalEvalPrediction } from "../types.js";

type EvalInput = {
  fixtures: RetrievalEvalFixture[];
  predictions: RetrievalEvalPrediction[];
};

function main(): void {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: cognitive-eval <fixtures-and-predictions.json>");
  }

  const input = JSON.parse(readFileSync(filePath, "utf8")) as EvalInput;
  const result = evaluateRetrievalFixtures({
    fixtures: input.fixtures ?? [],
    predictions: input.predictions ?? [],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
