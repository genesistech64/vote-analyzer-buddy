import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getVoteDetails, getGroupVoteDetail } from '@/utils/apiService';
import { GroupVoteDetail, DeputeVoteDetail, getGroupePolitiqueCouleur, VotePosition } from '@/utils/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import MainNavigation from '@/components/MainNavigation';
import APIErrorHandler from '@/components/APIErrorHandler';
import { toast } from 'sonner';
import { 
  CheckCircle2, 
  XCircle, 
  Minus, 
  Clock, 
  ChevronLeft, 
  Info, 
  ExternalLink, 
  Users, 
  BarChart3
} from 'lucide-react';

const VoteDetails = () => {
  const { voteId, legislature = '17' } = useParams<{ voteId: string, legislature?: string }>();
  const [voteDetails, setVoteDetails] = useState<any>(null);
  const [groupsData, setGroupsData] = useState<Record<string, GroupVoteDetail>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('summary');

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

        // 1. Appeler /scrutin_votes_detail pour obtenir les données principales du scrutin
        const url = `/scrutin_votes_detail?scrutin_numero=${voteId}`;
        console.log(`[API] Calling endpoint: ${url}`);
        
        // Fetch vote details with the appropriate endpoint
        const details = await getVoteDetails(voteId, legislature, true);
        if (!details) {
          throw new Error(`Aucun détail trouvé pour le scrutin n°${voteId}`);
        }
        
        setVoteDetails(details);
        console.log('Vote details:', details);

        // 2. Si nous avons des groupes, chercher les détails nominaux pour chacun
        if (details.groupes && Array.isArray(details.groupes)) {
          const groupsPromises = details.groupes.map(async (groupe: any) => {
            try {
              // Récupérer l'identifiant du groupe
              const groupeId = groupe.organeRef || groupe.uid;
              if (!groupeId) return null;

              // Appeler /groupe_vote_detail pour les détails nominaux du groupe
              const groupDetails = await getGroupVoteDetail(groupeId, voteId, legislature);
              return { [groupeId]: groupDetails };
            } catch (err) {
              console.error(`Error fetching group details for ${groupe.nom}:`, err);
              return null;
            }
          });

          const groupsResults = await Promise.all(groupsPromises);
          const groupsDataObj = groupsResults
            .filter(Boolean)
            .reduce((acc, curr) => ({ ...acc, ...curr }), {});

          setGroupsData(groupsDataObj);
          console.log('Groups data:', groupsDataObj);
        } else if (details.groupes && typeof details.groupes === 'object') {
          // If groupes is an object instead of an array (depends on API response format)
          const groupsObj = details.groupes;
          const groupIds = Object.keys(groupsObj);

          const groupsPromises = groupIds.map(async (groupId) => {
            try {
              const groupDetails = await getGroupVoteDetail(groupId, voteId, legislature);
              return { [groupId]: groupDetails };
            } catch (err) {
              console.error(`Error fetching group details for ${groupId}:`, err);
              return null;
            }
          });

          const groupsResults = await Promise.all(groupsPromises);
          const groupsDataObj = groupsResults
            .filter(Boolean)
            .reduce((acc, curr) => ({ ...acc, ...curr }), {});

          setGroupsData(groupsDataObj);
          console.log('Groups data from object:', groupsDataObj);
        } else {
          toast.info('Aucun détail des groupes n\'est disponible pour ce scrutin');
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

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    
    try {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateString;
    }
  };

  const positionIcons: Record<string, JSX.Element> = {
    'pour': <CheckCircle2 className="h-5 w-5 text-vote-pour" />,
    'contre': <XCircle className="h-5 w-5 text-vote-contre" />,
    'abstention': <Minus className="h-5 w-5 text-vote-abstention" />,
    'absent': <Clock className="h-5 w-5 text-vote-absent" />
  };

  const positionLabels: Record<string, string> = {
    'pour': 'Pour',
    'contre': 'Contre',
    'abstention': 'Abstention',
    'absent': 'Absent'
  };

  const positionClasses: Record<string, string> = {
    'pour': 'text-vote-pour',
    'contre': 'text-vote-contre',
    'abstention': 'text-vote-abstention',
    'absent': 'text-vote-absent'
  };

  // Helper function to process députés from different vote positions
  const processDeputiesFromVoteDetail = (groupDetail: any): DeputeVoteDetail[] => {
    if (!groupDetail || !groupDetail.decompte) return [];
    
    const deputies: DeputeVoteDetail[] = [];
    
    // Process pour votes
    if (groupDetail.decompte.pours && groupDetail.decompte.pours.votant) {
      groupDetail.decompte.pours.votant.forEach((depute: any) => {
        deputies.push({
          id: depute.acteurRef,
          nom: depute.nom,
          prenom: depute.prenom,
          position: 'pour'
        });
      });
    }
    
    // Process contre votes
    if (groupDetail.decompte.contres && groupDetail.decompte.contres.votant) {
      groupDetail.decompte.contres.votant.forEach((depute: any) => {
        deputies.push({
          id: depute.acteurRef,
          nom: depute.nom,
          prenom: depute.prenom,
          position: 'contre'
        });
      });
    }
    
    // Process abstention votes
    if (groupDetail.decompte.abstentions && groupDetail.decompte.abstentions.votant) {
      groupDetail.decompte.abstentions.votant.forEach((depute: any) => {
        deputies.push({
          id: depute.acteurRef,
          nom: depute.nom,
          prenom: depute.prenom,
          position: 'abstention'
        });
      });
    }
    
    // Process non-votant deputies
    if (groupDetail.decompte.nonVotants && groupDetail.decompte.nonVotants.votant) {
      groupDetail.decompte.nonVotants.votant.forEach((depute: any) => {
        deputies.push({
          id: depute.acteurRef,
          nom: depute.nom,
          prenom: depute.prenom,
          position: 'absent'
        });
      });
    }
    
    return deputies;
  };

  // Get position counts from API response
  const getPositionCounts = (groupe: any) => {
    if (!groupe) return { pour: 0, contre: 0, abstention: 0, absent: 0 };

    return {
      pour: groupe.pours?.votant?.length || 0,
      contre: groupe.contres?.votant?.length || 0,
      abstention: groupe.abstentions?.votant?.length || 0,
      absent: groupe.nonVotants?.votant?.length || 0
    };
  };

  const generateAssembleeUrl = () => {
    return `https://www2.assemblee-nationale.fr/scrutins/detail/(legislature)/${legislature}/(num)/${voteId}`;
  };

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
                onClick={() => window.open(generateAssembleeUrl(), '_blank', 'noopener,noreferrer')}
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
                    <span className="font-bold">{voteDetails.nombreVotants || 'N/A'}</span>
                  </div>
                  <div className="bg-green-50 px-3 py-2 rounded-md">
                    <span className="text-sm font-medium">Pour: </span>
                    <span className="font-bold text-vote-pour">{voteDetails.nombrePour || 'N/A'}</span>
                  </div>
                  <div className="bg-red-50 px-3 py-2 rounded-md">
                    <span className="text-sm font-medium">Contre: </span>
                    <span className="font-bold text-vote-contre">{voteDetails.nombreContre || 'N/A'}</span>
                  </div>
                  <div className="bg-blue-50 px-3 py-2 rounded-md">
                    <span className="text-sm font-medium">Abstentions: </span>
                    <span className="font-bold text-vote-abstention">{voteDetails.nombreAbstentions || 'N/A'}</span>
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
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Positions par groupe politique</CardTitle>
                    <CardDescription>
                      Vue d'ensemble des positions de vote par groupe politique
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-1/3">Groupe politique</TableHead>
                            <TableHead className="text-center">Position majoritaire</TableHead>
                            <TableHead className="text-center">Pour</TableHead>
                            <TableHead className="text-center">Contre</TableHead>
                            <TableHead className="text-center">Abstention</TableHead>
                            <TableHead className="text-center">Non-votant</TableHead>
                            <TableHead className="text-center w-20">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {renderGroupsSummary()}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="details" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Détail des votes par député</CardTitle>
                    <CardDescription>
                      Liste complète des votes de chaque député classés par groupe politique
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {renderDeputiesDetails()}
                  </CardContent>
                </Card>
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

  // Helper function to render groups summary
  function renderGroupsSummary() {
    // First check if we have the groupes as array (original format)
    if (voteDetails.groupes && Array.isArray(voteDetails.groupes) && voteDetails.groupes.length > 0) {
      return voteDetails.groupes.map((groupe: any) => {
        const groupId = groupe.organeRef || groupe.uid;
        const nomGroupe = groupe.nom || groupe.libelle || 'Groupe inconnu';
        const positionMajoritaire = normalizePosition(groupe.positionMajoritaire || groupe.position_majoritaire);
        
        // Count votes by position from the API data
        const counts = getPositionCounts(groupe);
        
        return (
          <TableRow key={groupId}>
            <TableCell>
              <Link 
                to={`/groupes/${groupId}`}
                className="font-medium hover:text-primary flex items-center"
              >
                <div 
                  className="w-3 h-3 rounded-full mr-2" 
                  style={{ 
                    backgroundColor: getGroupePolitiqueCouleur(nomGroupe)
                  }}
                />
                {nomGroupe}
              </Link>
            </TableCell>
            <TableCell className="text-center">
              <div className="flex items-center justify-center space-x-1">
                {positionIcons[positionMajoritaire]}
                <span className={`font-medium ${positionClasses[positionMajoritaire]}`}>
                  {positionLabels[positionMajoritaire]}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-center font-medium text-vote-pour">
              {counts.pour}
            </TableCell>
            <TableCell className="text-center font-medium text-vote-contre">
              {counts.contre}
            </TableCell>
            <TableCell className="text-center font-medium text-vote-abstention">
              {counts.abstention}
            </TableCell>
            <TableCell className="text-center font-medium text-vote-absent">
              {counts.absent}
            </TableCell>
            <TableCell className="text-center">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setSelectedTab('details');
                  // Ensure group details are loaded
                  if (!groupsData[groupId]) {
                    toast.info(`Chargement des détails pour ${nomGroupe}...`);
                    getGroupVoteDetail(groupId, voteId as string, legislature)
                      .then(details => {
                        setGroupsData(prev => ({
                          ...prev,
                          [groupId]: details
                        }));
                      })
                      .catch(err => {
                        toast.error(`Erreur lors du chargement des détails pour ${nomGroupe}`);
                        console.error(err);
                      });
                  }
                }}
              >
                <Info size={16} />
              </Button>
            </TableCell>
          </TableRow>
        );
      });
    }
    // Check if we have the groupes as object (alternative format from API)
    else if (voteDetails.groupes && typeof voteDetails.groupes === 'object') {
      return Object.entries(voteDetails.groupes).map(([groupId, groupe]: [string, any]) => {
        // Safely get properties with fallbacks, ensuring we don't try to access properties that don't exist
        const nomGroupe = groupe.libelle || groupe.nom || 'Groupe inconnu';
        const positionMajoritaire = normalizePosition(groupe.position_majoritaire || groupe.positionMajoritaire || 'absent');
        
        // Count votes by position from the API data
        const pourCount = groupe.pours?.length || 0;
        const contreCount = groupe.contres?.length || 0;
        const abstentionCount = groupe.abstentions?.length || 0;
        const absentCount = groupe.nonVotants?.length || 0;
        
        return (
          <TableRow key={groupId}>
            <TableCell>
              <Link 
                to={`/groupes/${groupId}`}
                className="font-medium hover:text-primary flex items-center"
              >
                <div 
                  className="w-3 h-3 rounded-full mr-2" 
                  style={{ 
                    backgroundColor: getGroupePolitiqueCouleur(nomGroupe)
                  }}
                />
                {nomGroupe}
              </Link>
            </TableCell>
            <TableCell className="text-center">
              <div className="flex items-center justify-center space-x-1">
                {positionIcons[positionMajoritaire]}
                <span className={`font-medium ${positionClasses[positionMajoritaire]}`}>
                  {positionLabels[positionMajoritaire]}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-center font-medium text-vote-pour">
              {pourCount}
            </TableCell>
            <TableCell className="text-center font-medium text-vote-contre">
              {contreCount}
            </TableCell>
            <TableCell className="text-center font-medium text-vote-abstention">
              {abstentionCount}
            </TableCell>
            <TableCell className="text-center font-medium text-vote-absent">
              {absentCount}
            </TableCell>
            <TableCell className="text-center">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setSelectedTab('details');
                  // Ensure group details are loaded
                  if (!groupsData[groupId]) {
                    toast.info(`Chargement des détails pour ${nomGroupe}...`);
                    getGroupVoteDetail(groupId, voteId as string, legislature)
                      .then(details => {
                        setGroupsData(prev => ({
                          ...prev,
                          [groupId]: details
                        }));
                      })
                      .catch(err => {
                        toast.error(`Erreur lors du chargement des détails pour ${nomGroupe}`);
                        console.error(err);
                      });
                  }
                }}
              >
                <Info size={16} />
              </Button>
            </TableCell>
          </TableRow>
        );
      });
    }
    
    return (
      <TableRow>
        <TableCell colSpan={7} className="text-center py-8 text-gray-500">
          Aucune donnée disponible pour ce scrutin
        </TableCell>
      </TableRow>
    );
  }

  // Helper function to render deputies details by group
  function renderDeputiesDetails() {
    if (Object.keys(groupsData).length > 0) {
      return (
        <div className="space-y-8">
          {Object.entries(groupsData).map(([groupId, groupDetail]) => {
            // Check if groupDetail has necessary data
            if (!groupDetail || !groupDetail.groupe) {
              console.warn(`Missing group data for groupId: ${groupId}`);
              return null;
            }

            // Extract group info and deputies
            const groupName = groupDetail.groupe.nom || groupDetail.groupe.libelle || 'Groupe inconnu';
            const deputies = processDeputiesFromVoteDetail(groupDetail);
            
            return (
              <div key={groupId}>
                <div className="flex items-center mb-3">
                  <div 
                    className="w-4 h-4 rounded-full mr-2" 
                    style={{ 
                      backgroundColor: getGroupePolitiqueCouleur(groupName)
                    }}
                  />
                  <h3 className="text-lg font-semibold">{groupName}</h3>
                </div>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Député</TableHead>
                        <TableHead className="text-center">Position</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deputies.length > 0 ? (
                        deputies.map((vote) => (
                          <TableRow key={vote.id}>
                            <TableCell>
                              <Link 
                                to={`/deputy/${vote.id}`}
                                className="hover:text-primary"
                              >
                                {vote.prenom} {vote.nom}
                              </Link>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center space-x-2">
                                {positionIcons[vote.position]}
                                <span className={`font-medium ${positionClasses[vote.position]}`}>
                                  {positionLabels[vote.position]}
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center py-8 text-gray-500">
                            Aucun détail de vote disponible
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <Separator className="my-6" />
              </div>
            );
          }).filter(Boolean)}
        </div>
      );
    }
    
    return (
      <div className="text-center py-8 text-gray-500">
        Cliquez sur l'icône d'information dans l'onglet "Résumé par groupe" pour voir le détail des votes des députés d'un groupe
      </div>
    );
  }
};

// Helper to normalize API position values to our internal format
const normalizePosition = (apiPosition: string): VotePosition => {
  if (!apiPosition) return 'absent';
  
  const positionMap: Record<string, VotePosition> = {
    'Pour': 'pour',
    'Contre': 'contre',
    'Abstention': 'abstention',
    'Non-votant': 'absent',
    'Non votant': 'absent'
  };
  
  return positionMap[apiPosition] || 'absent';
};

export default VoteDetails;
