// Verify the fixed codex-file:// decoding produces correct file URLs
const path = require("node:path");
const { pathToFileURL } = require("node:url");
for (const p of ["D:\\front\\test img\\a.png", "C:\\Users\\qdu_s\\x.webp", "D:/front/b.png"]) {
  const url = new URL("codex-file://local/" + encodeURIComponent(p));
  let fp = decodeURIComponent(url.pathname);
  if (/^\/[A-Za-z]:[/\\]/.test(fp)) fp = fp.slice(1);
  console.log(JSON.stringify(p), "->", pathToFileURL(fp).toString(), "isAbsolute:", path.isAbsolute(fp));
}
