
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getDeputyDetails } from '@/utils/apiService';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, User, AlertTriangle, ExternalLink } from 'lucide-react';
import StatusCard from '@/components/StatusCard';
import VotesTable from '@/components/VotesTable';
import VotesChart from '@/components/VotesChart';
import DeportsList from '@/components/DeportsList';
import { DeputeFullInfo, DeportInfo, DeputyVoteData, StatusMessage } from '@/utils/types';
import { fetchDeputyVotes, fetchDeputyDeports, exportToCSV } from '@/utils/apiService';

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
        
        // Fetch deputy details
        const deputyDetails = await getDeputyDetails(deputyId);
        console.log('[DeputyProfile] Deputy details:', deputyDetails);
        setDeputyInfo(deputyDetails);
        
        // Fetch votes
        const votes = await fetchDeputyVotes(deputyId, setStatus);
        console.log(`[DeputyProfile] Fetched ${votes.length} votes for deputy ${deputyId}`);
        setVotesData(votes);
        
        // Fetch deports
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

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Non renseigné';
    
    try {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
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
            <section className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
              <div className="flex items-center space-x-4 mb-6">
                <div className="bg-gray-100 p-3 rounded-full">
                  <User className="h-8 w-8 text-gray-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{deputyInfo.prenom} {deputyInfo.nom}</h2>
                  <div className="text-gray-600 flex items-center mt-1">
                    <span className="text-sm font-mono">ID: {deputyInfo.id}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-gray-800">Informations personnelles</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-gray-100 pb-1">
                      <span className="text-gray-600">Profession</span>
                      <span className="font-medium">{deputyInfo.profession || 'Non renseignée'}</span>
                    </div>
                    {deputyInfo.dateNaissance && (
                      <div className="flex justify-between border-b border-gray-100 pb-1">
                        <span className="text-gray-600">Date de naissance</span>
                        <span className="font-medium">{formatDate(deputyInfo.dateNaissance)}</span>
                      </div>
                    )}
                    {deputyInfo.lieuNaissance && (
                      <div className="flex justify-between border-b border-gray-100 pb-1">
                        <span className="text-gray-600">Lieu de naissance</span>
                        <span className="font-medium">{deputyInfo.lieuNaissance}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3 text-gray-800">Mandat actuel</h3>
                  <div className="space-y-2">
                    {deputyInfo.circonscription && (
                      <div className="flex justify-between border-b border-gray-100 pb-1">
                        <span className="text-gray-600">Circonscription</span>
                        <span className="font-medium">{deputyInfo.circonscription}</span>
                      </div>
                    )}
                    {deputyInfo.groupe && (
                      <div className="flex justify-between border-b border-gray-100 pb-1">
                        <span className="text-gray-600">Groupe politique</span>
                        <span className="font-medium">{deputyInfo.groupe}</span>
                      </div>
                    )}
                    {deputyInfo.datePriseFonction && (
                      <div className="flex justify-between border-b border-gray-100 pb-1">
                        <span className="text-gray-600">Début de mandat</span>
                        <span className="font-medium">{formatDate(deputyInfo.datePriseFonction)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {deputyInfo.urlHatvp && (
                <div className="mt-6">
                  <a 
                    href={deputyInfo.urlHatvp} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-primary hover:underline"
                  >
                    Voir la déclaration d'intérêts sur HATVP
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </div>
              )}
            </section>

            {deportsData.length > 0 && (
              <section className="mt-8">
                <DeportsList deports={deportsData} />
              </section>
            )}

            {votesData.length > 0 && (
              <>
                <section className="mt-8">
                  <VotesChart data={votesData} />
                </section>

                <section className="mt-8">
                  <VotesTable data={votesData} isLoading={isLoading} exportToCSV={exportToCSV} />
                </section>
              </>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">Aucune information trouvée pour ce député</p>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-100 py-8 mt-12 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-center text-gray-500">
            Données issues de l'open data de l'Assemblée nationale française <br />
            <span className="text-primary">Mise à jour toutes les 48 heures via API</span>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default DeputyProfile;
