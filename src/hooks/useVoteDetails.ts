
import { useState, useEffect } from 'react';
import { getVoteDetails, getGroupVoteDetail } from '@/utils/apiService';
import { GroupVoteDetail } from '@/utils/types';
import { processGroupsFromVoteDetail } from '@/components/votes/voteDetailsUtils';
import { extractVoteCounts } from '@/components/votes/voteCountsUtils';
import { checkDeputiesTableStatus } from '@/utils/deputySupabaseService';
import { useDeputyPrefetch } from '@/hooks/useDeputyPrefetch';
import { toast } from 'sonner';

interface VoteCountsType {
  votants: number;
  pour: number;
  contre: number;
  abstention: number;
}

interface UseVoteDetailsReturn {
  voteDetails: any;
  groupsData: Record<string, GroupVoteDetail>;
  setGroupsData: React.Dispatch<React.SetStateAction<Record<string, GroupVoteDetail>>>;
  loading: boolean;
  error: string | null;
  voteCounts: VoteCountsType;
  legislature: string;
  deputiesCount: number;
  isPrefetchingDeputies: boolean;
  prefetchStatus: 'idle' | 'loading' | 'success' | 'error';
}

export const useVoteDetails = (voteId: string | undefined, legislature: string): UseVoteDetailsReturn => {
  const [voteDetails, setVoteDetails] = useState<any>(null);
  const [groupsData, setGroupsData] = useState<Record<string, GroupVoteDetail>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voteCounts, setVoteCounts] = useState<VoteCountsType>({
    votants: 0,
    pour: 0,
    contre: 0,
    abstention: 0
  });
  const [deputiesCount, setDeputiesCount] = useState(0);

  const { isPrefetching: isPrefetchingDeputies, prefetchDeputiesData, prefetchStatus } = useDeputyPrefetch(legislature);

  useEffect(() => {
    if (!voteId) {
      setError('Numéro de scrutin manquant');
      setLoading(false);
      return;
    }

    // Check deputies table status at component initialization
    checkDeputiesTableStatus(legislature)
      .then(status => {
        setDeputiesCount(status.count);
        if (status.empty) {
          console.log(`[useVoteDetails] Deputies table is empty for legislature ${legislature}`);
          toast.info(
            "Base de données des députés vide", 
            { 
              description: "Pour voir les noms des députés, cliquez sur le bouton 'Rafraîchir le cache'",
              duration: 8000
            }
          );
        } else {
          console.log(`[useVoteDetails] Deputies table contains ${status.count} deputies for legislature ${legislature}`);
        }
      })
      .catch(err => {
        console.error(`[useVoteDetails] Error checking deputies table status: ${err}`);
      });

    const fetchVoteDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        setGroupsData({});

        console.log(`[useVoteDetails] Fetching vote details for vote ${voteId}, legislature ${legislature}`);
        
        // Try multiple API endpoints with fallback
        const endpoints = [
          { fn: () => getVoteDetails(voteId, legislature, false), name: 'standard' },
          { fn: () => getVoteDetails(voteId, legislature, true), name: 'alternate' }
        ];
        
        let details = null;
        let successEndpoint = '';
        
        for (const endpoint of endpoints) {
          try {
            console.log(`[useVoteDetails] Trying ${endpoint.name} endpoint for vote ${voteId}`);
            details = await endpoint.fn();
            if (details) {
              successEndpoint = endpoint.name;
              break;
            }
          } catch (err) {
            console.log(`[useVoteDetails] ${endpoint.name} endpoint failed:`, err);
          }
        }
        
        if (!details) {
          throw new Error(`Aucun détail trouvé pour le scrutin n°${voteId}`);
        }
        
        console.log(`[useVoteDetails] Vote details fetched successfully from ${successEndpoint} endpoint:`, details);
        setVoteDetails(details);

        const counts = extractVoteCounts(details);
        setVoteCounts(counts);
        console.log('[useVoteDetails] Extracted vote counts:', counts);

        const initialGroupsData = processGroupsFromVoteDetail(details);
        if (Object.keys(initialGroupsData).length > 0) {
          setGroupsData(initialGroupsData);
          console.log(`[useVoteDetails] Processed ${Object.keys(initialGroupsData).length} initial groups`);
          
          // Wait for deputy data to be prefetched before proceeding
          await prefetchDeputiesData(initialGroupsData);
        }

        if (details.groupes && Array.isArray(details.groupes)) {
          const firstGroupsToLoad = details.groupes.slice(0, 2);
          
          // Try to load each group's details with retry
          const loadGroupDetails = async (groupe: any, retries = 2) => {
            try {
              const groupeId = groupe.organeRef || groupe.uid;
              if (!groupeId) return null;

              const groupDetails = await getGroupVoteDetail(groupeId, voteId, legislature);
              return { [groupeId]: groupDetails };
            } catch (err) {
              console.error(`[useVoteDetails] Error fetching group details for ${groupe.nom || groupe.libelle}:`, err);
              
              if (retries > 0) {
                console.log(`[useVoteDetails] Retrying group details fetch, ${retries} retries left`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return loadGroupDetails(groupe, retries - 1);
              }
              
              return null;
            }
          };

          const groupsPromises = firstGroupsToLoad.map(groupe => loadGroupDetails(groupe));
          const groupsResults = await Promise.all(groupsPromises);
          const groupsDataObj = groupsResults
            .filter(Boolean)
            .reduce((acc, curr) => ({ ...acc, ...curr }), {});

          setGroupsData(prevData => ({...prevData, ...groupsDataObj}));
          
          // Prefetch deputies for the newly loaded groups
          if (Object.keys(groupsDataObj).length > 0) {
            await prefetchDeputiesData(groupsDataObj);
          }
          
          console.log(`[useVoteDetails] Loaded ${Object.keys(groupsDataObj).length} initial groups with details`);
        }
      } catch (err) {
        console.error('[useVoteDetails] Error fetching vote details:', err);
        setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        toast.error('Erreur lors du chargement des données', {
          description: err instanceof Error ? err.message : 'Une erreur est survenue',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchVoteDetails();
  }, [voteId, legislature, prefetchDeputiesData]);

  return {
    voteDetails,
    groupsData,
    setGroupsData,
    loading,
    error,
    voteCounts,
    legislature,
    deputiesCount,
    isPrefetchingDeputies,
    prefetchStatus
  };
};
