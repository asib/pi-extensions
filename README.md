# pi-extensions

Personal extensions for [pi](https://github.com/earendil-works/pi).

## Extensions

### `plan-mode/`

Read-only planning mode with `/plan`, `Tab`, and `Ctrl+Alt+P` toggles. Disables write tools while planning, extracts numbered plan steps, and tracks plan execution progress.

### `inline-footer.ts`

Custom footer replacement that renders plan/build state inline with token, cache, context, model, and thinking-level information.

## Install

Copy or symlink extensions into your pi user extensions directory:

```bash
mkdir -p ~/.pi/agent/extensions
cp -R plan-mode ~/.pi/agent/extensions/
cp inline-footer.ts ~/.pi/agent/extensions/
```

Then run `/reload` in pi or restart pi.
