// PDF Zathura Keys: zathura's keys, recolor, status bar, marks and last-page memory in
// Obsidian's PDF view.
//   J K          next / previous page        j k       scroll
//   u d  ^u ^d   half page up / down        h l ^h ^l ← →  scroll sideways
//   gg  G  {n}G  top / bottom / page n      z = +  Z -  zoom in / out
//   H  W  ^0     fit page / fit width       D         dual page
//   r            rotate                     i         recolor (dark page)
//   Tab  T       table of contents          b         status bar
//   / n N        search, next, previous     m<x> '<x> set / go to mark
//   R            reload                     Esc       cancel count
// Commands: study split (PDF | note), previous tab or pane, drive the PDF from the note,
// open PDFs in an external program (zathura itself), toggles.
const obsidian = (() => { try { return require("obsidian"); } catch { return {}; } })(); // node tests
const { Plugin = class {}, PluginSettingTab = class {}, Setting, Notice = class {}, TFile = class {}, WorkspaceLeaf } = obsidian;

const ZMIN = 0.1, ZMAX = 10;
const DEFAULTS = {
  scrollStep: 100, sideStep: 80, zoomStep: 1.1,
  alternateKeys: false,     // Alt+Tab / Ctrl+6 anywhere: previous tab or pane
  remoteKeys: false,        // Alt+. Alt+, (Shift: page) from the note drive the PDF
  focusMode: false,         // a PDF on screen hides sidebars, tabs, title bar
  externalProgram: "",      // e.g. zathura: PDFs opened from Obsidian go there (toggle per device)
  externalArgs: "--page={page} {file}",
};
// Per device, like zathura's own database: kept in localStorage, not in data.json (which a sync
// tool would fight over between devices).
const STATE = { recolor: false, statusbar: true, external: false, pages: {}, marks: {} };

function cleanSettings(s) {
  const o = { ...DEFAULTS, ...s }, num = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || d));
  o.scrollStep = num(o.scrollStep, DEFAULTS.scrollStep, 10, 2000);
  o.sideStep = num(o.sideStep, DEFAULTS.sideStep, 10, 2000);
  o.zoomStep = num(o.zoomStep, DEFAULTS.zoomStep, 1.01, 3);
  o.externalProgram = String(o.externalProgram || "").trim();
  o.externalArgs = String(o.externalArgs ?? DEFAULTS.externalArgs);
  for (const k of ["alternateKeys", "remoteKeys", "focusMode"]) o[k] = !!o[k];
  return o;
}

// The external program's arguments: {file} and {page} filled in; a word with {page} is left out
// when there is no page. Split before filling, so a file name with spaces stays one argument.
function externalArgs(template, file, page) {
  return template.split(/\s+/).filter(Boolean)
    .filter(w => page || !w.includes("{page}"))
    .map(w => w.replaceAll("{file}", file).replaceAll("{page}", page ?? ""));
}

class PdfZathura extends Plugin {
  async onload() {
    this.settings = cleanSettings(await this.loadData());
    this.count = "";
    this.hooked = new WeakSet(); // PDF views already given a status bar
    this.pending = null; // "g" | "m" | "'"
    this.state = Object.assign({}, STATE, { pages: {}, marks: {} }, this.app.loadLocalStorage("pdf-zathura"));
    this.applyBodyClasses();
    this.hookExternal();
    this.addSettingTab(new PdfZathuraSettings(this.app, this));
    this.registerDomEvent(window, "keydown", (e) => this.onKey(e), { capture: true });
    const refresh = () => { this.attachAll(); this.studyClasses(); };
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => { this.trackLeaf(leaf); refresh(); }));
    this.registerEvent(this.app.workspace.on("layout-change", refresh));
    this.app.workspace.onLayoutReady(refresh);
    this.addCommand({ id: "alternate", name: "Previous tab or pane (PDF ⇄ note)", callback: () => this.alternate() });
    this.addCommand({ id: "study-split", name: "Study split: PDF | note (toggle)", callback: () => this.studySplit() });
    this.addCommand({ id: "pdf-half-down", name: "Scroll the PDF beside the note down half a page", callback: () => this.remote(false, true) });
    this.addCommand({ id: "pdf-half-up", name: "Scroll the PDF beside the note up half a page", callback: () => this.remote(false, false) });
    this.addCommand({ id: "pdf-next-page", name: "Next page of the PDF beside the note", callback: () => this.remote(true, true) });
    this.addCommand({ id: "pdf-previous-page", name: "Previous page of the PDF beside the note", callback: () => this.remote(true, false) });
    this.addCommand({ id: "toggle-recolor", name: "Toggle recolor (dark pages)", callback: () => this.toggle("recolor") });
    this.addCommand({ id: "toggle-statusbar", name: "Toggle the status bar", callback: () => this.toggle("statusbar") });
    this.addCommand({ id: "toggle-external", name: "Open PDFs in the external program on this device (toggle)", callback: () => {
      if (!this.settings.externalProgram) return new Notice("PDF Zathura Keys: set the external program in the settings first");
      this.state.external = !this.state.external;
      this.save();
      new Notice("PDFs open in " + (this.state.external ? this.settings.externalProgram : "Obsidian"));
    } });
  }

  onunload() {
    if (this.origOpenFile) WorkspaceLeaf.prototype.openFile = this.origOpenFile;
    this.macButtons(true);
    window.clearTimeout(this.saveTimer);
    this.save();
    document.body.classList.remove("pz-recolor", "pz-nostatus", "pz-focus", "pz-study", "pz-split", "pz-pdf-active");
    document.querySelectorAll(".pz-status").forEach((el) => el.remove());
  }

  async saveSettings() {
    this.settings = cleanSettings(this.settings);
    await this.saveData(this.settings);
    this.applyBodyClasses();
    this.studyClasses();
  }

  // Route PDF opens to the external program. Every way of opening a file (file list, links,
  // quick switcher) ends in WorkspaceLeaf.openFile; embeds do not. Desktop only.
  hookExternal() {
    if (!WorkspaceLeaf || this.origOpenFile) return;
    const plugin = this, orig = (this.origOpenFile = WorkspaceLeaf.prototype.openFile);
    WorkspaceLeaf.prototype.openFile = async function (file, openState) {
      const prog = plugin.settings.externalProgram.replace(/^~(?=\/)/, () => require("os").homedir());
      if (!plugin.state.external || !prog || file?.extension !== "pdf") return orig.apply(this, arguments);
      const page = /page=(\d+)/.exec(openState?.eState?.subpath || "")?.[1];
      const path = plugin.app.vault.adapter.getFullPath(file.path);
      require("child_process").spawn(prog, externalArgs(plugin.settings.externalArgs, path, page), { detached: true, stdio: "ignore" })
        .on("error", () => new Notice("PDF Zathura Keys: cannot run " + prog)).unref();
      if (this.view?.getViewType() === "empty") this.detach(); // tab opened just for the PDF
    };
  }

  // Leaves of the main area that are on screen (not background tabs).
  visibleLeaves() {
    const out = [];
    this.app.workspace.iterateRootLeaves((l) => { if (l.containerEl.isShown()) out.push(l); });
    return out;
  }

  // Body classes (styles.css, or your own snippet, can use them):
  //   pz-study       a PDF is on screen
  //   pz-split       … next to a note
  //   pz-pdf-active  the PDF itself has focus
  //   pz-focus       focus mode is on (styles.css hides sidebars, tabs, title bar while pz-study)
  studyClasses() {
    const vis = this.visibleLeaves();
    const type = (l) => l?.view?.getViewType?.();
    const study = vis.some((l) => type(l) === "pdf");
    const split = study && vis.some((l) => type(l) === "markdown");
    const b = document.body.classList;
    b.toggle("pz-study", study);
    b.toggle("pz-split", split);
    b.toggle("pz-pdf-active", type(this.app.workspace.activeLeaf) === "pdf");
    this.macButtons(!(study && this.settings.focusMode));
  }

  // macOS: the red/yellow/green buttons float over the page once focus mode hides the title bar.
  macButtons(show) {
    try {
      const win = window.electron?.remote?.getCurrentWindow?.();
      if (!win?.setWindowButtonVisibility) return; // not macOS
      win.setWindowButtonVisibility(!!show);
    } catch (e) { /* never break the view over a cosmetic */ }
  }

  // ── Alternate: last two main-area leaves, like Vim's # buffer ─────
  trackLeaf(leaf) {
    if (!leaf || leaf === this.curLeaf || leaf.getRoot?.() !== this.app.workspace.rootSplit) return;
    this.prevLeaf = this.curLeaf;
    this.curLeaf = leaf;
  }

  alternate() {
    const ws = this.app.workspace, prev = this.prevLeaf;
    let alive = false;
    if (prev) ws.iterateRootLeaves((l) => { if (l === prev) alive = true; });
    if (alive) return ws.setActiveLeaf(prev, { focus: true });
    // tab was closed: reopen the last file of the other kind (or just the last one)
    const cur = ws.getActiveFile();
    const want = cur?.extension === "pdf" ? "md" : cur?.extension === "md" ? "pdf" : null;
    const f = (want && this.lastFile(want)) || this.lastFile(null, cur);
    if (!f) return new Notice("No previous tab");
    ws.getLeaf(false).openFile(f);
  }

  // ── Study split ─────────────────────────────────────────────────────
  lastFile(ext, not = null) {
    for (const path of this.app.workspace.getLastOpenFiles()) {
      const f = this.app.vault.getAbstractFileByPath(path);
      if (f instanceof TFile && f !== not && (!ext || f.extension === ext)) return f;
    }
    return null;
  }

  async studySplit() {
    const ws = this.app.workspace;
    const active = ws.activeLeaf;
    const type = active?.view?.getViewType?.();
    const vis = this.visibleLeaves();
    const pdfLeaf = vis.find((l) => l.view.getViewType() === "pdf");
    const noteLeaf = vis.find((l) => l.view.getViewType() === "markdown");
    if (pdfLeaf && noteLeaf) { // already split: keep the pane you are in
      (active === pdfLeaf ? noteLeaf : pdfLeaf).detach();
      return;
    }
    if (type === "pdf") {
      const note = this.lastFile("md");
      if (!note) return new Notice("No recent note: open one first");
      const leaf = ws.createLeafBySplit(active, "vertical", false); // note on the right
      await leaf.openFile(note);
      ws.setActiveLeaf(leaf, { focus: true });
    } else if (type === "markdown") {
      const pdf = this.lastFile("pdf");
      if (!pdf) return new Notice("No recent PDF: open one first");
      const leaf = ws.createLeafBySplit(active, "vertical", true); // PDF on the left
      await leaf.openFile(pdf, { active: false });
      ws.setActiveLeaf(active, { focus: true });
    } else {
      new Notice("Open a PDF or a note first");
    }
  }

  save() { this.app.saveLocalStorage("pdf-zathura", this.state); }
  applyBodyClasses() {
    const b = document.body.classList;
    b.toggle("pz-recolor", this.state.recolor);
    b.toggle("pz-nostatus", !this.state.statusbar);
    b.toggle("pz-focus", this.settings.focusMode);
  }
  toggle(what) { this.state[what] = !this.state[what]; this.applyBodyClasses(); this.save(); }

  // ── a PDF view (default: the active one) ───────────────────────────
  pdf(leaf = this.app.workspace.activeLeaf) {
    const v = leaf?.view;
    if (!v || v.getViewType() !== "pdf") return null;
    const child = v.viewer?.child;
    const app = child?.pdfViewer;          // pdf.js PDFViewerApplication-like
    const pv = app?.pdfViewer;             // pdf.js PDFViewer
    const box = v.containerEl.querySelector(".pdf-viewer-container");
    if (!pv || !box || !pv.pagesCount) return null;
    return { leaf, v, child, app, pv, box, file: v.file };
  }

  attachAll() {
    for (const l of this.visibleLeaves()) if (l.view?.getViewType?.() === "pdf") this.attach(l);
  }

  // status bar + page memory, hooked once per PDF view
  attach(leaf, tries = 0) {
    if (this.hooked.has(leaf.view)) return;
    const p = this.pdf(leaf);
    if (!p) { // still loading: try again shortly
      if (tries < 40) window.setTimeout(() => this.attach(leaf, tries + 1), 250);
      return;
    }
    this.hooked.add(p.v);
    const bar = p.v.containerEl.createDiv({ cls: "pz-status" });
    let raf = 0;
    const update = () => {
      raf = 0;
      if (!p.v.containerEl.isConnected) return;
      const pct = Math.round((100 * p.box.scrollTop) / Math.max(1, p.box.scrollHeight - p.box.clientHeight));
      bar.setText(`${p.file.basename}   [${p.pv.currentPageNumber}/${p.pv.pagesCount}]   ${pct}%`);
      if (p.file) { this.state.pages[p.file.path] = p.pv.currentPageNumber; this.saveSoon(); }
    };
    this.registerDomEvent(p.box, "scroll", () => { if (!raf) raf = window.requestAnimationFrame(update); }, { passive: true });
    // back to the last page read (zathura's database)
    const last = p.file && this.state.pages[p.file.path];
    if (last && last > 1 && p.pv.currentPageNumber === 1) p.pv.currentPageNumber = Math.min(last, p.pv.pagesCount);
    update();
  }

  saveSoon() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.save(), 1500);
  }

  // Vim Motions' global key handler, when that plugin runs: it owns g and Space sequences.
  vimMotions() { return this.app.plugins?.plugins?.["vim-motions"]?.globalKeyHandler; }

  // ── keys ────────────────────────────────────────────────────────────
  onKey(e) {
    const altTab = e.altKey && !e.ctrlKey && e.code === "Tab";
    if (this.settings.alternateKeys && !e.metaKey && !e.shiftKey && (altTab || (e.ctrlKey && !e.altKey && e.code === "Digit6"))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return this.alternate();
    }
    if (this.settings.remoteKeys && e.altKey && !e.metaKey && !e.ctrlKey && (e.code === "Period" || e.code === "Comma")) {
      if (this.remote(e.shiftKey, e.code === "Period")) { e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    if (e.metaKey || e.altKey || e.isComposing) return;
    const p = this.pdf(); // cheap: bail out first when no PDF is active
    if (!p) return;
    const t = e.target;
    const fb = p.child.findBar;
    if (fb && t === fb.searchComponent?.inputEl && e.key === "Enter") {
      // like zathura: Enter searches, then keys go back to the page
      this.lastQuery = t.value;
      window.setTimeout(() => { t.blur(); this.pdf()?.box.focus(); }, 0);
      return;
    }
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector(".modal-container, .menu, .suggestion-container")) return;
    if (this.vimMotions()?.keyBuffer?.length) return; // mid Space-leader sequence
    const key = (e.ctrlKey ? "C-" : "") + e.key;
    if (["Shift", "Control", "C-Control"].includes(e.key)) return;
    if (this.run(p, key) === false) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  // returns false when the key is not ours (it then reaches Obsidian, or Vim Motions)
  run(p, key) {
    const path = p.file?.path ?? "";
    const { scrollStep: STEP, sideStep: HSTEP, zoomStep: ZOOM } = this.settings;
    if (this.pending) {
      const what = this.pending; this.pending = null;
      if (what === "g") { if (key !== "g") return (this.count = ""), true; this.goPage(p, this.takeCount(1)); return true; }
      if (key.length !== 1) return true;
      const marks = (this.state.marks[path] ??= {});
      if (what === "m") { marks[key] = p.box.scrollTop / p.box.scrollHeight; this.save(); }
      else if (marks[key] != null) p.box.scrollTop = marks[key] * p.box.scrollHeight;
      return true;
    }
    if (/^[0-9]$/.test(key) && (this.count || key !== "0")) { this.count += key; return true; }
    // {n}gg is ours; with Vim Motions, a bare g goes to it (gg, gt, gT, gf still work)
    if (key === "g") { if (!this.count && this.vimMotions()) return false; this.pending = "g"; return true; }
    const n = this.takeCount(1);
    const half = p.box.clientHeight / 2;
    switch (key) {
      case "j": case "ArrowDown": p.box.scrollBy(0, STEP * n); break;
      case "k": case "ArrowUp": p.box.scrollBy(0, -STEP * n); break;
      case "h": case "C-h": case "ArrowLeft": p.box.scrollBy(-HSTEP * n, 0); break;
      case "l": case "C-l": case "ArrowRight": p.box.scrollBy(HSTEP * n, 0); break;
      case "d": case "C-d": p.box.scrollBy(0, half * n); break;
      case "u": case "C-u": p.box.scrollBy(0, -half * n); break;
      case "J": this.goPage(p, p.pv.currentPageNumber + n); break;
      case "K": this.goPage(p, p.pv.currentPageNumber - n); break;
      case "G": this.goPage(p, this.lastCount ? n : p.pv.pagesCount, !this.lastCount); break;
      case "z": case "=": case "+": this.zoom(p, Math.pow(ZOOM, n)); break;
      case "Z": case "-": this.zoom(p, Math.pow(1 / ZOOM, n)); break;
      case "C-0": case "W": p.pv.currentScaleValue = "page-width"; break;
      case "H": p.pv.currentScaleValue = "page-fit"; break;
      case "D": p.pv.spreadMode = p.pv.spreadMode ? 0 : 1; break;
      case "r": p.pv.pagesRotation = (p.pv.pagesRotation + 90 * n) % 360; break;
      case "i": this.toggle("recolor"); break;
      case "b": this.toggle("statusbar"); break;
      case "Tab": case "T": this.toggleIndex(p); break;
      case "/": p.child.findBar?.open?.(); break;
      case "n": case "N": this.findAgain(p, key === "N"); break;
      case "m": case "'": this.pending = key; break;
      case "R": p.leaf.rebuildView?.(); break;
      case "Escape": break;
      default: return false;
    }
    return true;
  }

  // Drive the PDF on screen from the note: half a page, or a whole page. False if no PDF is visible.
  remote(page, down) {
    const leaf = this.visibleLeaves().find((l) => l.view?.getViewType?.() === "pdf");
    const p = leaf && this.pdf(leaf);
    if (!p) return false;
    if (page) this.goPage(p, p.pv.currentPageNumber + (down ? 1 : -1));
    else p.box.scrollBy(0, (down ? 1 : -1) * p.box.clientHeight / 2);
    return true;
  }

  takeCount(def) {
    this.lastCount = this.count !== "";
    const n = this.lastCount ? parseInt(this.count, 10) : def;
    this.count = "";
    return n;
  }

  goPage(p, n, bottom) {
    const page = Math.max(1, Math.min(p.pv.pagesCount, n));
    if (bottom) { p.box.scrollTop = p.box.scrollHeight; return; }
    p.pv.scrollPageIntoView({ pageNumber: page });
  }

  zoom(p, f) {
    p.pv.currentScale = Math.max(ZMIN, Math.min(ZMAX, p.pv.currentScale * f));
  }

  toggleIndex(p) {
    const sb = p.app.pdfSidebar;
    if (!sb) return;
    if (sb.isOpen) sb.close();
    else { sb.switchView?.(2, true); if (!sb.isOpen) sb.open(); } // 2 = outline
  }

  findAgain(p, back) {
    const fb = p.child.findBar;
    if (!fb) return;
    const input = fb.searchComponent.inputEl;
    if (!input.value) {
      if (!this.lastQuery) return fb.open();
      fb.open(); input.value = this.lastQuery; input.blur(); p.box.focus();
    }
    fb.dispatchEvent("again", back);
  }
}

// Obsidian 1.13+ draws the settings tab from getSettingDefinitions() and lists every row in its
// settings search; older versions call display(), which draws the same definitions here.
function drawSettings(tab, defs, nested) {
  const el = tab.containerEl;
  if (!nested) el.empty();
  for (const d of defs) {
    if ((typeof d.visible === "function" ? d.visible() : d.visible) === false) continue;
    if (d.type === "group") {
      if (d.heading) new Setting(el).setName(d.heading).setHeading();
      drawSettings(tab, d.items || [], true);
      continue;
    }
    const row = new Setting(el).setName(d.name), c = d.control;
    if (d.desc) row.setDesc(d.desc);
    if (d.render) d.render(row);
    if (!c) continue;
    const value = tab.getControlValue(c.key) ?? c.defaultValue, ph = c.placeholder || "";
    const commit = async (v, redraw) => {
      if (c.validate && c.validate(v)) return;
      await tab.setControlValue(c.key, v);
      if (redraw) tab.display(); // the rows that hang on this one show or hide
    };
    if (c.type === "toggle") row.addToggle(t => t.setValue(!!value).onChange(v => commit(v, true)));
    else if (c.type === "dropdown") row.addDropdown(t => t.addOptions(c.options).setValue(value).onChange(v => commit(v, true)));
    else if (c.type === "number") row.addText(t => t.setPlaceholder(ph).setValue(String(value ?? "")).onChange(v => {
      const n = Number(v);
      if (v.trim() && Number.isFinite(n) && !(n < c.min) && !(n > c.max)) commit(n);
    }));
    else row.addText(t => t.setPlaceholder(ph).setValue(value ?? "").onChange(v => commit(v)));
  }
}

class PdfZathuraSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  getControlValue(key) { return this.plugin.settings[key]; }
  async setControlValue(key, value) { this.plugin.settings[key] = value; await this.plugin.saveSettings(); }
  display() { drawSettings(this, this.getSettingDefinitions()); }

  getSettingDefinitions() {
    return [
      { name: "Scroll step", desc: "Pixels moved by j and k.", control: { type: "number", key: "scrollStep", placeholder: "100", min: 10, max: 2000 } },
      { name: "Sideways step", desc: "Pixels moved by h and l.", control: { type: "number", key: "sideStep", placeholder: "80", min: 10, max: 2000 } },
      { name: "Zoom step", desc: "Factor applied by z and Z (1.1 = 10 %).", control: { type: "number", key: "zoomStep", placeholder: "1.1", min: 1.01, max: 3, step: 0.01 } },
      { type: "group", heading: "Global keys", items: [
        { name: "Alt+Tab and Ctrl+6: previous tab or pane", desc: "Anywhere, even while typing: back to the tab or pane you were in (PDF ⇄ note), again to come back, like Vim's Ctrl-^. On macOS Alt is Option. The command works without this, bound to any hotkey.",
          control: { type: "toggle", key: "alternateKeys" } },
        { name: "Alt+. and Alt+, drive the PDF from the note", desc: "Half a page down / up in the PDF on screen while you type in the note beside it; with Shift, a whole page. The commands work without this, bound to any hotkey.",
          control: { type: "toggle", key: "remoteKeys" } },
      ] },
      { type: "group", heading: "Look", items: [
        { name: "Focus mode", desc: "While a PDF is on screen, hide the sidebars, tabs, status bar and title bar; the PDF toolbar shows when you point at the top of the page.",
          control: { type: "toggle", key: "focusMode" } },
      ] },
      { type: "group", heading: "External program", items: [
        { name: "Program", desc: "Open PDFs in this program instead of Obsidian's view (file list, links, [[book.pdf#page=12]], quick switcher), for example zathura. Turned on per device with the command \"Open PDFs in the external program on this device\". Empty: never.",
          control: { type: "text", key: "externalProgram", placeholder: "zathura" } },
        { name: "Arguments", desc: "{file} is the PDF's full path, {page} the page of a #page=N link (a word with {page} is left out when there is none).",
          control: { type: "text", key: "externalArgs", placeholder: DEFAULTS.externalArgs } },
      ] },
    ];
  }
}

module.exports = PdfZathura;
module.exports.core = { cleanSettings, externalArgs, DEFAULTS, STATE };
