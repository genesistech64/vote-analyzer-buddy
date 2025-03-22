
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getDeputesByOrgane } from '@/utils/apiService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, AlertTriangle, Users } from 'lucide-react';
import MainNavigation from '@/components/MainNavigation';
import { DeputesParGroupe, DeputeInfo, getGroupePolitiqueCouleur } from '@/utils/types';
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from '@/components/ui/pagination';
import PoliticalGroupBadge from '@/components/PoliticalGroupBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const PoliticalGroupMembers = () => {
  const { groupId, groupName } = useParams<{ 
    groupId: string;
    groupName: string;
  }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupeData, setGroupeData] = useState<DeputesParGroupe | null>(null);
  const [page, setPage] = useState(1);
  const itemsPerPage = 12;

  // Fonction pour décoder les paramètres d'URL
  const decodeParam = (param?: string): string => {
    if (!param) return '';
    return decodeURIComponent(param);
  };

  useEffect(() => {
    const loadGroupData = async () => {
      if (!groupId) {
        setError(`Identifiant de groupe manquant`);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const decodedGroupName = decodeParam(groupName);
        
        console.log(`[PoliticalGroupMembers] Loading data for group: ${groupId}, ${decodedGroupName}`);
        
        // Récupérer les députés du groupe
        const data = await getDeputesByOrgane(groupId, decodedGroupName, 'GP');
        console.log(`[PoliticalGroupMembers] Fetched ${data.deputes.length} deputies for group ${groupId}`, data);
        
        setGroupeData(data);
        
        if (data.deputes.length === 0) {
          toast.warning(
            "Aucun député trouvé", 
            { description: `Aucun député trouvé dans ce groupe politique.` }
          );
        } else {
          toast.success(
            "Données chargées avec succès", 
            { description: `${data.deputes.length} députés trouvés dans "${data.organeInfo.nom}"` }
          );
        }
      } catch (error) {
        console.error('[PoliticalGroupMembers] Error loading group data:', error);
        const errorMessage = error instanceof Error ? error.message : "Une erreur est survenue lors du chargement des données.";
        setError(errorMessage);
        
        toast.error(
          "Erreur de chargement", 
          { description: errorMessage }
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadGroupData();
  }, [groupId, groupName]);

  const goBack = () => {
    navigate(-1);
  };

  const navigateToDeputy = (deputyId: string) => {
    navigate(`/deputy/${deputyId}`);
  };

  // Pagination
  const totalPages = groupeData ? Math.ceil(groupeData.deputes.length / itemsPerPage) : 0;
  const currentData = groupeData ? 
    groupeData.deputes.slice((page - 1) * itemsPerPage, page * itemsPerPage) : 
    [];

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo(0, 0);
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
              Retour
            </Button>
            <h1 className="text-xl font-semibold text-gray-900">
              {groupName && `Groupe ${decodeParam(groupName)}`}
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

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="h-12 w-12 border-4 border-t-transparent border-primary rounded-full animate-spin"></div>
          </div>
        ) : groupeData ? (
          <>
            <section>
              <Card className="overflow-hidden">
                <CardHeader 
                  className="bg-gray-50 border-b border-gray-100" 
                  style={{
                    backgroundColor: getGroupePolitiqueCouleur(groupeData.organeInfo.nom) + '20' // Add 20% opacity version of group color
                  }}
                >
                  <div className="flex items-center space-x-4">
                    <div className="bg-white p-3 rounded-full shadow-sm">
                      <Users className="h-10 w-10" style={{color: getGroupePolitiqueCouleur(groupeData.organeInfo.nom)}} />
                    </div>
                    <div>
                      <CardTitle className="flex items-center">
                        {groupeData.organeInfo.nom}
                        <PoliticalGroupBadge
                          groupe={groupeData.organeInfo.nom}
                          className="ml-3"
                        />
                      </CardTitle>
                      {groupeData.organeInfo.legislature && (
                        <p className="text-sm text-gray-500">
                          Législature: {groupeData.organeInfo.legislature}
                        </p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <h3 className="text-lg font-semibold mb-4 text-gray-800">
                    {groupeData.deputes.length} {groupeData.deputes.length > 1 ? 'députés' : 'député'}
                  </h3>
                  
                  <Tabs defaultValue="grid" className="w-full mb-6">
                    <TabsList className="mb-4">
                      <TabsTrigger value="grid">Affichage Grille</TabsTrigger>
                      <TabsTrigger value="list">Affichage Liste</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="grid" className="w-full">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {currentData.map((depute, index) => (
                          <Card 
                            key={index} 
                            className="hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
                            onClick={() => navigateToDeputy(depute.id)}
                          >
                            <div className="h-2" style={{backgroundColor: getGroupePolitiqueCouleur(groupeData.organeInfo.nom)}}></div>
                            <CardContent className="p-4">
                              <h4 className="font-semibold">{depute.prenom} {depute.nom}</h4>
                              {depute.profession && (
                                <p className="text-xs text-gray-500 mt-1 truncate">{depute.profession}</p>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="list">
                      <div className="border rounded-md divide-y">
                        {currentData.map((depute, index) => (
                          <div 
                            key={index} 
                            className="p-4 hover:bg-gray-50 cursor-pointer transition-colors flex justify-between items-center"
                            onClick={() => navigateToDeputy(depute.id)}
                          >
                            <div>
                              <h4 className="font-medium">{depute.prenom} {depute.nom}</h4>
                              {depute.profession && (
                                <p className="text-sm text-gray-500">{depute.profession}</p>
                              )}
                            </div>
                            <ArrowLeft className="h-4 w-4 text-gray-400 transform rotate-180" />
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  </Tabs>
                  
                  {totalPages > 1 && (
                    <Pagination className="mt-6">
                      <PaginationContent>
                        {page > 1 && (
                          <PaginationItem>
                            <PaginationLink onClick={() => handlePageChange(page - 1)}>
                              Précédent
                            </PaginationLink>
                          </PaginationItem>
                        )}
                        
                        {Array.from({length: Math.min(totalPages, 5)}).map((_, i) => {
                          // Logique pour afficher les pages proches de la page courante
                          let pageNum = i + 1;
                          if (totalPages > 5) {
                            if (page > 3 && page <= totalPages - 2) {
                              pageNum = page - 2 + i;
                            } else if (page > totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            }
                          }
                          
                          return (
                            <PaginationItem key={i}>
                              <PaginationLink 
                                isActive={page === pageNum}
                                onClick={() => handlePageChange(pageNum)}
                              >
                                {pageNum}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        })}
                        
                        {page < totalPages && (
                          <PaginationItem>
                            <PaginationLink onClick={() => handlePageChange(page + 1)}>
                              Suivant
                            </PaginationLink>
                          </PaginationItem>
                        )}
                      </PaginationContent>
                    </Pagination>
                  )}
                </CardContent>
              </Card>
            </section>
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">Aucune information trouvée pour ce groupe politique</p>
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

export default PoliticalGroupMembers;
