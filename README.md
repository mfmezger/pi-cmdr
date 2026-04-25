# pi-cmdr

A [pi coding agent](https://pi.dev) extension that opens a searchable command picker when you type `$` in the editor.

Use it for prompts you type often, such as shipping a PR or handling review feedback, without turning every workflow into a slash command or skill.

## What it does

- Type `$` to open the command picker.
- Keep typing to filter commands by category, title, tags, description, and prompt text.
- Use `↑` / `↓` or `ctrl+p` / `ctrl+n` to move through results.
- Press `Enter` to send the selected command immediately.
- Press `Tab` to insert the selected command without sending.
- Press `alt+enter` or `ctrl+enter` to send the selected command immediately.
- Press `Escape` to close the picker.

## Install

From npm:

```bash
pi install npm:pi-cmdr
```

From GitHub:

```bash
pi install git:github.com/mfmezger/pi-cmdr
```

For local development from this checkout:

```bash
npm install
npm run check
pi -e ./src/index.ts
```

## Configuration

`pi-cmdr` loads commands from built-in defaults, then merges config files in this order:

1. Global legacy files: `~/.pi/agent/cmdr.json`, `~/.pi/agent/cmdr.yaml`, `~/.pi/agent/cmdr.yml`
2. Global extension-scoped files: `~/.pi/agent/extensions/cmdr.json`, `~/.pi/agent/extensions/cmdr.yaml`, `~/.pi/agent/extensions/cmdr.yml`
3. Project legacy files: `.pi/cmdr.json`, `.pi/cmdr.yaml`, `.pi/cmdr.yml`
4. Project extension-scoped files: `.pi/extensions/cmdr.json`, `.pi/extensions/cmdr.yaml`, `.pi/extensions/cmdr.yml`

Commands are merged by `id`; later files override earlier files. In practice, project commands override global commands, and global commands override built-in defaults. YAML is recommended for hand-edited command files; JSON remains supported for compatibility.

Example `cmdr.yaml`:

```yaml
trigger: $
enterAction: send
commands:
  - id: git-ship-pr
    category: Git
    title: Create branch, commit, push, and open PR
    description: Use commit and github-pr skills to ship current work.
    tags: [git, branch, commit, push, pr, github]
    prompt: >-
      Please create a new branch for the current changes, use the commit skill to
      make an appropriate commit, push the branch, and then use the github-pr
      skill to open a GitHub PR. Keep the scope tight and summarize what you did.
```

See [`examples/cmdr.yaml`](examples/cmdr.yaml) for a copyable YAML config. The older [`examples/cmdr.json`](examples/cmdr.json) format is still supported.

## Command fields

Required:

- `id`: stable unique identifier used for overriding/merging
- `title`: display title
- `prompt`: text inserted or sent to pi

Optional:

- `category`: display grouping, e.g. `Git` or `Review`
- `description`: shown in the picker
- `tags`: extra search terms
- `defaultAction`: `insert` or `send`; overrides top-level `enterAction` for this command

## Diagnostics

Run this inside pi:

```text
/cmdr
```

It inserts a small status report into the editor with loaded command count, config paths, trigger, enter action, and any config warnings.

## Notes

- The default trigger is `$`. If you also use `pi-skill-searcher`, configure one extension to use a different trigger.
- `$5` is ignored so normal dollar amounts do not open the picker.
- `Enter` sends immediately by default. Use `Tab` when you want to insert and edit before sending.
