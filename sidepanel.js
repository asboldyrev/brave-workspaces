const $ = id => document.getElementById(id);
const ROOT_KEY = "bw.rootFolderId";
let rootId = null;
let selectedGroupId = null;
let folders = [];

function status(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}
function validUrl(value) {
  try { const url = new URL(value.trim()); return ["http:","https:"].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
async function bookmarkFolders() {
  const tree = await chrome.bookmarks.getTree();
  const result = [];
  function scan(nodes, depth) {
    for (const n of nodes) {
      if (!n.url && n.parentId) result.push({ id:n.id, title:n.title, depth });
      if (n.children) scan(n.children, depth + 1);
    }
  }
  scan(tree, 0);
  return result;
}
async function showSetup() {
  $("setup").hidden = false; $("workspace").hidden = true; $("create").hidden = true;
  folders = await bookmarkFolders();
  const select = $("root"); select.replaceChildren();
  for (const folder of folders) {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = "  ".repeat(Math.min(folder.depth,8)) + (folder.title || "Без названия");
    select.append(option);
  }
  if (rootId) select.value = rootId;
}
async function getGroups() {
  if (!rootId) return [];
  const children = await chrome.bookmarks.getChildren(rootId);
  return children.filter(n => !n.url);
}
async function render() {
  if (!rootId) return showSetup();
  $("setup").hidden = true; $("create").hidden = true; $("workspace").hidden = false;
  let root;
  try { [root] = await chrome.bookmarks.get(rootId); }
  catch { rootId = null; return showSetup(); }
  $("root-name").textContent = root?.title || "Выбранная папка";
  const groups = await getGroups();
  const container = $("groups"); container.replaceChildren();
  for (const group of groups) {
    const button = document.createElement("button"); button.className = "entry" + (selectedGroupId===group.id?" active":"");
    const label = document.createElement("span"); label.className = "label"; label.textContent = "▸ " + group.title;
    const count = document.createElement("span"); count.className="count";
    const children = await chrome.bookmarks.getChildren(group.id);
    count.textContent = String(children.filter(n => !!n.url).length);
    button.append(label,count);
    button.addEventListener("click",async()=>{ selectedGroupId=group.id; await render(); });
    container.append(button);
  }
  if (selectedGroupId && !groups.some(g=>g.id===selectedGroupId)) selectedGroupId=null;
  $("contents").hidden = !selectedGroupId;
  if (selectedGroupId) {
    const group = groups.find(g=>g.id===selectedGroupId);
    $("group-name").textContent=group.title;
    const nodes = (await chrome.bookmarks.getChildren(group.id)).filter(n=>!!n.url);
    $("group-count").textContent=nodes.length+" вкладок";
    const items=$("items"); items.replaceChildren();
    for (const node of nodes) {
      const button=document.createElement("button"); button.className="entry"; button.title=node.url;
      const label=document.createElement("span");label.className="label";label.textContent="◦ "+(node.title||node.url);
      button.append(label);
      button.addEventListener("click",async()=>{
        try {const response=await chrome.runtime.sendMessage({type:"OPEN_BOOKMARK",bookmarkId:node.id});if(response?.error)throw Error(response.error);status("Вкладка открыта");}
        catch(e){status(e.message,true);}
      });
      items.append(button);
    }
    if(!nodes.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="Пока нет вкладок";items.append(empty);}
  }
}

function isYandexShareLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "browser.yandex.ru" &&
      /^\\/tab-groupings-share\\/[0-9a-f-]{36}\\/?$/i.test(url.pathname);
  } catch { return false; }
}
function parseYandexHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title = doc.querySelector("main h1.title")?.textContent?.trim() ||
    doc.querySelector("h1")?.textContent?.trim();
  const entries = [...doc.querySelectorAll("ul.tabs li a.link[href]")].map(link => ({
    url: validUrl(link.getAttribute("href") || ""),
    title: link.querySelector("p.title")?.textContent?.trim() || ""
  })).filter(item => item.url);
  if (!title || !entries.length) throw new Error("Не удалось найти название или вкладки. Проверь, что это страница опубликованной группы Яндекс Браузера.");
  if (entries.length > 500) throw new Error("Слишком много вкладок для одного импорта");
  return { name: title, tabs: entries };
}
function showImportPreview(group) {
  $("import-name").value = group.name;
  $("import-urls").value = group.tabs.map(tab => tab.url).join("\\n");
  const box = $("preview-items"); box.replaceChildren();
  for (const tab of group.tabs) {
    const row = document.createElement("div"); row.className = "preview-row";
    const name = document.createElement("strong"); name.textContent = tab.title || new URL(tab.url).hostname;
    const url = document.createElement("small"); url.textContent = tab.url;
    row.append(name,url); box.append(row);
  }
  $("import-preview").hidden = false;
  status("Найдено вкладок: "+group.tabs.length+". Проверь список и нажми «Создать группу из списка».");
}
function showCreate() {
  $("workspace").hidden=true; $("setup").hidden=true; $("create").hidden=false; status("");
}
async function createGroup(name, urls=[]) {
  name=name.trim();
  if(!name) throw Error("Укажи название группы");
  if(!rootId) throw Error("Сначала выбери корневую папку");
  const folder=await chrome.bookmarks.create({parentId:rootId,title:name});
  try {
    for (const url of urls) await chrome.bookmarks.create({parentId:folder.id,title:new URL(url).hostname,url});
  } catch (error) {
    status("Группа создана, но часть URL не удалось импортировать: "+error.message,true);
  }
  selectedGroupId=folder.id;
  await render();
}
$("refresh").addEventListener("click",()=>render().catch(e=>status(e.message,true)));
$("choose-root").addEventListener("click",()=>showSetup().catch(e=>status(e.message,true)));
$("save-root").addEventListener("click",async()=>{rootId=$("root").value;await chrome.storage.local.set({[ROOT_KEY]:rootId});selectedGroupId=null;await render();});
$("new-group").addEventListener("click",showCreate);
async function addBookmarkToGroup(url, title) {
  if (!selectedGroupId) throw Error("Сначала выбери группу");
  const normalized = validUrl(url);
  if (!normalized) throw Error("Укажи корректный HTTP(S)-адрес");
  await chrome.bookmarks.create({ parentId:selectedGroupId, url:normalized, title:title || new URL(normalized).hostname });
  await render();
  status("Ссылка добавлена");
}
$("add-url-button").addEventListener("click",async()=>{
  try{ await addBookmarkToGroup($("add-url").value); $("add-url").value=""; }
  catch(e){status(e.message,true);}
});
$("add-current").addEventListener("click",async()=>{
  try{
    const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});
    if(!tab || !validUrl(tab.url)) throw Error("Текущую страницу нельзя добавить: нужен сайт с HTTP(S)");
    await addBookmarkToGroup(tab.url, tab.title || new URL(tab.url).hostname);
  } catch(e){status(e.message,true);}
});
$("fetch-yandex").addEventListener("click",async()=>{
  try{
    const link=$("yandex-link").value.trim();
    if(!isYandexShareLink(link)) throw Error("Вставь корректную ссылку на группу browser.yandex.ru");
    status("Загрузка опубликованной группы…");
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),12000);
    let response;
    try { response=await fetch(link,{credentials:"omit",signal:controller.signal}); }
    finally {clearTimeout(timeout);}
    if(!response.ok) throw Error("Яндекс вернул HTTP "+response.status);
    const html=await response.text();
    if(html.length>3000000) throw Error("Слишком большой ответ сервера");
    showImportPreview(parseYandexHtml(html));
  } catch(e) {status("Не удалось прочитать ссылку: "+e.message+". Можно вставить HTML страницы ниже.",true);}
});
$("parse-html").addEventListener("click",()=>{
  try {
    const html=$("import-html").value;
    if(!html.trim()) throw Error("Вставь HTML-код страницы Яндекса");
    if(html.length>3000000) throw Error("Слишком большой HTML");
    showImportPreview(parseYandexHtml(html));
  } catch(e){ status(e.message,true); }
});
$("back").addEventListener("click",()=>render().catch(e=>status(e.message,true)));
$("create-group").addEventListener("click",()=>createGroup($("new-name").value).catch(e=>status(e.message,true)));
$("import-group").addEventListener("click",async()=>{
  try {
    const raw=$("import-urls").value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if(!raw.length) throw Error("Вставь адреса страниц, по одному на строку");
    const urls=raw.map(validUrl);
    if(urls.some(x=>!x)) throw Error("В списке есть некорректные URL. Разрешены только HTTP(S)");
    await createGroup($("import-name").value,urls);
    status("Импортировано вкладок: "+urls.length); $("import-preview").hidden=true;
  }catch(e){status(e.message,true);}
});
document.querySelectorAll("[data-mode]").forEach(button=>{
  button.addEventListener("click",()=>{
    const importing=button.dataset.mode==="import";
    $("blank-form").hidden=importing; $("import-form").hidden=!importing;
    document.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("selected",b===button));
  });
});
chrome.bookmarks.onCreated.addListener(()=>render().catch(console.warn));
chrome.bookmarks.onRemoved.addListener(()=>render().catch(console.warn));
chrome.bookmarks.onChanged.addListener(()=>render().catch(console.warn));
chrome.bookmarks.onMoved.addListener(()=>render().catch(console.warn));
(async()=>{const saved=await chrome.storage.local.get(ROOT_KEY);rootId=saved[ROOT_KEY]||null;await render();})().catch(e=>status(e.message,true));
