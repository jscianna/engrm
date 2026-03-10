import { readFileSync } from "node:fs";
import { evaluateBenchmarkGate, evaluateRetrievalFixtures } from "./harness.js";
import type {
  BenchmarkGateThresholds,
  RetrievalEvalFixture,
  RetrievalEvalPrediction,
  RetrievalEvalResult,
} from "../types.js";

type EvalInput = {
  fixtures: RetrievalEvalFixture[];
  predictions: RetrievalEvalPrediction[];
  baselineResult?: RetrievalEvalResult;
  thresholds?: BenchmarkGateThresholds;
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
  const gate =
    input.baselineResult || input.thresholds
      ? evaluateBenchmarkGate({
          current: result,
          baseline: input.baselineResult,
          thresholds: input.thresholds,
        })
      : undefined;
  process.stdout.write(`${JSON.stringify({ result, gate }, null, 2)}\n`);
}

main();
