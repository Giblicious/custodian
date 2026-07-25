import {
  App,
  getAllTags,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath
} from "obsidian";
import {
  DEFAULT_SETTINGS,
  newRule,
  type CustodianRule,
  type CustodianSettings,
  type FileFacts,
  type MovePlan,
  type FrontmatterOperator,
  type TagMode
} from "./model";
import { planMove } from "./rules";

function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function cloneDefaults(): CustodianSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as CustodianSettings;
}

export default class CustodianPlugin extends Plugin {
  settings: CustodianSettings = cloneDefaults();
  private pending = new Map<string, number>();
  private moving = new Set<string>();

  async onload(): Promise<void> {
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
      if (file instanceof TFile) this.schedule(file);
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.pending.delete(oldPath);
      if (file instanceof TFile) this.schedule(file);
    }));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => this.schedule(file)));
  }

  onunload(): void {
    for (const timeout of this.pending.values()) {
      window.clearTimeout(timeout);
    }
    this.pending.clear();
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<CustodianSettings> | null;
    const defaults = cloneDefaults();
    this.settings = {
      ...defaults,
      ...(saved ?? {}),
      excludedFolders: Array.isArray(saved?.excludedFolders)
        ? saved.excludedFolders
        : defaults.excludedFolders,
      rules: Array.isArray(saved?.rules) ? saved.rules : defaults.rules
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private schedule(file: TFile): void {
    if (!this.settings.autoOrganize || this.moving.has(file.path)) return;
    const existing = this.pending.get(file.path);
    if (existing !== undefined) window.clearTimeout(existing);
    const timeout = window.setTimeout(() => {
      this.pending.delete(file.path);
      const current = this.app.vault.getAbstractFileByPath(file.path);
      if (current instanceof TFile) void this.organizeFile(current);
    }, 750);
    this.pending.set(file.path, timeout);
  }

  private factsFor(file: TFile): FileFacts {
    const cache = this.app.metadataCache.getFileCache(file);
    return {
      path: file.path,
      basename: file.basename,
      extension: file.extension,
      frontmatter: cache?.frontmatter ?? {},
      tags: cache ? (getAllTags(cache) ?? []) : [],
      now: new Date()
    };
  }

  private planFor(file: TFile): MovePlan | null {
    return planMove(
      this.factsFor(file),
      this.settings.rules,
      this.settings.excludedFolders
    );
  }

  private async ensureFolder(folder: string): Promise<void> {
    const parts = normalizePath(folder).split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private async applyPlan(file: TFile, plan: MovePlan): Promise<boolean> {
    if (this.app.vault.getAbstractFileByPath(plan.to)) {
      new Notice(`Custodian skipped ${plan.from}: ${plan.to} already exists.`);
      return false;
    }
    const destinationFolder = plan.to.slice(0, plan.to.lastIndexOf("/"));
    this.moving.add(file.path);
    try {
      await this.ensureFolder(destinationFolder);
      await this.app.fileManager.renameFile(file, plan.to);
      if (this.settings.notifyOnMove) {
        new Notice(`Custodian moved ${plan.from} → ${plan.to}`);
      }
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("Custodian could not move a file", error);
      new Notice(`Custodian could not move ${plan.from}: ${detail}`);
      return false;
    } finally {
      this.moving.delete(plan.from);
    }
  }

  private async organizeFile(file: TFile): Promise<boolean> {
    const plan = this.planFor(file);
    return plan ? this.applyPlan(file, plan) : false;
  }

  private plansForVault(): MovePlan[] {
    return this.app.vault.getFiles()
      .map((file) => this.planFor(file))
      .filter((plan): plan is MovePlan => plan !== null);
  }

  async previewAll(): Promise<void> {
    new PreviewModal(this.app, this.plansForVault()).open();
  }

  async organizeAll(): Promise<void> {
    const plans = this.plansForVault();
    if (plans.length === 0) {
      new Notice("Custodian: every file is already in place.");
      return;
    }
    let moved = 0;
    for (const plan of plans) {
      const file = this.app.vault.getAbstractFileByPath(plan.from);
      if (file instanceof TFile && await this.applyPlan(file, plan)) moved += 1;
    }
    new Notice(`Custodian moved ${moved} of ${plans.length} planned files.`);
  }
}

class PreviewModal extends Modal {
  constructor(app: App, private readonly plans: MovePlan[]) {
    super(app);
  }

  onOpen(): void {
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
        text: `${plan.from} → ${plan.to} (${plan.ruleName})`
      });
    }
  }
}

class CustodianSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: CustodianPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Custodian" });
    containerEl.createEl("p", {
      text: "Rules run from top to bottom. The first matching rule places the file; conditions inside a rule are combined."
    });

    new Setting(containerEl)
      .setName("Automatic organization")
      .setDesc("Evaluate files after they are created, renamed, or their metadata changes.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.autoOrganize)
        .onChange(async (value) => {
          this.plugin.settings.autoOrganize = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Move notifications")
      .setDesc("Show a notice after each automatic move.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.notifyOnMove)
        .onChange(async (value) => {
          this.plugin.settings.notifyOnMove = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Excluded folders")
      .setDesc("Comma-separated folders that Custodian will never move files out of.")
      .addText((text) => text
        .setPlaceholder(".trash, Templates")
        .setValue(this.plugin.settings.excludedFolders.join(", "))
        .onChange(async (value) => {
          this.plugin.settings.excludedFolders = splitList(value);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Rules")
      .setHeading()
      .addButton((button) => button
        .setButtonText("Add rule")
        .setCta()
        .onClick(async () => {
          this.plugin.settings.rules.push(newRule(`${Date.now()}-${Math.random().toString(36).slice(2)}`));
          await this.plugin.saveSettings();
          this.display();
        }));

    this.plugin.settings.rules.forEach((rule, index) => this.renderRule(rule, index));
  }

  private renderRule(rule: CustodianRule, index: number): void {
    const card = this.containerEl.createDiv({ cls: "custodian-rule" });
    const header = card.createDiv({ cls: "custodian-rule__header" });
    header.createEl("h3", { text: rule.name || `Rule ${index + 1}` });
    const actions = header.createDiv({ cls: "custodian-rule__actions" });
    this.actionButton(actions, "↑", "Move rule up", async () => {
      if (index === 0) return;
      const rules = this.plugin.settings.rules;
      [rules[index - 1], rules[index]] = [rules[index], rules[index - 1]];
      await this.plugin.saveSettings();
      this.display();
    }, index === 0);
    this.actionButton(actions, "↓", "Move rule down", async () => {
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

    new Setting(card)
      .setName("Enabled")
      .addToggle((toggle) => toggle.setValue(rule.enabled).onChange((value) => this.updateRule(rule, "enabled", value)));
    new Setting(card)
      .setName("Name")
      .addText((text) => text.setValue(rule.name).onChange(async (value) => {
        await this.updateRule(rule, "name", value);
        header.querySelector("h3")?.setText(value || `Rule ${index + 1}`);
      }));
    new Setting(card)
      .setName("Destination")
      .setDesc("Folder or template, such as Projects/{{property:project}}.")
      .addText((text) => text.setValue(rule.destination).onChange((value) => this.updateRule(rule, "destination", value)));

    card.createEl("p", {
      cls: "custodian-rule__hint",
      text: "Matching conditions. Leave a condition blank to ignore it."
    });
    new Setting(card)
      .setName("Title pattern")
      .setDesc("Case-insensitive glob; * matches any text.")
      .addText((text) => text.setPlaceholder("Meeting - *").setValue(rule.titlePattern)
        .onChange((value) => this.updateRule(rule, "titlePattern", value)));
    new Setting(card)
      .setName("Frontmatter property")
      .addText((text) => text.setPlaceholder("status").setValue(rule.frontmatterProperty)
        .onChange((value) => this.updateRule(rule, "frontmatterProperty", value)));
    new Setting(card)
      .setName("Frontmatter comparison")
      .addDropdown((dropdown) => dropdown
        .addOptions({
          exists: "Exists",
          "not-exists": "Does not exist",
          equals: "Equals",
          contains: "Contains"
        })
        .setValue(rule.frontmatterOperator)
        .onChange((value) => this.updateRule(rule, "frontmatterOperator", value as FrontmatterOperator)))
      .addText((text) => text.setPlaceholder("done").setValue(rule.frontmatterValue)
        .onChange((value) => this.updateRule(rule, "frontmatterValue", value)));
    new Setting(card)
      .setName("Tags")
      .setDesc("Comma-separated, with or without #.")
      .addDropdown((dropdown) => dropdown
        .addOptions({ any: "Match any", all: "Match all" })
        .setValue(rule.tagMode)
        .onChange((value) => this.updateRule(rule, "tagMode", value as TagMode)))
      .addText((text) => text.setPlaceholder("project, active").setValue(rule.tags.join(", "))
        .onChange((value) => this.updateRule(rule, "tags", splitList(value))));
    new Setting(card)
      .setName("Extensions")
      .setDesc("Comma-separated. Leave blank for every file type.")
      .addText((text) => text.setPlaceholder("md, pdf").setValue(rule.extensions.join(", "))
        .onChange((value) => this.updateRule(rule, "extensions", splitList(value))));
    new Setting(card)
      .setName("Source folder")
      .setDesc("Match this folder and its descendants. Leave blank for the whole vault.")
      .addText((text) => text.setPlaceholder("Inbox").setValue(rule.sourceFolder)
        .onChange((value) => this.updateRule(rule, "sourceFolder", value)));
  }

  private actionButton(
    parent: HTMLElement,
    text: string,
    label: string,
    action: () => Promise<void>,
    disabled = false
  ): void {
    const button = parent.createEl("button", { text, attr: { "aria-label": label } });
    button.disabled = disabled;
    button.addEventListener("click", () => void action());
  }

  private async updateRule<K extends keyof CustodianRule>(
    rule: CustodianRule,
    key: K,
    value: CustodianRule[K]
  ): Promise<void> {
    rule[key] = value;
    await this.plugin.saveSettings();
  }
}
