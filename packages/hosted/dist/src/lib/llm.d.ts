type CallLLMOptions = {
    model?: string;
};
export declare class LLMError extends Error {
    status: number;
    code: string;
    constructor(code: string, message: string, status: number);
}
export declare function callLLM(prompt: string, systemPrompt?: string, options?: CallLLMOptions): Promise<string>;
export {};
//# sourceMappingURL=llm.d.ts.map