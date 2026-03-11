# SIGKILL Runbook

## What SIGKILL usually means
Process was force-terminated by runtime/OS watchdog (time/memory/resource cap).

## Immediate Response
1. Capture last logs/output.
2. Checkpoint any saved files.
3. Retry with:
   - smaller scope
   - lower parallelism
   - shorter runtime window

## Data to Collect
- Duration before kill
- Parallel substep count
- Approx context/token growth
- Host memory pressure (if available)
- Last 20 lines before SIGKILL

## Retry Policy
- Attempt 1: parallel=2
- Attempt 2: parallel=1 + split task in half
- Attempt 3: switch orchestrator model for the step

## Prevention
- Commit after every step
- Use staged backlog (P0 step 1/2/3)
- Keep request wall-time <=10 min
