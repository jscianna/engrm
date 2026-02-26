// Dynamic import to avoid loading ONNX runtime on serverless where it's not available

type ExtractorOutput = {
  data: Float32Array | number[];
};

type FeatureExtractor = (
  input: string,
  options: { pooling: "mean"; normalize: true },
) => Promise<ExtractorOutput>;

let extractorPromise: Promise<FeatureExtractor | null> | null = null;

async function getExtractor(): Promise<FeatureExtractor | null> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      try {
        // Dynamic import to avoid crashing on serverless
        const { env, pipeline } = await import("@xenova/transformers");
        env.allowLocalModels = false;
        env.useBrowserCache = false;
        
        return pipeline(
          "feature-extraction",
          "Xenova/all-MiniLM-L6-v2",
        ) as Promise<FeatureExtractor>;
      } catch (error) {
        console.error("[Embeddings] Failed to load transformers:", error);
        return null;
      }
    })();
  }
  return extractorPromise;
}

export async function embedText(input: string): Promise<number[]> {
  try {
    const extractor = await getExtractor();
    if (!extractor) {
      console.warn("[Embeddings] Extractor unavailable, returning zero vector");
      return new Array(384).fill(0);
    }
    
    const output: ExtractorOutput = await extractor(input, {
      pooling: "mean",
      normalize: true,
    });

    return Array.from(output.data);
  } catch (error) {
    console.error("[Embeddings] Generation failed:", error);
    // Return zero vector as fallback (384 dimensions for MiniLM)
    return new Array(384).fill(0);
  }
}
