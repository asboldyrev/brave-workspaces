const SETTINGS_KEY = "bw.rootFolderId";
const MANAGED_KEY = "bw.managedTabs";

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (error) {
    console.error("Unable to open Brave Workspaces panel", error);
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.info("Panel behavior unavailable:", error);
  }
});

function supportedUrl(url) {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

// Deliberately updates *only* tabs explicitly opened through this extension.
// Browser tabs and bookmarks outside the selected root are never adopted.
async function refreshManagedTab(tabId, patch) {
  const stored = await chrome.storage.local.get(MANAGED_KEY);
  const map = stored[MANAGED_KEY] || {};
  const bookmarkId = map[tabId];
  if (!bookmarkId) return;

  let node;
  try { [node] = await chrome.bookmarks.get(bookmarkId); } catch { delete map[tabId]; }
  if (!node || !node.url) {
    delete map[tabId];
    await chrome.storage.local.set({ [MANAGED_KEY]: map });
    return;
  }
  const rootId = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
  if (!rootId) return;
  let parent;
  try { [parent] = await chrome.bookmarks.get(node.parentId); } catch { return; }
  if (!parent || parent.parentId !== rootId) return;

  const update = {};
  if (patch.url && supportedUrl(patch.url) && patch.url !== node.url) update.url = patch.url;
  if (patch.title && patch.title !== node.title) update.title = patch.title;
  if (Object.keys(update).length) {
    try { await chrome.bookmarks.update(bookmarkId, update); } catch (e) { console.warn(e); }
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.title) {
    refreshManagedTab(tabId, { url: changeInfo.url, title: changeInfo.title }).catch(console.warn);
  }
});

// Removing an extension-opened tab removes its bookmark, except when the whole
// browser window closes. Restoration/journaling is required before enabling
// broader automatic adoption of user tabs.
chrome.tabs.onRemoved.addListener(async (tabId, info) => {
  const stored = await chrome.storage.local.get(MANAGED_KEY);
  const map = stored[MANAGED_KEY] || {};
  const bookmarkId = map[tabId];
  if (!bookmarkId) return;
  delete map[tabId];
  await chrome.storage.local.set({ [MANAGED_KEY]: map });
  // Early preview: do not delete bookmarks yet. Closing a tab must remain
  // reversible before full bidirectional deletion is enabled.
});

chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (request.type !== "OPEN_BOOKMARK") return;
  (async () => {
    const [bookmark] = await chrome.bookmarks.get(request.bookmarkId);
    if (!bookmark?.url || !supportedUrl(bookmark.url)) throw new Error("Invalid bookmark URL");
    const tab = await chrome.tabs.create({ url: bookmark.url });
    const stored = await chrome.storage.local.get(MANAGED_KEY);
    const map = stored[MANAGED_KEY] || {};
    map[tab.id] = bookmark.id;
    await chrome.storage.local.set({ [MANAGED_KEY]: map });
    return { tabId: tab.id };
  })().then(respond, e => respond({ error: String(e.message || e) }));
  return true;
});
