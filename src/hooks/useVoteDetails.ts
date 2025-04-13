
import { useState, useEffect } from 'react';
import { getVoteDetails, getGroupVoteDetail } from '@/utils/apiService';
import { GroupVoteDetail } from '@/utils/types';
import { processGroupsFromVoteDetail, processDeputiesFromVoteDetail } from '@/components/votes/voteDetailsUtils';
import { extractVoteCounts } from '@/components/votes/voteCountsUtils';
import { prefetchDeputies } from '@/utils/deputyCache';
import { prefetchDeputiesFromSupabase } from '@/utils/deputySupabaseService';
import { toast } from 'sonner';

// Configuration pour le debug
const DEBUG = true;
const LOG_PREFIX = '[useVoteDetails]';

// Fonction utilitaire pour les logs
const log = (message: string, data?: any) => {
  if (DEBUG) {
    if (data) {
      console.log(`${LOG_PREFIX} ${message}`, data);
    } else {
      console.log(`${LOG_PREFIX} ${message}`);
    }
  }
};

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
      log('Numéro de scrutin manquant');
      setError('Numéro de scrutin manquant');
      setLoading(false);
      return;
    }

    const fetchVoteDetails = async () => {
      try {
        log(`Chargement des détails du vote ${voteId} (legislature=${legislature})`);
        setLoading(true);
        setError(null);
        setGroupsData({});

        let details = await getVoteDetails(voteId, legislature, false);
        if (!details) {
          log('Pas de détails trouvés dans l\'API standard, tentative avec l\'API détaillée');
          details = await getVoteDetails(voteId, legislature, true);
          if (!details) {
            throw new Error(`Aucun détail trouvé pour le scrutin n°${voteId}`);
          }
        }
        
        setVoteDetails(details);
        log('Détails du vote récupérés:', details);

        const counts = extractVoteCounts(details);
        setVoteCounts(counts);
        log('Comptage des votes extrait:', counts);

        const initialGroupsData = processGroupsFromVoteDetail(details);
        if (Object.keys(initialGroupsData).length > 0) {
          setGroupsData(initialGroupsData);
          log(`Données initiales pour ${Object.keys(initialGroupsData).length} groupes:`, initialGroupsData);
          
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
            log(`Préchargement de ${allDeputyIds.length} députés depuis le chargement initial`);
            // Précharger depuis Supabase d'abord, puis le cache mémoire
            prefetchDeputiesFromSupabase(allDeputyIds, legislature)
              .then(result => {
                log('Résultat du préchargement Supabase:', result);
                return prefetchDeputies(allDeputyIds);
              })
              .then(result => {
                log('Résultat du préchargement cache:', result);
              })
              .catch(err => {
                console.error(`${LOG_PREFIX} Erreur prefetch:`, err);
              });
          }
          
          if (counts.votants === 0 && counts.pour === 0 && counts.contre === 0 && counts.abstention === 0) {
            log('Pas de comptage de votes trouvé, calcul à partir des données de groupe');
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
              
              log('Comptage de votes calculé à partir des données de groupe:', newCounts);
              setVoteCounts(newCounts);
            }
          }
        } else {
          log('Aucune donnée de groupe initiale disponible, chargement à la demande');
        }

        if (details.groupes && Array.isArray(details.groupes)) {
          const firstGroupsToLoad = details.groupes.slice(0, 2);
          log(`Chargement initial des détails pour ${firstGroupsToLoad.length} groupes`);
          
          const groupsPromises = firstGroupsToLoad.map(async (groupe: any) => {
            try {
              const groupeId = groupe.organeRef || groupe.uid;
              if (!groupeId) {
                log(`ID de groupe manquant pour:`, groupe);
                return null;
              }

              log(`Chargement des détails du groupe ${groupeId}`);
              const groupDetails = await getGroupVoteDetail(groupeId, voteId, legislature);
              return { [groupeId]: groupDetails };
            } catch (err) {
              console.error(`${LOG_PREFIX} Erreur lors du chargement des détails du groupe ${groupe.nom || groupe.libelle}:`, err);
              return null;
            }
          });

          const groupsResults = await Promise.all(groupsPromises);
          const groupsDataObj = groupsResults
            .filter(Boolean)
            .reduce((acc, curr) => ({ ...acc, ...curr }), {});

          setGroupsData(prevData => ({...prevData, ...groupsDataObj}));
          log('Données de groupes initiales chargées:', groupsDataObj);
        }
      } catch (err) {
        console.error(`${LOG_PREFIX} Erreur lors du chargement des détails du vote:`, err);
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
