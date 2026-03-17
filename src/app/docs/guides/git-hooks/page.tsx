import { CodeBlock, Note, Table, H1, H2, H3, P, InlineCode, Footer } from "../../components";

export const metadata = {
  title: "Git Hooks | FatHippo Docs",
  description: "Auto-capture git commits to FatHippo memory with the post-commit hook.",
};

export default function GitHooksPage() {
  return (
    <>
      <H1>Git Hooks</H1>
      <P>
        FatHippo can automatically capture every git commit to memory. A lightweight
        post-commit hook records the repo, branch, commit message, files changed, and
        diff stats — giving your AI agents full awareness of project history without
        any manual effort.
      </P>

      <H2 id="install">Installation</H2>
      <P>
        Run this from inside any git repository:
      </P>
      <CodeBlock language="bash">{`npx @fathippo/connect hooks install`}</CodeBlock>
      <P>
        That's it. Every commit in this repo will now be captured to FatHippo memory.
      </P>

      <Note type="tip">
        The hook chains with existing post-commit hooks — it appends to an existing
        hook file rather than overwriting it. Safe to run in repos with other hooks.
      </Note>

      <H2 id="removal">Removal</H2>
      <P>
        To remove the FatHippo hook while preserving any other hooks:
      </P>
      <CodeBlock language="bash">{`npx @fathippo/connect hooks remove`}</CodeBlock>
      <P>
        If FatHippo was the only hook, the file is deleted entirely. If other hooks
        exist, only the FatHippo section is removed.
      </P>

      <H2 id="captured">What Gets Captured</H2>
      <P>
        Each commit creates a memory entry with the following data:
      </P>
      <Table
        headers={["Field", "Example", "Description"]}
        rows={[
          ["Repository", "fathippo", "Name of the git repo"],
          ["Branch", "main", "Current branch at commit time"],
          ["Commit message", "fix: handle null API key", "The full commit subject line"],
          ["Files changed", "src/index.ts, README.md", "Up to 20 modified files"],
          ["Diff stats", "3 files changed, 42 insertions(+), 7 deletions(-)", "Summary line from git diff --stat"],
          ["Hash", "a1b2c3d4", "Short commit hash (first 8 chars)"],
        ]}
      />

      <P>
        The memory text looks like:
      </P>
      <CodeBlock language="text">{`[Git commit] fathippo/main: fix: handle null API key | Files: src/index.ts, README.md, | Stats: 2 files changed, 12 insertions(+), 3 deletions(-) | Hash: a1b2c3d4`}</CodeBlock>

      <H2 id="how-it-works">How It Works</H2>
      <P>
        The hook is a shell script appended to <InlineCode>.git/hooks/post-commit</InlineCode>.
        Here's what happens on each commit:
      </P>
      <ul className="list-disc list-inside text-zinc-400 space-y-2 mb-4">
        <li>The hook runs <strong>in the background</strong> (forked with <InlineCode>&amp;</InlineCode>) — it does not slow down your commits</li>
        <li>It gathers commit metadata using standard git commands</li>
        <li>It sends a single <InlineCode>POST /v1/simple/remember</InlineCode> request to FatHippo</li>
        <li>All output is suppressed — the hook is silent on success and failure</li>
        <li>If the API key is missing or the request fails, the hook exits silently</li>
      </ul>

      <Note>
        The hook has zero dependencies beyond <InlineCode>curl</InlineCode> and <InlineCode>git</InlineCode>,
        both of which are available on any development machine. No Node.js required at runtime.
      </Note>

      <H2 id="requirements">Requirements</H2>
      <P>
        The hook needs a FatHippo API key available through one of these methods:
      </P>
      <Table
        headers={["Method", "Details"]}
        rows={[
          ["Environment variable", "Set FATHIPPO_API_KEY in your shell profile"],
          ["Config file", "Store in ~/.fathippo/config.json as {\"apiKey\": \"mem_...\"}"],
        ]}
      />

      <P>
        If no API key is found at commit time, the hook exits silently without sending anything.
      </P>

      <H3>Setting up the API key</H3>
      <CodeBlock language="bash">{`# Option 1: Environment variable (add to ~/.bashrc or ~/.zshrc)
export FATHIPPO_API_KEY="mem_your_api_key"

# Option 2: Config file
mkdir -p ~/.fathippo
echo '{"apiKey": "mem_your_api_key"}' > ~/.fathippo/config.json`}</CodeBlock>

      <H2 id="custom-base-url">Custom Base URL</H2>
      <P>
        If you're using a self-hosted FatHippo instance, set the base URL before installing:
      </P>
      <CodeBlock language="bash">{`export FATHIPPO_BASE_URL="https://your-instance.example.com/api"
npx @fathippo/connect hooks install`}</CodeBlock>

      <H2 id="faq">FAQ</H2>

      <H3>Does this slow down my commits?</H3>
      <P>
        No. The hook forks to a background process immediately. Your commit completes
        instantly while the API call happens asynchronously.
      </P>

      <H3>Will it overwrite my existing post-commit hook?</H3>
      <P>
        No. If a post-commit hook already exists, FatHippo appends its section to the
        end. Both hooks run. The FatHippo section is clearly marked with start/end
        comments for clean removal.
      </P>

      <H3>What happens if the API is down?</H3>
      <P>
        The hook fails silently. Your git workflow is never affected by FatHippo
        availability. The curl request has no timeout override, so it uses the system
        default and all output goes to <InlineCode>/dev/null</InlineCode>.
      </P>

      <H3>Can I use this with the MCP server?</H3>
      <P>
        Yes. The hook stores commits via the Simple API, which shares the same memory
        graph that the MCP server's <InlineCode>search</InlineCode> and <InlineCode>build_context</InlineCode> tools
        query. Your coding agent will automatically see relevant commit history when
        it calls <InlineCode>get_cognitive_context</InlineCode>.
      </P>

      <Footer />
    </>
  );
}
