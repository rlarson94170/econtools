import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserProfile } from '@/types/publication';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Camera, Loader2, ExternalLink, Key, Copy, Trash2, Plus, Terminal, BookOpen, Server, Database, Download, Bot, Sparkles, Gem } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ActivityLog } from './ActivityLog';

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

interface ProfileSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: UserProfile;
  onProfileUpdated: () => void;
}

// Hash a key using SHA-256 (same as edge function)
async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function ApiKeysSection({ userId }: { userId: string }) {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  // Derive the project ref from VITE_SUPABASE_URL (always set); fall back to the
  // optional VITE_SUPABASE_PROJECT_ID. Avoids "undefined.supabase.co" URLs in prod.
  const projectId = (import.meta.env.VITE_SUPABASE_URL || '').match(/\/\/([^.]+)\.supabase\.co/)?.[1]
    || import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const ingestUrl = `https://${projectId}.supabase.co/functions/v1/ingest-publications`;

  const fetchKeys = async () => {
    const { data } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, created_at, last_used_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    setKeys((data as ApiKeyRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchKeys(); }, []);

  const generateKey = async () => {
    setCreating(true);
    try {
      // Generate a random API key
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const rawKey = 'pz_' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
      const keyHash = await hashKey(rawKey);
      const keyPrefix = rawKey.slice(0, 11); // "pz_" + 8 chars

      const { error } = await supabase
        .from('api_keys')
        .insert({
          user_id: userId,
          name: newKeyName.trim() || 'Default',
          key_hash: keyHash,
          key_prefix: keyPrefix,
        });

      if (error) throw error;

      setRevealedKey(rawKey);
      setNewKeyName('');
      fetchKeys();
      toast.success('API key created – copy it now, it won\'t be shown again');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create key');
    } finally {
      setCreating(false);
    }
  };

  const deleteKey = async (id: string) => {
    const { error } = await supabase.from('api_keys').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete key');
    } else {
      toast.success('API key deleted');
      fetchKeys();
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Ingest API Endpoint</p>
        <div className="flex items-center gap-2">
          <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">{ingestUrl}</code>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copyToClipboard(ingestUrl, 'URL')}>
            <Copy className="w-3 h-3" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          POST with <code className="text-[11px]">x-api-key</code> header. Body: <code className="text-[11px]">{`{title, authors, stage, notes, ...}`}</code>
        </p>
      </div>

      {revealedKey && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <p className="text-xs font-medium text-primary">New API Key – copy now!</p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate font-mono">{revealedKey}</code>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copyToClipboard(revealedKey, 'API key')}>
              <Copy className="w-3 h-3" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">This key won't be shown again.</p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => {
              const config = JSON.stringify({
                mcpServers: {
                  kabbo: {
                    type: "url",
                    url: `https://${projectId}.supabase.co/functions/v1/mcp-server?api_key=${revealedKey}`
                  }
                }
              }, null, 2);
              copyToClipboard(config, 'MCP config');
            }}>
              <Server className="w-3 h-3" />
              Copy MCP Config
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setRevealedKey(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Key name (e.g. Overleaf sync)"
          value={newKeyName}
          onChange={e => setNewKeyName(e.target.value)}
          className="h-8 text-sm"
        />
        <Button size="sm" onClick={generateKey} disabled={creating} className="h-8 whitespace-nowrap">
          {creating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
          Create Key
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No API keys yet. Create one to enable external integrations.</p>
      ) : (
        <div className="space-y-2">
          {keys.map(k => (
            <div key={k.id} className="flex items-center justify-between rounded border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{k.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{k.key_prefix}•••</p>
                <p className="text-[11px] text-muted-foreground">
                  {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleDateString()}` : 'Never used'}
                </p>
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteKey(k.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IntegrationGuide({ userId }: { userId: string }) {
  // Derive the project ref from VITE_SUPABASE_URL (always set); fall back to the
  // optional VITE_SUPABASE_PROJECT_ID. Avoids "undefined.supabase.co" URLs in prod.
  const projectId = (import.meta.env.VITE_SUPABASE_URL || '').match(/\/\/([^.]+)\.supabase\.co/)?.[1]
    || import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const ingestUrl = `https://${projectId}.supabase.co/functions/v1/ingest-publications`;
  const apiUrl = `https://${projectId}.supabase.co/functions/v1/api-publications`;
  const mcpUrl = `https://${projectId}.supabase.co/functions/v1/mcp-server`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const curlExample = `curl -X POST "${ingestUrl}" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "title": "My Paper Title",
    "authors": ["Alice Smith", "Bob Jones"],
    "stage": "draft",
    "notes": "Drafting the methods section"
  }'`;

  // MCP config for Claude Code / Codex (HTTP server, key in an x-api-key header).
  const mcpConfig = `{
  "mcpServers": {
    "kabbo": {
      "type": "http",
      "url": "${mcpUrl}",
      "headers": { "x-api-key": "YOUR_API_KEY" }
    }
  }
}`;

  // Gemini CLI uses ~/.gemini/settings.json with httpUrl + headers.
  const geminiConfig = `{
  "mcpServers": {
    "kabbo": {
      "httpUrl": "${mcpUrl}",
      "headers": { "x-api-key": "YOUR_API_KEY" }
    }
  }
}`;

  const skillFileUrl = `${window.location.origin}/skill.md`;
  const curlInstall = `mkdir -p ~/.claude/skills/kabbo && curl -o ~/.claude/skills/kabbo/skill.md ${skillFileUrl}`;

  return (
    <div className="space-y-4 pt-2 border-t border-border">
      {/* AI Integration intro */}
      <div>
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <Sparkles className="w-4 h-4" />
          AI Integration
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Connect your AI coding agent — Claude Code, Codex, or Gemini — and it can
          manage your pipeline on request. Tell it <em>"I just submitted the climate
          paper to the AER — update Kabbo"</em> and it will fill in the journal,
          co-authors and links, then move the card to the right column. All three
          connect to the same Kabbo MCP server with a personal API key.
        </p>
      </div>

      {/* Platform cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Claude Code card */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Terminal className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Claude Code</p>
              <p className="text-[10px] text-muted-foreground">by Anthropic</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            A CLI assistant that runs in your terminal. Install the Kabbo skill
            file (or the one-command plugin) to give it access to every pipeline
            tool via the{' '}
            <code className="bg-muted px-1 rounded text-[10px]">/kabbo</code> command.
          </p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
              const a = document.createElement('a');
              a.href = skillFileUrl;
              a.download = 'skill.md';
              a.click();
            }}>
              <Download className="w-3 h-3" />
              Download skill.md
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => copyToClipboard(curlInstall)}>
              <Copy className="w-3 h-3" />
              Copy install command
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Place in <code className="bg-muted px-0.5 rounded text-[9px]">~/.claude/skills/kabbo/skill.md</code>
          </p>
        </div>

        {/* Codex card */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Codex</p>
              <p className="text-[10px] text-muted-foreground">by OpenAI</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            An AI coding agent that reads an{' '}
            <code className="bg-muted px-1 rounded text-[10px]">AGENTS.md</code> file
            in your project. Clone the Kabbo repo and Codex will automatically
            discover the pipeline tools.
          </p>
          <div className="flex gap-2 pt-1">
            <a
              href="https://github.com/johanfourieza/econtools/blob/main/kabbo/AGENTS.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                <ExternalLink className="w-3 h-3" />
                View AGENTS.md
              </Button>
            </a>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Place in your project root. Codex reads it automatically.
          </p>
        </div>

        {/* Gemini card */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Gem className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Gemini CLI</p>
              <p className="text-[10px] text-muted-foreground">by Google</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Google's terminal agent reads MCP servers from{' '}
            <code className="bg-muted px-1 rounded text-[10px]">~/.gemini/settings.json</code>.
            Add the Kabbo server and it gets every pipeline tool.
          </p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => copyToClipboard(geminiConfig)}>
              <Copy className="w-3 h-3" />
              Copy Gemini config
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Merge into <code className="bg-muted px-0.5 rounded text-[9px]">~/.gemini/settings.json</code>
          </p>
        </div>
      </div>

      {/* What you need section */}
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-xs font-medium mb-2">What you need to get started:</p>
        <ol className="text-[11px] text-muted-foreground list-decimal ml-4 space-y-1">
          <li>Create an <strong>API key</strong> in the section above</li>
          <li>Add the <strong>MCP config</strong> for your agent: the <strong>plugin</strong> or <strong>skill file</strong> (Claude Code), <strong>AGENTS.md</strong> (Codex), or the <strong>Gemini config</strong> (Gemini) — buttons above</li>
          <li>Paste your API key where the config says <code className="bg-muted px-1 rounded text-[10px]">YOUR_API_KEY</code></li>
          <li>Ask your agent: <em>"How's my pipeline looking?"</em></li>
        </ol>
      </div>

      {/* Detailed integration guides */}
      <div>
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <BookOpen className="w-4 h-4" />
          Integration guides
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          API and MCP reference for connecting your agent.
        </p>
      </div>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="quickstart">
          <AccordionTrigger className="text-sm py-2">
            <span className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              Quick Start (curl)
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Test the API with this curl command. Replace <code className="text-[11px] bg-muted px-1 rounded">YOUR_API_KEY</code> with a key from above.</p>
              <div className="relative">
                <pre className="text-[11px] bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">{curlExample}</pre>
                <Button size="sm" variant="ghost" className="absolute top-1 right-1 h-6 w-6 p-0" onClick={() => copyToClipboard(curlExample)}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <div className="text-[11px] text-muted-foreground space-y-1">
                <p className="font-medium">Stage mapping reference:</p>
                <p><code className="bg-muted px-1 rounded">idea</code> · <code className="bg-muted px-1 rounded">draft</code> · <code className="bg-muted px-1 rounded">submitted</code> · <code className="bg-muted px-1 rounded">revise_resubmit</code> · <code className="bg-muted px-1 rounded">resubmitted</code> · <code className="bg-muted px-1 rounded">accepted</code> · <code className="bg-muted px-1 rounded">published</code></p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="mcp-server">
          <AccordionTrigger className="text-sm py-2">
            <span className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              MCP Server (Claude Code · Codex · Gemini)
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Connect any agent to Kabbo over the <strong>Model Context Protocol</strong>. It can then list, create, update, move, and delete publications natively – no scripts needed. This is the same server the plugin, AGENTS.md, and Gemini config all point at.
              </p>

              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">MCP Server URL</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">{mcpUrl}</code>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copyToClipboard(mcpUrl)}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground space-y-2">
                <p className="font-medium">Setup (Claude Code / Codex):</p>
                <p>Add to your <code className="bg-muted px-1 rounded">~/.claude/settings.json</code> or project <code className="bg-muted px-1 rounded">.mcp.json</code>:</p>
                <div className="relative">
                  <pre className="text-[11px] bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">{mcpConfig}</pre>
                  <Button size="sm" variant="ghost" className="absolute top-1 right-1 h-6 w-6 p-0" onClick={() => copyToClipboard(mcpConfig)}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-[10px]">For <strong>Gemini CLI</strong>, use the same block in <code className="bg-muted px-1 rounded">~/.gemini/settings.json</code> but rename <code className="bg-muted px-1 rounded">url</code> → <code className="bg-muted px-1 rounded">httpUrl</code> and drop <code className="bg-muted px-1 rounded">type</code> (use the "Copy Gemini config" button above).</p>

                <p className="pt-2 pb-1 font-medium">Test connection:</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Paste your API key to test"
                    className="h-7 text-[11px] font-mono"
                    id="mcp-test-key"
                  />
                  <Button size="sm" variant="outline" className="h-7 text-xs whitespace-nowrap gap-1" onClick={async () => {
                    const key = (document.getElementById('mcp-test-key') as HTMLInputElement)?.value;
                    if (!key) { toast.error('Paste an API key first'); return; }
                    try {
                      const res = await fetch(mcpUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
                        body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'kabbo-test', version: '1.0.0' } }, id: 1 }),
                      });
                      if (res.ok) { toast.success('MCP server connected successfully'); }
                      else { toast.error(`Connection failed (${res.status})`); }
                    } catch { toast.error('Connection failed – check your network'); }
                  }}>
                    <Server className="w-3 h-3" />
                    Test
                  </Button>
                </div>

                <p className="font-medium pt-2">Available tools (16):</p>
                <div className="space-y-1">
                  <p><code className="bg-muted px-1 rounded">list_publications</code> – List all publications with optional filters</p>
                  <p><code className="bg-muted px-1 rounded">get_publication</code> – Get a single publication by ID</p>
                  <p><code className="bg-muted px-1 rounded">create_publication</code> – Create a new publication</p>
                  <p><code className="bg-muted px-1 rounded">update_publication</code> – Update any field on a publication</p>
                  <p><code className="bg-muted px-1 rounded">move_stage</code> – Move a publication to a different stage</p>
                  <p><code className="bg-muted px-1 rounded">delete_publication</code> – Soft-delete (bin) a publication</p>
                  <p><code className="bg-muted px-1 rounded">get_pipeline_summary</code> – Pipeline overview: counts by stage, stalled and recent papers</p>
                  <p><code className="bg-muted px-1 rounded">search_publications</code> – Search across title, authors, notes, themes, grants</p>
                  <p><code className="bg-muted px-1 rounded">bulk_update</code> – Update multiple publications at once</p>
                  <p><code className="bg-muted px-1 rounded">get_activity_log</code> – Recent activity from all sources with date filtering</p>
                  <p><code className="bg-muted px-1 rounded">manage_reminders</code> – Create, list, complete, or delete reminders</p>
                  <p><code className="bg-muted px-1 rounded">get_analytics</code> – Velocity, time per stage, breakdowns by author/theme/grant</p>
                  <p><code className="bg-muted px-1 rounded">get_team_summary</code> – Team pipeline: papers by stage per member</p>
                  <p><code className="bg-muted px-1 rounded">export_bibtex</code> – Generate BibTeX for your publications</p>
                  <p><code className="bg-muted px-1 rounded">add_note</code> – Append a timestamped note to a publication</p>
                  <p><code className="bg-muted px-1 rounded">get_stalled_papers</code> – Papers inactive for 30+ days, sorted by staleness</p>
                </div>

                <p className="font-medium pt-2">Example prompts for your agent:</p>
                <p><em>"I just submitted the climate paper to the AER — update Kabbo: set the journal, add my co-author, link the data repo, and move it to submitted."</em></p>
                <p><em>"How's my pipeline looking?"</em></p>
                <p><em>"Which papers have been stuck longest?"</em></p>
                <p><em>"How many papers did I publish this year vs last year?"</em></p>
                <p><em>"Find all papers about colonial wages"</em></p>
                <p><em>"Add a note to the climate paper: reviewer 2 wants robustness checks"</em></p>
                <p><em>"How are my students' papers progressing?"</em></p>
                <p><em>"Remind me to resubmit by June 15"</em></p>
                <p><em>"Give me BibTeX for all published papers since 2024"</em></p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="crud-api">
          <AccordionTrigger className="text-sm py-2">
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              Full CRUD API Reference
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Full REST API for listing, updating, and deleting publications. All requests need <code className="bg-muted px-1 rounded">x-api-key</code> header.
              </p>

              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Base URL</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">{apiUrl}</code>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copyToClipboard(apiUrl)}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground space-y-2">
                <p className="font-medium">GET – List publications</p>
                <p><code className="bg-muted px-1 rounded">?q=search</code> <code className="bg-muted px-1 rounded">?stage=draft</code> <code className="bg-muted px-1 rounded">?id=UUID</code> <code className="bg-muted px-1 rounded">?limit=50&offset=0</code></p>

                <p className="font-medium pt-1">PATCH – Update a publication</p>
                <p>Body: <code className="bg-muted px-1 rounded">{`{ "id": "...", "stage": "submitted", "notes": "..." }`}</code></p>

                <p className="font-medium pt-1">DELETE – Bin a publication</p>
                <p><code className="bg-muted px-1 rounded">?id=UUID</code></p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

export function ProfileSettingsModal({
  open,
  onOpenChange,
  profile,
  onProfileUpdated,
}: ProfileSettingsModalProps) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    displayName: profile.displayName || '',
    universityAffiliation: profile.universityAffiliation || '',
    googleScholarUrl: profile.googleScholarUrl || '',
    personalWebsiteUrl: profile.personalWebsiteUrl || '',
    orcidId: profile.orcidId || '',
    autoIncludeMeInAuthors: profile.autoIncludeMeInAuthors ?? true,
  });

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${profile.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      toast.success('Avatar updated');
      onProfileUpdated();
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  const isValidUrl = (url: string): boolean => {
    if (!url) return true;
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      try {
        const parsed = new URL(`https://${url}`);
        return ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    }
  };

  const normalizeUrl = (url: string): string => {
    if (!url) return url;
    const trimmed = url.trim();
    if (!trimmed) return trimmed;
    if (!/^https?:\/\//i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return trimmed;
  };

  const isValidOrcid = (orcid: string): boolean => {
    if (!orcid) return true;
    const cleanOrcid = orcid.replace(/-/g, '');
    return /^\d{15}[\dX]$/.test(cleanOrcid);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const googleScholarUrl = formData.googleScholarUrl.trim();
      const personalWebsiteUrl = formData.personalWebsiteUrl.trim();
      const orcidId = formData.orcidId.trim();

      if (googleScholarUrl && !isValidUrl(googleScholarUrl)) {
        toast.error('Google Scholar URL must be a valid http/https URL');
        setLoading(false);
        return;
      }

      if (personalWebsiteUrl && !isValidUrl(personalWebsiteUrl)) {
        toast.error('Personal website URL must be a valid http/https URL');
        setLoading(false);
        return;
      }

      if (orcidId && !isValidOrcid(orcidId)) {
        toast.error('ORCID iD should be in format: 0000-0000-0000-0000');
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: formData.displayName.trim() || null,
          university_affiliation: formData.universityAffiliation.trim() || null,
          google_scholar_url: googleScholarUrl ? normalizeUrl(googleScholarUrl) : null,
          personal_website_url: personalWebsiteUrl ? normalizeUrl(personalWebsiteUrl) : null,
          orcid_id: orcidId || null,
          auto_include_me_in_authors: formData.autoIncludeMeInAuthors,
        })
        .eq('id', profile.id);

      if (error) throw error;

      toast.success('Profile updated');
      onProfileUpdated();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const getInitials = () => {
    if (formData.displayName) {
      return formData.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return 'U';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="developer" className="flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              AI Integration
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Avatar Section */}
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <Avatar className="w-20 h-20">
                    <AvatarImage src={profile.avatarUrl} alt={formData.displayName} />
                    <AvatarFallback className="text-lg">{getInitials()}</AvatarFallback>
                  </Avatar>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute bottom-0 right-0 p-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Click camera to upload photo</p>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    value={formData.displayName}
                    onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                    placeholder="Your name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="universityAffiliation">University Affiliation</Label>
                  <Input
                    id="universityAffiliation"
                    value={formData.universityAffiliation}
                    onChange={(e) => setFormData(prev => ({ ...prev, universityAffiliation: e.target.value }))}
                    placeholder="e.g., University of Oxford"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="googleScholarUrl" className="flex items-center gap-1">
                    Google Scholar
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </Label>
                  <Input
                    id="googleScholarUrl"
                    type="text"
                    value={formData.googleScholarUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, googleScholarUrl: e.target.value }))}
                    placeholder="scholar.google.com/citations?user=..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="personalWebsiteUrl" className="flex items-center gap-1">
                    Personal Website
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </Label>
                  <Input
                    id="personalWebsiteUrl"
                    type="text"
                    value={formData.personalWebsiteUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, personalWebsiteUrl: e.target.value }))}
                    placeholder="yourwebsite.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orcidId">ORCID iD</Label>
                  <Input
                    id="orcidId"
                    value={formData.orcidId}
                    onChange={(e) => setFormData(prev => ({ ...prev, orcidId: e.target.value }))}
                    placeholder="0000-0000-0000-0000"
                  />
                </div>
              </div>

              {/* Author preferences */}
              <div className="border-t border-border pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <Label htmlFor="auto-include-me" className="font-medium">
                      Include my name in new publications
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      When on, new publications pre-fill the authors field with your display name.
                      Dashboard cards still show only your co-authors.
                    </p>
                  </div>
                  <Switch
                    id="auto-include-me"
                    checked={formData.autoIncludeMeInAuthors}
                    onCheckedChange={(v) =>
                      setFormData(prev => ({ ...prev, autoIncludeMeInAuthors: v }))
                    }
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="developer" className="mt-4">
            <div className="space-y-3 overflow-x-hidden">
              <ActivityLog userId={profile.id} />
              <div className="border-t border-border pt-3">
                <h3 className="text-sm font-medium flex items-center gap-1.5">
                  <Key className="w-4 h-4" />
                  API Keys
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Generate a key, then paste it into your agent's MCP config (Claude Code, Codex, or Gemini) so it can read and update your pipeline.
                </p>
              </div>
              <ApiKeysSection userId={profile.id} />
              <IntegrationGuide userId={profile.id} />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}