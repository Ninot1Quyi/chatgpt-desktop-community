// Minimal unified-diff parser → per-file hunks with add/del counts.

export function parseUnifiedDiff(text) {
  if (!text) return [];
  const lines = String(text).split("\n");
  const files = [];
  let cur = null;
  let hunk = null;

  const finishFile = () => {
    if (!cur) return;
    cur.added = cur.hunks.reduce(
      (n, h) => n + h.lines.filter((l) => l.type === "add").length,
      0
    );
    cur.deleted = cur.hunks.reduce(
      (n, h) => n + h.lines.filter((l) => l.type === "del").length,
      0
    );
    files.push(cur);
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      finishFile();
      cur = { oldPath: null, newPath: null, hunks: [], isNew: false, isDeleted: false, isRename: false };
      hunk = null;
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (m) { cur.oldPath = m[1]; cur.newPath = m[2]; }
      continue;
    }
    if (!cur) {
      // Some producers emit bare --- / +++ headers without "diff --git".
      if (line.startsWith("--- ")) {
        cur = { oldPath: null, newPath: null, hunks: [], isNew: false, isDeleted: false, isRename: false };
        hunk = null;
        cur.oldPath = stripPrefix(line.slice(4));
      }
      continue;
    }
    if (line.startsWith("new file mode")) { cur.isNew = true; continue; }
    if (line.startsWith("deleted file mode")) { cur.isDeleted = true; continue; }
    if (line.startsWith("rename from ")) { cur.isRename = true; cur.oldPath = line.slice(12); continue; }
    if (line.startsWith("rename to ")) { cur.newPath = line.slice(10); continue; }
    if (line.startsWith("--- ")) { cur.oldPath = stripPrefix(line.slice(4)); continue; }
    if (line.startsWith("+++ ")) { cur.newPath = stripPrefix(line.slice(4)); continue; }
    if (line.startsWith("@@")) {
      const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
      hunk = {
        oldStart: m ? +m[1] : 0,
        newStart: m ? +m[3] : 0,
        context: m ? m[5].trim() : "",
        lines: [],
      };
      cur.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    if (line.startsWith("+")) hunk.lines.push({ type: "add", text: line.slice(1) });
    else if (line.startsWith("-")) hunk.lines.push({ type: "del", text: line.slice(1) });
    else if (line.startsWith("\\")) hunk.lines.push({ type: "meta", text: line });
    else hunk.lines.push({ type: "ctx", text: line.startsWith(" ") ? line.slice(1) : line });
  }
  finishFile();
  return files;
}

function stripPrefix(p) {
  if (p === "/dev/null") return p;
  return p.replace(/^[ab]\//, "");
}

export function diffFileName(f) {
  return f.newPath && f.newPath !== "/dev/null" ? f.newPath : f.oldPath;
}

// Count +/- in a single-file diff snippet (used for fileChange rows).
export function countDiff(diffText) {
  let add = 0, del = 0;
  for (const line of String(diffText || "").split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) add++;
    else if (line.startsWith("-") && !line.startsWith("---")) del++;
  }
  return { add, del };
}
