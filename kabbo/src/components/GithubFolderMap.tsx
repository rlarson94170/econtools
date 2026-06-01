import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, FolderGit2, FileText } from 'lucide-react';
import { useGithubInstallations, type RepoFolders } from '@/hooks/useGithubInstallations';

interface CardRow {
  id: string;
  title: string;
  stage: string;
  github_repo: string | null;
  github_subpath: string | null;
}

const NEW = '__new__';
const SKIP = '';

/**
 * Maps the top-level folders of a connected repo to publication cards.
 * Pure point-and-click: a dropdown per folder (link an existing card, create a
 * new one, or skip). Writes github_repo / github_repo_id / github_subpath.
 */
export function GithubFolderMap({
  open, onOpenChange, repoFullName, userId, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  repoFullName: string;
  userId: string;
  onSaved?: () => void;
}) {
  const { listFolders } = useGithubInstallations(userId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<RepoFolders | null>(null);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [folders, { data: cardData }] = await Promise.all([
          listFolders(repoFullName),
          supabase
            .from('publications')
            .select('id, title, stage, github_repo, github_subpath')
            .eq('owner_id', userId)
            .order('title', { ascending: true }),
        ]);
        if (cancelled) return;
        const rows = (cardData as CardRow[]) || [];
        setInfo(folders);
        setCards(rows);
        // Pre-select any folder already mapped to a card.
        const pre: Record<string, string> = {};
        for (const f of folders.folders) {
          const mapped = rows.find(c => c.github_repo === folders.html_url && c.github_subpath === f.path);
          pre[f.path] = mapped ? mapped.id : SKIP;
        }
        setChoice(pre);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, repoFullName, userId, listFolders]);

  const save = async () => {
    if (!info) return;
    setSaving(true);
    try {
      let linked = 0;
      for (const f of info.folders) {
        const v = choice[f.path];
        if (!v) continue; // skip
        const patch = {
          github_repo: info.html_url,
          github_repo_id: info.repo_id,
          github_subpath: f.path,
          updated_at: new Date().toISOString(),
        };
        if (v === NEW) {
          const { error } = await supabase.from('publications').insert({
            owner_id: userId, title: f.path, stage: 'draft', ...patch,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase.from('publications').update(patch).eq('id', v);
          if (error) throw error;
        }
        linked++;
      }
      toast.success(linked ? `Linked ${linked} folder${linked > 1 ? 's' : ''}` : 'No changes');
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || 'Failed to save links');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FolderGit2 className="w-4 h-4" /> Link folders in {repoFullName.split('/')[1]}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <p className="text-sm text-destructive py-4">{error}</p>
        ) : info && info.folders.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No top-level folders found in this repo. (Kabbo links one card per folder; a
            single-paper repo links automatically on first push.)
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Pick which paper each folder belongs to. Pushes that change a folder will update its card.
            </p>
            {info?.folders.map(f => (
              <div key={f.path} className="flex items-center gap-2">
                <div className="w-40 min-w-0">
                  <p className="text-sm font-medium truncate flex items-center gap-1">
                    {f.path}
                    {f.hasTex && <FileText className="w-3 h-3 text-muted-foreground" aria-label="contains LaTeX" />}
                  </p>
                </div>
                <Select value={choice[f.path] ?? SKIP} onValueChange={(v) => setChoice(c => ({ ...c, [f.path]: v }))}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Skip" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SKIP}>— Skip —</SelectItem>
                    <SelectItem value={NEW}>+ Create a new card</SelectItem>
                    {cards.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.title || '(untitled)'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Save links
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
