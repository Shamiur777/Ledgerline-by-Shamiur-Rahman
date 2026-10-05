#!/usr/bin/env node
/**
 * Fails (exit 1) if anything that looks like a credential is tracked in git or present anywhere in history.
 *   npm run scan:secrets
 * Run before every push. It never prints the secret itself, only where it was found.
 */
import { execFileSync } from "node:child_process";

const PATTERNS = [
  ["JWT (e.g. a Supabase anon/service-role key)", /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{10,}/],
  ["Supabase access token", /sbp_[a-f0-9]{30,}/],
  ["Private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Database URL with a password for a non-local host", /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s/]{6,}@(?!127\.0\.0\.1|localhost|db\.localhost)[^\s/'"`]+/],
  ["Service-role key assigned a value", /SUPABASE_SERVICE_ROLE_KEY\s*=\s*(?![$<{\s])[^\s#]{10,}/],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9]{30,}/],
  ["Vercel token", /vercel_[A-Za-z0-9]{20,}/i],
  ["Generic secret assignment", /(?:SECRET|PASSWORD|TOKEN)[A-Z_]*\s*=\s*['"]?[A-Za-z0-9+/_-]{24,}/],
];

const sh = (args, opts = {}) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, ...opts });
const findings = [];

function scan(label, text, where) {
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.length > 4000) return; // minified/binary-ish
    for (const [name, re] of PATTERNS) if (re.test(line)) findings.push(`${name}: ${where}${i ? `:${i + 1}` : ""} (${label})`);
  });
}

// 1) Every tracked file in the working tree (skip the lockfile: integrity hashes are noise).
for (const f of sh(["ls-files", "-z"]).split("\0").filter(Boolean)) {
  if (f === "package-lock.json" || /\.(png|jpg|ico|svg)$/i.test(f)) continue;
  try { scan("working tree", sh(["show", `:${f}`]), f); } catch { /* binary */ }
}

// 2) Every line ever added in any commit on any branch.
const log = sh(["log", "--all", "-p", "--no-color", "--format=commit %h", "--", ".", ":(exclude)package-lock.json"]);
let commit = "?";
for (const line of log.split(/\r?\n/)) {
  const m = line.match(/^commit ([0-9a-f]+)/);
  if (m) { commit = m[1]; continue; }
  if (!line.startsWith("+") || line.startsWith("+++")) continue;
  for (const [name, re] of PATTERNS) if (re.test(line)) findings.push(`${name}: in commit ${commit} (history)`);
}

const unique = [...new Set(findings)];
if (unique.length) {
  console.error(`\nSECRET SCAN FAILED, ${unique.length} finding(s):`);
  for (const f of unique) console.error("  - " + f);
  console.error("\nRemove the value, rotate it if it was ever pushed, and re-run.");
  process.exit(1);
}
console.log("Secret scan clean: no credentials in tracked files or git history.");
