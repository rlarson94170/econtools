import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  extractStageTag,
  fetchKabboYaml,
  hashKey,
  normalizeStage,
  repoNameToTitle,
  verifySignature,
} from "../_shared/github.ts";

// Legacy per-repo webhook. The shared helpers now back both this and the
// Kabbo GitHub App (github-app). New users should prefer the GitHub App.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const rawBody = await req.text();

    // --- Authentication: GitHub signature OR API key ---
    const ghSignature = req.headers.get("x-hub-signature-256");
    const apiKey = req.headers.get("x-api-key");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let userId: string;

    if (ghSignature) {
      // GitHub webhook authentication via HMAC signature
      const webhookSecret = Deno.env.get("GITHUB_WEBHOOK_SECRET");
      if (!webhookSecret) {
        console.error("GITHUB_WEBHOOK_SECRET not configured");
        return new Response(
          JSON.stringify({ error: "Webhook secret not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const valid = await verifySignature(rawBody, ghSignature, webhookSecret);
      if (!valid) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // For GitHub webhooks, we need the user's API key in a query param to identify the user
      const url = new URL(req.url);
      const userApiKey = url.searchParams.get("api_key");
      if (!userApiKey) {
        return new Response(
          JSON.stringify({ error: "Missing api_key query parameter. Add ?api_key=YOUR_KEY to the webhook URL." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const keyHash = await hashKey(userApiKey);
      const { data: validatedUserId, error: keyError } = await supabase.rpc(
        "validate_api_key",
        { _key_hash: keyHash }
      );

      if (keyError || !validatedUserId) {
        return new Response(JSON.stringify({ error: "Invalid API key in webhook URL" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userId = validatedUserId;

      // Update last_used_at
      await supabase
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("key_hash", keyHash);
    } else if (apiKey) {
      // Direct API key authentication (for testing / manual calls)
      const keyHash = await hashKey(apiKey);
      const { data: validatedUserId, error: keyError } = await supabase.rpc(
        "validate_api_key",
        { _key_hash: keyHash }
      );

      if (keyError || !validatedUserId) {
        return new Response(JSON.stringify({ error: "Invalid API key" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userId = validatedUserId;

      await supabase
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("key_hash", keyHash);
    } else {
      return new Response(
        JSON.stringify({ error: "Missing authentication. Provide x-hub-signature-256 (GitHub) or x-api-key header." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the payload
    const body = JSON.parse(rawBody);

    // Check if this is a GitHub webhook event
    const ghEvent = req.headers.get("x-github-event");

    if (ghEvent) {
      // Only process push events
      if (ghEvent === "ping") {
        return new Response(
          JSON.stringify({ success: true, message: "Pong! Webhook is connected." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (ghEvent !== "push") {
        return new Response(
          JSON.stringify({ skipped: true, reason: `Event '${ghEvent}' is not processed. Only 'push' events are handled.` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Extract data from GitHub push event
      const repo = body.repository;
      const repoName = repo?.name || "";
      const repoFullName = repo?.full_name || "";
      const repoUrl = repo?.html_url || "";
      const defaultBranch = repo?.default_branch || "main";
      const commits = body.commits || [];

      // Check if .kabbo.yaml was added/modified in this push
      const yamlTouched = commits.some((c: any) =>
        [...(c.added || []), ...(c.modified || [])].includes(".kabbo.yaml")
      );

      // Fetch .kabbo.yaml from repo (always try, but prioritize if touched)
      const yamlConfig = await fetchKabboYaml(repoFullName, defaultBranch);

      // Title: .kabbo.yaml > repo name
      const title = yamlConfig?.title || repoNameToTitle(repoName);

      // Check all commits for stage tags (use the latest one found)
      let stage: string | null = null;
      let latestMessage = "";
      for (const commit of commits) {
        const extracted = extractStageTag(commit.message || "");
        if (extracted) {
          stage = extracted;
        }
        latestMessage = commit.message || latestMessage;
      }

      // Stage priority: commit tag > .kabbo.yaml > existing
      if (!stage && yamlConfig?.stage) {
        const normalized = normalizeStage(yamlConfig.stage);
        if (normalized) stage = normalized;
      }

      // Try to find existing publication by title (case-insensitive)
      const { data: existing } = await supabase
        .from("publications")
        .select("id, title, stage, github_repo")
        .eq("owner_id", userId)
        .ilike("title", title)
        .limit(1)
        .single();

      // Also try matching by github_repo URL
      let existingByRepo = null;
      if (!existing && repoUrl) {
        const { data: byRepo } = await supabase
          .from("publications")
          .select("id, title, stage, github_repo")
          .eq("owner_id", userId)
          .eq("github_repo", repoUrl)
          .limit(1)
          .single();
        existingByRepo = byRepo;
      }

      const match = existing || existingByRepo;

      const pubData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        github_repo: repoUrl,
      };

      // Apply .kabbo.yaml metadata (lower priority than explicit API fields)
      if (yamlConfig) {
        if (yamlConfig.authors) pubData.authors = yamlConfig.authors;
        if (yamlConfig.output_type) pubData.output_type = yamlConfig.output_type;
        if (yamlConfig.target_year) pubData.target_year = yamlConfig.target_year;
        if (yamlConfig.themes) pubData.themes = yamlConfig.themes;
        if (yamlConfig.grants) pubData.grants = yamlConfig.grants;
        if (yamlConfig.notes) pubData.notes = yamlConfig.notes;
        if (yamlConfig.overleaf_url) pubData.overleaf_link = yamlConfig.overleaf_url;
        if (yamlConfig.links) pubData.links = yamlConfig.links;
      }

      if (stage) {
        pubData.stage = stage;
        // Add stage history entry
        pubData.stage_history = match?.stage && match.stage !== stage
          ? [{ from: match.stage, to: stage, at: new Date().toISOString() }]
          : undefined;
      }

      // Add commit info to notes if no existing notes or append
      const commitNote = `[GitHub] ${latestMessage} (${new Date().toISOString().split("T")[0]})`;

      let resultId: string;
      let action: string;

      if (match) {
        // Don't overwrite stage_history, append instead
        if (pubData.stage_history) {
          // We can't easily append in a single update, so just set the new entry
          // The client-side handles full history
        }
        delete pubData.stage_history;

        const { error: updateError } = await supabase
          .from("publications")
          .update(pubData)
          .eq("id", match.id);

        if (updateError) throw updateError;
        resultId = match.id;
        action = "updated";
      } else {
        // Create new publication
        pubData.title = title;
        pubData.owner_id = userId;
        pubData.stage = stage || "idea";

        const { data: created, error: createError } = await supabase
          .from("publications")
          .insert(pubData)
          .select("id")
          .single();

        if (createError) throw createError;
        resultId = created.id;
        action = "created";
      }

      // Log activity
      await supabase.from("activity_log").insert({
        user_id: userId,
        source: "webhook",
        action,
        publication_id: resultId,
        publication_title: title,
        details: {
          stage: stage || match?.stage || "idea",
          commit_message: latestMessage,
          repo: repoFullName,
        },
        kabbo_yaml_detected: !!yamlConfig,
      });

      return new Response(
        JSON.stringify({
          success: true,
          action,
          publication_id: resultId,
          title,
          stage: stage || match?.stage || "idea",
          commit_message: latestMessage,
          kabbo_yaml_detected: !!yamlConfig,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If not a GitHub event, return error
    return new Response(
      JSON.stringify({ error: "Not a recognized GitHub webhook event. Missing x-github-event header." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("GitHub webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
