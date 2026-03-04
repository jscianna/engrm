"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CodeBlock({ 
  children, 
  language = "bash",
  title,
}: { 
  children: string; 
  language?: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-4">
      {title && (
        <div className="px-4 py-2 bg-zinc-800 border border-zinc-700 border-b-0 rounded-t-lg text-sm text-zinc-400">
          {title}
        </div>
      )}
      <pre className={`bg-zinc-900 border border-zinc-800 ${title ? 'rounded-b-lg' : 'rounded-lg'} p-4 overflow-x-auto text-sm`}>
        <code className="text-zinc-300 font-mono">{children}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

export function Note({ 
  children, 
  type = "info" 
}: { 
  children: React.ReactNode; 
  type?: "info" | "warning" | "tip" 
}) {
  const styles = {
    info: "border-cyan-500/30 bg-cyan-500/5",
    warning: "border-amber-500/30 bg-amber-500/5",
    tip: "border-emerald-500/30 bg-emerald-500/5",
  };
  const labels = {
    info: "Note",
    warning: "Warning",
    tip: "Tip",
  };
  return (
    <div className={`border-l-4 ${styles[type]} p-4 rounded-r-lg my-4`}>
      <p className="text-sm font-semibold text-zinc-400 mb-1">{labels[type]}</p>
      <div className="text-zinc-300 text-sm">{children}</div>
    </div>
  );
}

export function Table({ 
  headers, 
  rows 
}: { 
  headers: string[]; 
  rows: (string | React.ReactNode)[][] 
}) {
  return (
    <div className="overflow-x-auto my-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
            {headers.map((h, i) => (
              <th key={i} className="text-left py-3 px-4 text-zinc-400 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
              {row.map((cell, j) => (
                <td key={j} className="py-3 px-4 text-zinc-300">
                  {j === 0 && typeof cell === 'string' ? (
                    <code className="text-cyan-400 bg-zinc-900 px-1.5 py-0.5 rounded">{cell}</code>
                  ) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Endpoint({
  method,
  path,
  description,
}: {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  description?: string;
}) {
  const methodColors = {
    GET: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    POST: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    PUT: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    DELETE: "bg-red-500/10 text-red-400 border-red-500/30",
    PATCH: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  };

  return (
    <div className="flex items-center gap-3 my-4 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
      <span className={`px-2 py-1 text-xs font-mono font-bold rounded border ${methodColors[method]}`}>
        {method}
      </span>
      <code className="text-zinc-300 font-mono text-sm">{path}</code>
      {description && <span className="text-zinc-500 text-sm ml-auto">{description}</span>}
    </div>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="text-4xl font-bold mb-4">{children}</h1>;
}

export function H2({ children, id }: { children: React.ReactNode; id?: string }) {
  return <h2 id={id} className="text-3xl font-bold mb-4 mt-12 scroll-mt-20">{children}</h2>;
}

export function H3({ children, id }: { children: React.ReactNode; id?: string }) {
  return <h3 id={id} className="text-xl font-semibold mb-4 mt-8 scroll-mt-20">{children}</h3>;
}

export function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={className || "text-zinc-400 mb-4 leading-relaxed"}>{children}</p>;
}

export function InlineCode({ children }: { children: React.ReactNode }) {
  return <code className="text-cyan-400 bg-zinc-900 px-1.5 py-0.5 rounded text-sm">{children}</code>;
}

export function Footer() {
  return (
    <footer className="border-t border-zinc-800 pt-8 mt-16">
      <p className="text-zinc-500 text-sm">
        Built by <a href="https://x.com/scianna" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">John Scianna</a>.
        Open source on <a href="https://github.com/jscianna/engrm" className="text-cyan-400 hover:underline">GitHub</a>.
      </p>
    </footer>
  );
}
