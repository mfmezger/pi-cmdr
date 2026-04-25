export type CmdrAction = "insert" | "send";
export type CmdrSource = "default" | "global" | "project";

export type CmdrCommand = {
	id: string;
	title: string;
	prompt: string;
	description?: string;
	category?: string;
	tags: string[];
	defaultAction?: CmdrAction;
	source: CmdrSource;
};

export type CmdrSettings = {
	trigger: string;
	enterAction: CmdrAction;
	commands: CmdrCommand[];
	errors: string[];
	configPaths: {
		global: string[];
		project: string[];
	};
};
