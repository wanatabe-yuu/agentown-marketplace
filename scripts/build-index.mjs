// Builds index.json: the worlds Agentown offers under Create world → Marketplace
// (and agentown.site/marketplace/ shows). Installs read it from
// https://raw.githubusercontent.com/wanatabe-yuu/agentown-marketplace/main/index.json
//
// - Official worlds: worlds/*.yaml in this repository, reviewed by pull request,
//   pinned to the last commit that changed worlds/.
// - Community worlds (with GITHUB_TOKEN): public GitHub repositories with the topic
//   `agentown-world` and an `agentown.world.yaml` at the root of the default branch,
//   pinned to that commit. A world is Verified while its sha256 is the one listed
//   for its repository in verified.json (only the maintainer merges it).
//
// The output has no timestamp of its own, so it only changes when a world does.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const REPO = process.env.MARKETPLACE_REPO ?? "wanatabe-yuu/agentown-marketplace";
const MAX = 256 * 1024; // what an Agentown server accepts
const root = new URL("..", import.meta.url).pathname;
const verified = JSON.parse(readFileSync(join(root, "verified.json"), "utf8"));
const token = process.env.GITHUB_TOKEN;

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** The last commit that changed worlds/ (main before the first commit). */
function worldsCommit() {
  try {
    return execFileSync("git", ["log", "-1", "--format=%H", "--", "worlds/"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || "main";
  } catch {
    return "main";
  }
}

/** The listing fields of a world file, or null when it is not one. */
function describe(text) {
  let doc;
  try {
    doc = parse(text, { maxAliasCount: 50 });
  } catch {
    return null;
  }
  const meta = doc?.meta;
  if (doc?.format !== "agentown.template/v1" || typeof meta?.name !== "string") return null;
  return {
    meta,
    info: {
      name: meta.name.slice(0, 200),
      description: typeof meta.description === "string" ? meta.description.slice(0, 2000) : "",
      ...(typeof meta.term === "string" ? { term: meta.term.slice(0, 40) } : {}),
      departments: Array.isArray(doc.departments) ? doc.departments.map((d) => String(d?.name ?? "")).filter(Boolean).slice(0, 100) : [],
    },
  };
}

const commit = worldsCommit();
const official = readdirSync(join(root, "worlds"))
  .filter((f) => f.endsWith(".yaml"))
  .sort()
  .map((file) => {
    const buf = readFileSync(join(root, "worlds", file));
    const world = buf.length <= MAX ? describe(buf.toString("utf8")) : null;
    if (!world) throw new Error(`worlds/${file} is not a usable world file`);
    if (`${world.meta.id}.yaml` !== file) throw new Error(`worlds/${file} must be named after its meta.id (${world.meta.id})`);
    return {
      id: world.meta.id,
      ...world.info,
      author: "Agentown",
      repo: REPO,
      commit,
      url: `https://raw.githubusercontent.com/${REPO}/${commit}/worlds/${file}`,
      sha256: sha256(buf),
      size: buf.length,
      official: true,
      verified: true,
    };
  });

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } });
  if (!res.ok) throw new Error(`GitHub ${path}: ${res.status}`);
  return res.json();
}

async function community() {
  if (!token) {
    console.log("index: no GITHUB_TOKEN, official worlds only");
    return [];
  }
  // ponytail: first 100 search results only; page through them when the marketplace grows past that
  const { items } = await gh("/search/repositories?q=topic:agentown-world+is:public&sort=stars&per_page=100");
  const worlds = [];
  for (const repo of items) {
    if (repo.full_name === REPO) continue;
    try {
      const head = await gh(`/repos/${repo.full_name}/commits/${encodeURIComponent(repo.default_branch)}`);
      const url = `https://raw.githubusercontent.com/${repo.full_name}/${head.sha}/agentown.world.yaml`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const world = buf.length <= MAX ? describe(buf.toString("utf8")) : null;
      if (!world) continue;
      const hash = sha256(buf);
      worlds.push({
        id: `github:${repo.full_name}`,
        ...world.info,
        author: repo.owner.login,
        repo: repo.full_name,
        commit: head.sha,
        url,
        sha256: hash,
        size: buf.length,
        official: false,
        verified: verified.some((v) => v.repo === repo.full_name && v.sha256 === hash),
        stars: repo.stargazers_count,
        updatedAt: head.commit.committer.date,
      });
    } catch (err) {
      console.warn(`index: skipped ${repo.full_name}: ${err.message}`);
    }
  }
  return worlds.sort((a, b) => Number(b.verified) - Number(a.verified) || b.stars - a.stars || a.id.localeCompare(b.id));
}

const index = { version: 1, worlds: [...official, ...(await community())] };
writeFileSync(join(root, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(`index: ${index.worlds.length} worlds -> index.json`);
