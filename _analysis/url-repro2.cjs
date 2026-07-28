// Repro 2: what pathToFileURL does with the leading-slash Windows path
const { pathToFileURL } = require("node:url");
for (const decoded of ["/D:\\front\\test img\\a.png", "/C:\\Users\\qdu_s\\x.webp", "/D:/front/b.png"]) {
  console.log(JSON.stringify(decoded), "->", pathToFileURL(decoded).toString());
}
console.log("cwd drive:", process.cwd());
