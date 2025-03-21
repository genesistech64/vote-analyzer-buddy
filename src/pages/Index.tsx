import React, { useState } from 'react';
import SearchBar from '@/components/SearchBar';
import VotesTable from '@/components/VotesTable';
import VotesChart from '@/components/VotesChart';
import DeportsList from '@/components/DeportsList';
import StatusCard from '@/components/StatusCard';
import { DeportInfo, DeputeInfo, DeputeSearchResult, DeputyVoteData, StatusMessage } from '@/utils/types';
import { fetchDeputyVotes, fetchDeputyDeports, exportToCSV, searchDepute } from '@/utils/apiService';
import { toast } from 'sonner';
import { BarChart3, HelpCircle, AlertTriangle, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const Index = () => {
  const [deputyId, setDeputyId] = useState<string>('');
  const [votesData, setVotesData] = useState<DeputyVoteData[]>([]);
  const [deportsData, setDeportsData] = useState<DeportInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<DeputeSearchResult | undefined>();
  const [deputeInfo, setDeputeInfo] = useState<DeputeInfo | undefined>();
  const [status, setStatus] = useState<StatusMessage>({
    status: 'idle',
    message: ''
  });

  const handleSearchDepute = async (query: string) => {
    if (isLoading) return;
    
    setIsLoading(true);
    setError(null);
    setSearchResult(undefined);
    setDeputeInfo(undefined);
    setVotesData([]);
    setDeportsData([]);
    
    try {
      console.log(`[Index] Searching for deputy: ${query}`);
      const result = await searchDepute(query, setStatus);
      setSearchResult(result);
      
      if (result.success && result.deputeInfo) {
        setDeputeInfo(result.deputeInfo);
        await fetchVotesAndDeports(result.deputeInfo.id);
      } else if (result.multipleResults) {
        toast.info(
          "Plusieurs députés trouvés", 
          { description: "Veuillez sélectionner un député dans la liste" }
        );
      } else {
        toast.warning(
          "Aucun député trouvé", 
          { description: `Vérifiez le nom ou l'identifiant "${query}" et réessayez.` }
        );
      }
    } catch (error) {
      console.error('[Index] Error in search:', error);
      handleSearchError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectDepute = async (selectedDeputyId: string) => {
    if (isLoading) return;
    
    setIsLoading(true);
    setDeputyId(selectedDeputyId);
    setError(null);
    setVotesData([]);
    setDeportsData([]);
    
    try {
      const result = await searchDepute(selectedDeputyId, setStatus);
      
      if (result.success && result.deputeInfo) {
        setDeputeInfo(result.deputeInfo);
        await fetchVotesAndDeports(selectedDeputyId);
      } else {
        toast.warning(
          "Erreur lors de la sélection du député", 
          { description: "Impossible de récupérer les informations du député sélectionné." }
        );
      }
    } catch (error) {
      console.error('[Index] Error in deputy selection:', error);
      handleSearchError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchVotesAndDeports = async (id: string) => {
    try {
      console.log(`[Index] Fetching votes for deputy ID: ${id}`);
      
      const votes = await fetchDeputyVotes(id, setStatus);
      setVotesData(votes);
      console.log(`[Index] Fetched ${votes.length} votes for deputy ${id}`);
      
      const deports = await fetchDeputyDeports(id);
      setDeportsData(deports);
      console.log(`[Index] Fetched ${deports.length} deports for deputy ${id}`);
      
      if (votes.length === 0) {
        toast.warning(
          "Aucun vote trouvé", 
          { description: `Aucun vote enregistré pour ce député.` }
        );
      } else {
        toast.success(
          "Analyse terminée", 
          { description: `${votes.length} votes analysés pour le député ${id}` }
        );
        
        if (deports.length > 0) {
          toast.info(
            "Restrictions de vote détectées", 
            { description: `${deports.length} restriction(s) de vote déclarée(s)` }
          );
        }
      }
    } catch (error) {
      console.error('[Index] Error fetching data:', error);
      handleSearchError(error);
    }
  };

  const handleSearchError = (error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : "Une erreur est survenue lors de la connexion à l'API.";
    
    setError(errorMessage);
    
    toast.error(
      "Erreur lors de l'analyse", 
      { description: errorMessage }
    );
    
    setStatus({
      status: 'error',
      message: "Une erreur est survenue lors de l'analyse",
      details: errorMessage
    });
  };

  const showHelp = () => {
    toast.info(
      "Comment rechercher un député ?", 
      { 
        description: `Vous pouvez rechercher par nom (ex: "Habib") ou par identifiant 
        (ex: "PA1592"). L'identifiant se trouve dans l'URL de la fiche du député 
        sur le site de l'Assemblée Nationale (assemblee-nationale.fr)`,
        duration: 8000 
      }
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <BarChart3 className="h-8 w-8 text-primary mr-3" />
              <h1 className="text-xl font-semibold text-gray-900">Vote Analyzer</h1>
            </div>
            <div className="text-sm text-gray-500">Assemblée Nationale - 17e législature</div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erreur de connexion</AlertTitle>
            <AlertDescription>
              {error}
              <div className="mt-2 text-sm">
                Pour tester l'application, essayez l'identifiant PA1592 (David Habib) ou le nom "Habib".
              </div>
            </AlertDescription>
          </Alert>
        )}
        
        <section className="space-y-4">
          <div className="max-w-3xl mx-auto text-center mb-8 space-y-3">
            <h2 className="text-3xl font-bold text-gray-900">Analysez les votes d'un député</h2>
            <p className="text-gray-600">
              Entrez le nom ou l'identifiant d'un député pour analyser ses votes à l'Assemblée nationale.
            </p>
            <div className="flex justify-center">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={showHelp} 
                className="flex items-center text-xs"
              >
                <HelpCircle className="mr-1 h-3 w-3" />
                Comment rechercher un député ?
              </Button>
            </div>
          </div>
          
          <SearchBar 
            onSearch={handleSearchDepute} 
            onSelectDepute={handleSelectDepute}
            isLoading={isLoading} 
            searchResult={searchResult}
          />
          
          {status.status !== 'idle' && (
            <div className="max-w-md mx-auto mt-4">
              <StatusCard status={status} />
            </div>
          )}
        </section>

        {deputeInfo && (
          <section className="mt-8">
            <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
              <div className="flex items-center space-x-4">
                <div className="bg-gray-100 p-3 rounded-full">
                  <User className="h-8 w-8 text-gray-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{deputeInfo.prenom} {deputeInfo.nom}</h2>
                  <div className="text-gray-600 flex items-center mt-1">
                    <span className="text-sm">
                      {deputeInfo.profession} • ID: <span className="font-mono">{deputeInfo.id}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {deportsData.length > 0 && (
          <section className="mt-8">
            <DeportsList deports={deportsData} />
          </section>
        )}

        {votesData.length > 0 && (
          <section className="mt-8">
            <VotesChart data={votesData} />
          </section>
        )}

        <section className="mt-8">
          <VotesTable data={votesData} isLoading={isLoading} exportToCSV={exportToCSV} />
        </section>
      </main>

      <footer className="border-t border-gray-100 py-8 mt-12 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-center text-gray-500">
            Données issues de l'open data de l'Assemblée nationale française <br />
            <span className="text-primary">Mise à jour toutes les 48 heures via API</span> <br />
            <a 
              href="https://data.assemblee-nationale.fr" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              data.assemblee-nationale.fr
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
