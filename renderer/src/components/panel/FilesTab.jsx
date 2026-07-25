// Files tab: replicates the reference app — a breadcrumb bar on top, a
// reserved preview area (empty state until a file is picked), and a file
// tree column docked on the right with a filter box. Selecting a file in the
// tree fills the preview and retitles the tab.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../store.js";
import * as api from "../../api.js";
import { cx } from "../../lib/cx.js";
import { basename } from "../../lib/time.js";
import { Menu, Spinner } from "../ui.jsx";
import Markdown from "../Markdown.jsx";
import {
  IconFile, IconFolder, IconChevronRight, IconChevronDown, IconExternal,
  IconList, IconSearch,
} from "../icons.jsx";
import { usePanelStore } from "../RightPanel.jsx";
import { FileIcon } from "./FileIcon.jsx";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i;
const MD_EXT = /\.(md|markdown|mdx)$/i;

export default function FilesTab({ tab }) {
  const conv = useStore((s) => (s.activeThreadId ? s.conversations[s.activeThreadId] : null));
  const globalCwd = useStore((s) => s.cwd);
  const root = conv?.thread?.cwd || globalCwd || "";
  const setTabFile = usePanelStore((s) => s.setFile);
  const toast = useStore((s) => s.toast);
  const [treeOpen, setTreeOpen] = useState(true);
  const [treeWidth, setTreeWidth] = useState(250);
  const [source, setSource] = useState(false); // markdown: source vs rendered
  const [file, setFile] = useState(null); // {path, content|null, loading, error, image?}
  const [text, setText] = useState(null); // edited draft (null = pristine)
  const [saving, setSaving] = useState(false);
  const path = tab.filePath;

  // Load file content when the tab's filePath changes.
  useEffect(() => {
    let live = true;
    setSource(false);
    setText(null);
    if (!path) { setFile(null); return; }
    setFile({ path, content: null, loading: true });
    if (IMAGE_EXT.test(path)) { setFile({ path, content: null, loading: false, image: true }); return; }
    api.rpc("fs/readFile", { path })
      .then((r) => {
        if (!live) return;
        let content = "";
        if (typeof r === "string") content = r;
        else if (typeof r?.dataBase64 === "string") { try { content = decodeURIComponent(escape(atob(r.dataBase64))); } catch { try { content = atob(r.dataBase64); } catch { content = ""; } } }
        else content = r?.content ?? r?.data ?? "";
        setFile({ path, content: String(content), loading: false });
      })
      .catch((e) => live && setFile({ path, content: null, loading: false, error: e.message }));
    return () => { live = false; };
  }, [path]);

  const select = (full) => setTabFile(tab.id, full);

  const dirty = !!file && !file.loading && !file.error && !file.image && text !== null && text !== file.content;
  const save = async () => {
    if (!file || text === null || saving) return;
    setSaving(true);
    try {
      await api.rpc("fs/writeFile", { path: file.path, dataBase64: btoa(unescape(encodeURIComponent(text))) });
      setFile({ ...file, content: text });
      setText(null);
      toast(`Saved ${basename(file.path)}`);
    } catch (e) {
      toast(`Save failed: ${e.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const segments = useMemo(() => {
    if (!path || !root) return [];
    const rel = path.startsWith(root.replace(/\/+$/, "") + "/") ? path.slice(root.replace(/\/+$/, "").length + 1) : basename(path);
    return rel.split("/");
  }, [path, root]);

  return (
    <div className="flex h-full flex-col">
      {/* breadcrumb bar (h-toolbar-pane = 40px) */}
      <nav className="flex h-10 shrink-0 items-center gap-1 border-b border-(--border-light) px-2 select-none">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 text-xs text-(--fg-secondary)">
          <Crumb text={basename(root.replace(/\/+$/, "")) || root} />
          {segments.map((seg, i) => (
            <React.Fragment key={i}>
              <IconChevronRight size={10} className="shrink-0 text-(--fg-faint)" />
              <Crumb text={seg} last={i === segments.length - 1} />
            </React.Fragment>
          ))}
        </div>
        {file && !file.loading && !file.error && !file.image && MD_EXT.test(file.path) && (
          <button
            className="mr-1 flex h-7 shrink-0 items-center rounded-lg border border-(--border) px-2.5 text-[13px] text-(--fg-secondary) hover:bg-(--surface-hover) hover:text-(--fg)"
            onClick={() => setSource(!source)}
          >
            {source ? "View rendered" : "View source"}
          </button>
        )}
        {dirty && (
          <button
            className="mr-1 flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-(--border) px-2.5 text-[13px] text-(--fg) hover:bg-(--surface-hover)"
            onClick={save}
            disabled={saving}
            title="Save (⌘S)"
          >
            {saving ? "Saving…" : "Save"}
            <kbd className="rounded bg-(--surface-hover) px-1 py-px text-[10px] text-(--fg-tertiary)">⌘S</kbd>
          </button>
        )}
        <IconBtn title="Toggle file tree" active={treeOpen} onClick={() => setTreeOpen(!treeOpen)}>
          <IconList size={14} />
        </IconBtn>
        {path && <OpenSplitButton path={path} />}
      </nav>

      {/* body: reserved preview area + tree column */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {!path ? (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <IconFolder size={30} className="text-(--fg-faint)" />
              <div className="text-[17px] font-medium text-(--fg)">Open file</div>
              <div className="text-[13px] text-(--fg-secondary)">Select a file from the workspace tree</div>
            </div>
          ) : file?.loading ? (
            <div className="flex h-full items-center justify-center text-(--fg-tertiary)"><Spinner size={16} /></div>
          ) : file?.error ? (
            <div className="flex h-full items-center justify-center text-[13px] text-(--danger)">{file.error}</div>
          ) : file?.image ? (
            <div className="flex h-full items-center justify-center overflow-auto p-4">
              <img src={api.localFileUrl(file.path)} className="max-h-full max-w-full object-contain" alt={basename(file.path)} />
            </div>
          ) : file && MD_EXT.test(file.path) && !source ? (
            <div className="h-full overflow-y-auto">
              <div className="md mx-auto max-w-[720px] px-6 py-5 text-[14px]"><Markdown>{text ?? file.content}</Markdown></div>
            </div>
          ) : file ? (
            <CodeEditor
              key={file.path}
              path={file.path}
              value={text ?? file.content}
              onChange={setText}
              onSave={save}
            />
          ) : null}
        </div>
        {treeOpen && root && (
          <>
            <div
              className="relative z-20 w-[5px] shrink-0 cursor-col-resize"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const baseW = treeWidth;
                const move = (ev) => {
                  setTreeWidth(Math.max(180, Math.min(420, baseW - (ev.clientX - startX))));
                };
                const up = () => {
                  window.removeEventListener("mousemove", move);
                  window.removeEventListener("mouseup", up);
                };
                window.addEventListener("mousemove", move);
                window.addEventListener("mouseup", up);
              }}
            >
              <div className="absolute inset-y-0 -left-[6px] w-[17px]" />
              <div className="absolute inset-y-0 left-[2px] w-px bg-transparent transition-colors hover:bg-(--accent-soft)" />
            </div>
            <div className="flex h-full shrink-0 flex-col border-l border-(--border-light)" style={{ width: treeWidth }}>
              <FileTree root={root} selected={path} onSelect={select} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Crumb({ text, last }) {
  return (
    <button
      className={cx(
        "shrink-0 cursor-default truncate whitespace-nowrap",
        last ? "font-medium text-(--fg)" : "hover:text-(--fg)"
      )}
      title={text}
    >
      {text}
    </button>
  );
}

function IconBtn({ title, active, onClick, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cx(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
        active ? "text-(--fg)" : "text-(--fg-tertiary)",
        "hover:bg-(--surface-hover) hover:text-(--fg)"
      )}
    >
      {children}
    </button>
  );
}

function OpenSplitButton({ path }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  return (
    <div className="ml-1 flex h-7 shrink-0 items-stretch overflow-hidden rounded-lg border border-(--border)">
      <button
        className="flex items-center gap-1.5 px-2.5 text-[13px] whitespace-nowrap text-(--fg) hover:bg-(--surface-hover)"
        onClick={() => api.openPath(path)}
        title="Open in default app"
      >
        <IconExternal size={12} />
        Open
      </button>
      <div className="w-px bg-(--border-light)" />
      <button ref={ref} className="px-1 text-(--fg-secondary) hover:bg-(--surface-hover)" onClick={() => setOpen(true)} title="Open options">
        <IconChevronDown size={11} />
      </button>
      <Menu
        open={open}
        anchor={() => ref.current?.getBoundingClientRect()}
        onClose={() => setOpen(false)}
        align="end"
        items={[
          { id: "reveal", label: "Reveal in Finder", onSelect: () => api.showItemInFolder(path) },
          { id: "copy", label: "Copy path", onSelect: () => navigator.clipboard.writeText(path) },
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Code preview: line numbers + lightweight syntax highlighting.
// ---------------------------------------------------------------------------
const LANGS = {
  js: { line: ["//"], block: [["/*", "*/"]], kw: "const let var function return if else for while do break continue switch case default try catch finally throw new class extends super this typeof instanceof of in async await import export from yield delete void static get set null undefined true false" },
  py: { line: ["#"], block: [['"""', '"""'], ["'''", "'''"]], kw: "def return if elif else for while break continue pass try except finally raise with as import from class lambda global nonlocal yield assert del in is not and or None True False async await print" },
  rs: { line: ["//"], block: [["/*", "*/"]], kw: "fn let mut const static struct enum impl trait for in while loop if else match return pub use mod crate self Self super where async await move ref type as unsafe extern break continue Some None Ok Err true false" },
  go: { line: ["//"], block: [["/*", "*/"]], kw: "func var const type struct interface map chan go defer return if else for range switch case default break continue fallthrough package import select nil true false iota" },
  java: { line: ["//"], block: [["/*", "*/"]], kw: "class interface enum extends implements public private protected static final void int long double float boolean char byte short new return if else for while do break continue switch case default try catch finally throw throws package import this super instanceof abstract synchronized volatile transient native strictfp assert var record sealed permits true false null" },
  c: { line: ["//"], block: [["/*", "*/"]], kw: "int char short long float double void unsigned signed const static extern register volatile struct union enum typedef sizeof return if else for while do break continue switch case default goto auto inline restrict bool true false NULL nullptr class public private protected namespace template typename using new delete this virtual override final friend operator" },
  css: { line: [], block: [["/*", "*/"]], kw: "import media supports keyframes font-face charset namespace layer property root hover focus active before after first-child last-child not" },
  sh: { line: ["#"], block: [], kw: "if then else elif fi for while until do done case esac function in select echo printf read cd ls export local return exit set unset shift trap eval exec source alias unalias true false" },
  rb: { line: ["#"], block: [], kw: "def end class module if elsif else unless while until do begin rescue ensure raise return yield block_given? require require_relative include extend attr_accessor attr_reader attr_writer self super nil true false and or not in lambda proc new puts print gets chomp" },
  sql: { line: ["--"], block: [["/*", "*/"]], kw: "SELECT FROM WHERE AND OR NOT NULL INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE DROP ALTER ADD COLUMN INDEX PRIMARY KEY FOREIGN REFERENCES UNIQUE DEFAULT CHECK CONSTRAINT JOIN INNER LEFT RIGHT FULL OUTER CROSS ON AS ORDER BY GROUP HAVING LIMIT OFFSET UNION ALL DISTINCT EXISTS BETWEEN LIKE IN IS CASE WHEN THEN ELSE END CAST COUNT SUM AVG MIN MAX select from where and or not null insert into values update set delete create table drop alter add column index primary key foreign references unique default check constraint join inner left right full outer cross on as order by group having limit offset union all distinct exists between like in is case when then else end cast count sum avg min max" },
  html: { line: [], block: [["<!--", "-->"]], kw: "html head body div span script style link meta title p a img ul ol li table tr td th thead tbody form input button select option textarea label header footer main nav section article aside h1 h2 h3 h4 h5 h6 br hr em strong code pre blockquote iframe video audio source canvas svg path DOCTYPE" },
};
const EXT_LANG = {
  js: "js", mjs: "js", cjs: "js", jsx: "js", ts: "js", tsx: "js", mts: "js", cts: "js",
  py: "py", rs: "rs", go: "go", java: "java", kt: "java", scala: "java",
  c: "c", h: "c", cpp: "c", cc: "c", cxx: "c", hpp: "c", cs: "java", m: "c", mm: "c",
  css: "css", scss: "css", less: "css",
  sh: "sh", bash: "sh", zsh: "sh", fish: "sh",
  rb: "rb", sql: "sql", html: "html", htm: "html", xml: "html", vue: "html", svelte: "html",
  php: "java", swift: "java", lua: "py", pl: "py", r: "py",
};
const TOKEN_COLORS = { kw: "#f67576", str: "#98c379", com: "#999999", num: "#d19a66" };

function tokenizeLine(line, lang, state) {
  const cfg = lang ? LANGS[lang] : null;
  if (!cfg) return [{ t: line, c: null }];
  const out = [];
  let i = 0, buf = "";
  const flush = () => { if (buf) { out.push({ t: buf, c: null }); buf = ""; } };
  const kwSet = tokenizeLine._kwc[lang] || (tokenizeLine._kwc[lang] = new Set(cfg.kw.split(" ")));
  while (i < line.length) {
    if (state.block) {
      const end = line.indexOf(state.block, i);
      if (end < 0) { out.push({ t: line.slice(i), c: "com" }); i = line.length; break; }
      out.push({ t: line.slice(i, end + state.block.length), c: "com" });
      i = end + state.block.length;
      state.block = null;
      continue;
    }
    const rest = line.slice(i);
    let matched = false;
    for (const lc of cfg.line) {
      if (lc && rest.startsWith(lc)) {
        flush(); out.push({ t: rest, c: "com" });
        i = line.length; matched = true; break;
      }
    }
    if (matched) break;
    for (const [o, c] of cfg.block) {
      if (rest.startsWith(o)) {
        const end = line.indexOf(c, i + o.length);
        flush();
        if (end < 0) { out.push({ t: rest, c: "com" }); state.block = c; i = line.length; }
        else { out.push({ t: line.slice(i, end + c.length), c: "com" }); i = end + c.length; }
        matched = true; break;
      }
    }
    if (matched) continue;
    const ch = line[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < line.length && line[j] !== ch) { if (line[j] === "\\") j++; j++; }
      flush(); out.push({ t: line.slice(i, j + 1), c: "str" });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch) && !/[A-Za-z_$]/.test(line[i - 1] || "")) {
      let j = i;
      while (j < line.length && /[0-9a-fA-FxXoObB._eE+-]/.test(line[j]) && (j === i || /[0-9a-fA-FxXoObB._]/.test(line[j]) || !/[eE+-]/.test(line[j - 1]))) j++;
      // simpler: consume numeric-ish run
      j = i;
      while (j < line.length && /[\w.]/.test(line[j])) j++;
      flush(); out.push({ t: line.slice(i, j), c: "num" });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < line.length && /[\w$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (kwSet.has(word)) { flush(); out.push({ t: word, c: "kw" }); }
      else buf += word;
      i = j;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}
tokenizeLine._kwc = {};

// Editable code view: a transparent textarea layered over the highlighted
// code (same metrics), so typing/selecting works while colors show through.
function CodeEditor({ path, value, onChange, onSave }) {
  const ext = (path.split(".").pop() || "").toLowerCase();
  const lang = EXT_LANG[ext] || null;
  const taRef = useRef(null);
  const preRef = useRef(null);

  const lines = useMemo(() => value.split("\n"), [value]);
  const rendered = useMemo(() => {
    const state = { block: null };
    return lines.map((line) => tokenizeLine(line, lang, state));
  }, [lines, lang]);

  const syncScroll = () => {
    if (preRef.current && taRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };

  return (
    <div className="relative h-full overflow-hidden">
      <pre
        ref={preRef}
        aria-hidden="true"
        className="absolute inset-0 overflow-hidden py-2 font-mono text-[12px] leading-[22px] text-(--fg)"
      >
        {rendered.map((toks, n) => (
          <div key={n} className="flex">
            <span className="w-[44px] shrink-0 pr-4 text-right text-(--fg-faint) select-none">{n + 1}</span>
            <span className="pr-4 whitespace-pre">
              {toks.map((tk, i) => (
                <span key={i} style={tk.c ? { color: TOKEN_COLORS[tk.c] } : undefined}>{tk.t || " "}</span>
              ))}
            </span>
          </div>
        ))}
      </pre>
      <textarea
        ref={taRef}
        value={value}
        spellCheck={false}
        wrap="off"
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            onSave?.();
          }
        }}
        className="absolute inset-0 resize-none overflow-auto bg-transparent py-2 pr-4 pl-[44px] font-mono text-[12px] leading-[22px] whitespace-pre text-transparent caret-(--fg) outline-none selection:bg-(--accent-soft) selection:text-transparent"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// File tree column: filter box + lazy tree with colored file icons.
// ---------------------------------------------------------------------------
function FileTree({ root, selected, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [gitMap, setGitMap] = useState(null); // absPath → {letter, color}
  const deb = useRef(null);

  // git status decorations (M/A/D/? badges), like the reference tree
  useEffect(() => {
    let live = true;
    setGitMap(null);
    api.rpc("command/exec", { command: ["git", "status", "--porcelain=v1", "-uall"], cwd: root, timeoutMs: 10000 })
      .then((r) => {
        if (!live) return;
        const out = String(r?.stdout ?? r?.output ?? "");
        const map = new Map();
        for (const line of out.split("\n")) {
          if (line.length < 4) continue;
          const xy = line.slice(0, 2);
          let p = line.slice(3).trim();
          if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
          const arrow = p.indexOf(" -> ");
          if (arrow >= 0) p = p.slice(arrow + 4);
          const letter = xy.includes("D") ? "D" : xy.includes("R") ? "R" : xy.includes("A") || xy.includes("?") ? (xy.includes("?") ? "U" : "A") : "M";
          const color = letter === "D" ? "#e05252" : letter === "R" ? "#4a90d9" : letter === "M" ? "#d8913a" : "#40c977";
          map.set(`${root.replace(/\/+$/, "")}/${p}`, { letter, color });
        }
        setGitMap(map);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [root]);

  useEffect(() => {
    if (!query.trim()) { setResults(null); return; }
    clearTimeout(deb.current);
    deb.current = setTimeout(() => {
      api.rpc("fuzzyFileSearch", { query: query.trim(), roots: [root] })
        .then((r) => {
          const list = r?.files || r?.matches || r?.results || [];
          setResults(list.map((f) => (typeof f === "string" ? f : f.path || f.file || "")).filter(Boolean).slice(0, 60));
        })
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(deb.current);
  }, [query, root]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="shrink-0 px-2 pt-2 pb-px">
        <div className="flex h-7 w-full items-center gap-1.5 rounded-lg border border-(--border-light) bg-(--surface-fog)">
          <IconSearch size={13} className="ms-2 shrink-0 text-(--fg-faint)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter files…"
            className="w-full appearance-none border-none bg-transparent py-0 ps-0 pe-1.5 text-[13px] text-(--fg) ring-0 outline-none placeholder:text-(--fg-faint)"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {results ? (
          results.length ? (
            results.map((p) => {
              const full = p.startsWith("/") ? p : `${root.replace(/\/+$/, "")}/${p}`;
              return (
                <TreeRow
                  key={p}
                  depth={0}
                  name={p.startsWith(root) ? p.slice(root.replace(/\/+$/, "").length + 1) : p}
                  full={full}
                  isDir={false}
                  selected={selected === full}
                  git={gitMap?.get(full)}
                  onSelect={onSelect}
                />
              );
            })
          ) : (
            <div className="px-2 py-2 text-xs text-(--fg-faint)">No matches</div>
          )
        ) : (
          <DirNode path={root} depth={0} selected={selected} onSelect={onSelect} gitMap={gitMap} />
        )}
      </div>
    </div>
  );
}

function DirNode({ path, depth, selected, onSelect, gitMap }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    api.rpc("fs/readDirectory", { path })
      .then((r) => {
        if (!live) return;
        const sorted = [...(r?.entries || [])].sort((a, b) =>
          a.isDirectory === b.isDirectory ? a.fileName.localeCompare(b.fileName) : a.isDirectory ? -1 : 1
        );
        setEntries(sorted);
      })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [path]);

  if (error) return <div className="px-3 py-1 text-xs text-(--danger)">{error}</div>;
  if (!entries) return <div className="flex justify-center py-2 text-(--fg-tertiary)"><Spinner size={12} /></div>;

  return (
    <>
      {entries
        .filter((e) => !e.fileName.startsWith("."))
        .map((e) => (
          <TreeEntry key={e.fileName} entry={e} parent={path} depth={depth} selected={selected} onSelect={onSelect} gitMap={gitMap} />
        ))}
    </>
  );
}

function TreeEntry({ entry, parent, depth, selected, onSelect, gitMap }) {
  const [open, setOpen] = useState(false);
  const full = `${parent}/${entry.fileName}`;
  return (
    <div>
      <TreeRow
        depth={depth}
        name={entry.fileName}
        full={full}
        isDir={entry.isDirectory}
        open={open}
        selected={selected === full}
        git={gitMap?.get(full)}
        onToggle={() => setOpen(!open)}
        onSelect={onSelect}
      />
      {open && entry.isDirectory && (
        <DirNode path={full} depth={depth + 1} selected={selected} onSelect={onSelect} gitMap={gitMap} />
      )}
    </div>
  );
}

function TreeRow({ depth, name, full, isDir, open, selected, git, onToggle, onSelect }) {
  return (
    <button
      className={cx(
        "flex min-h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-[13px] transition-colors",
        selected ? "bg-(--surface-active) text-(--fg)" : "text-(--fg) hover:bg-(--surface-hover)"
      )}
      style={{ paddingLeft: 6 + depth * 14 }}
      title={name}
      onClick={() => (isDir ? onToggle?.() : onSelect(full))}
    >
      {isDir ? (
        <IconChevronRight
          size={12}
          className={cx("shrink-0 text-(--fg-tertiary) transition-transform duration-150", open && "rotate-90")}
        />
      ) : (
        <FileIcon name={name} size={13} />
      )}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {git && !isDir && (
        <span className="shrink-0 text-[11px] font-medium" style={{ color: git.color }}>{git.letter}</span>
      )}
    </button>
  );
}
