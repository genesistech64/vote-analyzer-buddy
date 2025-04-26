
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
  const [prefetchProgress, setPrefetchProgress] = useState({ loaded: 0, total: 0 });

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
      
      setPrefetchProgress({
        loaded: 0,
        total: allDeputyIds.size
      });
      
      // Try to get from localStorage first
      const deputyIdsToFetch = new Set<string>();
      Array.from(allDeputyIds).forEach(id => {
        try {
          const storageKey = `deputy_v1_${id}`;
          const data = localStorage.getItem(storageKey);
          if (data) {
            try {
              const parsed = JSON.parse(data);
              const now = Date.now();
              
              if (parsed.timestamp && (now - parsed.timestamp) < 24 * 60 * 60 * 1000 && 
                  parsed.prenom && parsed.nom) {
                // Valid cached data, don't need to fetch
                setPrefetchProgress(prev => ({
                  ...prev,
                  loaded: prev.loaded + 1
                }));
                return;
              }
            } catch (e) {
              // Parsing error, will fetch
              deputyIdsToFetch.add(id);
            }
          } else {
            deputyIdsToFetch.add(id);
          }
        } catch (e) {
          deputyIdsToFetch.add(id);
        }
      });
      
      if (deputyIdsToFetch.size === 0) {
        console.log('[useDeputyPrefetch] All deputies found in localStorage cache');
        setIsPrefetching(false);
        setPrefetchProgress({
          loaded: allDeputyIds.size,
          total: allDeputyIds.size
        });
        return true;
      }
      
      console.log(`[useDeputyPrefetch] Fetching ${deputyIdsToFetch.size} deputies not in localStorage cache`);

      // First prefetch from Supabase
      const supabaseResult = await prefetchDeputiesFromSupabase(
        Array.from(deputyIdsToFetch), 
        legislature
      );
      
      const fetchedCount = supabaseResult?.fetchedCount || 0;
      console.log(`[useDeputyPrefetch] Supabase prefetch fetched ${fetchedCount} deputies`);
      
      setPrefetchProgress(prev => ({
        ...prev,
        loaded: prev.loaded + fetchedCount
      }));

      // Then update the in-memory cache for any remaining unfetched deputies
      if (fetchedCount < deputyIdsToFetch.size) {
        await prefetchDeputies(Array.from(deputyIdsToFetch));
        console.log('[useDeputyPrefetch] Memory cache updated for all deputies');
        
        setPrefetchProgress(prev => ({
          ...prev,
          loaded: allDeputyIds.size
        }));
      }

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
    prefetchProgress,
    prefetchDeputiesData
  };
};
