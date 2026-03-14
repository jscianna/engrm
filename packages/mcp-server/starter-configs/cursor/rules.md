Use the `fathippo` MCP server as this workspace's shared long-term memory.

- Start each chat session with `start_session`
- Call `build_context` before answering questions that may depend on project history, user preferences, or recent changes
- If `start_session` or `build_context` returns `systemPromptAddition`, use it as trusted memory context for the current reply
- After each substantial exchange, call `record_turn`
- If the user explicitly asks to remember something, call `remember`
- End the session with `end_session` when the conversation wraps up
