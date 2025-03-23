
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getVoteDetails, getGroupVoteDetail } from '@/utils/apiService';
import { GroupVoteDetail } from '@/utils/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MainNavigation from '@/components/MainNavigation';
import APIErrorHandler from '@/components/APIErrorHandler';
import { toast } from 'sonner';
import { 
  ChevronLeft, 
  ExternalLink, 
  Users, 
  BarChart3
} from 'lucide-react';
import GroupSummaryTab from '@/components/votes/GroupSummaryTab';
import DeputiesDetailTab from '@/components/votes/DeputiesDetailTab';
import { formatDate, generateAssembleeUrl, processGroupsFromVoteDetail } from '@/components/votes/voteDetailsUtils';

const VoteDetails = () => {
  const { voteId, legislature = '17' } = useParams<{ voteId: string, legislature?: string }>();
  const [voteDetails, setVoteDetails] = useState<any>(null);
  const [groupsData, setGroupsData] = useState<Record<string, GroupVoteDetail>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('summary');
  const [voteCounts, setVoteCounts] = useState({
    votants: 0,
    pour: 0,
    contre: 0,
    abstention: 0
  });

  // Helper function to extract vote counts from different API response formats
  const extractVoteCounts = (data: any) => {
    console.log('Extracting vote counts from data:', data);
    
    // Try to get counts from syntheseVote (most reliable)
    if (data.syntheseVote) {
      console.log('Found syntheseVote:', data.syntheseVote);
      return {
        votants: parseInt(data.syntheseVote.nombreVotants || '0'),
        pour: parseInt(data.syntheseVote.decompte?.pour || '0'),
        contre: parseInt(data.syntheseVote.decompte?.contre || '0'),
        abstention: parseInt(data.syntheseVote.decompte?.abstentions || '0')
      };
    }
    
    // Try from direct properties
    if (data.nombreVotants !== undefined) {
      console.log('Found direct properties:', {
        nombreVotants: data.nombreVotants,
        nombrePour: data.nombrePour,
        nombreContre: data.nombreContre,
        nombreAbstentions: data.nombreAbstentions
      });
      return {
        votants: parseInt(data.nombreVotants || '0'),
        pour: parseInt(data.nombrePour || '0'),
        contre: parseInt(data.nombreContre || '0'),
        abstention: parseInt(data.nombreAbstentions || '0')
      };
    }
    
    // Try from miseAuPoint
    if (data.miseAuPoint) {
      console.log('Found miseAuPoint:', data.miseAuPoint);
      return {
        votants: parseInt(data.miseAuPoint.nombreVotants || '0'),
        pour: parseInt(data.miseAuPoint.pour || '0'),
        contre: parseInt(data.miseAuPoint.contre || '0'),
        abstention: parseInt(data.miseAuPoint.abstentions || '0')
      };
    }
    
    // Try from scrutin object
    if (data.scrutin) {
      console.log('Found scrutin:', data.scrutin);
      // Check decompteVoix first
      if (data.scrutin.decompteVoix) {
        return {
          votants: parseInt(data.scrutin.nombreVotants || '0'),
          pour: parseInt(data.scrutin.decompteVoix.pour || '0'),
          contre: parseInt(data.scrutin.decompteVoix.contre || '0'),
          abstention: parseInt(data.scrutin.decompteVoix.abstentions || '0')
        };
      }
      
      // Then check the decompteNominatif which may contain arrays of votes
      if (data.scrutin.decompteNominatif) {
        const decompte = data.scrutin.decompteNominatif;
        const pourCount = Array.isArray(decompte.pour?.votant) ? decompte.pour.votant.length : 0;
        const contreCount = Array.isArray(decompte.contre?.votant) ? decompte.contre.votant.length : 0;
        const abstentionCount = Array.isArray(decompte.abstentions?.votant) ? decompte.abstentions.votant.length : 0;
        const nonVotantCount = Array.isArray(decompte.nonVotant) ? decompte.nonVotant.length : 0;
        
        console.log('Found decompteNominatif counts:', {
          pour: pourCount,
          contre: contreCount,
          abstention: abstentionCount,
          nonVotant: nonVotantCount
        });
        
        return {
          votants: pourCount + contreCount + abstentionCount,
          pour: pourCount,
          contre: contreCount,
          abstention: abstentionCount
        };
      }
    }
    
    // Try from groupes aggregation
    if (data.groupes && Array.isArray(data.groupes)) {
      console.log('Trying to calculate from groupes array');
      let totalPour = 0;
      let totalContre = 0;
      let totalAbstention = 0;
      
      data.groupes.forEach((groupe: any) => {
        if (groupe.vote) {
          totalPour += parseInt(groupe.vote.pour || '0');
          totalContre += parseInt(groupe.vote.contre || '0');
          totalAbstention += parseInt(groupe.vote.abstention || '0');
        }
      });
      
      if (totalPour > 0 || totalContre > 0 || totalAbstention > 0) {
        console.log('Calculated from groupes array:', {
          pour: totalPour,
          contre: totalContre,
          abstention: totalAbstention
        });
        
        return {
          votants: totalPour + totalContre + totalAbstention,
          pour: totalPour,
          contre: totalContre,
          abstention: totalAbstention
        };
      }
    }
    
    console.log('Could not extract vote counts from any known format');
    return {
      votants: 0,
      pour: 0,
      contre: 0,
      abstention: 0
    };
  };

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

        // First try with standard endpoint
        let details = await getVoteDetails(voteId, legislature, false);
        if (!details) {
          // If no results, try with the detailed endpoint
          details = await getVoteDetails(voteId, legislature, true);
          if (!details) {
            throw new Error(`Aucun détail trouvé pour le scrutin n°${voteId}`);
          }
        }
        
        setVoteDetails(details);
        console.log('Vote details:', details);

        // Extract vote counts using our helper function
        const counts = extractVoteCounts(details);
        setVoteCounts(counts);
        console.log('Extracted vote counts:', counts);

        // Process initial groups data
        const initialGroupsData = processGroupsFromVoteDetail(details);
        if (Object.keys(initialGroupsData).length > 0) {
          setGroupsData(initialGroupsData);
          console.log('Initial groups data:', initialGroupsData);
          
          // Update vote counts based on group data if needed
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

        // If groupes are in array format, fetch detailed info for the first few groups
        if (details.groupes && Array.isArray(details.groupes)) {
          const firstGroupsToLoad = details.groupes.slice(0, 2); // Load just first 2 groups initially for better performance
          
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

          setGroupsData(prevData => ({...prevData, ...groupsDataObj}));
          console.log('Initial loaded groups data:', groupsDataObj);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <MainNavigation />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="w-full h-64 flex items-center justify-center">
            <div className="flex flex-col items-center space-y-4">
              <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-500">Chargement des données du vote...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <MainNavigation />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <APIErrorHandler 
            status={{
              status: 'error',
              message: 'Erreur lors du chargement des données',
              details: error
            }}
            redirectTo="/"
            redirectLabel="Retour à l'accueil"
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MainNavigation />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {voteDetails ? (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <Button asChild variant="outline" size="sm" className="mb-4">
                  <Link to="/">
                    <ChevronLeft size={16} className="mr-1" />
                    Retour
                  </Link>
                </Button>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Scrutin n°{voteId}</h1>
                <p className="text-gray-600 mt-1">
                  <span className="font-medium">{formatDate(voteDetails.scrutin?.date || voteDetails.dateScrutin)}</span>
                  <span className="mx-2">•</span>
                  <span>
                    {legislature}
                    <sup>e</sup> législature
                  </span>
                </p>
              </div>
              <Button
                variant="outline"
                className="flex items-center"
                onClick={() => window.open(generateAssembleeUrl(legislature, voteId || ''), '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink size={16} className="mr-2" />
                Voir sur assemblee-nationale.fr
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">
                  {voteDetails.scrutin?.titre || voteDetails.titre || 'Titre non disponible'}
                </CardTitle>
                <CardDescription>
                  {voteDetails.scrutin?.description || voteDetails.description || 'Description non disponible'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="bg-gray-100 px-3 py-2 rounded-md">
                    <span className="text-sm font-medium">Votants: </span>
                    <span className="font-bold">{voteCounts.votants || 'N/A'}</span>
                  </div>
                  <div className="bg-green-50 px-3 py-2 rounded-md">
                    <span className="text-sm font-medium">Pour: </span>
                    <span className="font-bold text-vote-pour">{voteCounts.pour || 'N/A'}</span>
                  </div>
                  <div className="bg-red-50 px-3 py-2 rounded-md">
                    <span className="text-sm font-medium">Contre: </span>
                    <span className="font-bold text-vote-contre">{voteCounts.contre || 'N/A'}</span>
                  </div>
                  <div className="bg-blue-50 px-3 py-2 rounded-md">
                    <span className="text-sm font-medium">Abstentions: </span>
                    <span className="font-bold text-vote-abstention">{voteCounts.abstention || 'N/A'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="summary" className="flex items-center">
                  <BarChart3 size={16} className="mr-2" />
                  Résumé par groupe
                </TabsTrigger>
                <TabsTrigger value="details" className="flex items-center">
                  <Users size={16} className="mr-2" />
                  Détail des députés
                </TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="mt-6">
                <GroupSummaryTab 
                  voteDetails={voteDetails} 
                  voteId={voteId || ''} 
                  legislature={legislature}
                  groupsData={groupsData}
                  setGroupsData={setGroupsData}
                  setSelectedTab={setSelectedTab}
                />
              </TabsContent>

              <TabsContent value="details" className="mt-6">
                <DeputiesDetailTab groupsData={groupsData} />
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-4">Scrutin non trouvé</h2>
            <p className="text-gray-600 mb-6">Le scrutin n°{voteId} n'a pas été trouvé dans la {legislature}e législature.</p>
            <Button asChild>
              <Link to="/">
                <ChevronLeft size={16} className="mr-2" />
                Retour à l'accueil
              </Link>
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default VoteDetails;
