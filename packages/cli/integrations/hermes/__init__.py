"""FatHippo plugin for Hermes Agent — cross-agent memory."""

import json
import logging

from . import schemas, tools

logger = logging.getLogger(__name__)

# Track tool calls for passive insight capture
_session_tool_log = []
_IMPORTANT_TOOLS = {
    "write_file", "create_file", "edit_file", "replace_file",
    "terminal", "bash", "shell",
    "git_commit", "git_push",
    "delegate_task",
}


def _on_post_tool_call(tool_name, args, result, task_id, **kwargs):
    """Hook: capture important tool calls for passive insight storage.

    After significant actions (file writes, terminal commands, git ops),
    we silently store a condensed trace to FatHippo so the agent
    remembers what it did across sessions.
    """
    if tool_name in _IMPORTANT_TOOLS:
        _session_tool_log.append({
            "tool": tool_name,
            "args_summary": _summarize_args(args),
            "session": task_id,
        })

        # Batch store every 10 significant actions
        if len(_session_tool_log) >= 10:
            _flush_tool_log()


def _on_session_end(session_id, platform, **kwargs):
    """Hook: flush any remaining tool traces at session end."""
    if _session_tool_log:
        _flush_tool_log()


def _summarize_args(args):
    """Extract a short summary of tool args without leaking full content."""
    if not args:
        return ""
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except (json.JSONDecodeError, TypeError):
            return args[:100]
    summary = {}
    for key in ("path", "file_path", "command", "query", "message"):
        if key in args:
            val = str(args[key])
            summary[key] = val[:120] if len(val) > 120 else val
    return json.dumps(summary) if summary else str(args)[:100]


def _flush_tool_log():
    """Store batched tool traces to FatHippo."""
    global _session_tool_log
    if not _session_tool_log:
        return

    log_copy = _session_tool_log[:]
    _session_tool_log = []

    # Build a concise summary
    actions = []
    for entry in log_copy:
        actions.append(f"{entry['tool']}: {entry['args_summary']}")
    summary = "Session activity trace:\n" + "\n".join(actions)

    try:
        tools.fathippo_remember({"text": summary[:1500]})
    except Exception as e:
        logger.debug("FatHippo flush failed: %s", e)


def register(ctx):
    """Wire FatHippo tools and hooks into Hermes."""
    # Tools
    ctx.register_tool(
        name="fathippo_recall",
        toolset="fathippo",
        schema=schemas.RECALL,
        handler=tools.fathippo_recall,
    )
    ctx.register_tool(
        name="fathippo_remember",
        toolset="fathippo",
        schema=schemas.REMEMBER,
        handler=tools.fathippo_remember,
    )
    ctx.register_tool(
        name="fathippo_context",
        toolset="fathippo",
        schema=schemas.CONTEXT,
        handler=tools.fathippo_context,
    )

    # Hooks — passive insight capture
    ctx.register_hook("post_tool_call", _on_post_tool_call)
    ctx.register_hook("on_session_end", _on_session_end)

    logger.info("FatHippo plugin loaded — 3 tools, 2 hooks")
