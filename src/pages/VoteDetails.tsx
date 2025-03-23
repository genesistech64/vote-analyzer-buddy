
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getVoteDetails, getGroupVoteDetail, getDeputesByOrgane } from '@/utils/apiService';
import { GroupVoteDetail, DeputeVoteDetail, getGroupePolitiqueCouleur } from '@/utils/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import MainNavigation from '@/components/MainNavigation';
import StatusCard from '@/components/StatusCard';
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

        // Fetch vote details
        const details = await getVoteDetails(voteId, legislature);
        setVoteDetails(details);

        // Fetch all groups involved
        if (details.groupes && Array.isArray(details.groupes)) {
          const groupsPromises = details.groupes.map(async (groupe: any) => {
            try {
              const groupeId = groupe.organeRef || groupe.uid;
              if (!groupeId) return null;

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

  const getPositionCounts = (groupDetail: GroupVoteDetail) => {
    if (!groupDetail || !groupDetail.votes) return { pour: 0, contre: 0, abstention: 0, absent: 0 };

    return groupDetail.votes.reduce((acc, vote) => {
      acc[vote.position]++;
      return acc;
    }, { pour: 0, contre: 0, abstention: 0, absent: 0 });
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
          <div className="w-full">
            <StatusCard 
              status={{
                status: 'error',
                message: 'Erreur lors du chargement des données',
                details: error
              }} 
            />
            <div className="mt-4 text-center">
              <Button asChild variant="outline">
                <Link to="/">
                  <ChevronLeft size={16} className="mr-2" />
                  Retour à l'accueil
                </Link>
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MainNavigation />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {voteDetails && (
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
                  <span className="font-medium">{formatDate(voteDetails.dateScrutin)}</span>
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
                  {voteDetails.titre || 'Titre non disponible'}
                </CardTitle>
                <CardDescription>
                  {voteDetails.description || 'Description non disponible'}
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
                          {Object.entries(groupsData).map(([groupId, groupDetail]) => {
                            const countByPosition = getPositionCounts(groupDetail);
                            
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
                                        backgroundColor: getGroupePolitiqueCouleur(groupDetail.groupe.nom)
                                      }}
                                    />
                                    {groupDetail.groupe.nom}
                                  </Link>
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="flex items-center justify-center space-x-1">
                                    {positionIcons[groupDetail.groupe.positionMajoritaire]}
                                    <span className={`font-medium ${positionClasses[groupDetail.groupe.positionMajoritaire]}`}>
                                      {positionLabels[groupDetail.groupe.positionMajoritaire]}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center font-medium text-vote-pour">
                                  {countByPosition.pour}
                                </TableCell>
                                <TableCell className="text-center font-medium text-vote-contre">
                                  {countByPosition.contre}
                                </TableCell>
                                <TableCell className="text-center font-medium text-vote-abstention">
                                  {countByPosition.abstention}
                                </TableCell>
                                <TableCell className="text-center font-medium text-vote-absent">
                                  {countByPosition.absent}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => setSelectedTab('details')}
                                  >
                                    <Info size={16} />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
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
                    <div className="space-y-8">
                      {Object.entries(groupsData).map(([groupId, groupDetail]) => (
                        <div key={groupId}>
                          <div className="flex items-center mb-3">
                            <div 
                              className="w-4 h-4 rounded-full mr-2" 
                              style={{ 
                                backgroundColor: getGroupePolitiqueCouleur(groupDetail.groupe.nom)
                              }}
                            />
                            <h3 className="text-lg font-semibold">{groupDetail.groupe.nom}</h3>
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
                                {groupDetail.votes && groupDetail.votes.length > 0 ? (
                                  groupDetail.votes.map((vote: DeputeVoteDetail) => (
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
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>
    </div>
  );
};

export default VoteDetails;
