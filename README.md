# Custodian

Rule-driven file organization for Obsidian.

Custodian turns ordinary vault folders into smart folders. Define ordered rules based on a file's title, YAML frontmatter, tags, extension, or current folder, and Custodian places matching files in their designated location.

## Install with BRAT

1. Install and enable **BRAT** in Obsidian.
2. Open BRAT settings and choose **Add Beta Plugin**.
3. Enter `Giblicious/custodian`.
4. Enable **Custodian** under Community plugins.

Custodian supports Obsidian on desktop and mobile.

## Rules

Rules are evaluated from top to bottom. The first matching rule owns the file. Conditions within a rule are combined with **AND**; blank conditions are ignored.

Available conditions:

- **Title:** glob patterns such as `Meeting - *` or `* Invoice`
- **Frontmatter:** property exists, does not exist, equals, or contains a value
- **Tags:** require any or all listed tags
- **Extension:** for example `md`, `pdf`, or `png`
- **Source folder:** limit a rule to one part of the vault

Destinations may be static (`Projects/Active`) or templated:

- `Journal/{{year}}/{{month}}`
- `Projects/{{property:project}}`
- `Attachments/{{extension}}`
- `People/{{property:owner}}`

Template values are sanitized into safe folder names. Custodian never overwrites a file and rejects paths that could escape the vault.

## Commands

- **Preview file organization:** report how many files would move without changing the vault
- **Organize all files now:** apply the current rules across the vault

Automatic organization can be disabled globally while rules are being designed. Individual rules can also be disabled.

## Privacy

Custodian works entirely inside Obsidian. It has no network requests, telemetry, accounts, advertising, or analytics.

## Development

```sh
npm install
npm run check
```

Create a semantic version tag matching `manifest.json` (for example `0.1.0`) to publish the BRAT release assets.

## License

MIT
