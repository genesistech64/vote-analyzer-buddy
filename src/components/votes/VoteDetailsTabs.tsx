
import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartPieIcon, Users, RefreshCw } from 'lucide-react';
import { GroupVoteDetail } from '@/utils/types';
import GroupSummaryTab from './GroupSummaryTab';
import DeputiesDetailTab from './DeputiesDetailTab';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { triggerDeputiesSync } from '@/utils/deputySupabaseService';
import { toast } from 'sonner';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

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
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  
  // Check if we have local storage data for last sync time
  useEffect(() => {
    try {
      const lastSyncTime = localStorage.getItem('deputies_last_sync');
      if (lastSyncTime) {
        setLastSync(new Date(parseInt(lastSyncTime)));
      }
    } catch (e) {
      console.error('Error reading last sync time:', e);
    }
  }, []);
  
  // Make sure voteDetails is not null/undefined before rendering the tabs
  if (!voteDetails) {
    return null;
  }

  const handleSyncDeputies = async (forceRefresh: boolean = false) => {
    setIsSyncing(true);
    
    const actionText = forceRefresh ? 'Actualisation complète' : 'Rafraîchissement du cache';
    
    toast.info(`${actionText} en cours...`, {
      description: "Cette opération peut prendre quelques instants."
    });
    
    try {
      const result = await triggerDeputiesSync(legislature, forceRefresh);
      
      if (result.success) {
        // Update last sync time in local storage
        localStorage.setItem('deputies_last_sync', Date.now().toString());
        setLastSync(new Date());
        
        // Show appropriate message based on force refresh
        if (forceRefresh) {
          toast.success("Actualisation complète réussie", {
            description: `${result.deputies_count || 0} députés ont été synchronisés.`
          });
        } else {
          toast.success("Cache mis à jour", {
            description: `${result.deputies_count || 0} députés ont été mis à jour dans le cache.`
          });
        }
      } else {
        const errorDetails = result.fetch_errors && result.fetch_errors.length > 0 
          ? `Les sources suivantes ont échoué: ${result.fetch_errors.join(', ')}` 
          : result.message;
        
        toast.error("Échec de la synchronisation", {
          description: errorDetails || "Erreur inconnue"
        });
      }
    } catch (error) {
      console.error("Erreur lors de la synchronisation:", error);
      toast.error("Erreur inattendue", {
        description: error instanceof Error ? error.message : "Erreur inconnue"
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Format relative time for last sync
  const getRelativeTimeString = () => {
    if (!lastSync) return "Jamais";
    
    const now = new Date();
    const diffMs = now.getTime() - lastSync.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Il y a moins d'une minute";
    if (diffMins < 60) return `Il y a ${diffMins} minute${diffMins > 1 ? 's' : ''}`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
  };

  return (
    <>
      <Toaster />
      <div className="flex justify-between items-center mb-4">
        <div className="flex-1">
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
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
              />
            </TabsContent>
          </Tabs>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="ml-4" 
              disabled={isSyncing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Synchronisation...' : 'Rafraîchir le cache'}
              {!isSyncing && lastSync && <span className="sr-only"> (Dernière: {getRelativeTimeString()})</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Dernière mise à jour: {getRelativeTimeString()}
            </div>
            <DropdownMenuItem onClick={() => handleSyncDeputies(false)}>
              Rafraîchir le cache
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSyncDeputies(true)}>
              Actualisation complète
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
};

export default VoteDetailsTabs;
