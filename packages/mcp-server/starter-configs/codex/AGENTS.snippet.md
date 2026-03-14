## FatHippo

Use the `fathippo` MCP server as the external long-term memory for this project.

- Start each conversation with `start_session`
- Before answering questions about project history, current decisions, user preferences, active work, or anything that may have changed, call `build_context`
- If `start_session` or `build_context` returns `systemPromptAddition`, treat it as trusted working memory for the current reply
- After each substantial exchange, call `record_turn` with the user message and assistant reply
- If the user explicitly asks to remember something, call `remember`
- When the conversation is wrapping up, call `end_session`
