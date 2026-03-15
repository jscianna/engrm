import { CodeBlock, Note, H1, H2, H3, P, InlineCode, Footer } from "../../components";

export const metadata = {
  title: "OpenClaw Integration | FatHippo Docs",
  description: "Add persistent memory to OpenClaw agents.",
};

export default function OpenClawGuidePage() {
  return (
    <>
      <H1>OpenClaw Integration</H1>
      <P>
        FatHippo plugs into OpenClaw as a context engine. Hosted mode now builds memory context before every non-trivial
        reply and records the completed exchange after the reply, while local mode follows the same turn rhythm entirely
        on-device.
      </P>

      <H2 id="recommended">Recommended Install</H2>
      <P>
        The default path is the interactive one-command installer. It installs the plugin, lets you choose your plan,
        handles configuration, and restarts OpenClaw for you.
      </P>

      <CodeBlock language="bash">{`npx @fathippo/connect openclaw`}</CodeBlock>

      <P>
        The installer prompts you to choose how you want to use FatHippo:
      </P>

      <CodeBlock language="text">{`How do you want to use FatHippo?

  [1] Free (local-only) — memories stay on your machine, no account needed
  [2] Hosted ($9.99/mo) — cloud sync, cognitive features, cross-device memory

Choose [1/2]:`}</CodeBlock>

      <H3>Plans</H3>
      <ul className="mb-4 list-inside list-disc space-y-2 text-zinc-400">
        <li><strong>Free (Local-Only) — $0/month:</strong> on-device memory, cross-session context recall, lightweight fix/workflow reuse, works offline, no account required.</li>
        <li><strong>Hosted — $9.99/month or $99.99/year (save 17%):</strong> everything in Free, plus cloud sync across devices, cognitive traces &amp; pattern extraction, skill synthesis, dashboard with receipts &amp; analytics, plugin version management, and priority support.</li>
      </ul>

      <Note type="tip">
        You can also pass <InlineCode>--local</InlineCode> or <InlineCode>--hosted</InlineCode> to skip the interactive
        prompt: <InlineCode>npx @fathippo/connect openclaw --local</InlineCode>
      </Note>

      <H2 id="manual">Manual Fallback</H2>
      <P>
        If you need a manual path for a locked-down environment, you can still install the plugin directly and paste an
        API key yourself.
      </P>

      <CodeBlock language="bash">{`openclaw plugins install @fathippo/fathippo-context-engine
openclaw config set plugins.slots.contextEngine fathippo-context-engine
openclaw config set plugins.entries.fathippo-context-engine.config.mode hosted
openclaw config set plugins.entries.fathippo-context-engine.config.apiKey mem_your_key
openclaw config set plugins.entries.fathippo-context-engine.config.baseUrl https://fathippo.ai/api
openclaw gateway restart`}</CodeBlock>

      <H2 id="behavior">Runtime Behavior</H2>
      <ul className="mb-4 list-inside list-disc space-y-2 text-zinc-400">
        <li><strong>Per-turn retrieval:</strong> hosted mode calls the FatHippo runtime context path before every non-trivial reply.</li>
        <li><strong>Full-turn capture:</strong> the completed exchange is recorded after the reply, not one message at a time.</li>
        <li><strong>Local parity:</strong> local mode retrieves before reply and persists after the completed turn on-device.</li>
        <li><strong>Compaction:</strong> hosted mode still uses Dream Cycle on compaction when enabled.</li>
        <li><strong>Subagents:</strong> FatHippo keeps the same OpenClaw memory scope across spawned sessions and best-effort closes hosted sessions when possible.</li>
      </ul>

      <H2 id="config">Configuration</H2>
      <P>
        New installs should not set <InlineCode>captureUserOnly</InlineCode>. Full-turn capture is now the default. Keep
        <InlineCode>captureUserOnly: true</InlineCode> only if you explicitly want the older conservative behavior.
      </P>

      <CodeBlock language="json">{`{
  "plugins": {
    "slots": {
      "contextEngine": "fathippo-context-engine"
    },
    "entries": {
      "fathippo-context-engine": {
        "enabled": true,
        "config": {
          "mode": "hosted",
          "apiKey": "mem_your_key",
          "baseUrl": "https://fathippo.ai/api",
          "namespace": "my-project",
          "installationId": "oc_machine_01",
          "injectCritical": true,
          "injectLimit": 20,
          "dreamCycleOnCompact": true,
          "hippoNodsEnabled": true
        }
      }
    }
  }
}`}</CodeBlock>

      <Note type="tip">
        If you share one FatHippo namespace across OpenClaw, Codex, Claude, or Cursor, they can all retrieve from the
        same project memory graph.
      </Note>

      <H2 id="workflow">What OpenClaw Does For You</H2>
      <H3>Before The Reply</H3>
      <CodeBlock language="text">{`FatHippo runtime:
- memory context from /v1/simple/context
- indexed summaries
- active constraints
- cognitive traces/patterns for coding-like requests`}</CodeBlock>

      <H3>After The Reply</H3>
      <CodeBlock language="text">{`FatHippo runtime:
- records the completed turn
- extracts durable memories from the exchange
- updates or merges existing memories when needed
- stores constraints detected from the turn
- captures a coding trace when the exchange looks like a real fix flow`}</CodeBlock>

      <H2 id="compatibility">Compatibility Notes</H2>
      <ul className="mb-4 list-inside list-disc space-y-2 text-zinc-400">
        <li><strong>Legacy behavior:</strong> <InlineCode>captureUserOnly: true</InlineCode> is still supported as an opt-out.</li>
        <li><strong>Package name:</strong> OpenClaw should install <InlineCode>@fathippo/fathippo-context-engine</InlineCode>.</li>
        <li><strong>One-command install:</strong> <InlineCode>@fathippo/connect</InlineCode> stays a separate package so the command remains clean.</li>
      </ul>

      <Footer />
    </>
  );
}
