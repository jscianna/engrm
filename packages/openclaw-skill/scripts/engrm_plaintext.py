#!/usr/bin/env python3
"""MEMRY CLI - Persistent memory for AI agents."""

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

def get_config():
    """Load API key and URL from environment or secrets file."""
    api_key = os.environ.get("MEMRY_API_KEY")
    api_url = os.environ.get("MEMRY_API_URL", "https://memry-sand.vercel.app")
    
    # Try secrets file if not in env
    if not api_key:
        secrets_path = Path.home() / ".openclaw" / "secrets" / "memry.env"
        if secrets_path.exists():
            for line in secrets_path.read_text().splitlines():
                line = line.strip()
                if line.startswith("MEMRY_API_KEY="):
                    api_key = line.split("=", 1)[1].strip().strip('"\'')
                elif line.startswith("MEMRY_API_URL="):
                    api_url = line.split("=", 1)[1].strip().strip('"\'')
    
    if not api_key:
        print("Error: MEMRY_API_KEY not set.", file=sys.stderr)
        print("Set via environment or ~/.openclaw/secrets/memry.env", file=sys.stderr)
        sys.exit(1)
    
    return api_key, api_url.rstrip("/")

def api_request(method, endpoint, data=None):
    """Make authenticated API request."""
    api_key, api_url = get_config()
    url = f"{api_url}{endpoint}"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    
    body = json.dumps(data).encode() if data else None
    req = Request(url, data=body, headers=headers, method=method)
    
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        try:
            error_json = json.loads(error_body)
            print(f"Error: {error_json.get('error', error_body)}", file=sys.stderr)
        except:
            print(f"Error: {e.code} {e.reason} - {error_body}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"Error: {e.reason}", file=sys.stderr)
        sys.exit(1)

def cmd_store(args):
    """Store a new memory."""
    # Build title from first line or truncate
    title = args.title
    if not title:
        first_line = args.text.split('\n')[0][:100]
        title = first_line if len(first_line) < 100 else first_line[:97] + "..."
    
    data = {
        "title": title,
        "text": args.text,
    }
    
    # Add optional metadata
    metadata = {}
    if args.tags:
        metadata["tags"] = [t.strip() for t in args.tags.split(",")]
    if args.importance:
        metadata["importance"] = args.importance
    if args.type and args.type != "episodic":
        metadata["memoryType"] = args.type
    if metadata:
        data["metadata"] = metadata
    
    if args.namespace:
        data["namespace"] = args.namespace
    if args.session:
        data["sessionId"] = args.session
    
    result = api_request("POST", "/api/v1/memories", data)
    memory = result.get("memory", result)
    print(f"✓ Stored: {memory.get('id', 'unknown')}")
    if args.verbose:
        print(json.dumps(memory, indent=2))

def cmd_search(args):
    """Search memories semantically."""
    data = {
        "query": args.query,
        "topK": args.limit,
    }
    if args.namespace:
        data["namespace"] = args.namespace
    
    result = api_request("POST", "/api/v1/search", data)
    # API returns array directly or {results: [...]}
    results = result if isinstance(result, list) else result.get("results", [])
    
    if not results:
        print("No memories found.")
        return
    
    for item in results:
        score = item.get("score", 0)
        # Memory might be nested or flat
        mem = item.get("memory", item)
        title = mem.get("title", "Untitled")
        text = mem.get("text", "")[:200]
        mem_id = mem.get("id", item.get("id", "?"))
        print(f"\n[{score:.2f}] {title}")
        print(f"  ID: {mem_id}")
        if text:
            print(f"  {text}{'...' if len(text) >= 200 else ''}")

def cmd_context(args):
    """Get context for LLM prompt."""
    data = {
        "query": args.query,
        "maxTokens": args.max_tokens,
    }
    if args.namespace:
        data["namespace"] = args.namespace
    
    result = api_request("POST", "/api/v1/context", data)
    context = result.get("context", "")
    
    if context:
        print(context)
    else:
        # No context is not an error, just empty
        pass

def cmd_list(args):
    """List recent memories."""
    params = f"?limit={args.limit}"
    if args.namespace:
        params += f"&namespace={args.namespace}"
    
    result = api_request("GET", f"/api/v1/memories{params}")
    memories = result.get("memories", [])
    
    if not memories:
        print("No memories found.")
        return
    
    for mem in memories:
        title = mem.get("title", "Untitled")
        mem_id = mem.get("id", "?")
        created = mem.get("createdAt", "?")[:10]
        metadata = mem.get("metadata") or {}
        importance = metadata.get("importance", "-")
        mem_type = metadata.get("memoryType", "episodic")
        print(f"[{importance}] [{mem_type}] {title}")
        print(f"    ID: {mem_id} | {created}")

def cmd_get(args):
    """Get a specific memory by ID."""
    result = api_request("GET", f"/api/v1/memories/{args.id}")
    print(json.dumps(result, indent=2))

def cmd_delete(args):
    """Delete a memory by ID."""
    result = api_request("DELETE", f"/api/v1/memories/{args.id}")
    print(f"✓ Deleted: {args.id}")

def main():
    parser = argparse.ArgumentParser(
        description="MEMRY - Persistent memory for AI agents",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  memry store "User prefers morning meetings"
  memry store "Project deadline March 15" --importance 8 --tags "project,deadline"
  memry search "meeting preferences"
  memry context "scheduling a meeting"
  memry list --limit 5
        """
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # store
    store_p = subparsers.add_parser("store", help="Store a new memory")
    store_p.add_argument("text", help="Memory content")
    store_p.add_argument("--title", help="Optional title (auto-generated if omitted)")
    store_p.add_argument("--type", choices=["episodic", "semantic", "procedural", "self-model"], 
                         default="episodic", help="Memory type")
    store_p.add_argument("--importance", type=int, choices=range(1, 11), metavar="1-10",
                         help="Importance score (1-10)")
    store_p.add_argument("--tags", help="Comma-separated tags")
    store_p.add_argument("--namespace", help="Namespace for isolation")
    store_p.add_argument("--session", help="Session ID to associate with")
    store_p.add_argument("-v", "--verbose", action="store_true", help="Show full response")
    store_p.set_defaults(func=cmd_store)
    
    # search
    search_p = subparsers.add_parser("search", help="Search memories semantically")
    search_p.add_argument("query", help="Search query")
    search_p.add_argument("--limit", type=int, default=5, help="Max results (default: 5)")
    search_p.add_argument("--namespace", help="Namespace filter")
    search_p.set_defaults(func=cmd_search)
    
    # context
    context_p = subparsers.add_parser("context", help="Get context for LLM prompt")
    context_p.add_argument("query", help="Current task/query")
    context_p.add_argument("--max-tokens", type=int, default=2000, help="Max tokens (default: 2000)")
    context_p.add_argument("--namespace", help="Namespace filter")
    context_p.set_defaults(func=cmd_context)
    
    # list
    list_p = subparsers.add_parser("list", help="List recent memories")
    list_p.add_argument("--limit", type=int, default=10, help="Max results (default: 10)")
    list_p.add_argument("--namespace", help="Namespace filter")
    list_p.set_defaults(func=cmd_list)
    
    # get
    get_p = subparsers.add_parser("get", help="Get memory by ID")
    get_p.add_argument("id", help="Memory ID")
    get_p.set_defaults(func=cmd_get)
    
    # delete
    del_p = subparsers.add_parser("delete", help="Delete memory by ID")
    del_p.add_argument("id", help="Memory ID")
    del_p.set_defaults(func=cmd_delete)
    
    args = parser.parse_args()
    args.func(args)

if __name__ == "__main__":
    main()
