
import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartPieIcon, Users, AlertTriangle, AlertCircle } from 'lucide-react';
import { GroupVoteDetail } from '@/utils/types';
import GroupSummaryTab from './GroupSummaryTab';
import DeputiesDetailTab from './DeputiesDetailTab';
import { Toaster } from '@/components/ui/sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { debugDatabaseState } from '@/utils/deputySupabaseService';
import { toast } from 'sonner';

// Configuration pour le debug
const DEBUG = true;
const LOG_PREFIX = '[VoteDetailsTabs]';

// Fonction utilitaire pour les logs
const log = (message: string, data?: any) => {
  if (DEBUG) {
    if (data) {
      console.log(`${LOG_PREFIX} ${message}`, data);
    } else {
      console.log(`${LOG_PREFIX} ${message}`);
    }
  }
};

interface VoteDetailsTabsProps {
  groupsData: Record<string, GroupVoteDetail>;
  setGroupsData: React.Dispatch<React.SetStateAction<Record<string, GroupVoteDetail>>>;
  voteId: string;
  legislature: string;
  voteDetails: any; // Using any type for now since we don't have a specific type for the voteDetails
  selectedTab: string;
  setSelectedTab: React.Dispatch<React.SetStateAction<string>>;
}

const VoteDetailsTabs: React.FC<VoteDetailsTabsProps> = ({
  groupsData,
  setGroupsData,
  voteId,
  legislature,
  voteDetails,
  selectedTab,
  setSelectedTab
}) => {
  const [databaseState, setDatabaseState] = useState<{
    totalDeputies: number;
    tableExists: boolean;
    randomSample: any[];
    error?: string;
  } | null>(null);
  
  const [apiDataError, setApiDataError] = useState<boolean>(false);
  
  useEffect(() => {
    log('Initialisation du composant avec les props suivantes:', { 
      voteId, 
      legislature, 
      selectedTab,
      groupsDataKeys: Object.keys(groupsData)
    });
    
    // Vérifier l'état de la base de données au chargement
    const checkDatabaseState = async () => {
      try {
        const state = await debugDatabaseState(legislature);
        setDatabaseState(state);
        
        log('État de la base de données:', state);
        
        if (state.error) {
          console.error(`${LOG_PREFIX} Erreur lors de la vérification de la base de données:`, state.error);
          toast.error('Erreur de base de données', {
            description: `Impossible de vérifier l'état de la base de données: ${state.error}`
          });
        } else if (state.totalDeputies === 0) {
          log('La table deputies est vide! Synchronisation nécessaire.');
        }
        
        // Vérifier si les logs indiquent un problème d'accès à l'API externe
        checkApiLogs();
      } catch (err) {
        console.error(`${LOG_PREFIX} Exception lors de la vérification de la base de données:`, err);
      }
    };
    
    const checkApiLogs = async () => {
      try {
        // Simuler la vérification des logs d'API
        const { supabase } = await import('@/integrations/supabase/client');
        const { data, error } = await supabase
          .from('data_sync')
          .select('*')
          .order('last_sync', { ascending: false })
          .limit(1);
          
        if (error) {
          console.error(`${LOG_PREFIX} Erreur lors de la vérification des logs d'API:`, error);
          return;
        }
        
        if (data && data.length > 0) {
          const latestSync = data[0];
          if (latestSync.status === 'error' && latestSync.logs) {
            if (latestSync.logs.includes('404') || latestSync.logs.includes('No deputies fetched')) {
              log('Les logs indiquent des problèmes d\'accès à l\'API externe');
              setApiDataError(true);
            }
          }
        }
      } catch (err) {
        console.error(`${LOG_PREFIX} Exception lors de la vérification des logs:`, err);
      }
    };
    
    checkDatabaseState();
  }, [legislature]);
  
  // Make sure voteDetails is not null/undefined before rendering the tabs
  if (!voteDetails) {
    log('Pas de détails de vote disponibles, arrêt du rendu');
    return null;
  }

  log('Rendu du composant avec les données suivantes:', { 
    nombreGroupes: Object.keys(groupsData).length,
    premiersGroupes: Object.keys(groupsData).slice(0, 3),
    ongletActif: selectedTab 
  });

  return (
    <>
      <Toaster />
      {apiDataError && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Problème de connexion à l'API de l'Assemblée Nationale</AlertTitle>
          <AlertDescription>
            Impossible d'accéder aux données de l'API de l'Assemblée Nationale. Les serveurs de l'Assemblée semblent inaccessibles. 
            Les noms des députés ne peuvent pas être affichés pour le moment.
          </AlertDescription>
        </Alert>
      )}
      
      {databaseState && databaseState.totalDeputies === 0 && selectedTab === 'deputies' && (
        <Alert variant="warning" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Base de données vide</AlertTitle>
          <AlertDescription>
            La base de données des députés est vide. Pour voir les noms des députés, veuillez synchroniser la base de données en cliquant sur le bouton "Synchroniser les députés" dans l'onglet ci-dessous.
            {apiDataError && (
              <div className="mt-2 text-red-600">
                Note: La synchronisation risque d'échouer car les serveurs de l'API de l'Assemblée Nationale semblent inaccessibles pour le moment.
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
      
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mb-8">
        <TabsList className="grid w-full grid-cols-2 mb-5">
          <TabsTrigger value="groups" className="flex items-center gap-2">
            <ChartPieIcon className="h-4 w-4" />
            <span>Résumé par groupe</span>
          </TabsTrigger>
          <TabsTrigger value="deputies" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>Détail par député</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="groups">
          <GroupSummaryTab 
            groupsData={groupsData} 
            setGroupsData={setGroupsData} 
            voteId={voteId}
            legislature={legislature}
            voteDetails={voteDetails}
            setSelectedTab={setSelectedTab}
          />
        </TabsContent>
        
        <TabsContent value="deputies">
          <DeputiesDetailTab 
            groupsData={groupsData}
            legislature={legislature}
            voteDetails={voteDetails}
            apiDataError={apiDataError}
          />
        </TabsContent>
      </Tabs>
    </>
  );
};

export default VoteDetailsTabs;
