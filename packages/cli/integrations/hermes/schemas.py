"""FatHippo tool schemas — what the LLM sees."""

RECALL = {
    "name": "fathippo_recall",
    "description": (
        "Recall relevant context from FatHippo memory. Use this before answering "
        "questions about prior work, decisions, preferences, people, or project history. "
        "Also use at session start to warm context. Returns ranked memories with scores. "
        "Works across all agent platforms — memories stored in Hermes, OpenClaw, Claude Code, "
        "Cursor, or any connected agent are all searchable."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Natural language query to search memories (e.g., 'what did we decide about the auth system?')",
            },
            "limit": {
                "type": "integer",
                "description": "Maximum number of memories to return (default: 5, max: 20)",
            },
        },
        "required": ["query"],
    },
}

REMEMBER = {
    "name": "fathippo_remember",
    "description": (
        "Store a synthesized insight in FatHippo memory. Use this to persist important "
        "decisions, preferences, corrections, project context, or lessons learned. "
        "Store insights, not raw transcripts — distill what matters. "
        "These memories will be available across all connected agent platforms."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "text": {
                "type": "string",
                "description": "The insight to store (e.g., 'User prefers snake_case. Always use early returns.')",
            },
            "title": {
                "type": "string",
                "description": "Optional short title for the memory",
            },
        },
        "required": ["text"],
    },
}

CONTEXT = {
    "name": "fathippo_context",
    "description": (
        "Get relevant context for the current conversation. Pass the user's message "
        "and FatHippo returns memories that are contextually relevant. Use this when "
        "you need background context but don't have a specific search query. "
        "Lighter weight than fathippo_recall — returns pre-ranked, ready-to-use context."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "message": {
                "type": "string",
                "description": "The current user message or conversation context to find relevant memories for",
            },
        },
        "required": ["message"],
    },
}
