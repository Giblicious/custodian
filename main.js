"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => CustodianPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/model.ts
var DEFAULT_SETTINGS = {
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
function newRule(id) {
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

// src/rules.ts
function normalizeSlashes(value) {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/");
}
function normalizeFolder(value) {
  const normalized = normalizeSlashes(value).trim().replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized === "." || normalized.split("/").some((part) => part === "..")) {
    return null;
  }
  return normalized;
}
function parentFolder(path) {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}
function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
function matchesGlob(value, glob) {
  const expression = glob.split("*").map(escapeRegExp).join(".*");
  return new RegExp(`^${expression}$`, "i").test(value);
}
function comparable(value) {
  if (Array.isArray(value)) {
    return value.map(String).join(", ");
  }
  if (value === null || value === void 0) {
    return "";
  }
  return String(value);
}
function frontmatterMatches(facts, rule) {
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
function tagsMatch(facts, rule) {
  const wanted = rule.tags.map((tag) => tag.replace(/^#/, "").toLocaleLowerCase()).filter(Boolean);
  if (wanted.length === 0) {
    return true;
  }
  const actual = new Set(facts.tags.map((tag) => tag.replace(/^#/, "").toLocaleLowerCase()));
  return rule.tagMode === "all" ? wanted.every((tag) => actual.has(tag)) : wanted.some((tag) => actual.has(tag));
}
function ruleMatches(facts, rule) {
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
function safeSegment(value) {
  return comparable(value).replace(/[\\/:*?"<>|#^[\]]/g, "-").replace(/\s+/g, " ").replace(/^\.+|\.+$/g, "").trim() || "Unassigned";
}
function renderDestination(template, facts) {
  const rendered = template.replace(/\{\{([^}]+)}}/g, (_match, rawToken) => {
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
function planMove(facts, rules, excludedFolders) {
  const currentFolder = parentFolder(facts.path);
  const excluded = excludedFolders.map((folder) => normalizeSlashes(folder).replace(/^\/+|\/+$/g, "")).filter(Boolean);
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

// src/main.ts
function splitList(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}
var CustodianPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "settings", cloneDefaults());
    __publicField(this, "pending", /* @__PURE__ */ new Map());
    __publicField(this, "moving", /* @__PURE__ */ new Set());
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new CustodianSettingTab(this.app, this));
    this.addCommand({
      id: "preview-file-organization",
      name: "Preview file organization",
      callback: () => void this.previewAll()
    });
    this.addCommand({
      id: "organize-all-files",
      name: "Organize all files now",
      callback: () => void this.organizeAll()
    });
    this.registerEvent(this.app.vault.on("create", (file) => {
      if (file instanceof import_obsidian.TFile) this.schedule(file);
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.pending.delete(oldPath);
      if (file instanceof import_obsidian.TFile) this.schedule(file);
    }));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => this.schedule(file)));
  }
  onunload() {
    for (const timeout of this.pending.values()) {
      window.clearTimeout(timeout);
    }
    this.pending.clear();
  }
  async loadSettings() {
    const saved = await this.loadData();
    const defaults = cloneDefaults();
    this.settings = {
      ...defaults,
      ...saved != null ? saved : {},
      excludedFolders: Array.isArray(saved == null ? void 0 : saved.excludedFolders) ? saved.excludedFolders : defaults.excludedFolders,
      rules: Array.isArray(saved == null ? void 0 : saved.rules) ? saved.rules : defaults.rules
    };
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  schedule(file) {
    if (!this.settings.autoOrganize || this.moving.has(file.path)) return;
    const existing = this.pending.get(file.path);
    if (existing !== void 0) window.clearTimeout(existing);
    const timeout = window.setTimeout(() => {
      this.pending.delete(file.path);
      const current = this.app.vault.getAbstractFileByPath(file.path);
      if (current instanceof import_obsidian.TFile) void this.organizeFile(current);
    }, 750);
    this.pending.set(file.path, timeout);
  }
  factsFor(file) {
    var _a, _b;
    const cache = this.app.metadataCache.getFileCache(file);
    return {
      path: file.path,
      basename: file.basename,
      extension: file.extension,
      frontmatter: (_a = cache == null ? void 0 : cache.frontmatter) != null ? _a : {},
      tags: cache ? (_b = (0, import_obsidian.getAllTags)(cache)) != null ? _b : [] : [],
      now: /* @__PURE__ */ new Date()
    };
  }
  planFor(file) {
    return planMove(
      this.factsFor(file),
      this.settings.rules,
      this.settings.excludedFolders
    );
  }
  async ensureFolder(folder) {
    const parts = (0, import_obsidian.normalizePath)(folder).split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
  async applyPlan(file, plan) {
    if (this.app.vault.getAbstractFileByPath(plan.to)) {
      new import_obsidian.Notice(`Custodian skipped ${plan.from}: ${plan.to} already exists.`);
      return false;
    }
    const destinationFolder = plan.to.slice(0, plan.to.lastIndexOf("/"));
    this.moving.add(file.path);
    try {
      await this.ensureFolder(destinationFolder);
      await this.app.fileManager.renameFile(file, plan.to);
      if (this.settings.notifyOnMove) {
        new import_obsidian.Notice(`Custodian moved ${plan.from} \u2192 ${plan.to}`);
      }
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("Custodian could not move a file", error);
      new import_obsidian.Notice(`Custodian could not move ${plan.from}: ${detail}`);
      return false;
    } finally {
      this.moving.delete(plan.from);
    }
  }
  async organizeFile(file) {
    const plan = this.planFor(file);
    return plan ? this.applyPlan(file, plan) : false;
  }
  plansForVault() {
    return this.app.vault.getFiles().map((file) => this.planFor(file)).filter((plan) => plan !== null);
  }
  async previewAll() {
    new PreviewModal(this.app, this.plansForVault()).open();
  }
  async organizeAll() {
    const plans = this.plansForVault();
    if (plans.length === 0) {
      new import_obsidian.Notice("Custodian: every file is already in place.");
      return;
    }
    let moved = 0;
    for (const plan of plans) {
      const file = this.app.vault.getAbstractFileByPath(plan.from);
      if (file instanceof import_obsidian.TFile && await this.applyPlan(file, plan)) moved += 1;
    }
    new import_obsidian.Notice(`Custodian moved ${moved} of ${plans.length} planned files.`);
  }
};
var PreviewModal = class extends import_obsidian.Modal {
  constructor(app, plans) {
    super(app);
    this.plans = plans;
  }
  onOpen() {
    this.titleEl.setText("Custodian preview");
    if (this.plans.length === 0) {
      this.contentEl.createEl("p", { text: "Every file is already in place." });
      return;
    }
    this.contentEl.createEl("p", {
      text: `${this.plans.length} file${this.plans.length === 1 ? "" : "s"} would move. No changes have been made.`
    });
    const list = this.contentEl.createEl("ul", { cls: "custodian-preview" });
    for (const plan of this.plans) {
      list.createEl("li", {
        text: `${plan.from} \u2192 ${plan.to} (${plan.ruleName})`
      });
    }
  }
};
var CustodianSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Custodian" });
    containerEl.createEl("p", {
      text: "Rules run from top to bottom. The first matching rule places the file; conditions inside a rule are combined."
    });
    new import_obsidian.Setting(containerEl).setName("Automatic organization").setDesc("Evaluate files after they are created, renamed, or their metadata changes.").addToggle((toggle) => toggle.setValue(this.plugin.settings.autoOrganize).onChange(async (value) => {
      this.plugin.settings.autoOrganize = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Move notifications").setDesc("Show a notice after each automatic move.").addToggle((toggle) => toggle.setValue(this.plugin.settings.notifyOnMove).onChange(async (value) => {
      this.plugin.settings.notifyOnMove = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Excluded folders").setDesc("Comma-separated folders that Custodian will never move files out of.").addText((text) => text.setPlaceholder(".trash, Templates").setValue(this.plugin.settings.excludedFolders.join(", ")).onChange(async (value) => {
      this.plugin.settings.excludedFolders = splitList(value);
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Rules").setHeading().addButton((button) => button.setButtonText("Add rule").setCta().onClick(async () => {
      this.plugin.settings.rules.push(newRule(`${Date.now()}-${Math.random().toString(36).slice(2)}`));
      await this.plugin.saveSettings();
      this.display();
    }));
    this.plugin.settings.rules.forEach((rule, index) => this.renderRule(rule, index));
  }
  renderRule(rule, index) {
    const card = this.containerEl.createDiv({ cls: "custodian-rule" });
    const header = card.createDiv({ cls: "custodian-rule__header" });
    header.createEl("h3", { text: rule.name || `Rule ${index + 1}` });
    const actions = header.createDiv({ cls: "custodian-rule__actions" });
    this.actionButton(actions, "\u2191", "Move rule up", async () => {
      if (index === 0) return;
      const rules = this.plugin.settings.rules;
      [rules[index - 1], rules[index]] = [rules[index], rules[index - 1]];
      await this.plugin.saveSettings();
      this.display();
    }, index === 0);
    this.actionButton(actions, "\u2193", "Move rule down", async () => {
      const rules = this.plugin.settings.rules;
      if (index >= rules.length - 1) return;
      [rules[index], rules[index + 1]] = [rules[index + 1], rules[index]];
      await this.plugin.saveSettings();
      this.display();
    }, index >= this.plugin.settings.rules.length - 1);
    this.actionButton(actions, "Delete", "Delete rule", async () => {
      this.plugin.settings.rules.splice(index, 1);
      await this.plugin.saveSettings();
      this.display();
    });
    new import_obsidian.Setting(card).setName("Enabled").addToggle((toggle) => toggle.setValue(rule.enabled).onChange((value) => this.updateRule(rule, "enabled", value)));
    new import_obsidian.Setting(card).setName("Name").addText((text) => text.setValue(rule.name).onChange(async (value) => {
      var _a;
      await this.updateRule(rule, "name", value);
      (_a = header.querySelector("h3")) == null ? void 0 : _a.setText(value || `Rule ${index + 1}`);
    }));
    new import_obsidian.Setting(card).setName("Destination").setDesc("Folder or template, such as Projects/{{property:project}}.").addText((text) => text.setValue(rule.destination).onChange((value) => this.updateRule(rule, "destination", value)));
    card.createEl("p", {
      cls: "custodian-rule__hint",
      text: "Matching conditions. Leave a condition blank to ignore it."
    });
    new import_obsidian.Setting(card).setName("Title pattern").setDesc("Case-insensitive glob; * matches any text.").addText((text) => text.setPlaceholder("Meeting - *").setValue(rule.titlePattern).onChange((value) => this.updateRule(rule, "titlePattern", value)));
    new import_obsidian.Setting(card).setName("Frontmatter property").addText((text) => text.setPlaceholder("status").setValue(rule.frontmatterProperty).onChange((value) => this.updateRule(rule, "frontmatterProperty", value)));
    new import_obsidian.Setting(card).setName("Frontmatter comparison").addDropdown((dropdown) => dropdown.addOptions({
      exists: "Exists",
      "not-exists": "Does not exist",
      equals: "Equals",
      contains: "Contains"
    }).setValue(rule.frontmatterOperator).onChange((value) => this.updateRule(rule, "frontmatterOperator", value))).addText((text) => text.setPlaceholder("done").setValue(rule.frontmatterValue).onChange((value) => this.updateRule(rule, "frontmatterValue", value)));
    new import_obsidian.Setting(card).setName("Tags").setDesc("Comma-separated, with or without #.").addDropdown((dropdown) => dropdown.addOptions({ any: "Match any", all: "Match all" }).setValue(rule.tagMode).onChange((value) => this.updateRule(rule, "tagMode", value))).addText((text) => text.setPlaceholder("project, active").setValue(rule.tags.join(", ")).onChange((value) => this.updateRule(rule, "tags", splitList(value))));
    new import_obsidian.Setting(card).setName("Extensions").setDesc("Comma-separated. Leave blank for every file type.").addText((text) => text.setPlaceholder("md, pdf").setValue(rule.extensions.join(", ")).onChange((value) => this.updateRule(rule, "extensions", splitList(value))));
    new import_obsidian.Setting(card).setName("Source folder").setDesc("Match this folder and its descendants. Leave blank for the whole vault.").addText((text) => text.setPlaceholder("Inbox").setValue(rule.sourceFolder).onChange((value) => this.updateRule(rule, "sourceFolder", value)));
  }
  actionButton(parent, text, label, action, disabled = false) {
    const button = parent.createEl("button", { text, attr: { "aria-label": label } });
    button.disabled = disabled;
    button.addEventListener("click", () => void action());
  }
  async updateRule(rule, key, value) {
    rule[key] = value;
    await this.plugin.saveSettings();
  }
};
