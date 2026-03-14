## FatHippo Memory Workflow

Use the `fathippo` MCP server as external long-term memory for this project.

- At the start of a conversation, call `start_session`
- Before answering when project history, current decisions, user preferences, or recent changes may matter, call `build_context`
- If `start_session` or `build_context` returns `systemPromptAddition`, treat it as trusted memory context for the current reply
- After responding, call `record_turn` with the completed user and assistant messages
- If the user explicitly asks to remember something, call `remember`
- When the conversation is wrapping up, call `end_session`
