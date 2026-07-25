import { describe, expect, it } from "vitest";
import type { CustodianRule, FileFacts } from "../src/model";
import { normalizeFolder, planMove, renderDestination, ruleMatches } from "../src/rules";

const facts: FileFacts = {
  path: "Inbox/Meeting - Apollo.md",
  basename: "Meeting - Apollo",
  extension: "md",
  frontmatter: { project: "Apollo", status: "active", owner: "Ada/Lovelace" },
  tags: ["meeting", "work"],
  now: new Date(2026, 6, 24)
};

const rule: CustodianRule = {
  id: "meetings",
  name: "Project meetings",
  enabled: true,
  destination: "Projects/{{property:project}}/Meetings/{{year}}",
  titlePattern: "Meeting - *",
  frontmatterProperty: "status",
  frontmatterOperator: "equals",
  frontmatterValue: "active",
  tags: ["#meeting"],
  tagMode: "all",
  extensions: ["md"],
  sourceFolder: "Inbox"
};

describe("rules", () => {
  it("combines configured conditions", () => {
    expect(ruleMatches(facts, rule)).toBe(true);
    expect(ruleMatches({ ...facts, tags: ["work"] }, rule)).toBe(false);
  });

  it("renders safe destination templates", () => {
    expect(renderDestination("People/{{property:owner}}/{{month}}", facts))
      .toBe("People/Ada-Lovelace/07");
  });

  it("uses the first matching rule", () => {
    expect(planMove(facts, [rule, { ...rule, id: "later" }], []))
      .toEqual({
        ruleId: "meetings",
        ruleName: "Project meetings",
        from: facts.path,
        to: "Projects/Apollo/Meetings/2026/Meeting - Apollo.md"
      });
  });

  it("does not reprocess excluded folders", () => {
    expect(planMove({ ...facts, path: "Templates/Meeting - Apollo.md" }, [rule], ["Templates"]))
      .toBeNull();
  });

  it("rejects empty and escaping destinations", () => {
    expect(normalizeFolder("")).toBeNull();
    expect(normalizeFolder("../Outside")).toBeNull();
  });
});
