<img src="docs/readme/demo.webp" width="100%" alt="PDF Zathura Keys recorded in Obsidian: J and K turn pages, 5G, gg and G jump, i recolours the pages dark, / searches with n and N, Tab opens the table of contents, and a study split puts the PDF beside your notes.">

<p align="center">
  <b>Read PDFs in Obsidian like it's zathura.</b><br>
  <code>J</code> <code>K</code> <code>gg</code> <code>G</code>, dark recolor, marks, a status bar and a study split, all without the mouse.
</p>

<p align="center">
  <a href="https://github.com/confuserdotcom/obsidian-pdf-zathura/releases/latest"><img src="https://img.shields.io/github/v/release/confuserdotcom/obsidian-pdf-zathura?style=flat-square&color=7c3aed&label=release" alt="Latest release"></a>
  <a href="https://github.com/confuserdotcom/obsidian-pdf-zathura/releases"><img src="https://img.shields.io/github/downloads/confuserdotcom/obsidian-pdf-zathura/total?style=flat-square&color=7c3aed" alt="Downloads"></a>
  <a href="https://github.com/confuserdotcom/obsidian-pdf-zathura/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/confuserdotcom/obsidian-pdf-zathura/test.yml?branch=main&style=flat-square&label=tests" alt="Tests"></a>
  <a href="https://github.com/confuserdotcom/obsidian-pdf-zathura/stargazers"><img src="https://img.shields.io/github/stars/confuserdotcom/obsidian-pdf-zathura?style=flat-square&color=7c3aed" alt="Stars"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/confuserdotcom/obsidian-pdf-zathura?style=flat-square&color=7c3aed" alt="MIT license"></a>
</p>

<p align="center">
  <a href="#keys">Keys</a> ·
  <a href="#commands">Commands</a> ·
  <a href="#settings">Settings</a> ·
  <a href="#install">Install</a>
</p>

[Zathura](https://pwmt.org/projects/zathura/)'s keys in [Obsidian](https://obsidian.md)'s PDF view: read a book without touching the mouse. Also a dark recolor, a status bar, marks, last-page memory, and a study split that puts the PDF next to your notes.

<p align="center">▶ <a href="docs/readme/demo.mp4"><b>Watch the full-quality video</b></a></p>

## Keys

In a PDF tab, with the page focused:

| Keys | What they do |
| --- | --- |
| `J` `K` | next / previous page |
| `j` `k` `↓` `↑` | scroll |
| `d` `u` `Ctrl-d` `Ctrl-u` | half a page down / up |
| `h` `l` `Ctrl-h` `Ctrl-l` `←` `→` | scroll sideways |
| `gg` `G` `{n}G` `{n}gg` | first page, bottom, page n |
| `z` `=` `+` / `Z` `-` | zoom in / out |
| `W` `Ctrl-0` / `H` | fit width / fit page |
| `D` | dual page |
| `r` | rotate |
| `i` | recolor: dark pages, colours keep their hue |
| `b` | status bar on / off |
| `Tab` `T` | table of contents |
| `/` then `Enter`, `n` `N` | search (Enter goes back to the page), next, previous |
| `m{x}` `'{x}` | set a mark / go back to it (per file) |
| `R` | reload |
| `Esc` | drop a count |

Counts work like in zathura: `3J`, `5j`, `12G`. Keys typed in a note, a search box or a dialog are left alone.

- **Status bar**: `file   [page/pages]   percent`, at the bottom of each PDF.
- **Last page read**: a PDF opens again where you left it, like zathura's database.
- Recolor, status bar, marks and last pages are kept per device, so two devices syncing the same vault don't fight over them.

## Commands

Bind them to hotkeys (or vimrc maps, see below):

- **Study split: PDF | note (toggle)**: from a PDF, opens your last note beside it; from a note, your last PDF. Again: back to one pane, the one you are in.
- **Previous tab or pane (PDF ⇄ note)**: like Vim's `Ctrl-^`; when that tab was closed, reopens the last file of the other kind.
- **Scroll the PDF beside the note down / up half a page**, **Next / Previous page of the PDF beside the note**: read on without leaving the note you type in.
- **Toggle recolor**, **Toggle the status bar**.
- **Open PDFs in the external program on this device (toggle)**: see below.

## Settings

- **Scroll step**, **Sideways step**, **Zoom step**.
- **Alt+Tab and Ctrl+6: previous tab or pane**: these keys anywhere, even while typing (Alt is Option on macOS). Off by default.
- **Alt+. and Alt+, drive the PDF from the note**: half a page down / up, with Shift a whole page. Off by default.
- **Focus mode**: while a PDF is on screen, sidebars, tabs, status bar and title bar go away; the PDF toolbar shows when you point at the top.
- **External program**: open PDFs in a real PDF reader instead of Obsidian's view, from the file list, links (`[[book.pdf#page=12]]` opens page 12), the quick switcher. **Arguments** take `{file}` and `{page}`; for zathura, `--page={page} {file}`. It is turned on per device with the command above, so a desktop can open zathura while a laptop keeps Obsidian's view.

The recolor and the status bar can be restyled in a CSS snippet:

```css
body { --pz-recolor-bg: #1e1e2e; --pz-status-bg: #181825; --pz-status-fg: #cdd6f4; }
```

The body gets classes for your own snippets too: `pz-study` (a PDF is on screen), `pz-split` (next to a note), `pz-pdf-active` (the PDF has focus).

## Vim

The keys work on their own; no Vim mode needed. With Obsidian's Vim mode on, the editor keeps its own keys: these only act while a PDF has focus.

With [Vim Motions](https://github.com/saberzero1/obsidian-vim-motions), its leader sequences (`Space f f`…) still work from a PDF, and a bare `g` goes to it (`gg`, `gt`, `gT`). Leader maps for the commands:

```vim
nnoremap <leader>p  :obcommand pdf-zathura:study-split<CR>
nnoremap <leader>ba :obcommand pdf-zathura:alternate<CR>
```

## Install

Until it is in the community plugins list, either:

- use [BRAT](https://github.com/TfTHacker/obsidian42-brat): add `confuserdotcom/obsidian-pdf-zathura`, or
- download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/confuserdotcom/obsidian-pdf-zathura/releases/latest) into `<vault>/.obsidian/plugins/pdf-zathura/`, then enable **PDF Zathura Keys** in Settings → Community plugins.

Desktop only.

## Development

No build step: `main.js` is the plugin.

```sh
npm test               # unit tests: every key on a fake PDF view, settings, external program arguments
node e2e-isolated.mjs  # real key presses in a separate Obsidian with a throwaway vault and tools/sample.pdf (macOS)
```

## Support

The plugin is free and stays free. If it saves you time, you can [support it here](https://confuserdotcom.lemonsqueezy.com).

## License

[MIT](LICENSE)

---

<p align="center">
  If it saves you a trip to the mouse, <a href="https://github.com/confuserdotcom/obsidian-pdf-zathura">a ⭐ on GitHub</a> helps other Obsidian users find it.<br>
  Bugs and ideas: <a href="https://github.com/confuserdotcom/obsidian-pdf-zathura/issues">open an issue</a>.
</p>

<a href="https://star-history.com/#confuserdotcom/obsidian-pdf-zathura&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=confuserdotcom/obsidian-pdf-zathura&type=Date&theme=dark">
    <img src="https://api.star-history.com/svg?repos=confuserdotcom/obsidian-pdf-zathura&type=Date" alt="Star history" width="100%">
  </picture>
</a>
