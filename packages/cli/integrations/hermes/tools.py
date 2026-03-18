"""FatHippo tool handlers — pure stdlib, no pip dependencies."""

import json
import os
import urllib.request
import urllib.error
import logging

logger = logging.getLogger(__name__)

_BASE_URL = "https://fathippo.ai/api"
_API_KEY = os.environ.get("FATHIPPO_API_KEY", "")


def _request(path, body):
    """Make a POST request to the FatHippo API. Returns parsed JSON or error dict."""
    url = f"{_BASE_URL}/v1/simple{path}"
    headers = {
        "Authorization": f"Bearer {_API_KEY}",
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode("utf-8")

    try:
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body_text = ""
        try:
            body_text = e.read().decode("utf-8", errors="replace")[:200]
        except Exception:
            pass
        return {"error": f"HTTP {e.code}: {body_text}"}
    except urllib.error.URLError as e:
        return {"error": f"Connection failed: {e.reason}"}
    except Exception as e:
        return {"error": f"Request failed: {e}"}


def fathippo_recall(args, **kwargs):
    """Search memories by query."""
    query = args.get("query", "").strip()
    if not query:
        return json.dumps({"error": "No query provided"})

    limit = min(int(args.get("limit", 5)), 20)
    result = _request("/recall", {"query": query, "limit": limit})

    if "error" in result:
        return json.dumps(result)

    # Format memories for the agent
    memories = result.get("memories", result.get("results", []))
    formatted = []
    for mem in memories:
        entry = {
            "content": mem.get("content", mem.get("text", "")),
            "score": mem.get("score", mem.get("relevance", 0)),
        }
        if mem.get("title"):
            entry["title"] = mem["title"]
        if mem.get("created_at"):
            entry["created_at"] = mem["created_at"]
        formatted.append(entry)

    return json.dumps({"memories": formatted, "count": len(formatted)})


def fathippo_remember(args, **kwargs):
    """Store a synthesized insight."""
    text = args.get("text", "").strip()
    if not text:
        return json.dumps({"error": "No text provided"})

    body = {"text": text}
    if args.get("title"):
        body["title"] = args["title"]

    result = _request("/remember", body)

    if "error" in result:
        return json.dumps(result)

    return json.dumps({
        "status": "stored",
        "id": result.get("id", result.get("memory_id", "unknown")),
    })


def fathippo_context(args, **kwargs):
    """Get relevant context for a message."""
    message = args.get("message", "").strip()
    if not message:
        return json.dumps({"error": "No message provided"})

    result = _request("/context", {"message": message})

    if "error" in result:
        return json.dumps(result)

    # Pass through the context response
    context = result.get("context", result.get("memories", []))
    if isinstance(context, list):
        formatted = []
        for mem in context:
            entry = {
                "content": mem.get("content", mem.get("text", "")),
                "score": mem.get("score", mem.get("relevance", 0)),
            }
            if mem.get("title"):
                entry["title"] = mem["title"]
            formatted.append(entry)
        return json.dumps({"context": formatted, "count": len(formatted)})

    # If context is a string (pre-formatted), pass through
    return json.dumps({"context": context})
