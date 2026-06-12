# Autonomy Boundaries

Chrome MCP Bridge gives agents a capable local browser surface, but it should not silently become an unattended browser operator for a real logged-in Chrome profile.

## Current Supported Model

The supported high-level action model is intentionally bounded:

- `act-preview` is read-only. It inspects the current page and proposes deterministic low-level actions with selectors, risks, and exact command suggestions.
- `act-apply` executes exactly one deterministic action from a previous preview, requires explicit confirmation, rejects stale previews, and then stops.
- After `act-apply`, the next step should be a read such as `observe`, `snapshot`, `text`, `screenshot`, or `diagnostics`.

This keeps high-level action execution auditable. The bridge can help an agent choose and apply a next action, but it does not loop until a goal is complete.

## Hard Boundaries

- full autonomous agent-run is research-only.
- No multi-step mutation loop is implemented in this release.
- There are no remote LLM calls inside the bridge.
- There is no self-approval of `confirmed` or `confirmSensitive` gates.
- Agents must not submit forms, send messages, make purchases, change account settings, delete data, upload files, or expose private browser data unless the user explicitly asked for that scoped action.
- Sensitive reads still require `confirmSensitive` even if the caller is using an action preview flow.

## Future Bounded Loop Requirements

If a future release considers an autonomous loop, it needs a separate design and verification track before implementation:

- max steps per run
- max sites or same-origin policy
- explicit allowlist for cross-site workflows
- checkpoint prompts before sensitive or mutating steps
- forbidden-action classification for submit, send, purchase, delete, publish, credential, payment, and account-setting flows
- no self-approval of confirmations
- emergency stop
- full local audit log
- per-run artifact directory with bounded stdout
- no private-data reads without a separate sensitive confirmation

Until those requirements are implemented and tested, agents should compose existing single-step tools themselves and ask the user at human-risk boundaries.

## Recommended Agent Pattern

1. Read first with `observe`, `snapshot`, `text`, or `find-elements`.
2. Use `act-preview` when the next action is ambiguous.
3. Show the proposed deterministic action to the user when it mutates page state.
4. Call `act-apply` with `confirmed: true` only for the selected preview.
5. Stop after the apply result and read again before deciding the next step.

This pattern keeps Chrome MCP Bridge useful for agentic work while preserving user control over a real browser profile.
