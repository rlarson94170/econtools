import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface GithubInstallation {
  installation_id: number;
  account_login: string | null;
  account_type: string | null;
  repositories: { all?: boolean } | Array<{ id: number; full_name: string }>;
  suspended_at: string | null;
  created_at: string;
}

const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const installUrl = `https://${projectId}.supabase.co/functions/v1/github-app/install`;

/**
 * Reads the user's connected GitHub App installations and starts the
 * install/connect flow using the current Supabase session (no API key needed).
 */
export function useGithubInstallations(userId: string | undefined) {
  const [installations, setInstallations] = useState<GithubInstallation[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('github_installations')
      .select('installation_id, account_login, account_type, repositories, suspended_at, created_at')
      .eq('user_id', userId);
    setInstallations((data as GithubInstallation[]) || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  /** Opens GitHub's App install screen, authenticated by the current session. */
  const connect = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      toast.error('Please sign in again to connect GitHub');
      return;
    }
    window.location.href = `${installUrl}?token=${encodeURIComponent(token)}`;
  }, []);

  const repoCount = (inst: GithubInstallation): number | 'all' =>
    Array.isArray(inst.repositories) ? inst.repositories.length
      : inst.repositories?.all ? 'all' : 0;

  return { installations, loading, refresh, connect, repoCount };
}
