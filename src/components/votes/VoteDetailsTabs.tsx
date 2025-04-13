
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartPieIcon, Users } from 'lucide-react';
import { GroupVoteDetail } from '@/utils/types';
import GroupSummaryTab from './GroupSummaryTab';
import DeputiesDetailTab from './DeputiesDetailTab';
import { Toaster } from '@/components/ui/sonner';

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
  // Make sure voteDetails is not null/undefined before rendering the tabs
  if (!voteDetails) {
    return null;
  }

  return (
    <>
      <Toaster />
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
          />
        </TabsContent>
      </Tabs>
    </>
  );
};

export default VoteDetailsTabs;
