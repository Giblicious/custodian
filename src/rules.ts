import type { CustodianRule, FileFacts, MovePlan } from "./model";

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/");
}

export function normalizeFolder(value: string): string | null {
  const normalized = normalizeSlashes(value).trim().replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized === "." || normalized.split("/").some((part) => part === "..")) {
    return null;
  }
  return normalized;
}

function parentFolder(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function matchesGlob(value: string, glob: string): boolean {
  const expression = glob.split("*").map(escapeRegExp).join(".*");
  return new RegExp(`^${expression}$`, "i").test(value);
}

function comparable(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(String).join(", ");
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function frontmatterMatches(facts: FileFacts, rule: CustodianRule): boolean {
  const property = rule.frontmatterProperty.trim();
  if (!property) {
    return true;
  }
  const hasProperty = Object.prototype.hasOwnProperty.call(facts.frontmatter, property);
  if (rule.frontmatterOperator === "exists") {
    return hasProperty;
  }
  if (rule.frontmatterOperator === "not-exists") {
    return !hasProperty;
  }
  if (!hasProperty) {
    return false;
  }
  const actual = comparable(facts.frontmatter[property]).toLocaleLowerCase();
  const expected = rule.frontmatterValue.trim().toLocaleLowerCase();
  if (rule.frontmatterOperator === "contains") {
    return actual.includes(expected);
  }
  return actual === expected;
}

function tagsMatch(facts: FileFacts, rule: CustodianRule): boolean {
  const wanted = rule.tags.map((tag) => tag.replace(/^#/, "").toLocaleLowerCase()).filter(Boolean);
  if (wanted.length === 0) {
    return true;
  }
  const actual = new Set(facts.tags.map((tag) => tag.replace(/^#/, "").toLocaleLowerCase()));
  return rule.tagMode === "all"
    ? wanted.every((tag) => actual.has(tag))
    : wanted.some((tag) => actual.has(tag));
}

export function ruleMatches(facts: FileFacts, rule: CustodianRule): boolean {
  if (!rule.enabled || !normalizeFolder(rule.destination)) {
    return false;
  }
  if (rule.titlePattern.trim() && !matchesGlob(facts.basename, rule.titlePattern.trim())) {
    return false;
  }
  const extensions = rule.extensions.map((extension) => extension.replace(/^\./, "").toLocaleLowerCase()).filter(Boolean);
  if (extensions.length > 0 && !extensions.includes(facts.extension.toLocaleLowerCase())) {
    return false;
  }
  const source = normalizeSlashes(rule.sourceFolder).replace(/^\/+|\/+$/g, "");
  const currentFolder = parentFolder(facts.path);
  if (source && currentFolder !== source && !currentFolder.startsWith(`${source}/`)) {
    return false;
  }
  return frontmatterMatches(facts, rule) && tagsMatch(facts, rule);
}

function safeSegment(value: unknown): string {
  return comparable(value)
    .replace(/[\\/:*?"<>|#^[\]]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim() || "Unassigned";
}

export function renderDestination(template: string, facts: FileFacts): string | null {
  const rendered = template.replace(/\{\{([^}]+)}}/g, (_match, rawToken: string) => {
    const token = rawToken.trim();
    if (token === "year") return String(facts.now.getFullYear());
    if (token === "month") return String(facts.now.getMonth() + 1).padStart(2, "0");
    if (token === "day") return String(facts.now.getDate()).padStart(2, "0");
    if (token === "title") return safeSegment(facts.basename);
    if (token === "extension") return safeSegment(facts.extension.toLocaleLowerCase());
    if (token.startsWith("property:")) {
      return safeSegment(facts.frontmatter[token.slice("property:".length).trim()]);
    }
    return "Unassigned";
  });
  return normalizeFolder(rendered);
}

export function planMove(
  facts: FileFacts,
  rules: CustodianRule[],
  excludedFolders: string[]
): MovePlan | null {
  const currentFolder = parentFolder(facts.path);
  const excluded = excludedFolders
    .map((folder) => normalizeSlashes(folder).replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  if (excluded.some((folder) => currentFolder === folder || currentFolder.startsWith(`${folder}/`))) {
    return null;
  }

  const rule = rules.find((candidate) => ruleMatches(facts, candidate));
  if (!rule) {
    return null;
  }
  const destination = renderDestination(rule.destination, facts);
  if (!destination || destination === currentFolder) {
    return null;
  }
  const filename = facts.path.slice(facts.path.lastIndexOf("/") + 1);
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    from: facts.path,
    to: `${destination}/${filename}`
  };
}
