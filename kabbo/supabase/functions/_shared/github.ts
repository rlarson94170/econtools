// Shared GitHub helpers for the Kabbo edge functions.
//
// Two consumers:
//   - github-webhook  (legacy per-repo webhooks, API-key auth)
//   - github-app      (the Kabbo GitHub App: signed webhooks + installation tokens)
//
// The YAML / stage / matching helpers were lifted verbatim from the original
// github-webhook/index.ts so behaviour is unchanged. The App-auth helpers
// (appJwt, installationToken, ghContents, countTexWords) are new.

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

export const VALID_STAGES = [
  "idea", "draft", "submitted", "revise_resubmit",
  "resubmitted", "accepted", "published",
] as const;

/** Map common stage aliases to a canonical stage, or null if unrecognised. */
export function normalizeStage(stage: string): string | null {
  const map: Record<string, string> = {
    idea: "idea", ideas: "idea",
    draft: "draft", drafting: "draft", wip: "draft",
    "in-progress": "draft", "work-in-progress": "draft",
    submitted: "submitted", "under-review": "submitted", "under review": "submitted",
    revise: "revise_resubmit", "revise-resubmit": "revise_resubmit",
    revise_resubmit: "revise_resubmit", "r&r": "revise_resubmit",
    "revise and resubmit": "revise_resubmit",
    resubmitted: "resubmitted",
    accepted: "accepted", forthcoming: "accepted",
    published: "published",
  };
  const key = stage.toLowerCase().trim();
  return map[key] || (VALID_STAGES.includes(key as typeof VALID_STAGES[number]) ? key : null);
}

/** Extract a [stage:xxx] tag from a commit message, normalised. */
export function extractStageTag(message: string): string | null {
  const match = message.match(/\[stage:([^\]]+)\]/i);
  if (!match) return null;
  return normalizeStage(match[1]);
}

/** Turn a repo slug ("colonial-wages") into a human title ("Colonial Wages"). */
export function repoNameToTitle(name: string): string {
  return name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Signatures & hashing
// ---------------------------------------------------------------------------

/** Verify a GitHub webhook HMAC-SHA256 signature ("sha256=..."), constant-time. */
export async function verifySignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const computed = "sha256=" +
    Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (computed.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

/** SHA-256 hex of an API key (matches validate_api_key's stored key_hash). */
export async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// .kabbo.yaml
// ---------------------------------------------------------------------------

export interface KabboYaml {
  title?: string;
  authors?: string[];
  stage?: string;
  output_type?: string;
  target_year?: number;
  target_journal?: string;
  themes?: string[];
  grants?: string[];
  notes?: string;
  overleaf_url?: string;
  links?: string[];
}

/** Minimal YAML parser: flat key-value + simple "- item" arrays. No deps. */
export function parseSimpleYaml(text: string): KabboYaml {
  const result: Record<string, unknown> = {};
  const lines = text.split("\n");
  let currentKey = "";
  let currentArray: string[] | null = null;

  for (const line of lines) {
    if (line.trim().startsWith("#") || line.trim() === "") {
      if (currentArray && currentKey) {
        result[currentKey] = currentArray;
        currentArray = null;
        currentKey = "";
      }
      continue;
    }

    const arrayMatch = line.match(/^\s+-\s+(.+)$/);
    if (arrayMatch && currentKey) {
      if (!currentArray) currentArray = [];
      currentArray.push(arrayMatch[1].trim().replace(/^["']|["']$/g, ""));
      continue;
    }

    if (currentArray && currentKey) {
      result[currentKey] = currentArray;
      currentArray = null;
    }

    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const val = kvMatch[2].trim();
      if (val === "" || val === "[]") {
        currentKey = key;
        currentArray = val === "[]" ? [] : null;
      } else {
        const cleaned = val.replace(/^["']|["']$/g, "");
        if (cleaned === "true") result[key] = true;
        else if (cleaned === "false") result[key] = false;
        else if (/^\d+$/.test(cleaned)) result[key] = parseInt(cleaned, 10);
        else result[key] = cleaned;
        currentKey = "";
      }
    }
  }
  if (currentArray && currentKey) result[currentKey] = currentArray;
  return result as KabboYaml;
}

/**
 * Fetch and parse .kabbo.yaml from a repo's default branch.
 * With an installation token, reads via the authenticated Contents API (works
 * for private repos); without one, falls back to the public raw URL.
 */
export async function fetchKabboYaml(
  repoFullName: string,
  defaultBranch: string,
  token?: string,
): Promise<KabboYaml | null> {
  try {
    if (token) {
      const text = await ghContents(repoFullName, ".kabbo.yaml", token, defaultBranch);
      return text ? parseSimpleYaml(text) : null;
    }
    const url = `https://raw.githubusercontent.com/${repoFullName}/${defaultBranch}/.kabbo.yaml`;
    const resp = await fetch(url, { headers: { "User-Agent": "Kabbo-Webhook/1.0" } });
    if (!resp.ok) return null;
    return parseSimpleYaml(await resp.text());
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GitHub App authentication
// ---------------------------------------------------------------------------

const GH_API = "https://api.github.com";
const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "Kabbo-GitHub-App/1.0",
};

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode a PKCS8 PEM ("-----BEGIN PRIVATE KEY-----") into DER bytes. */
function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der;
}

/**
 * Build a short-lived (10 min) RS256 App JWT signed with the App private key.
 * GITHUB_APP_PRIVATE_KEY must be in PKCS8 PEM form:
 *   openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in app.pem -out app.pkcs8.pem
 */
export async function appJwt(): Promise<string> {
  const appId = Deno.env.get("GITHUB_APP_ID");
  const pem = Deno.env.get("GITHUB_APP_PRIVATE_KEY");
  if (!appId || !pem) throw new Error("GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY not configured");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iat: now - 60, exp: now + 9 * 60, iss: appId };
  const enc = new TextEncoder();
  const signingInput =
    base64UrlEncode(enc.encode(JSON.stringify(header))) + "." +
    base64UrlEncode(enc.encode(JSON.stringify(payload)));

  const key = await crypto.subtle.importKey(
    "pkcs8", pemToDer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(signingInput));
  return signingInput + "." + base64UrlEncode(new Uint8Array(sig));
}

const tokenCache = new Map<number, { token: string; exp: number }>();

/** Mint (and briefly cache) an installation access token. */
export async function installationToken(installationId: number): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.exp - 60_000 > Date.now()) return cached.token;

  const jwt = await appJwt();
  const res = await fetch(`${GH_API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: { ...GH_HEADERS, Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error(`installation token failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  tokenCache.set(installationId, { token: data.token, exp: new Date(data.expires_at).getTime() });
  return data.token;
}

export interface RepoMeta {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  default_branch: string;
}

/** List the repositories an installation can access (full repo objects). */
export async function listInstallationRepos(
  installationId: number, token: string,
): Promise<RepoMeta[]> {
  const repos: RepoMeta[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(
      `${GH_API}/installation/repositories?per_page=100&page=${page}`,
      { headers: { ...GH_HEADERS, Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) break;
    const data = await res.json();
    const batch = (data.repositories || []) as RepoMeta[];
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
}

/** Read a text file from a repo via the Contents API. Returns null if absent. */
export async function ghContents(
  repoFullName: string,
  path: string,
  token: string,
  ref?: string,
): Promise<string | null> {
  const url = new URL(`${GH_API}/repos/${repoFullName}/contents/${path}`);
  if (ref) url.searchParams.set("ref", ref);
  const res = await fetch(url.toString(), {
    headers: { ...GH_HEADERS, Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`contents ${path}: ${res.status}`);
  const data = await res.json();
  if (!data.content) return null;
  const bin = atob(data.content.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------------------
// LaTeX word count (writing momentum)
// ---------------------------------------------------------------------------

/** texcount-lite: strip comments + commands + braces, count word tokens. */
export function countWordsInTex(tex: string): number {
  const cleaned = tex
    .replace(/(^|[^\\])%.*$/gm, "$1")   // strip % comments (not \%)
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, " ") // strip \commands{...}
    .replace(/[{}$&~^_\\]/g, " ")       // strip residual TeX punctuation
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(" ").filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

/**
 * Sum LaTeX word counts across a repo's .tex files (capped) using the git tree
 * + blob APIs. Best-effort: returns the total, or 0 if nothing readable.
 */
export async function countTexWords(
  repoFullName: string,
  token: string,
  branch: string,
  maxFiles = 25,
): Promise<number> {
  try {
    const treeRes = await fetch(
      `${GH_API}/repos/${repoFullName}/git/trees/${branch}?recursive=1`,
      { headers: { ...GH_HEADERS, Authorization: `Bearer ${token}` } },
    );
    if (!treeRes.ok) return 0;
    const tree = await treeRes.json();
    const texBlobs = (tree.tree || [])
      .filter((n: { type: string; path: string }) => n.type === "blob" && /\.tex$/i.test(n.path))
      .slice(0, maxFiles) as Array<{ sha: string; path: string }>;

    let total = 0;
    for (const blob of texBlobs) {
      const bRes = await fetch(`${GH_API}/repos/${repoFullName}/git/blobs/${blob.sha}`, {
        headers: { ...GH_HEADERS, Authorization: `Bearer ${token}` },
      });
      if (!bRes.ok) continue;
      const bData = await bRes.json();
      if (bData.encoding !== "base64" || !bData.content) continue;
      const bin = atob(bData.content.replace(/\n/g, ""));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      total += countWordsInTex(new TextDecoder().decode(bytes));
    }
    return total;
  } catch {
    return 0;
  }
}
