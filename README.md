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

`pi-cmdr` loads commands from:

1. Built-in defaults
2. `~/.pi/agent/cmdr.json`
3. `.pi/cmdr.json`

Commands are merged by `id`; project commands override global commands, and global commands override built-in defaults.

Example `cmdr.json`:

```json
{
	"trigger": "$",
	"enterAction": "send",
	"commands": [
		{
			"id": "git-ship-pr",
			"category": "Git",
			"title": "Create branch, commit, push, and open PR",
			"description": "Use commit and github-pr skills to ship current work.",
			"tags": ["git", "branch", "commit", "push", "pr", "github"],
			"prompt": "Please create a new branch for the current changes, use the commit skill to make an appropriate commit, push the branch, and then use the github-pr skill to open a GitHub PR. Keep the scope tight and summarize what you did."
		},
		{
			"id": "github-feedback",
			"category": "GitHub",
			"title": "GitHub feedback",
			"description": "Use the github-pr-feedback skill to triage current PR feedback into fix/no-fix tables.",
			"tags": ["github", "pr", "feedback", "review", "triage", "skill"],
			"prompt": "Please use the github-pr-feedback skill to triage GitHub PR feedback for the current branch. Prefer pasted feedback if I provided any; otherwise use gh to inspect the PR for the current branch, including review comments, inline review threads, resolved comments, latest reviews, files, and failed checks when relevant. Produce the required two markdown tables: Does Not Need To Be Fixed and Should Be Fixed, then a concise Summary with counts and the highest-priority fix. Keep the Karpathy guidelines in mind and do not make code changes yet; ask me whether to fix the Should Be Fixed items after the report."
		},
		{
			"id": "review-pr-feedback",
			"category": "Review",
			"title": "Review PR feedback and fix actionable items",
			"description": "Triage reviewer feedback, decide what should be fixed, and implement fixes.",
			"tags": ["review", "pr", "feedback", "karpathy"],
			"prompt": "Please review the PR feedback, triage what is actionable versus not actionable, and work through the fixes. Keep the Karpathy guidelines in mind: think before coding, keep changes surgical, avoid overengineering, and verify with tests or checks where appropriate."
		}
	]
}
```

See [`examples/cmdr.json`](examples/cmdr.json) for a copyable config.

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
