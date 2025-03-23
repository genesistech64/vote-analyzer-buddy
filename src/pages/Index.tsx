import React, { useState, useEffect } from 'react';
import SearchBar from '@/components/SearchBar';
import VotesTable from '@/components/VotesTable';
import VotesChart from '@/components/VotesChart';
import DeportsList from '@/components/DeportsList';
import StatusCard from '@/components/StatusCard';
import MainNavigation from '@/components/MainNavigation';
import PoliticalGroupBadge from '@/components/PoliticalGroupBadge';
import LegislatureSelector from '@/components/LegislatureSelector';
import { DeportInfo, DeputeInfo, DeputeSearchResult, DeputyVoteData, StatusMessage } from '@/utils/types';
import { fetchDeputyVotes, fetchDeputyDeports, exportToCSV, searchDepute, getDeputyDetails } from '@/utils/apiService';
import { toast } from 'sonner';
import { BarChart3, HelpCircle, AlertTriangle, User, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { triggerDeputiesSync } from '@/utils/deputySupabaseService';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean, error: Error | null, errorInfo: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('=== ERROR BOUNDARY CAUGHT ERROR ===');
    console.error('Error:', error);
    console.error('Component stack:', errorInfo.componentStack);
    this.setState({ errorInfo: errorInfo.componentStack });
    
    toast.error('Une erreur est survenue', {
      description: 'Détails dans la console (F12)',
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-50 rounded-lg border border-red-200 text-red-700 my-4">
          <div className="flex items-center mb-3">
            <Bug className="h-6 w-6 mr-2" />
            <h2 className="text-lg font-semibold">Une erreur est survenue lors du rendu</h2>
          </div>
          <div className="bg-white p-4 rounded border border-red-100 mb-3">
            <p className="font-mono text-sm whitespace-pre-wrap overflow-x-auto">
              {this.state.error?.toString()}
            </p>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium">Informations techniques</summary>
            <pre className="mt-2 text-xs bg-gray-100 p-3 rounded overflow-x-auto whitespace-pre-wrap">
              {this.state.errorInfo}
            </pre>
          </details>
          <Button 
            variant="outline" 
            className="mt-4" 
            onClick={() => window.location.reload()}
          >
            Rafraîchir la page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

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
  const [selectedLegislature, setSelectedLegislature] = useState<string>("17");

  useEffect(() => {
    console.log('=== STATE DEBUG ===');
    console.log('searchResult:', searchResult);
    console.log('deputeInfo:', deputeInfo);
    console.log('deputyId:', deputyId);
  }, [searchResult, deputeInfo, deputyId]);

  const handleLegislatureChange = (legislature: string) => {
    console.log(`[Index] Legislature changed to: ${legislature}`);
    setSelectedLegislature(legislature);
    
    setSearchResult(undefined);
    setDeputeInfo(undefined);
    setVotesData([]);
    setDeportsData([]);
    setDeputyId('');
  };

  const handleSearchDepute = async (query: string) => {
    if (isLoading) return;
    
    setIsLoading(true);
    setError(null);
    setSearchResult(undefined);
    setDeputeInfo(undefined);
    setVotesData([]);
    setDeportsData([]);
    
    try {
      console.log(`[Index] Searching for deputy: ${query} in legislature: ${selectedLegislature}`);
      const result = await searchDepute(query, setStatus, selectedLegislature);
      console.log('[Index] Search result:', JSON.stringify(result, null, 2));
      setSearchResult(result);
      
      if (result.success && result.deputeInfo) {
        if (!result.deputeInfo.prenom && !result.deputeInfo.nom) {
          console.warn('[Index] Deputy name missing, showing with placeholder');
          const updatedInfo = { 
            ...result.deputeInfo,
            prenom: result.deputeInfo.prenom || 'Prénom non disponible',
            nom: result.deputeInfo.nom || 'Nom non disponible'
          };
          setDeputeInfo(updatedInfo);
        } else {
          setDeputeInfo(result.deputeInfo);
        }
        
        if (result.deputeInfo.id) {
          console.log('[Index] Will fetch votes with ID:', result.deputeInfo.id);
          setDeputyId(result.deputeInfo.id);
          
          try {
            const detailedInfo = await getDeputyDetails(result.deputeInfo.id, selectedLegislature);
            console.log('[Index] Detailed deputy info:', detailedInfo);
            if (detailedInfo.groupe_politique) {
              setDeputeInfo(prevInfo => ({
                ...prevInfo!,
                groupe_politique: detailedInfo.groupe_politique
              }));
              
              setSearchResult(prevResult => ({
                ...prevResult!,
                deputeInfo: {
                  ...prevResult!.deputeInfo!,
                  groupe_politique: detailedInfo.groupe_politique
                }
              }));
            }
          } catch (error) {
            console.error('[Index] Error fetching detailed deputy info:', error);
          }
          
          await fetchVotesAndDeports(result.deputeInfo.id);
        } else {
          console.error('[Index] Deputy ID is missing or invalid:', result.deputeInfo);
          toast.error('ID de député invalide', { 
            description: 'L\'identifiant du député est manquant ou invalide.' 
          });
        }
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
      console.log(`[Index] Selected deputy ID: ${selectedDeputyId} in legislature: ${selectedLegislature}`);
      const result = await searchDepute(selectedDeputyId, setStatus, selectedLegislature);
      console.log('[Index] Selected deputy info:', JSON.stringify(result, null, 2));
      
      if (result.success && result.deputeInfo) {
        try {
          const detailedInfo = await getDeputyDetails(selectedDeputyId, selectedLegislature);
          console.log('[Index] Detailed deputy info:', detailedInfo);
          
          const mergedInfo = {
            ...result.deputeInfo,
            groupe_politique: detailedInfo.groupe_politique || result.deputeInfo.groupe_politique
          };
          
          setDeputeInfo(mergedInfo);
        } catch (error) {
          console.error('[Index] Error fetching detailed deputy info:', error);
          setDeputeInfo(result.deputeInfo);
        }
        
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
      console.log(`[Index] Fetching votes for deputy ID: ${id} in legislature: ${selectedLegislature}`);
      
      const votes = await fetchDeputyVotes(id, setStatus, selectedLegislature);
      console.log(`[Index] Fetched ${votes.length} votes for deputy ${id}`);
      setVotesData(votes);
      
      const deports = await fetchDeputyDeports(id, selectedLegislature);
      console.log(`[Index] Fetched ${deports.length} deports for deputy ${id}`);
      setDeportsData(deports);
      
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
    
    console.error('=== DETAILED ERROR INFO ===');
    console.error('Error Object:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack available');
    
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
        sur le site de l'Assemblée nationale (assemblee-nationale.fr)`,
        duration: 8000 
      }
    );
  };

  const handleSyncDeputies = async () => {
    toast.info("Synchronisation en cours", {
      description: "La synchronisation peut prendre quelques minutes. Veuillez patienter."
    });
    
    try {
      const result = await triggerDeputiesSync(selectedLegislature, true);
      
      if (result.success) {
        toast.success("Synchronisation démarrée", {
          description: result.message
        });
      } else {
        toast.error("Erreur de synchronisation", {
          description: result.message
        });
      }
    } catch (error) {
      toast.error("Erreur lors de la synchronisation", {
        description: error instanceof Error ? error.message : "Une erreur est survenue"
      });
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background">
        <header className="header-gradient shadow-md sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <BarChart3 className="h-8 w-8 text-white mr-3" />
                <h1 className="text-xl font-semibold text-white">AN Vote Analyser</h1>
              </div>
              <div className="flex items-center space-x-4">
                <LegislatureSelector 
                  selectedLegislature={selectedLegislature} 
                  onSelectLegislature={handleLegislatureChange} 
                />
              </div>
            </div>
          </div>
        </header>

        <MainNavigation />

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
              <div className="flex justify-center items-center space-x-4">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={showHelp} 
                  className="flex items-center text-xs"
                >
                  <HelpCircle className="mr-1 h-3 w-3" />
                  Comment rechercher un député ?
                </Button>
                <div className="text-sm font-medium text-gray-700">
                  {selectedLegislature}e législature
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSyncDeputies}
                  className="flex items-center text-xs"
                >
                  <User className="mr-1 h-3 w-3" />
                  Synchroniser les députés
                </Button>
              </div>
            </div>
            
            <SearchBar 
              onSearch={handleSearchDepute} 
              onSelectDepute={handleSelectDepute}
              isLoading={isLoading} 
              searchResult={searchResult}
              legislature={selectedLegislature}
            />
            
            {status.status !== 'idle' && (
              <div className="max-w-md mx-auto mt-4">
                <StatusCard status={status} />
              </div>
            )}
          </section>

          {deputeInfo && (
            <section className="mt-8">
              <div className="content-container">
                <div className="flex items-center space-x-4">
                  <div className="bg-gray-100 p-3 rounded-full">
                    <User className="h-8 w-8 text-gray-600" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-2xl font-bold text-gray-900">
                        {deputeInfo.prenom || '[Prénom]'} {deputeInfo.nom || '[Nom]'}
                        {(!deputeInfo.prenom && !deputeInfo.nom) && (
                          <span className="text-sm font-normal text-red-500 ml-2">(Nom non disponible)</span>
                        )}
                      </h2>
                      {deputeInfo.groupe_politique && (
                        <PoliticalGroupBadge 
                          groupe={deputeInfo.groupe_politique} 
                          className="ml-2"
                        />
                      )}
                    </div>
                    <div className="text-gray-600 flex items-center mt-1">
                      <span className="text-sm">
                        {deputeInfo.profession || 'Profession non renseignée'} • ID: <span className="font-mono">{deputeInfo.id}</span>
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

        <footer className="bg-[#003366] text-white py-8 mt-12">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-sm text-center">
              Données issues de l'open data de l'Assemblée nationale française <br />
              <span className="text-[#00a1cf]">Mise à jour toutes les 48 heures via API</span> <br />
              <a 
                href="https://data.assemblee-nationale.fr" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[#00a1cf] hover:underline"
              >
                data.assemblee-nationale.fr
              </a>
              <br />
              <span className="mt-3 block pt-2 border-t border-[#00539b] text-xs">
                Développé par <a 
                  href="https://x.com/Cresson_Ni" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[#00a1cf] hover:underline"
                >
                  Cresson Nicolas
                </a>
              </span>
            </p>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
};

export default Index;
