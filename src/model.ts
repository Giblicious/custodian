export type FrontmatterOperator = "exists" | "not-exists" | "equals" | "contains";
export type TagMode = "any" | "all";

export interface CustodianRule {
  id: string;
  name: string;
  enabled: boolean;
  destination: string;
  titlePattern: string;
  frontmatterProperty: string;
  frontmatterOperator: FrontmatterOperator;
  frontmatterValue: string;
  tags: string[];
  tagMode: TagMode;
  extensions: string[];
  sourceFolder: string;
}

export interface CustodianSettings {
  autoOrganize: boolean;
  notifyOnMove: boolean;
  excludedFolders: string[];
  rules: CustodianRule[];
}

export interface FileFacts {
  path: string;
  basename: string;
  extension: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  now: Date;
}

export interface MovePlan {
  ruleId: string;
  ruleName: string;
  from: string;
  to: string;
}

export const DEFAULT_SETTINGS: CustodianSettings = {
  autoOrganize: true,
  notifyOnMove: false,
  excludedFolders: [".trash", "Templates"],
  rules: [
    {
      id: "example-completed",
      name: "Example: completed notes",
      enabled: false,
      destination: "Archive/{{year}}",
      titlePattern: "",
      frontmatterProperty: "status",
      frontmatterOperator: "equals",
      frontmatterValue: "done",
      tags: [],
      tagMode: "any",
      extensions: ["md"],
      sourceFolder: ""
    }
  ]
};

export function newRule(id: string): CustodianRule {
  return {
    id,
    name: "New rule",
    enabled: true,
    destination: "Organized",
    titlePattern: "",
    frontmatterProperty: "",
    frontmatterOperator: "equals",
    frontmatterValue: "",
    tags: [],
    tagMode: "any",
    extensions: ["md"],
    sourceFolder: ""
  };
}
