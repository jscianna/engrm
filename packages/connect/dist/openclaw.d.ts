export type OpenClawInstallOptions = {
    mode: "hosted" | "local";
    apiKey?: string;
    baseUrl?: string;
    namespace?: string;
    installationId?: string;
    noRestart?: boolean;
};
export declare function ensureOpenClawAvailable(): Promise<void>;
export declare function defaultInstallationName(): string;
export declare function copyToClipboard(value: string): Promise<boolean>;
export declare function installOpenClawContextEngine(options: OpenClawInstallOptions): Promise<void>;
//# sourceMappingURL=openclaw.d.ts.map