# pi-extensions

Personal extensions for [pi](https://github.com/earendil-works/pi).

## Extensions

### `plan-mode/`

Read-only planning and discussion modes with `/plan`, `/discuss`, and `Tab`/`Ctrl+Alt+P` cycling through build → plan → discuss. Disables write tools while planning or discussing, extracts numbered plan steps in plan mode, and tracks plan execution progress.

### `inline-footer.ts`

Custom footer replacement that renders plan/discuss/build state inline with token, cache, context, model, and thinking-level information.

## Install

Copy or symlink extensions into your pi user extensions directory:

```bash
mkdir -p ~/.pi/agent/extensions
cp -R plan-mode ~/.pi/agent/extensions/
cp inline-footer.ts ~/.pi/agent/extensions/
```

Then run `/reload` in pi or restart pi.
