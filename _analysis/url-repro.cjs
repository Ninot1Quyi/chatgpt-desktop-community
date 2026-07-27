// Repro: codex-file:// URL handling on Windows paths
const path = require("node:path");
for (const p of ["D:\\front\\test img\\a.png", "D:/front/b.png", "C:\\Users\\qdu_s\\x.webp"]) {
  const url = new URL("codex-file://local/" + encodeURIComponent(p));
  const decoded = decodeURIComponent(url.pathname);
  console.log(JSON.stringify(p), "->", JSON.stringify(decoded), "isAbsolute:", path.isAbsolute(decoded));
}
