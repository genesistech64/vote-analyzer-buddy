
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getDeputesByOrgane } from '@/utils/apiService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, AlertTriangle, Users } from 'lucide-react';
import MainNavigation from '@/components/MainNavigation';
import { DeputesParGroupe, DeputeInfo } from '@/utils/types';
import { Badge } from '@/components/ui/badge';

const OrganeMembers = () => {
  const { organeId, organeNom, organeType } = useParams<{ 
    organeId: string;
    organeNom: string;
    organeType: string;
  }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupeData, setGroupeData] = useState<DeputesParGroupe | null>(null);

  // Fonction pour décoder les paramètres d'URL
  const decodeParam = (param?: string): string => {
    if (!param) return '';
    return decodeURIComponent(param);
  };

  useEffect(() => {
    const loadOrganeData = async () => {
      if (!organeId || !organeNom || !organeType) {
        setError("Informations de l'organe manquantes");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const decodedOrganeNom = decodeParam(organeNom);
        const decodedOrganeType = decodeParam(organeType);
        
        console.log(`[OrganeMembers] Loading data for organe: ${organeId}, ${decodedOrganeNom}, ${decodedOrganeType}`);
        
        // Récupérer les députés de l'organe
        const data = await getDeputesByOrgane(organeId, decodedOrganeNom, decodedOrganeType);
        console.log(`[OrganeMembers] Fetched ${data.deputes.length} deputies for organe ${organeId}`);
        
        setGroupeData(data);
        
        if (data.deputes.length === 0) {
          toast.warning(
            "Aucun député trouvé", 
            { description: `Aucun député trouvé dans cet organe.` }
          );
        } else {
          toast.success(
            "Données chargées avec succès", 
            { description: `${data.deputes.length} députés trouvés dans "${data.organeInfo.nom}"` }
          );
        }
      } catch (error) {
        console.error('[OrganeMembers] Error loading organe data:', error);
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

    loadOrganeData();
  }, [organeId, organeNom, organeType]);

  const goBack = () => {
    navigate(-1);
  };

  const navigateToDeputy = (deputyId: string) => {
    navigate(`/deputy/${deputyId}`);
  };

  // Fonction pour afficher le type d'organe de manière plus lisible
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
              Liste des députés
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
                <CardHeader className="bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center space-x-4">
                    <div className="bg-white p-3 rounded-full shadow-sm">
                      <Users className="h-10 w-10 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="flex items-center">
                        {groupeData.organeInfo.nom}
                        <Badge variant="outline" className="ml-3">
                          {getOrganeTypeLabel(groupeData.organeInfo.type)}
                        </Badge>
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
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupeData.deputes.map((depute, index) => (
                      <Card 
                        key={index} 
                        className="hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => navigateToDeputy(depute.id)}
                      >
                        <CardContent className="p-4">
                          <h4 className="font-semibold">{depute.prenom} {depute.nom}</h4>
                          <p className="text-sm text-gray-500">ID: {depute.id}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">Aucune information trouvée pour cet organe</p>
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

export default OrganeMembers;
