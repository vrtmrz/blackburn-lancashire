# Blackburn Lancashire

The plugin that receives your quick jot logs and fills four-thousand-holes in
your life.

Blackburn Lancashire is an Obsidian plugin for rapid daily jotting. It stores short jots in plain Markdown daily files, keeps revision history through metadata comments, and provides a searchable timeline in an Obsidian view.


## Installation

Still for a while, or until other plug-ins are stable. this plugin is only
available as a home-brew option. To install it, use BRAT, please.

## Features

- Capture new jots from the command palette, ribbon icon, or the Blackburn view.
- Store entries in daily Markdown files named `YYYY-MM-DD.md`.
- Keep each entry under `## YYYY-MM-DD` and `### HH:mm` headings.
- Preserve revision history by expiring old entries instead of deleting text.
- Support multi-line jots with proper indentation in Markdown.
- Search body text and inline tags with case-insensitive, tokenised AND matching.
- **Search clear button** for quick query resets.
- **Enhanced tag suggestions** including frequently used tag combinations.
- **Filter results** by a specific "Before" date.
- **Collapsible search area** to maximise vertical space for browsing.
- Switch list display between line, parent, and day modes.
- **Grouped display** by date headers with integrated checkbox toggles to expand or collapse daily entries.
- **Consistent sorting** by expression time, then update time and unique ID.
- Hide expired entries by default, with a view toggle for history checks.
- Load the list incrementally for lighter behaviour on larger jot logs.
- **Automatic refresh** when the Blackburn view becomes active.
- **Geolocation support**: capture Latitude and Longitude for each entry when enabled.
- **Native integration**: utilise Obsidian's native `Menu` API for entry actions.

## Commands and Shortcuts

- `Open blackburn`: opens the jot timeline view.
- `New jot`: opens the jot capture modal.

### Keyboard Shortcuts (in Modal)

- `Ctrl + Enter` (or `Cmd + Enter`): **Save and close** the modal.
- `Ctrl + Shift + Enter`: **Save** and continue (clears the body for the next entry).

The ribbon icon also opens the jot list. If the list is already open, the existing view is revealed. The body textarea is automatically focused when the modal opens. The modal also provides explicit buttons for **Save and close**, **Save**, and **Close** for better accessibility.

## Settings

The plugin currently exposes the following settings:

- `Save folder`: folder used for daily jot files. The default is `daily`.
- `Identification tag`: frontmatter tag used to recognise daily log files. The default is `daily-log`.
- `Enable Geolocation`: capture Latitude and Longitude when saving a jot.

## Storage Format

With the default settings, jot files are written under `daily/` and use this shape:

```markdown
---
tags: [daily-log]
---

## 2026-05-23

### 11:45

- A jot body line
- #idea

%%memo-meta: e=2026-05-23 11:45; u=2026-05-23 11:45; la=35.6895; lo=139.6917%%
```

Metadata fields are:

- `e`: expression time, the time represented by the jot.
- `u`: update time, the time when the current entry was saved.
- `x`: expiry time, added when an entry is invalidated by revision or deletion.
- `la`: latitude coordinate (if geolocation is enabled).
- `lo`: longitude coordinate (if geolocation is enabled).

When an entry is revised, the old entry remains in place and receives `x`. The replacement entry is appended to the selected date and time, inheriting the original `e` value and receiving a fresh `u` value.

## Search and Filter Behaviour

Search is case-insensitive and uses partial matching. Half-width and full-width spaces split the query into tokens, and all tokens must match either the body or inline tags.

The **Before** filter allows you to restrict the list to jots recorded on or before a selected date. The entire search and filter section can be collapsed to focus on reading.

Display modes are:

- `Line`: show matched entries only.
- `Parent`: show the date and time context for each matched entry.
- `Day`: show all entries on every date that has at least one match.

Entries are grouped under large date headers. These headers utilise a checkbox toggle to expand or collapse the day's entries in `Parent` mode. When multiple entries exist at the same time, the time label is only shown for the first one to maintain a clean appearance.

## Development

Install dependencies with npm:

```bash
npm install
```

Run a production build:

```bash
npm run build
```

Run a development build:

```bash
npm run dev
```

The release artefacts expected by Obsidian are `main.js`, `manifest.json`, and `styles.css`.

## Notes

The first version uses Obsidian standard UI components: `ItemView`, `Modal`, and `PluginSettingTab`. No network requests or telemetry are used.
