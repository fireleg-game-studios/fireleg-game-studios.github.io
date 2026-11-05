// Checks every internal link, image and stylesheet reference of a built site.
// Run with `npm run check` after a build. PATH_PREFIX must match the one used for that build.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const DIR = process.argv[2] || "_site";
const PREFIX = process.env.PATH_PREFIX || "/";

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const exists = (url) => {
  const target = path.join(DIR, url.slice(PREFIX.length).split(/[?#]/)[0]);
  return existsSync(target) && (statSync(target).isFile() || existsSync(path.join(target, "index.html")));
};

const files = walk(DIR);
const pages = files.filter((file) => file.endsWith(".html"));
const broken = [];
let checked = 0;

for (const page of pages) {
  const html = readFileSync(page, "utf8");
  const urls = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  for (const [, srcset] of html.matchAll(/srcset="([^"]+)"/g)) {
    urls.push(...srcset.split(",").map((candidate) => candidate.trim().split(/\s+/)[0]));
  }
  for (const url of urls) {
    if (/^(https?:|mailto:|tel:|#|data:)/.test(url)) continue;
    checked++;
    if (!url.startsWith(PREFIX)) broken.push(`${page}: wrong prefix: ${url}`);
    else if (!exists(url)) broken.push(`${page}: not found: ${url}`);
  }
}

for (const sheet of files.filter((file) => file.endsWith(".css"))) {
  for (const [, url] of readFileSync(sheet, "utf8").matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    if (url.startsWith("data:")) continue;
    checked++;
    if (!existsSync(path.join(path.dirname(sheet), url))) broken.push(`${sheet}: not found: ${url}`);
  }
}

const weight = files.reduce((total, file) => total + statSync(file).size, 0);
console.log(`${pages.length} pages, ${checked} references checked, ${broken.length} broken, ${(weight / 1024 / 1024).toFixed(1)} MB on disk`);
broken.forEach((line) => console.log(`  ${line}`));
process.exit(broken.length ? 1 : 0);
