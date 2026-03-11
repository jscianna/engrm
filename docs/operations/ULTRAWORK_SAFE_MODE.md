# Ultrawork Safe Mode

## Defaults
- Max parallel substeps: **2** (max 3)
- Context target: **64K–128K**
- Max request wall-time: **<=10 min**
- Checkpoint cadence: **every 10–15 min**
- Retry on SIGKILL: exponential backoff + reduce parallelism by 1

## Run Pattern
1. Break work into small, independent steps.
2. Run one step at a time.
3. After each step: `git add -A && git commit -m "checkpoint: ..." && git push`.
4. If SIGKILL: resume from latest checkpoint only.

## Command Template
```bash
opencode run "ultrawork <single-step scoped task>"
```

## Do / Don’t
- ✅ Keep scope narrow and measurable.
- ✅ Prefer sequential phases over wide fanout.
- ❌ Don’t run multi-hour monolithic prompts.
- ❌ Don’t batch unrelated features into one ultrawork run.
