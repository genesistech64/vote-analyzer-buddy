
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
  
  // Make sure voteDetails is not null/undefined before rendering the tabs
  if (!voteDetails) {
    return null;
  }

  const handleSyncDeputies = async () => {
    setIsSyncing(true);
    toast.info("Synchronisation des députés en cours...", {
      description: "Cette opération peut prendre quelques instants."
    });
    
    try {
      const result = await triggerDeputiesSync(legislature, true);
      
      if (result.success) {
        toast.success("Synchronisation réussie", {
          description: `${result.deputies_count || 0} députés ont été synchronisés.`
        });
      } else {
        toast.error("Échec de la synchronisation", {
          description: result.message || "Erreur inconnue"
        });
      }
    } catch (error) {
      console.error("Erreur lors de la synchronisation:", error);
      toast.error("Erreur lors de la synchronisation", {
        description: error instanceof Error ? error.message : "Erreur inconnue"
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      <Toaster />
      <div className="flex justify-between items-center mb-4">
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex-1">
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
        </Tabs>
        <Button 
          variant="outline" 
          size="sm" 
          className="ml-4" 
          onClick={handleSyncDeputies}
          disabled={isSyncing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Synchronisation...' : 'Synchroniser les députés'}
        </Button>
      </div>
      
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
    </>
  );
};

export default VoteDetailsTabs;
