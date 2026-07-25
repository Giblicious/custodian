# Security

Please report security issues privately through GitHub's security advisory form for this repository. Do not open a public issue for an unpatched vulnerability.

Custodian reads file paths and Obsidian metadata from the active vault and moves files only within that vault. It does not send vault data over the network and has no telemetry, accounts, advertising, or analytics.

Rules are stored in Obsidian's local plugin data. Before enabling a broad rule, use the preview command and keep a current backup or version history for the vault. Custodian refuses destinations that escape the vault and does not overwrite an existing file.
