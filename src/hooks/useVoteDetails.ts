
import { useState, useEffect } from 'react';
import { getVoteDetails, getGroupVoteDetail } from '@/utils/apiService';
import { GroupVoteDetail } from '@/utils/types';
import { processGroupsFromVoteDetail, processDeputiesFromVoteDetail } from '@/components/votes/voteDetailsUtils';
import { extractVoteCounts } from '@/components/votes/voteCountsUtils';
import { prefetchDeputies } from '@/utils/deputyCache';
import { prefetchDeputiesFromSupabase, ensureDeputyIdFormat, checkDeputiesTableStatus } from '@/utils/deputySupabaseService';
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
              description: "Pour voir les noms des députés, cliquez sur le bouton 'Synchroniser les députés'",
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
        let details = await getVoteDetails(voteId, legislature, false);
        if (!details) {
          console.log(`[useVoteDetails] Initial fetch failed, trying alternate approach for vote ${voteId}`);
          details = await getVoteDetails(voteId, legislature, true);
          if (!details) {
            throw new Error(`Aucun détail trouvé pour le scrutin n°${voteId}`);
          }
        }
        
        setVoteDetails(details);
        console.log('[useVoteDetails] Vote details fetched successfully:', details);

        const counts = extractVoteCounts(details);
        setVoteCounts(counts);
        console.log('[useVoteDetails] Extracted vote counts:', counts);

        const initialGroupsData = processGroupsFromVoteDetail(details);
        if (Object.keys(initialGroupsData).length > 0) {
          setGroupsData(initialGroupsData);
          console.log(`[useVoteDetails] Processed ${Object.keys(initialGroupsData).length} initial groups`);
          
          const allDeputyIds: string[] = [];
          
          Object.values(initialGroupsData).forEach(group => {
            const deputies = processDeputiesFromVoteDetail(group);
            deputies.forEach(deputy => {
              if (deputy.id) {
                // Ensure all deputy IDs have the PA prefix
                const formattedId = ensureDeputyIdFormat(deputy.id);
                allDeputyIds.push(formattedId);
              }
            });
          });
          
          if (allDeputyIds.length > 0) {
            console.log(`[useVoteDetails] Prefetching ${allDeputyIds.length} deputies information`);
            
            // Précharger depuis Supabase d'abord, puis le cache mémoire
            prefetchDeputiesFromSupabase(allDeputyIds, legislature)
              .then(result => {
                console.log(`[useVoteDetails] Prefetch from Supabase result: ${result.status} - ${result.message}`);
                return prefetchDeputies(allDeputyIds);
              })
              .catch(err => console.error('[useVoteDetails] Prefetch error:', err));
          }
          
          if (counts.votants === 0 && counts.pour === 0 && counts.contre === 0 && counts.abstention === 0) {
            let sumPour = 0;
            let sumContre = 0;
            let sumAbstention = 0;
            
            Object.values(initialGroupsData).forEach(group => {
              if (group.decompte) {
                const pourCount = Array.isArray(group.decompte.pours?.votant) ? group.decompte.pours.votant.length : 0;
                const contreCount = Array.isArray(group.decompte.contres?.votant) ? group.decompte.contres.votant.length : 0;
                const abstentionCount = Array.isArray(group.decompte.abstentions?.votant) ? group.decompte.abstentions.votant.length : 0;
                
                sumPour += pourCount;
                sumContre += contreCount;
                sumAbstention += abstentionCount;
              }
            });
            
            if (sumPour > 0 || sumContre > 0 || sumAbstention > 0) {
              const newCounts = {
                votants: sumPour + sumContre + sumAbstention,
                pour: sumPour,
                contre: sumContre,
                abstention: sumAbstention
              };
              
              console.log('[useVoteDetails] Calculated vote counts from group data:', newCounts);
              setVoteCounts(newCounts);
            }
          }
        } else {
          console.log('[useVoteDetails] No initial groups data available, will load on demand');
        }

        if (details.groupes && Array.isArray(details.groupes)) {
          const firstGroupsToLoad = details.groupes.slice(0, 2);
          
          const groupsPromises = firstGroupsToLoad.map(async (groupe: any) => {
            try {
              const groupeId = groupe.organeRef || groupe.uid;
              if (!groupeId) return null;

              const groupDetails = await getGroupVoteDetail(groupeId, voteId, legislature);
              return { [groupeId]: groupDetails };
            } catch (err) {
              console.error(`[useVoteDetails] Error fetching group details for ${groupe.nom || groupe.libelle}:`, err);
              return null;
            }
          });

          const groupsResults = await Promise.all(groupsPromises);
          const groupsDataObj = groupsResults
            .filter(Boolean)
            .reduce((acc, curr) => ({ ...acc, ...curr }), {});

          setGroupsData(prevData => ({...prevData, ...groupsDataObj}));
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
  }, [voteId, legislature]);

  return {
    voteDetails,
    groupsData,
    setGroupsData,
    loading,
    error,
    voteCounts,
    legislature,
    deputiesCount
  };
};
