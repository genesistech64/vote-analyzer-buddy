import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getDeputyDetails, fetchDeputyVotes, fetchDeputyDeports, exportToCSV } from '@/utils/apiService';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  ArrowLeft, 
  User, 
  AlertTriangle, 
  ExternalLink, 
  Mail, 
  Twitter, 
  Facebook, 
  Globe, 
  Building, 
  Users, 
  FileCheck,
  Flag
} from 'lucide-react';
import PoliticalGroupBadge from '@/components/PoliticalGroupBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import StatusCard from '@/components/StatusCard';
import VotesTable from '@/components/VotesTable';
import VotesChart from '@/components/VotesChart';
import DeportsList from '@/components/DeportsList';
import { 
  DeputeFullInfo, 
  DeportInfo, 
  DeputyVoteData, 
  StatusMessage, 
  ContactInfo,
  OrganeInfo 
} from '@/utils/types';
import MainNavigation from '@/components/MainNavigation';

const DeputyProfile = () => {
  const { deputyId } = useParams<{ deputyId: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deputyInfo, setDeputyInfo] = useState<DeputeFullInfo | null>(null);
  const [votesData, setVotesData] = useState<DeputyVoteData[]>([]);
  const [deportsData, setDeportsData] = useState<DeportInfo[]>([]);
  const [status, setStatus] = useState<StatusMessage>({
    status: 'loading',
    message: 'Chargement des données du député...'
  });

  useEffect(() => {
    const loadDeputyData = async () => {
      if (!deputyId) {
        setError("Identifiant du député manquant");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        console.log(`[DeputyProfile] Loading data for deputy: ${deputyId}`);
        
        const deputyDetails = await getDeputyDetails(deputyId);
        console.log('[DeputyProfile] Deputy details:', deputyDetails);
        
        setDeputyInfo(deputyDetails);
        
        const votes = await fetchDeputyVotes(deputyId, setStatus);
        console.log(`[DeputyProfile] Fetched ${votes.length} votes for deputy ${deputyId}`);
        setVotesData(votes);
        
        const deports = await fetchDeputyDeports(deputyId);
        console.log(`[DeputyProfile] Fetched ${deports.length} deports for deputy ${deputyId}`);
        setDeportsData(deports);
        
        if (votes.length === 0) {
          toast.warning(
            "Aucun vote trouvé", 
            { description: `Aucun vote enregistré pour ce député.` }
          );
        } else {
          toast.success(
            "Données chargées avec succès", 
            { description: `${votes.length} votes analysés pour le député ${deputyId}` }
          );
        }
      } catch (error) {
        console.error('[DeputyProfile] Error loading deputy data:', error);
        const errorMessage = error instanceof Error ? error.message : "Une erreur est survenue lors du chargement des données.";
        setError(errorMessage);
        
        toast.error(
          "Erreur de chargement", 
          { description: errorMessage }
        );
        
        setStatus({
          status: 'error',
          message: "Une erreur est survenue",
          details: errorMessage
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadDeputyData();
  }, [deputyId]);

  const goBack = () => {
    navigate('/');
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Non renseigné';
    
    try {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateString;
    }
  };

  const getOrganeTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      'GP': 'Groupe politique',
      'COMNL': 'Commission',
      'COMPER': 'Commission permanente',
      'GE': 'Groupe d\'études',
      'GEVI': 'Groupe d\'amitié',
      'GA': 'Groupe d\'amitié',
      'MISINF': 'Mission d\'information',
      'MISINFPRE': 'Mission d\'information présidentielle',
      'COMSPEC': 'Commission spéciale',
      'CNPE': 'Commisson d\'enquête',
      'OFFPAR': 'Office parlementaire',
      'PARPOL': 'Parti politique',
      'ORGEXTPARL': 'Organisme extraparlementaire'
    };
    
    return typeMap[type] || type;
  };

  const getContactIcon = (type: string) => {
    type = type.toLowerCase();
    
    if (type.includes('mèl') || type.includes('mail')) {
      return <Mail className="h-4 w-4" />;
    } else if (type.includes('twitter')) {
      return <Twitter className="h-4 w-4" />;
    } else if (type.includes('facebook')) {
      return <Facebook className="h-4 w-4" />;
    } else if (type.includes('site') || type.includes('web')) {
      return <Globe className="h-4 w-4" />;
    } else if (type.includes('adresse')) {
      return <Building className="h-4 w-4" />;
    }
    return null;
  };

  const renderContactValue = (contact: ContactInfo) => {
    const value = contact.valeur;
    const type = contact.type.toLowerCase();
    
    if (type.includes('mèl') || type.includes('mail')) {
      return (
        <a href={`mailto:${value}`} className="text-primary hover:underline">
          {value}
        </a>
      );
    } else if (type.includes('twitter')) {
      return (
        <a href={`https://twitter.com/${value.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          {value}
        </a>
      );
    } else if (type.includes('facebook')) {
      return (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          {value}
        </a>
      );
    } else if (type.includes('site') || type.includes('web')) {
      return (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          {value}
        </a>
      );
    }
    
    return value;
  };

  const navigateToOrgane = (organe: OrganeInfo) => {
    if (!organe.uid) {
      toast.error("Impossible d'afficher les membres", {
        description: "Identifiant d'organe manquant pour " + organe.nom
      });
      return;
    }
    
    let organeId = organe.uid;
    
    console.log(`[DeputyProfile] Original organe info:`, organe);
    
    if (!organeId.startsWith('PO') && organe.organeRef) {
      organeId = organe.organeRef;
      console.log(`[DeputyProfile] Using organeRef as organeId: ${organeId}`);
    }
    
    if (!organeId.startsWith('PO')) {
      console.warn(`[DeputyProfile] Potentially invalid organe ID: ${organeId}`);
      toast.warning(
        "Format d'identifiant potentiellement incorrect", 
        { description: `L'identifiant ${organeId} ne semble pas être un identifiant d'organe valide.` }
      );
    }
    
    const encodedNom = encodeURIComponent(organe.nom);
    const encodedType = encodeURIComponent(organe.type);
    navigate(`/organe/${organeId}/${encodedNom}/${encodedType}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <MainNavigation />
      
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Button 
              variant="ghost" 
              onClick={goBack} 
              className="flex items-center text-gray-600"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour à la recherche
            </Button>
            <h1 className="text-xl font-semibold text-gray-900">
              Profil du député
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {status.status !== 'idle' && (
          <div className="max-w-md mx-auto mt-4">
            <StatusCard status={status} />
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="h-12 w-12 border-4 border-t-transparent border-primary rounded-full animate-spin"></div>
          </div>
        ) : deputyInfo ? (
          <>
            <section>
              <Card className="overflow-hidden">
                <CardHeader className="bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center space-x-4">
                    <div className="bg-white p-3 rounded-full shadow-sm">
                      <User className="h-10 w-10 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="flex items-center flex-wrap gap-2">
                        {deputyInfo.civilite} {deputyInfo.prenom} {deputyInfo.nom}
                        {deputyInfo.groupe_politique && (
                          <PoliticalGroupBadge
                            groupe={deputyInfo.groupe_politique}
                            groupeId={deputyInfo.groupe_politique_uid}
                            linkToMembers={true}
                            className="ml-1"
                          />
                        )}
                      </CardTitle>
                      <CardDescription>
                        <span className="text-sm font-mono">
                          ID: {deputyInfo.id}
                        </span>
                        {deputyInfo.profession && (
                          <span> • {deputyInfo.profession}</span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
                        <User className="mr-2 h-5 w-5 text-gray-500" />
                        Informations personnelles
                      </h3>
                      <div className="space-y-3">
                        {deputyInfo.date_naissance && (
                          <div className="flex justify-between border-b border-gray-100 pb-2">
                            <span className="text-gray-600">Date de naissance</span>
                            <span className="font-medium">{formatDate(deputyInfo.date_naissance)}</span>
                          </div>
                        )}
                        {deputyInfo.lieu_naissance && (
                          <div className="flex justify-between border-b border-gray-100 pb-2">
                            <span className="text-gray-600">Lieu de naissance</span>
                            <span className="font-medium">{deputyInfo.lieu_naissance}</span>
                          </div>
                        )}
                        {deputyInfo.profession && (
                          <div className="flex justify-between border-b border-gray-100 pb-2">
                            <span className="text-gray-600">Profession</span>
                            <span className="font-medium">{deputyInfo.profession}</span>
                          </div>
                        )}
                        {deputyInfo.hatvp_url && (
                          <div className="flex justify-between border-b border-gray-100 pb-2">
                            <span className="text-gray-600">Déclaration HATVP</span>
                            <a 
                              href={deputyInfo.hatvp_url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-primary hover:underline flex items-center"
                            >
                              <FileCheck className="h-4 w-4 mr-1" />
                              Consulter
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </div>
                        )}
                      </div>

                      {deputyInfo.contacts && deputyInfo.contacts.length > 0 && (
                        <div className="mt-8">
                          <h3 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
                            <Mail className="mr-2 h-5 w-5 text-gray-500" />
                            Contacts
                          </h3>
                          <div className="space-y-3">
                            {deputyInfo.contacts.map((contact, index) => (
                              <div key={index} className="flex justify-between border-b border-gray-100 pb-2">
                                <span className="text-gray-600 flex items-center">
                                  {getContactIcon(contact.type)}
                                  <span className="ml-2">{contact.type}</span>
                                </span>
                                <span className="font-medium">
                                  {renderContactValue(contact)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      {deputyInfo.organes && deputyInfo.organes.length > 0 && (
                        <div>
                          <h3 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
                            <Users className="mr-2 h-5 w-5 text-gray-500" />
                            Appartenance aux organes
                          </h3>
                          <div className="space-y-3">
                            {deputyInfo.organes.map((organe, index) => (
                              <div
                                key={index}
                                className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50 transition-colors"
                                onClick={() => organe.uid ? navigateToOrgane(organe) : null}
                                style={{ cursor: organe.uid ? 'pointer' : 'default' }}
                              >
                                <div className="font-medium text-primary">
                                  {organe.nom}
                                </div>
                                <div className="flex justify-between text-sm text-gray-500 mt-1">
                                  <span>{getOrganeTypeLabel(organe.type)}</span>
                                  <span>{organe.date_debut && formatDate(organe.date_debut)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {deportsData.length > 0 && (
              <DeportsList deports={deportsData} />
            )}

            {votesData.length > 0 && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-1">
                    <VotesChart data={votesData} />
                  </div>
                  <div className="md:col-span-2">
                    <VotesTable 
                      data={votesData} 
                      exportToCSV={() => exportToCSV(votesData)} 
                    />
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-lg text-gray-500">Aucune information trouvée pour ce député.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default DeputyProfile;
