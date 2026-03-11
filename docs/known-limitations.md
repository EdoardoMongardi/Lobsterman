# Known Limitations

Documented boundaries and trade-offs in Lobsterman v1.

## Session-Level Monitoring

Lobsterman monitors one session at a time. There is no cross-session correlation, historical trending, or multi-session dashboard. When a new session starts, state resets.

## Limited Level 2 Verification

Independent verification (Level 2) is currently limited to:
- **File write**: checks that the file exists and is non-empty
- **File delete**: checks that the file path is gone

Only paths inside `LOBSTERMAN_PROJECT_ROOT` are verified. Paths outside the root boundary are logged but skipped.

### Not Verified

- File content correctness (e.g., did the agent write valid JSON?)
- Partial writes or truncated files
- Network requests, API calls, registry modifications
- System state changes (environment variables, running processes)
- Git operations beyond file existence

## No Universal Side-Effect Verification

Lobsterman cannot verify that arbitrary commands had their intended effect. For example:
- `npm install` succeeded but installed wrong version → not caught
- `git push` ran but was rejected → not caught unless error event received
- `curl` made a request but the response was wrong → invisible

## No Control Plane in v1

Lobsterman **monitors and alerts**. It does not:
- Block or intercept agent actions
- Pause execution
- Roll back changes
- Gate actions on operator approval

The "recommended action" in the dashboard is advisory only.

## Live-Only Verification

Verification runs at the moment `tool_result` arrives. There is no retroactive verification or periodic re-checks. If Lobsterman starts after the agent has already acted, those actions are not verified.

Pending verifications expire after 30 seconds if no matching `tool_result` arrives.

## Single-Operator Model

Lobsterman sends all notifications to a single Telegram chat ID. There is no multi-user support, role-based access, or notification routing.

## Dependency on OpenClaw Format

Lobsterman parses OpenClaw's JSONL transcript format. It is not agent-agnostic. Supporting other agent frameworks would require new ingestion adapters.

## Known False Positives

- **osascript Trash operations**: Correctly flags as destructive, but the "destructive" label may alarm operators when the file is simply moved to Trash (recoverable)
- **mkdir -p outside root**: Creating directories outside root triggers outside-root alert even for benign operations like `mkdir -p ~/.config/some-tool`
- **Repeated tool calls with different semantics**: Calling the same tool on the same target with different parameters (e.g., different file content) may trigger the looping rule

## Warmup Period

When Lobsterman starts in Telegram mode, the first detected session's historical events are processed with alert suppression ("warmup"). This prevents stale alerts from flooding the operator. However, it means Lobsterman cannot retroactively flag dangerous actions from before it started monitoring.
