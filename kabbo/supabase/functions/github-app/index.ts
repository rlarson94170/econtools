// Kabbo GitHub App.
//
// One install on a user's account/org tracks every selected repo. No API key in
// the URL: the webhook is signed with the App secret and the owning Kabbo user
// is resolved from installation.id via the github_installations table.
//
// Routes (path suffix, since Supabase prefixes the function name):
//   POST .../github-app            → signed App webhook (push/release/PR/install)
//   GET  .../github-app/install    → ?token=SUPABASE_JWT (or api_key) → redirect
//                                     to GitHub's install screen with a signed state
//   GET  .../github-app/callback   → the App's GitHub "Callback URL". Requires
//                                     "Request user authorization (OAuth) during
//                                     installation" so GitHub returns our `state`
//                                     (+ installation_id) here; we verify state
//                                     and bind installation→user. The `code` is
//                                     ignored. (The plain Setup URL does NOT
//                                     carry state, so it can't be used for this.)
//
// Required secrets: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY (PKCS8 PEM),
// GITHUB_APP_WEBHOOK_SECRET, GITHUB_APP_SLUG. Optional: SITE_URL.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  countTexWords,
  extractStageTag,
  fetchKabboYaml,
  hashKey,
  installationToken,
  type KabboYaml,
  listInstallationRepos,
  normalizeStage,
  repoNameToTitle,
  verifySignature,
} from "../_shared/github.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") || "https://kabbo.app";
const APP_SLUG = Deno.env.get("GITHUB_APP_SLUG") || "kabbo-app";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature-256, x-github-event",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

// --- signed install state (no table needed) ---------------------------------

async function hmac(input: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(input));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signState(userId: string, secret: string): Promise<string> {
  const ts = Date.now().toString();
  const payload = `${userId}.${ts}`;
  return `${btoa(payload).replace(/=+$/, "")}.${await hmac(payload, secret)}`;
}

async function verifyState(state: string, secret: string): Promise<string | null> {
  const [b64, sig] = state.split(".");
  if (!b64 || !sig) return null;
  let payload: string;
  try { payload = atob(b64); } catch { return null; }
  if (await hmac(payload, secret) !== sig) return null;
  const [userId, tsStr] = payload.split(".");
  if (!userId || !tsStr) return null;
  if (Date.now() - Number(tsStr) > 15 * 60 * 1000) return null; // 15 min
  return userId;
}

// --- shared upsert (push + auto-import on install) --------------------------

interface RepoInfo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  default_branch: string;
}

async function upsertFromRepo(
  supabase: SupabaseClient,
  userId: string,
  repo: RepoInfo,
  yamlConfig: KabboYaml | null,
  stage: string | null,
  commitMessage: string | null,
  source: string,
  words: number | null,
): Promise<{ id: string; action: string; title: string; stage: string }> {
  const title = yamlConfig?.title || repoNameToTitle(repo.name);

  // Match: stable repo id → repo URL → title (case-insensitive).
  let match: { id: string; stage: string } | null = null;
  const byId = await supabase.from("publications")
    .select("id, stage").eq("owner_id", userId).eq("github_repo_id", repo.id)
    .is("deleted_at", null).limit(1).maybeSingle();
  match = byId.data;
  if (!match) {
    const byUrl = await supabase.from("publications")
      .select("id, stage").eq("owner_id", userId).eq("github_repo", repo.html_url)
      .is("deleted_at", null).limit(1).maybeSingle();
    match = byUrl.data;
  }
  if (!match) {
    const byTitle = await supabase.from("publications")
      .select("id, stage").eq("owner_id", userId).ilike("title", title)
      .is("deleted_at", null).limit(1).maybeSingle();
    match = byTitle.data;
  }

  const pubData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    github_repo: repo.html_url,
    github_repo_id: repo.id,
  };
  if (yamlConfig) {
    if (yamlConfig.authors) pubData.authors = yamlConfig.authors;
    if (yamlConfig.output_type) pubData.output_type = yamlConfig.output_type;
    if (yamlConfig.target_year) pubData.target_year = yamlConfig.target_year;
    if (yamlConfig.target_journal) pubData.target_journal = yamlConfig.target_journal;
    if (yamlConfig.themes) pubData.themes = yamlConfig.themes;
    if (yamlConfig.grants) pubData.grants = yamlConfig.grants;
    if (yamlConfig.notes) pubData.notes = yamlConfig.notes;
    if (yamlConfig.overleaf_url) pubData.overleaf_link = yamlConfig.overleaf_url;
    if (yamlConfig.links) pubData.links = yamlConfig.links;
  }
  if (stage) pubData.stage = stage;

  let resultId: string;
  let action: string;
  let resolvedStage: string;

  if (match) {
    // Append to word_count_history if we measured one.
    if (words !== null) {
      const cur = await supabase.from("publications")
        .select("word_count_history").eq("id", match.id).maybeSingle();
      const hist = Array.isArray(cur.data?.word_count_history) ? cur.data!.word_count_history : [];
      hist.push({ at: new Date().toISOString(), words });
      pubData.word_count_history = hist.slice(-200);
    }
    const { error } = await supabase.from("publications").update(pubData).eq("id", match.id);
    if (error) throw error;
    resultId = match.id;
    action = "updated";
    resolvedStage = stage || match.stage;
  } else {
    pubData.title = title;
    pubData.owner_id = userId;
    pubData.stage = stage || "idea";
    if (words !== null) pubData.word_count_history = [{ at: new Date().toISOString(), words }];
    const { data, error } = await supabase.from("publications").insert(pubData)
      .select("id").single();
    if (error) throw error;
    resultId = data.id;
    action = "created";
    resolvedStage = (pubData.stage as string);
  }

  await supabase.from("activity_log").insert({
    user_id: userId,
    source,
    action,
    publication_id: resultId,
    publication_title: title,
    details: {
      stage: resolvedStage,
      repo: repo.full_name,
      ...(commitMessage ? { commit_message: commitMessage } : {}),
      ...(words !== null ? { word_count: words } : {}),
    },
    kabbo_yaml_detected: !!yamlConfig,
  });

  return { id: resultId, action, title, stage: resolvedStage };
}

/**
 * Auto-import: create a card for each accessible repo that has a .kabbo.yaml.
 * Idempotent (upsertFromRepo matches by repo id/title), so it's safe to call
 * from both the installation webhook and the OAuth callback. Returns the count.
 */
async function importInstallationRepos(
  supabase: SupabaseClient, userId: string, installationId: number,
): Promise<number> {
  const token = await installationToken(installationId);
  const repos = await listInstallationRepos(installationId, token);
  let imported = 0;
  for (const r of repos.slice(0, 100)) {
    const branch = r.default_branch || "main";
    const yaml = await fetchKabboYaml(r.full_name, branch, token);
    if (!yaml) continue; // only import repos that opt in via .kabbo.yaml
    const words = await countTexWords(r.full_name, token, branch);
    await upsertFromRepo(
      supabase, userId,
      { id: r.id, name: r.name, full_name: r.full_name, html_url: r.html_url, default_branch: branch },
      yaml, yaml.stage ? normalizeStage(yaml.stage) : null, null, "github_app", words || null,
    );
    imported++;
  }
  return imported;
}

// --- installation persistence -----------------------------------------------

async function upsertInstallation(
  supabase: SupabaseClient,
  installation: { id: number; account?: { login?: string; type?: string } },
  repositories: unknown,
  patch: Record<string, unknown> = {},
) {
  await supabase.from("github_installations").upsert({
    installation_id: installation.id,
    account_login: installation.account?.login ?? null,
    account_type: installation.account?.type ?? null,
    ...(repositories !== undefined ? { repositories } : {}),
    updated_at: new Date().toISOString(),
    ...patch,
  }, { onConflict: "installation_id" });
}

async function userForInstallation(
  supabase: SupabaseClient, installationId: number,
): Promise<string | null> {
  const { data } = await supabase.from("github_installations")
    .select("user_id").eq("installation_id", installationId).maybeSingle();
  return data?.user_id ?? null;
}

// --- handlers ----------------------------------------------------------------

async function handleWebhook(req: Request, rawBody: string): Promise<Response> {
  const secret = Deno.env.get("GITHUB_APP_WEBHOOK_SECRET");
  if (!secret) return json({ error: "Webhook secret not configured" }, 500);

  const signature = req.headers.get("x-hub-signature-256");
  if (!signature || !(await verifySignature(rawBody, signature, secret))) {
    return json({ error: "Invalid signature" }, 401);
  }

  const event = req.headers.get("x-github-event") || "";
  if (event === "ping") return json({ success: true, message: "Pong! Kabbo App connected." });

  const body = JSON.parse(rawBody);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const installationId: number | undefined = body.installation?.id;

  // -- installation lifecycle --
  if (event === "installation" || event === "installation_repositories") {
    if (!installationId) return json({ skipped: true });
    const repos = body.repositories ?? body.repositories_added ??
      (body.repository_selection === "all" ? { all: true } : []);
    await upsertInstallation(supabase, body.installation, repos);

    if (body.action === "deleted") {
      await supabase.from("github_installations").delete().eq("installation_id", installationId);
      return json({ success: true, action: "uninstalled" });
    }
    if (body.action === "suspend") {
      await supabase.from("github_installations")
        .update({ suspended_at: new Date().toISOString() }).eq("installation_id", installationId);
      return json({ success: true, action: "suspended" });
    }
    if (body.action === "unsuspend") {
      await supabase.from("github_installations")
        .update({ suspended_at: null }).eq("installation_id", installationId);
      return json({ success: true, action: "unsuspended" });
    }

    // Auto-import any repo that opts in via .kabbo.yaml — only if this
    // installation is already bound to a Kabbo user. If the callback hasn't run
    // yet, it will run the same import after binding (idempotent).
    const userId = await userForInstallation(supabase, installationId);
    const imported = userId ? await importInstallationRepos(supabase, userId, installationId) : 0;
    return json({ success: true, action: body.action, bound: !!userId, imported });
  }

  // Everything else needs an installation→user binding.
  if (!installationId) return json({ skipped: true, reason: "no installation id" });
  const userId = await userForInstallation(supabase, installationId);
  if (!userId) return json({ skipped: true, reason: "installation not bound to a Kabbo user yet" });

  const repo = body.repository;
  if (!repo?.full_name) return json({ skipped: true, reason: "no repository" });
  const repoInfo: RepoInfo = {
    id: repo.id, name: repo.name, full_name: repo.full_name,
    html_url: repo.html_url, default_branch: repo.default_branch || "main",
  };

  // -- push --
  if (event === "push") {
    const commits = body.commits || [];
    let stage: string | null = null;
    let latestMessage = "";
    for (const c of commits) {
      const tag = extractStageTag(c.message || "");
      if (tag) stage = tag;
      latestMessage = c.message || latestMessage;
    }
    const token = await installationToken(installationId);
    const yaml = await fetchKabboYaml(repoInfo.full_name, repoInfo.default_branch, token);
    if (!stage && yaml?.stage) stage = normalizeStage(yaml.stage);
    const words = await countTexWords(repoInfo.full_name, token, repoInfo.default_branch);
    const result = await upsertFromRepo(
      supabase, userId, repoInfo, yaml, stage, latestMessage, "github_app", words || null,
    );
    return json({ success: true, ...result, word_count: words });
  }

  // -- release published → move stage if the tag/name encodes one --
  if (event === "release" && body.action === "published") {
    const rel = body.release || {};
    const stage = normalizeStage(rel.tag_name || "") || normalizeStage(rel.name || "");
    const token = await installationToken(installationId);
    const yaml = await fetchKabboYaml(repoInfo.full_name, repoInfo.default_branch, token);
    const result = await upsertFromRepo(
      supabase, userId, repoInfo, yaml, stage,
      `Release: ${rel.name || rel.tag_name} ${rel.html_url || ""}`.trim(),
      "github_app", null,
    );
    return json({ success: true, ...result, release: rel.tag_name });
  }

  // -- merged PR → activity note only --
  if (event === "pull_request" && body.action === "closed" && body.pull_request?.merged) {
    const pr = body.pull_request;
    await supabase.from("activity_log").insert({
      user_id: userId, source: "github_app", action: "pr_merged",
      publication_title: repoInfo.full_name,
      details: { repo: repoInfo.full_name, pr_title: pr.title, pr_url: pr.html_url },
      kabbo_yaml_detected: false,
    });
    return json({ success: true, action: "pr_merged" });
  }

  return json({ skipped: true, reason: `event '${event}' not handled` });
}

async function handleInstall(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");   // Supabase session JWT (preferred)
  const apiKey = url.searchParams.get("api_key"); // fallback

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  let userId: string | null = null;
  if (token) {
    const { data } = await supabase.auth.getUser(token);
    userId = data.user?.id ?? null;
  } else if (apiKey) {
    const { data } = await supabase.rpc("validate_api_key", { _key_hash: await hashKey(apiKey) });
    userId = (data as string | null) ?? null;
  }
  if (!userId) return json({ error: "Not authenticated" }, 401);

  const secret = Deno.env.get("GITHUB_APP_WEBHOOK_SECRET");
  if (!secret) return json({ error: "App not configured" }, 500);
  const state = await signState(userId, secret);
  const target = `https://github.com/apps/${APP_SLUG}/installations/new?state=${encodeURIComponent(state)}`;
  return new Response(null, { status: 302, headers: { ...cors, Location: target } });
}

async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const installationId = url.searchParams.get("installation_id");
  const secret = Deno.env.get("GITHUB_APP_WEBHOOK_SECRET");

  const redirect = (status: string) =>
    new Response(null, { status: 302, headers: { ...cors, Location: `${SITE_URL}/?github=${status}` } });

  if (!state || !installationId || !secret) return redirect("error");
  const userId = await verifyState(state, secret);
  if (!userId) return redirect("error");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  await supabase.from("github_installations").upsert({
    installation_id: Number(installationId),
    user_id: userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "installation_id" });

  // Auto-import opted-in repos after binding. Run in the background so the
  // browser redirect isn't blocked by repo scanning; await as a fallback.
  const importTask = importInstallationRepos(supabase, userId, Number(installationId)).catch(() => 0);
  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(importTask);
  else await importTask;

  return redirect("connected");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const pathname = new URL(req.url).pathname;

  try {
    if (req.method === "GET" && pathname.endsWith("/install")) return await handleInstall(req);
    if (req.method === "GET" && pathname.endsWith("/callback")) return await handleCallback(req);
    if (req.method === "POST") return await handleWebhook(req, await req.text());
    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error("github-app error:", error);
    return json({ error: (error as Error).message || "Internal server error" }, 500);
  }
});
