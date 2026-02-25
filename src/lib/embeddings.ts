import { env, pipeline } from "@xenova/transformers";

env.allowLocalModels = false;
env.useBrowserCache = false;

type ExtractorOutput = {
  data: Float32Array | number[];
};

type FeatureExtractor = (
  input: string,
  options: { pooling: "mean"; normalize: true },
) => Promise<ExtractorOutput>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    ) as Promise<FeatureExtractor>;
  }
  return extractorPromise;
}

export async function embedText(input: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output: ExtractorOutput = await extractor(input, {
    pooling: "mean",
    normalize: true,
  });

  return Array.from(output.data);
}
