// Real key presses in a running Obsidian. Run it through e2e-isolated.mjs (its own Obsidian, a
// throwaway vault with tools/sample.pdf and a note), or against an Obsidian started with
// --remote-debugging-port=PORT (default 9222) whose vault has sample.pdf and Notes.md at its root.
const PORT = process.env.PORT || 9222;
const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
const ws = new WebSocket(list.find(p => p.type === "page" && p.url.endsWith("/index.html")).webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
let id = 0; const pend = {};
ws.onmessage = e => { const m = JSON.parse(e.data); pend[m.id]?.(m); };
const call = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval failed");
  return r.result?.result?.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const P = `app.plugins.plugins["pdf-zathura"]`;

// one key: a character, <Esc> <Tab>, or <C-x> <A-.> <A-S-.> with modifiers (Alt 1, Ctrl 2, Shift 8)
const CODES = { ".": "Period", ",": "Comma", "6": "Digit6", "/": "Slash", "'": "Quote", "=": "Equal" };
async function key(k) {
  const m = /^<((?:[ACS]-)*)(.+)>$/.exec(k);
  let mods = 0, name = k;
  if (m) { name = m[2]; for (const c of m[1].split("-").filter(Boolean)) mods |= { A: 1, C: 2, S: 8 }[c]; }
  const special = { Esc: ["Escape", 27], Tab: ["Tab", 9] }[name];
  const keyName = special ? special[0] : name;
  const code = special ? special[0] : CODES[name] || (/^[a-z]$/i.test(name) ? "Key" + name.toUpperCase() : /^[0-9]$/.test(name) ? "Digit" + name : "");
  const vk = special ? special[1] : name.toUpperCase().charCodeAt(0);
  const text = !special && !(mods & 3) ? name : undefined;
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: keyName, code, text, unmodifiedText: text, windowsVirtualKeyCode: vk, modifiers: mods });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: keyName, code, windowsVirtualKeyCode: vk, modifiers: mods });
  await sleep(150);
}
const keys = async s => { for (const k of s.match(/<[^>]+>|./gu)) await key(k); };
const page = () => ev(`${P}.pdf(app.workspace.getLeavesOfType("pdf")[0])?.pv.currentPageNumber`);
let fails = 0; const report = (ok, name, d) => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "\n      " + JSON.stringify(d)}`); };

// open the PDF alone in the active tab, wait until pdf.js has its pages, focus the page
async function openPdf() {
  await ev(`(async()=>{const ws=app.workspace;ws.iterateRootLeaves(l=>{if(l!==ws.getLeaf(false))l.detach()});
    await ws.getLeaf(false).openFile(app.vault.getAbstractFileByPath("sample.pdf"));
    for(let i=0;i<60&&!${P}.pdf();i++)await new Promise(r=>setTimeout(r,250));
    await new Promise(r=>setTimeout(r,800));ws.setActiveLeaf(${P}.pdf().leaf,{focus:true});${P}.pdf().box.focus()})()`);
  await sleep(300);
}
try {
  await ev(`(()=>{const z=${P};z.state.pages={};z.state.marks={};z.state.recolor=false;z.state.statusbar=true;z.applyBodyClasses();z.save()})()`);
  await ev(`(async()=>{Object.assign(${P}.settings,{remoteKeys:false,alternateKeys:false,focusMode:false});await ${P}.saveSettings()})()`);
  await openPdf();
  const pages = await ev(`${P}.pdf().pv.pagesCount`);
  report(pages >= 6, "the sample PDF is open", { pages });
  await keys("gg"); await sleep(400);
  report(await page() === 1, "gg: first page", await page());
  await keys("J"); await sleep(400);
  report(await page() === 2, "J: next page", await page());
  await keys("3J"); await sleep(400);
  report(await page() === 5, "3J: three pages on", await page());
  await keys("2K"); await sleep(400);
  report(await page() === 3, "2K: two pages back", await page());
  await keys("6G"); await sleep(500);
  report(await page() === 6, "6G: page 6", await page());
  const bar = await ev(`document.querySelector(".pz-status")?.textContent`);
  report(/sample\s+\[6\/\d+\]\s+\d+%/.test(bar || ""), "status bar: file [page/pages] percent", bar);
  await keys("ma"); await keys("gg"); await sleep(400); await keys("'a"); await sleep(500);
  report(await page() === 6, "m a, gg, ' a: back to the mark", await page());
  await keys("G"); await sleep(600);
  report(await page() === pages, "G: last page", { got: await page(), pages });
  await keys("gg"); await sleep(400);
  const top0 = await ev(`${P}.pdf().box.scrollTop`);
  await keys("3j"); await sleep(300);
  const top1 = await ev(`${P}.pdf().box.scrollTop`);
  report(top1 - top0 === 300, "3j: scrolls 3 steps", { top0, top1 });
  await keys("d"); await sleep(300);
  const top2 = await ev(`${P}.pdf().box.scrollTop`), half = await ev(`${P}.pdf().box.clientHeight/2`);
  report(Math.abs(top2 - top1 - half) <= 1, "d: half a page", { top1, top2, half });
  const s0 = await ev(`${P}.pdf().pv.currentScale`);
  await keys("z"); await sleep(400);
  const s1 = await ev(`${P}.pdf().pv.currentScale`);
  report(Math.abs(s1 / s0 - 1.1) < 0.01, "z: zoom in by the step", { s0, s1 });
  await keys("W"); await sleep(400);
  report(await ev(`${P}.pdf().pv.currentScaleValue`) === "page-width", "W: fit width", await ev(`${P}.pdf().pv.currentScaleValue`));
  await keys("i"); await sleep(200);
  report(await ev(`document.body.classList.contains("pz-recolor")`), "i: recolor on", null);
  await keys("i"); await keys("b"); await sleep(200);
  report(await ev(`!document.body.classList.contains("pz-recolor") && document.body.classList.contains("pz-nostatus")`), "i again: off; b: status bar hidden", null);
  await keys("b"); await sleep(200);
  await keys("<Tab>"); await sleep(600);
  report(await ev(`!!${P}.pdf().app.pdfSidebar?.isOpen`), "Tab: table of contents open", null);
  await keys("<Tab>"); await sleep(400);
  // last page read comes back when the PDF is opened again
  await keys("4G"); await sleep(2200);
  await ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath("Notes.md"))`); await sleep(800);
  await openPdf(); await sleep(600);
  report(await page() === 4, "reopened: back on the last page read", await page());
  // study split: PDF | note, keys typed in the note stay the note's
  await ev(`app.commands.executeCommandById("pdf-zathura:study-split")`); await sleep(1500);
  const split = await ev(`(()=>{const t=[];app.workspace.iterateRootLeaves(l=>{t.push(l.view.getViewType())});return t})()`);
  const active = await ev(`app.workspace.activeLeaf.view.getViewType()`);
  report(split.includes("pdf") && split.includes("markdown") && active === "markdown", "study split from the PDF: note beside it, focused", { split, active });
  report(await ev(`document.body.classList.contains("pz-split")`), "pz-split body class", null);
  await ev(`app.workspace.activeEditor.editor.setValue("one\\ntwo");app.workspace.activeEditor.editor.setCursor(0,0);app.workspace.activeEditor.editor.focus()`);
  await keys("<Esc>J"); await sleep(300);
  report(await ev(`app.workspace.activeEditor.editor.getValue()`) === "one two" && await page() === 4, "J in the note joins lines; the PDF stays", { doc: await ev(`app.workspace.activeEditor.editor.getValue()`), page: await page() });
  // global keys are off by default, then on
  await keys("<A-S-.>"); await sleep(400);
  const pOff = await ev(`${P}.pdf(app.workspace.getLeavesOfType("pdf")[0])?.pv.currentPageNumber`);
  report(pOff === 4, "Alt+Shift+. does nothing while remote keys are off", pOff);
  await ev(`(async()=>{${P}.settings.remoteKeys=true;${P}.settings.alternateKeys=true;await ${P}.saveSettings()})()`);
  await keys("<A-S-.>"); await sleep(600);
  const pOn = await ev(`${P}.pdf(app.workspace.getLeavesOfType("pdf")[0])?.pv.currentPageNumber`);
  report(pOn === 5, "remote keys on: Alt+Shift+. from the note turns the PDF's page", pOn);
  await keys("<C-6>"); await sleep(400);
  report(await ev(`app.workspace.activeLeaf.view.getViewType()`) === "pdf", "Ctrl+6: back to the PDF pane", await ev(`app.workspace.activeLeaf.view.getViewType()`));
  await keys("<C-6>"); await sleep(400);
  report(await ev(`app.workspace.activeLeaf.view.getViewType()`) === "markdown", "Ctrl+6 again: the note", await ev(`app.workspace.activeLeaf.view.getViewType()`));
  // focus mode
  await ev(`(async()=>{${P}.settings.focusMode=true;await ${P}.saveSettings()})()`); await sleep(300);
  report(await ev(`document.body.classList.contains("pz-focus") && getComputedStyle(document.querySelector(".workspace-ribbon")).display==="none"`), "focus mode: ribbon hidden while a PDF is on screen", null);
  await ev(`app.commands.executeCommandById("pdf-zathura:study-split")`); await sleep(800);
  const one = await ev(`(()=>{const t=[];app.workspace.iterateRootLeaves(l=>{t.push(l.view.getViewType())});return t})()`);
  report(one.length === 1 && one[0] === "markdown", "study split again: one pane, the one you were in", one);
  report(await ev(`getComputedStyle(document.querySelector(".workspace-ribbon")).display!=="none"`), "no PDF on screen: ribbon back", null);
  // the plugin goes away cleanly
  await ev(`app.plugins.disablePlugin("pdf-zathura")`); await sleep(400);
  report(await ev(`!document.body.className.includes("pz-") && !document.querySelector(".pz-status")`), "disabled: no classes or status bars left", await ev(`document.body.className`));
  await ev(`app.plugins.enablePlugin("pdf-zathura")`); await sleep(600);
} catch (e) { fails++; console.log("CRASH", e.message); }
console.log(fails ? `${fails} FAILED` : "all passed");
ws.close();
process.exit(fails ? 1 : 0);
