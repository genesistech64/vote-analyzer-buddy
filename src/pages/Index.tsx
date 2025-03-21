
import React, { useState } from 'react';
import SearchBar from '@/components/SearchBar';
import VotesTable from '@/components/VotesTable';
import StatusCard from '@/components/StatusCard';
import { DeputyVoteData, StatusMessage } from '@/utils/types';
import { fetchDeputyVotes, exportToCSV } from '@/utils/apiService';
import { toast } from 'sonner';
import { BarChart3, HelpCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const Index = () => {
  const [deputyId, setDeputyId] = useState<string>('');
  const [votesData, setVotesData] = useState<DeputyVoteData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage>({
    status: 'idle',
    message: ''
  });

  const handleSearch = async (newDeputyId: string) => {
    if (isLoading) return;
    
    setDeputyId(newDeputyId);
    setIsLoading(true);
    setVotesData([]);
    setError(null);
    
    try {
      console.log(`[Index] Starting search for deputy ID: ${newDeputyId}`);
      const data = await fetchDeputyVotes(newDeputyId, setStatus);
      setVotesData(data);
      console.log(`[Index] Search completed, got ${data.length} results`);
      
      if (data.length === 0) {
        toast.warning(
          "Aucun vote trouvé", 
          { 
            description: `Vérifiez l'identifiant du député "${newDeputyId}" et réessayez.` 
          }
        );
      } else {
        toast.success(
          "Analyse terminée", 
          { description: `${data.length} votes analysés pour le député ${newDeputyId}` }
        );
      }
    } catch (error) {
      console.error('[Index] Error in search handler:', error);
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
    } finally {
      setIsLoading(false);
    }
  };

  const showHelp = () => {
    toast.info(
      "Comment trouver l'identifiant d'un député ?", 
      { 
        description: `Rendez-vous sur le site de l'Assemblée Nationale (assemblee-nationale.fr), 
        consultez la fiche du député, et cherchez l'identifiant PA suivi de chiffres 
        dans l'URL de sa page. Exemple: pour David Habib, l'identifiant est PA1592.`,
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
                Pour tester l'application, essayez l'identifiant PA1592 (David Habib).
              </div>
            </AlertDescription>
          </Alert>
        )}
        
        <section className="space-y-4">
          <div className="max-w-3xl mx-auto text-center mb-8 space-y-3">
            <h2 className="text-3xl font-bold text-gray-900">Analysez les votes d'un député</h2>
            <p className="text-gray-600">
              Entrez l'identifiant d'un député pour analyser ses votes lors des scrutins publics à l'Assemblée nationale.
            </p>
            <div className="flex justify-center">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={showHelp} 
                className="flex items-center text-xs"
              >
                <HelpCircle className="mr-1 h-3 w-3" />
                Comment trouver l'identifiant ?
              </Button>
            </div>
          </div>
          
          <SearchBar onSearch={handleSearch} isLoading={isLoading} />
          
          {status.status !== 'idle' && (
            <div className="max-w-md mx-auto mt-4">
              <StatusCard status={status} />
            </div>
          )}
        </section>

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
