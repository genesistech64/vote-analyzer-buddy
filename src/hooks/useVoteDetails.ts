
import { useState, useEffect } from 'react';
import { getVoteDetails, getGroupVoteDetail } from '@/utils/apiService';
import { GroupVoteDetail } from '@/utils/types';
import { processGroupsFromVoteDetail, processDeputiesFromVoteDetail } from '@/components/votes/voteDetailsUtils';
import { extractVoteCounts } from '@/components/votes/voteCountsUtils';
import { prefetchDeputies } from '@/utils/deputyCache';
import { prefetchDeputiesFromSupabase } from '@/utils/deputySupabaseService';
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
}

// Ensure deputy ID is properly formatted with PA prefix
const ensureDeputyIdFormat = (deputyId: string): string => {
  if (!deputyId) return '';
  return deputyId.startsWith('PA') ? deputyId : `PA${deputyId}`;
};

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

  useEffect(() => {
    if (!voteId) {
      setError('Numéro de scrutin manquant');
      setLoading(false);
      return;
    }

    const fetchVoteDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        setGroupsData({});

        let details = await getVoteDetails(voteId, legislature, false);
        if (!details) {
          details = await getVoteDetails(voteId, legislature, true);
          if (!details) {
            throw new Error(`Aucun détail trouvé pour le scrutin n°${voteId}`);
          }
        }
        
        setVoteDetails(details);
        console.log('Vote details:', details);

        const counts = extractVoteCounts(details);
        setVoteCounts(counts);
        console.log('Extracted vote counts:', counts);

        const initialGroupsData = processGroupsFromVoteDetail(details);
        if (Object.keys(initialGroupsData).length > 0) {
          setGroupsData(initialGroupsData);
          console.log('Initial groups data:', initialGroupsData);
          
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
            console.log(`Prefetching ${allDeputyIds.length} deputies from initial load`);
            // Précharger depuis Supabase d'abord, puis le cache mémoire
            prefetchDeputiesFromSupabase(allDeputyIds, legislature)
              .then(() => prefetchDeputies(allDeputyIds))
              .catch(err => console.error('Erreur prefetch:', err));
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
              
              console.log('Calculated vote counts from group data:', newCounts);
              setVoteCounts(newCounts);
            }
          }
        } else {
          console.log('No initial groups data available, will load on demand');
        }

        // Try to load at least some groups data, even if the initial data didn't have any
        if (details.groupes && Array.isArray(details.groupes)) {
          const firstGroupsToLoad = details.groupes.slice(0, 3); // Load more groups initially
          
          const groupsPromises = firstGroupsToLoad.map(async (groupe: any) => {
            try {
              const groupeId = groupe.organeRef || groupe.uid;
              if (!groupeId) return null;

              const groupDetails = await getGroupVoteDetail(groupeId, voteId, legislature);
              return { [groupeId]: groupDetails };
            } catch (err) {
              console.error(`Error fetching group details for ${groupe.nom || groupe.libelle}:`, err);
              return null;
            }
          });

          const groupsResults = await Promise.all(groupsPromises);
          const groupsDataObj = groupsResults
            .filter(Boolean)
            .reduce((acc, curr) => ({ ...acc, ...curr }), {});

          if (Object.keys(groupsDataObj).length > 0) {
            setGroupsData(prevData => ({...prevData, ...groupsDataObj}));
            console.log('Initial loaded groups data:', groupsDataObj);
          } else {
            // We couldn't load any group data, show a warning
            toast.warning('Données limitées disponibles', {
              description: 'Impossible de charger les détails des groupes politiques.'
            });
          }
        }
      } catch (err) {
        console.error('Error fetching vote details:', err);
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
    legislature
  };
};
