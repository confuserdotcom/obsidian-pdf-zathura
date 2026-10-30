// Unit tests:  npm test   (key handling on a fake PDF view; e2e.mjs: real keys in Obsidian)
const assert = require("assert");
const PdfZathura = require("./main.js");
const { cleanSettings, externalArgs, DEFAULTS, STATE } = PdfZathura.core;
let n = 0, failed = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message}`); } };

global.document = { body: { classList: { toggle() {} } }, querySelector: () => null };

// A plugin with no Obsidian behind it, and a PDF view that records what is done to it.
function setup(settings = {}, vimMotions = false) {
  const z = Object.create(PdfZathura.prototype);
  z.settings = cleanSettings(settings);
  z.state = { ...STATE, pages: {}, marks: {} };
  z.count = ""; z.pending = null;
  z.app = { plugins: { plugins: vimMotions ? { "vim-motions": { globalKeyHandler: {} } } : {} }, saveLocalStorage() {} };
  const p = {
    file: { path: "book.pdf", basename: "book" },
    box: { scrollTop: 0, scrollHeight: 10000, clientHeight: 800, scrollBy(x, y) { this.scrollTop += y; this.x = (this.x || 0) + x; } },
    pv: { currentPageNumber: 5, pagesCount: 40, currentScale: 1, spreadMode: 0, pagesRotation: 0,
      scrollPageIntoView({ pageNumber }) { this.currentPageNumber = pageNumber; } },
    child: {}, leaf: {}, app: {},
  };
  const keys = s => { for (const k of s.match(/C-.|./g)) z.run(p, k); };
  return { z, p, keys };
}

t("J / K: next / previous page, with a count", () => {
  const { p, keys } = setup();
  keys("J"); assert.strictEqual(p.pv.currentPageNumber, 6);
  keys("3K"); assert.strictEqual(p.pv.currentPageNumber, 3);
});
t("pages stop at the first and the last", () => {
  const { p, keys } = setup();
  keys("99J"); assert.strictEqual(p.pv.currentPageNumber, 40);
  keys("99K"); assert.strictEqual(p.pv.currentPageNumber, 1);
});
t("{n}G goes to page n; G alone to the bottom", () => {
  const { p, keys } = setup();
  keys("12G"); assert.strictEqual(p.pv.currentPageNumber, 12);
  keys("G"); assert.strictEqual(p.box.scrollTop, p.box.scrollHeight);
});
t("gg goes to page 1 without Vim Motions; {n}gg to page n", () => {
  const { p, keys } = setup();
  keys("gg"); assert.strictEqual(p.pv.currentPageNumber, 1);
  keys("7gg"); assert.strictEqual(p.pv.currentPageNumber, 7);
});
t("with Vim Motions a bare g is left to it, {n}gg stays ours", () => {
  const { z, p } = setup({}, true);
  assert.strictEqual(z.run(p, "g"), false);
  z.run(p, "8"); z.run(p, "g"); z.run(p, "g");
  assert.strictEqual(p.pv.currentPageNumber, 8);
});
t("j / k scroll by the scroll step, with a count", () => {
  const { p, keys } = setup({ scrollStep: 50 });
  keys("j"); assert.strictEqual(p.box.scrollTop, 50);
  keys("4j"); assert.strictEqual(p.box.scrollTop, 250);
  keys("k"); assert.strictEqual(p.box.scrollTop, 200);
});
t("d / u and Ctrl-d / Ctrl-u: half a page", () => {
  const { p, keys } = setup();
  keys("d"); assert.strictEqual(p.box.scrollTop, 400);
  keys("C-d"); assert.strictEqual(p.box.scrollTop, 800);
  keys("u"); assert.strictEqual(p.box.scrollTop, 400);
});
t("h / l scroll sideways by the sideways step", () => {
  const { p, keys } = setup({ sideStep: 30 });
  keys("2l"); assert.strictEqual(p.box.x, 60);
  keys("h"); assert.strictEqual(p.box.x, 30);
});
t("z / Z zoom by the zoom step, within limits", () => {
  const { p, keys } = setup({ zoomStep: 2 });
  keys("z"); assert.strictEqual(p.pv.currentScale, 2);
  keys("Z"); keys("Z"); assert.strictEqual(p.pv.currentScale, 0.5);
  keys("9z"); assert.strictEqual(p.pv.currentScale, 10);
});
t("W / Ctrl-0 fit width, H fit page, D dual page, r rotate", () => {
  const { p, keys } = setup();
  keys("W"); assert.strictEqual(p.pv.currentScaleValue, "page-width");
  keys("H"); assert.strictEqual(p.pv.currentScaleValue, "page-fit");
  keys("D"); assert.strictEqual(p.pv.spreadMode, 1); keys("D"); assert.strictEqual(p.pv.spreadMode, 0);
  keys("r"); keys("r"); assert.strictEqual(p.pv.pagesRotation, 180);
});
t("i and b toggle recolor and the status bar", () => {
  const { z, keys } = setup();
  keys("i"); assert.strictEqual(z.state.recolor, true);
  keys("b"); assert.strictEqual(z.state.statusbar, false);
});
t("marks: m<x> sets, '<x> comes back, per file", () => {
  const { z, p, keys } = setup();
  p.box.scrollTop = 3000; keys("ma");
  p.box.scrollTop = 0; keys("'a");
  assert.strictEqual(p.box.scrollTop, 3000);
  assert.ok(z.state.marks["book.pdf"].a > 0);
  keys("'b"); assert.strictEqual(p.box.scrollTop, 3000);  // unset mark: nothing moves
});
t("0 alone is not a count (Ctrl-0 and counts like 10 still work)", () => {
  const { p, keys } = setup();
  keys("10J"); assert.strictEqual(p.pv.currentPageNumber, 15);
});
t("Esc drops a count", () => {
  const { z, p } = setup();
  z.run(p, "4"); z.run(p, "Escape"); z.run(p, "J");
  assert.strictEqual(p.pv.currentPageNumber, 6);
});
t("keys that are not ours return false (they reach Obsidian)", () => {
  const { z, p } = setup();
  for (const k of ["x", "Enter", "C-p", "q"]) assert.strictEqual(z.run(p, k), false, k);
});

t("settings: numbers kept in range, defaults filled in", () => {
  const s = cleanSettings({ scrollStep: 0, zoomStep: 50, externalProgram: "  zathura " });
  assert.deepStrictEqual([s.scrollStep, s.zoomStep, s.sideStep, s.externalProgram, s.alternateKeys], [100, 3, 80, "zathura", false]);
});
t("settings: nothing saved yet = the defaults", () => assert.deepStrictEqual(cleanSettings(null), DEFAULTS));
t("external args: file and page filled in", () =>
  assert.deepStrictEqual(externalArgs("--page={page} {file}", "/v/My book.pdf", "12"), ["--page=12", "/v/My book.pdf"]));
t("external args: without a page, its word is left out", () =>
  assert.deepStrictEqual(externalArgs("--page={page} {file}", "/v/a.pdf", undefined), ["/v/a.pdf"]));
t("external args: positional page (zathura-open style)", () =>
  assert.deepStrictEqual(externalArgs("{file} {page}", "/v/a.pdf", "3"), ["/v/a.pdf", "3"]));

if (failed) { console.log(`${failed} failed, ${n} passed`); process.exit(1); }
console.log(`ok — ${n} tests`);
