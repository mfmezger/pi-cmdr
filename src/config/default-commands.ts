import type { CmdrCommand } from "../types.js";

export const DEFAULT_COMMANDS: CmdrCommand[] = [
	{
		id: "github-ship-pr",
		category: "Git",
		title: "Create branch, commit, push, and open PR",
		description: "Use commit and github-pr skills to ship current work.",
		tags: ["git", "branch", "commit", "push", "pr", "github"],
		source: "default",
		prompt:
			"Please create a new branch for the current changes, use the commit skill to make an appropriate commit, push the branch, and then use the github-pr skill to open a GitHub PR. Keep the scope tight and summarize what you did.",
	},
	{
		id: "github-feedback",
		category: "GitHub",
		title: "GitHub feedback",
		description:
			"Use the github-pr-feedback skill to triage current PR feedback into fix/no-fix tables.",
		tags: ["github", "pr", "feedback", "review", "triage", "skill"],
		source: "default",
		prompt:
			"Please use the github-pr-feedback skill to triage GitHub PR feedback for the current branch. Prefer pasted feedback if I provided any; otherwise use gh to inspect the PR for the current branch, including review comments, inline review threads, resolved comments, latest reviews, files, and failed checks when relevant. Produce the required two markdown tables: Does Not Need To Be Fixed and Should Be Fixed, then a concise Summary with counts and the highest-priority fix. Keep the Karpathy guidelines in mind and do not make code changes yet; ask me whether to fix the Should Be Fixed items after the report.",
	},
	{
		id: "review-pr-feedback",
		category: "Review",
		title: "Review PR feedback and fix actionable items",
		description:
			"Triage reviewer feedback, decide what should be fixed, and implement fixes.",
		tags: ["review", "pr", "feedback", "karpathy"],
		source: "default",
		prompt:
			"Please review the PR feedback, triage what is actionable versus not actionable, and work through the fixes. Keep the Karpathy guidelines in mind: think before coding, keep changes surgical, avoid overengineering, and verify with tests or checks where appropriate.",
	},
	{
		id: "main-commit-and-push",
		category: "Push",
		title: "Commit and Push directly on Main cause yolo.",
		description: "Commit and Push on Main.",
		tags: ["commit", "push"],
		source: "default",
		prompt:
			"Please create a nice commit use the commit skill. then push directly on the active branch. make sure to not commit any secrets, build or temp files.",
	},
];
