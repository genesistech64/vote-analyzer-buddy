
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartPieIcon, ListChecks, Users } from 'lucide-react';
import { GroupVoteDetail } from '@/utils/types';
import GroupSummaryTab from './GroupSummaryTab';
import DeputiesDetailTab from './DeputiesDetailTab';

interface VoteDetailsTabsProps {
  groupsData: Record<string, GroupVoteDetail>;
  setGroupsData: React.Dispatch<React.SetStateAction<Record<string, GroupVoteDetail>>>;
  voteId: string;
  legislature: string;
}

const VoteDetailsTabs: React.FC<VoteDetailsTabsProps> = ({
  groupsData,
  setGroupsData,
  voteId,
  legislature
}) => {
  return (
    <Tabs defaultValue="groups" className="mb-8">
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
        />
      </TabsContent>
      
      <TabsContent value="deputies">
        <DeputiesDetailTab 
          groupsData={groupsData}
          legislature={legislature}
        />
      </TabsContent>
    </Tabs>
  );
};

export default VoteDetailsTabs;
