
import { useState, useCallback } from 'react';
import { prefetchDeputies } from '@/utils/deputyCache';
import { prefetchDeputiesFromSupabase, checkDeputiesTableStatus } from '@/utils/deputySupabaseService';
import { toast } from 'sonner';
import { processDeputiesFromVoteDetail } from '@/components/votes/voteDetailsUtils';
import { ensureDeputyIdFormat } from '@/utils/deputySupabaseService';
import { GroupVoteDetail } from '@/utils/types';

export const useDeputyPrefetch = (legislature: string) => {
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [prefetchError, setPrefetchError] = useState<string | null>(null);

  const prefetchDeputiesData = useCallback(async (groupsData: Record<string, GroupVoteDetail>) => {
    try {
      setIsPrefetching(true);
      setPrefetchError(null);

      // Check deputies table status first
      const status = await checkDeputiesTableStatus(legislature);
      console.log(`[useDeputyPrefetch] Deputies table status:`, status);

      if (status.empty) {
        console.log('[useDeputyPrefetch] Deputies table is empty');
        toast.info(
          "Base de données des députés vide", 
          { 
            description: "Pour voir les noms des députés, cliquez sur le bouton 'Synchroniser les députés'",
            duration: 8000
          }
        );
        return false;
      }

      // Extract all deputy IDs from groups data
      const allDeputyIds = new Set<string>();
      Object.values(groupsData).forEach(group => {
        if (!group) return;
        
        const deputies = processDeputiesFromVoteDetail(group);
        deputies.forEach(deputy => {
          if (deputy.id) {
            const formattedId = ensureDeputyIdFormat(deputy.id);
            allDeputyIds.add(formattedId);
          }
        });
      });

      if (allDeputyIds.size === 0) {
        console.log('[useDeputyPrefetch] No deputy IDs found in groups data');
        return false;
      }

      console.log(`[useDeputyPrefetch] Prefetching ${allDeputyIds.size} deputies`);

      // First prefetch from Supabase
      const supabaseResult = await prefetchDeputiesFromSupabase(Array.from(allDeputyIds), legislature);
      console.log('[useDeputyPrefetch] Supabase prefetch result:', supabaseResult);

      // Then update the in-memory cache
      await prefetchDeputies(Array.from(allDeputyIds));

      return true;
    } catch (error) {
      console.error('[useDeputyPrefetch] Error prefetching deputies:', error);
      setPrefetchError(error instanceof Error ? error.message : 'Une erreur est survenue');
      return false;
    } finally {
      setIsPrefetching(false);
    }
  }, [legislature]);

  return {
    isPrefetching,
    prefetchError,
    prefetchDeputiesData
  };
};
