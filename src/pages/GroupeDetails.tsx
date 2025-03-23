
import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getDeputesByOrgane, getGroupVotes, getGroupVoteDetail } from '@/utils/apiService';
import { DeputesParGroupe, GroupeVote, getGroupePolitiqueCouleur, GroupVoteDetail } from '@/utils/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import MainNavigation from '@/components/MainNavigation';
import StatusCard from '@/components/StatusCard';
import { toast } from 'sonner';
import { 
  CheckCircle2, 
  XCircle, 
  Minus, 
  Clock, 
  ChevronLeft, 
  Users, 
  Vote, 
  BarChart3,
  ExternalLink,
  User
} from 'lucide-react';

const GroupeDetails = () => {
  const { groupeId, legislature = '17' } = useParams<{ groupeId: string, legislature?: string }>();
  const [groupeDetails, setGroupeDetails] = useState<DeputesParGroupe | null>(null);
  const [groupeVotes, setGroupeVotes] = useState<GroupeVote[]>([]);
  const [voteDetails, setVoteDetails] = useState<Record<string, GroupVoteDetail>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!groupeId) {
      setError('ID de groupe politique manquant');
      setLoading(false);
      return;
    }

    const fetchGroupeDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch groupe members
        const details = await getDeputesByOrgane(groupeId, '', '', legislature);
        setGroupeDetails(details);

        // Fetch group votes
        const votes = await getGroupVotes(groupeId, legislature);
        setGroupeVotes(votes);

      } catch (err) {
        console.error('Error fetching groupe details:', err);
        setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        toast.error('Erreur lors du chargement des données', {
          description: err instanceof Error ? err.message : 'Une erreur est survenue',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchGroupeDetails();
  }, [groupeId, legislature]);

  const fetchVoteDetail = async (numero: string) => {
    if (!groupeId) return;
    
    try {
      // Use the getGroupVoteDetail endpoint with the correct parameters
      const detail = await getGroupVoteDetail(groupeId, numero, legislature);
      setVoteDetails(prev => ({
        ...prev,
        [numero]: detail
      }));
      return detail;
    } catch (err) {
      console.error(`Error fetching vote detail for scrutin ${numero}:`, err);
      toast.error(`Erreur lors du chargement des détails du vote ${numero}`);
      return null;
    }
  };

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

  const handleViewVoteDetails = async (numero: string) => {
    // For navigation to vote details page
    navigate(`/votes/${legislature}/${numero}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <MainNavigation />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="w-full h-64 flex items-center justify-center">
            <div className="flex flex-col items-center space-y-4">
              <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-500">Chargement des données du groupe...</p>
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
        {groupeDetails && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <Button asChild variant="outline" size="sm" className="mb-4">
                  <Link to="/">
                    <ChevronLeft size={16} className="mr-1" />
                    Retour
                  </Link>
                </Button>
                <div className="flex items-center space-x-3">
                  <div 
                    className="w-8 h-8 rounded-full" 
                    style={{ 
                      backgroundColor: getGroupePolitiqueCouleur(groupeDetails.organeInfo.nom)
                    }}
                  />
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{groupeDetails.organeInfo.nom}</h1>
                </div>
                <p className="text-gray-600 mt-1">
                  <span>
                    {legislature}
                    <sup>e</sup> législature
                  </span>
                  <span className="mx-2">•</span>
                  <span className="font-medium">{groupeDetails.deputes.length} membres</span>
                </p>
              </div>
            </div>

            <Tabs defaultValue="votes">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="votes" className="flex items-center">
                  <Vote size={16} className="mr-2" />
                  Votes
                </TabsTrigger>
                <TabsTrigger value="membres" className="flex items-center">
                  <Users size={16} className="mr-2" />
                  Membres
                </TabsTrigger>
              </TabsList>

              <TabsContent value="votes" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Historique des votes du groupe</CardTitle>
                    <CardDescription>
                      Liste des scrutins et positions majoritaires du groupe {groupeDetails.organeInfo.nom}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-24">N°</TableHead>
                            <TableHead className="w-28">Date</TableHead>
                            <TableHead>Sujet</TableHead>
                            <TableHead className="text-center">Position majoritaire</TableHead>
                            <TableHead className="text-center w-32">Détails</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groupeVotes && groupeVotes.length > 0 ? (
                            groupeVotes.map((vote) => (
                              <TableRow key={vote.numero}>
                                <TableCell>{vote.numero}</TableCell>
                                <TableCell>{formatDate(vote.dateScrutin)}</TableCell>
                                <TableCell className="max-w-md truncate" title={vote.title}>
                                  {vote.title}
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="flex items-center justify-center space-x-2">
                                    {positionIcons[vote.positionMajoritaire]}
                                    <span className={`font-medium ${positionClasses[vote.positionMajoritaire]}`}>
                                      {positionLabels[vote.positionMajoritaire]}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => handleViewVoteDetails(vote.numero)}
                                  >
                                    <BarChart3 size={16} className="mr-1" />
                                    Voir
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                                Aucun vote trouvé pour ce groupe politique
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="membres" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Membres du groupe</CardTitle>
                    <CardDescription>
                      Liste des {groupeDetails.deputes.length} députés membres du groupe {groupeDetails.organeInfo.nom}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {groupeDetails.deputes.map((depute) => (
                        <div key={depute.id} className="border rounded-md p-4 flex items-center space-x-3">
                          <Avatar className="h-10 w-10 bg-primary/10">
                            <AvatarFallback>
                              <User className="h-5 w-5 text-primary" />
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <Link 
                              to={`/deputy/${depute.id}`}
                              className="font-medium hover:text-primary"
                            >
                              {depute.prenom} {depute.nom}
                            </Link>
                            <p className="text-sm text-gray-500">
                              {depute.profession || 'Profession non renseignée'}
                            </p>
                          </div>
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

export default GroupeDetails;
