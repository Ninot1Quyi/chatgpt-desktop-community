// Minimal terminal screen emulator for full-screen apps (vim/less/htop).
// Handles the alternate screen buffer (CSI ?1049/?47 h/l), cursor addressing,
// erase/insert/delete ops and SGR colors. Normal flow keeps using the
// line-buffer renderer; we switch to the grid while altscreen is active.

const FG = {
  30: "#6e6e6e", 31: "#f14c4c", 32: "#23d18b", 33: "#e2c08d", 34: "#3b8eea", 35: "#d670d6", 36: "#29b8db", 37: "#d4d4d4",
  90: "#8a8a8a", 91: "#ff6764", 92: "#4ee6a0", 93: "#f5d67b", 94: "#6ab0ff", 95: "#e582e5", 96: "#4adbe6", 97: "#ffffff",
};
const X256 = (n) => {
  if (n < 8) return Object.values(FG)[n];
  if (n < 16) return Object.values(FG)[n + 60 - 8];
  if (n >= 232) { const v = 8 + (n - 232) * 10; return `rgb(${v},${v},${v})`; }
  const i = n - 16, r = Math.floor(i / 36) % 6, g = Math.floor(i / 6) % 6, b = i % 6;
  const cv = (x) => (x === 0 ? 0 : 55 + x * 40);
  return `rgb(${cv(r)},${cv(g)},${cv(b)})`;
};

export class TermScreen {
  constructor(cols = 110, rows = 32) {
    this.cols = cols;
    this.rows = rows;
    this.grid = [];
    for (let y = 0; y < rows; y++) this.grid.push(this._blankRow());
    this.x = 0; this.y = 0;
    this.fg = null; this.bg = null; this.bold = false; this.dim = false; this.underline = false;
    this.alt = false;          // in alternate screen
    this.savedGrid = null;     // main-screen grid while alt active
    this.savedCursor = null;
    this.showCursor = true;
    this.oscBuf = "";
    this.version = 0;          // bumped on every mutation (render hint)
  }

  _blankRow() {
    return Array.from({ length: this.cols }, () => ({ ch: " ", fg: null, bg: null, bold: false, dim: false, underline: false }));
  }
  _cell() {
    return { ch: " ", fg: this.fg, bg: this.bg, bold: this.bold, dim: this.dim, underline: this.underline };
  }
  _scrollUp(n = 1) {
    for (let i = 0; i < n; i++) { this.grid.shift(); this.grid.push(this._blankRow()); }
  }
  _scrollDown(n = 1) {
    for (let i = 0; i < n; i++) { this.grid.pop(); this.grid.unshift(this._blankRow()); }
  }
  _put(ch) {
    if (this.x >= this.cols) { this.x = 0; this._nextLine(); }
    if (this.y < 0) this.y = 0;
    if (this.y >= this.rows) this.y = this.rows - 1;
    const c = this._cell();
    c.ch = ch;
    this.grid[this.y][this.x] = c;
    this.x++;
  }
  _nextLine() {
    this.y++;
    if (this.y >= this.rows) { this._scrollUp(1); this.y = this.rows - 1; }
  }

  // Feed raw (unsanitized) text; returns true if altscreen mode changed.
  feed(text) {
    const wasAlt = this.alt;
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (ch === "\x1b") {
        const m = /^\x1b\[([0-9;?]*)([ -/]*)([@-~])/.exec(text.slice(i));
        if (m) {
          this._csi(m[1], m[3]);
          i += m[0].length;
          continue;
        }
        const m2 = /^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/.exec(text.slice(i));
        if (m2) { i += m2[0].length; continue; } // OSC
        const m3 = /^\x1b[()][0-2]/.exec(text.slice(i));
        if (m3) { i += m3[0].length; continue; }
        i += 2; // other escape: swallow ESC + 1 char
        continue;
      }
      if (ch === "\n") { this._nextLine(); i++; continue; }
      if (ch === "\r") { this.x = 0; i++; continue; }
      if (ch === "\b") { this.x = Math.max(0, this.x - 1); i++; continue; }
      if (ch === "\t") { this.x = Math.min(this.cols - 1, (Math.floor(this.x / 8) + 1) * 8); i++; continue; }
      if (ch < " " || ch === "\x7f") { i++; continue; }
      this._put(ch);
      i++;
    }
    this.version++;
    return wasAlt !== this.alt;
  }

  _csi(params, final) {
    const priv = params.startsWith("?");
    const ps = priv ? params.slice(1) : params;
    const nums = ps === "" ? [] : ps.split(";").map((p) => (p === "" ? 0 : Number(p)));
    const n1 = nums[0] || 1;
    switch (final) {
      case "A": this.y = Math.max(0, this.y - n1); break;
      case "B": this.y = Math.min(this.rows - 1, this.y + n1); break;
      case "C": this.x = Math.min(this.cols - 1, this.x + n1); break;
      case "D": this.x = Math.max(0, this.x - n1); break;
      case "E": this.y = Math.min(this.rows - 1, this.y + n1); this.x = 0; break;
      case "F": this.y = Math.max(0, this.y - n1); this.x = 0; break;
      case "G": this.x = Math.min(this.cols - 1, Math.max(0, n1 - 1)); break;
      case "H": case "f":
        this.y = Math.min(this.rows - 1, Math.max(0, (nums[0] || 1) - 1));
        this.x = Math.min(this.cols - 1, Math.max(0, (nums[1] || 1) - 1));
        break;
      case "J": {
        const mode = nums[0] || 0;
        if (mode === 2 || mode === 3) { this.grid = this.grid.map(() => this._blankRow()); this.x = 0; this.y = 0; }
        else if (mode === 0) {
          for (let x = this.x; x < this.cols; x++) this.grid[this.y][x] = this._cell();
          for (let y = this.y + 1; y < this.rows; y++) this.grid[y] = this._blankRow();
        } else if (mode === 1) {
          for (let x = 0; x <= this.x; x++) this.grid[this.y][x] = this._cell();
          for (let y = 0; y < this.y; y++) this.grid[y] = this._blankRow();
        }
        break;
      }
      case "K": {
        const mode = nums[0] || 0;
        if (mode === 2) this.grid[this.y] = this._blankRow();
        else if (mode === 0) for (let x = this.x; x < this.cols; x++) this.grid[this.y][x] = this._cell();
        else if (mode === 1) for (let x = 0; x <= this.x; x++) this.grid[this.y][x] = this._cell();
        break;
      }
      case "L": { // insert lines
        for (let k = 0; k < n1; k++) { this.grid.splice(this.y, 0, this._blankRow()); this.grid.pop(); }
        break;
      }
      case "M": { // delete lines
        for (let k = 0; k < n1; k++) { this.grid.splice(this.y, 1); this.grid.push(this._blankRow()); }
        break;
      }
      case "P": { // delete chars
        const row = this.grid[this.y];
        row.splice(this.x, n1);
        while (row.length < this.cols) row.push(this._cell());
        break;
      }
      case "@": { // insert chars
        const row = this.grid[this.y];
        for (let k = 0; k < n1; k++) row.splice(this.x, 0, this._cell());
        row.length = this.cols;
        break;
      }
      case "S": this._scrollUp(n1); break;
      case "T": this._scrollDown(n1); break;
      case "d": this.y = Math.min(this.rows - 1, Math.max(0, n1 - 1)); break;
      case "e": this.y = Math.min(this.rows - 1, this.y + n1); break;
      case "X": { // erase chars
        for (let x = this.x; x < Math.min(this.cols, this.x + n1); x++) this.grid[this.y][x] = this._cell();
        break;
      }
      case "m": this._sgr(nums.length ? nums : [0]); break;
      case "h": case "l": {
        if (priv) {
          const on = final === "h";
          for (const p of nums) {
            if (p === 1049 || p === 47 || p === 1047) this._altscreen(on);
            if (p === 25) this.showCursor = on;
            if (p === 1048) { /* save/restore cursor */ }
          }
        }
        break;
      }
      default: break;
    }
  }

  _altscreen(on) {
    if (on && !this.alt) {
      this.savedGrid = this.grid;
      this.savedCursor = { x: this.x, y: this.y };
      this.grid = [];
      for (let y = 0; y < this.rows; y++) this.grid.push(this._blankRow());
      this.x = 0; this.y = 0;
      this.alt = true;
    } else if (!on && this.alt) {
      if (this.savedGrid) this.grid = this.savedGrid;
      if (this.savedCursor) { this.x = this.savedCursor.x; this.y = this.savedCursor.y; }
      this.savedGrid = null;
      this.alt = false;
    }
  }

  _sgr(nums) {
    for (let j = 0; j < nums.length; j++) {
      const c = nums[j];
      if (c === 0) { this.fg = this.bg = null; this.bold = this.dim = this.underline = false; }
      else if (c === 1) this.bold = true;
      else if (c === 2) this.dim = true;
      else if (c === 4) this.underline = true;
      else if (c === 22) { this.bold = this.dim = false; }
      else if (c === 24) this.underline = false;
      else if (c === 39) this.fg = null;
      else if (c === 49) this.bg = null;
      else if (FG[c]) this.fg = FG[c];
      else if (c >= 40 && c <= 47) this.bg = FG[c - 10];
      else if (c >= 100 && c <= 107) this.bg = FG[c - 60];
      else if (c === 38 && nums[j + 1] === 5) { this.fg = X256(nums[j + 2] || 0); j += 2; }
      else if (c === 48 && nums[j + 1] === 5) { this.bg = X256(nums[j + 2] || 0); j += 2; }
      else if (c === 38 && nums[j + 1] === 2) { this.fg = `rgb(${nums[j + 2] || 0},${nums[j + 3] || 0},${nums[j + 4] || 0})`; j += 4; }
      else if (c === 48 && nums[j + 1] === 2) { this.bg = `rgb(${nums[j + 2] || 0},${nums[j + 3] || 0},${nums[j + 4] || 0})`; j += 4; }
    }
  }
}
