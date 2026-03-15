import { spawn } from "node:child_process";
import os from "node:os";
const OPENCLAW_BINARY = "openclaw";
const OPENCLAW_PLUGIN_ID = "fathippo-context-engine";
const OPENCLAW_PLUGIN_PACKAGE = "@fathippo/fathippo-context-engine";
function formatCommand(binary, args) {
    return [binary, ...args].join(" ");
}
async function runCommand(binary, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(binary, args, {
            stdio: "pipe",
            env: process.env,
        });
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        child.on("error", (error) => {
            reject(new Error(`Failed to run '${formatCommand(binary, args)}': ${error.message}`));
        });
        child.on("close", (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
                return;
            }
            reject(new Error(`Command failed (${code}): ${formatCommand(binary, args)}\n${stderr.trim() || stdout.trim() || "No output"}`));
        });
        if (typeof options.input === "string") {
            child.stdin.write(options.input);
        }
        child.stdin.end();
    });
}
async function runOpenClaw(args) {
    await runCommand(OPENCLAW_BINARY, args);
}
export async function ensureOpenClawAvailable() {
    await runOpenClaw(["--help"]);
}
export function defaultInstallationName() {
    const hostname = os.hostname().replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 48);
    return `${hostname || "machine"}-openclaw`;
}
export async function copyToClipboard(value) {
    const attempts = [];
    if (process.platform === "darwin") {
        attempts.push({ binary: "pbcopy", args: [], input: value });
    }
    else if (process.platform === "win32") {
        attempts.push({ binary: "cmd", args: ["/c", "clip"], input: value });
    }
    else {
        attempts.push({ binary: "wl-copy", args: [], input: value }, { binary: "xclip", args: ["-selection", "clipboard"], input: value }, { binary: "xsel", args: ["--clipboard", "--input"], input: value });
    }
    for (const attempt of attempts) {
        try {
            await runCommand(attempt.binary, attempt.args, { input: attempt.input });
            return true;
        }
        catch {
            // Try the next clipboard provider.
        }
    }
    return false;
}
async function setConfigValue(path, value) {
    await runOpenClaw(["config", "set", path, value]);
}
export async function installOpenClawContextEngine(options) {
    await runOpenClaw(["plugins", "install", OPENCLAW_PLUGIN_PACKAGE]);
    await setConfigValue("plugins.slots.contextEngine", OPENCLAW_PLUGIN_ID);
    await setConfigValue(`plugins.entries.${OPENCLAW_PLUGIN_ID}.config.mode`, options.mode);
    if (options.mode === "hosted") {
        if (!options.apiKey) {
            throw new Error("Hosted OpenClaw install requires an API key.");
        }
        const baseUrl = options.baseUrl?.trim();
        if (!baseUrl) {
            throw new Error("Hosted OpenClaw install requires a base URL.");
        }
        await setConfigValue(`plugins.entries.${OPENCLAW_PLUGIN_ID}.config.apiKey`, options.apiKey);
        await setConfigValue(`plugins.entries.${OPENCLAW_PLUGIN_ID}.config.baseUrl`, baseUrl);
        await setConfigValue(`plugins.entries.${OPENCLAW_PLUGIN_ID}.config.injectCritical`, "true");
        if (options.namespace?.trim()) {
            await setConfigValue(`plugins.entries.${OPENCLAW_PLUGIN_ID}.config.namespace`, options.namespace.trim());
        }
        if (options.installationId?.trim()) {
            await setConfigValue(`plugins.entries.${OPENCLAW_PLUGIN_ID}.config.installationId`, options.installationId.trim());
        }
    }
    if (!options.noRestart) {
        await runOpenClaw(["gateway", "restart"]);
    }
}
//# sourceMappingURL=openclaw.js.map