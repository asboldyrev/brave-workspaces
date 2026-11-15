# Brave Workspaces

An early **Manifest V3 / Brave side-panel** prototype for managing bookmark-backed workspace groups.

## Install locally

1. Clone or download the repository.
2. Open `brave://extensions`, enable **Developer mode**.
3. Choose **Load unpacked** and select the repository folder.
4. Pin the extension and click its icon to open the side panel.
5. Pick a root bookmarks folder. **Only direct subfolders** are treated as groups; nested folders are ignored.

## Implemented in 0.1.0

- Choose and persist the root bookmark folder.
- Show groups and the bookmarks directly inside each group, in order.
- Create a group as a new bookmark folder.
- Import a group from a pasted list of HTTP(S) URLs (one per line), under **New group → Import**.
- Open a bookmarked URL in a real browser tab.
- Keep the bookmark URL and title updated for tabs opened *through this extension*.

## Intentionally NOT implemented yet

- Import by a Yandex share link. The page format/endpoint is unverified. The link field is a placeholder, not a functional parser.
- Native Yandex-style workspace switching or background preservation of live tabs.
- Synchronizing *all* tabs, closing a tab => deleting its bookmark, cross-window replication, tab reordering, and Ctrl+Shift+T restoration.
- Home workspace per window.

These need a tested tab identity + reconciliation engine, a recoverable deletion journal, and protection against losing synced bookmarks when windows close or extension-generated actions occur. **Do not treat this preview as a replacement for an existing session manager.**

## Planned model

The selected root folder's direct subfolders are global workspaces, their direct URL bookmarks are tabs. Each browser window also has an independent local-only home workspace. Cross-window groups share bookmark-backed identities. When a page navigates, its bookmark URL and title should follow the current document, while moving or closing a tab should update the corresponding bookmark and a recovery journal.

The main unresolved technical spike is safe retention of live tabs during workspace switching. Moving tabs to a minimized holding window is a candidate, but native Brave/Chrome extension APIs cannot hide tab strips, and browsers may still suspend background pages.

## Permissions

- `bookmarks`: read and create folders/bookmarks, update opened bookmark metadata.
- `tabs`: open tabs and monitor navigation/title changes.
- `storage`: remember settings and managed tab mappings.
- `sidePanel`: render the UI.
No host permissions, content scripts, remote code, or external dependencies.
