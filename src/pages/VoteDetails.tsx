
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

        const details = await getVoteDetails(voteId, legislature, true);
        if (!details) {
          throw new Error(`Aucun détail trouvé pour le scrutin n°${voteId}`);
        }
        
        setVoteDetails(details);
        console.log('Vote details:', details);

        // Extract vote counts from response
        // First try from syntheseVote which is the most reliable source
        if (details.syntheseVote) {
          setVoteCounts({
            votants: parseInt(details.syntheseVote.nombreVotants || '0'),
            pour: parseInt(details.syntheseVote.decompte?.pour || '0'),
            contre: parseInt(details.syntheseVote.decompte?.contre || '0'),
            abstention: parseInt(details.syntheseVote.decompte?.abstentions || '0')
          });
        } 
        // Try from direct properties
        else if (details.nombreVotants !== undefined) {
          setVoteCounts({
            votants: details.nombreVotants || 0,
            pour: details.nombrePour || 0,
            contre: details.nombreContre || 0,
            abstention: details.nombreAbstentions || 0
          });
        }
        // Try from the miseAuPoint property
        else if (details.miseAuPoint) {
          setVoteCounts({
            votants: parseInt(details.miseAuPoint.nombreVotants || '0'),
            pour: parseInt(details.miseAuPoint.pour || '0'),
            contre: parseInt(details.miseAuPoint.contre || '0'),
            abstention: parseInt(details.miseAuPoint.abstentions || '0')
          });
        }
        // Finally try from the direct scrutin object
        else if (details.scrutin) {
          setVoteCounts({
            votants: parseInt(details.scrutin.nombreVotants || '0'),
            pour: parseInt(details.scrutin.decompteVoix?.pour || '0'),
            contre: parseInt(details.scrutin.decompteVoix?.contre || '0'),
            abstention: parseInt(details.scrutin.decompteVoix?.abstentions || '0')
          });
        }

        // Process initial groups data
        const initialGroupsData = processGroupsFromVoteDetail(details);
        if (Object.keys(initialGroupsData).length > 0) {
          setGroupsData(initialGroupsData);
          console.log('Initial groups data:', initialGroupsData);
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
