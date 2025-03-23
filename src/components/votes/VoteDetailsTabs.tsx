
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Users } from 'lucide-react';
import { GroupVoteDetail } from '@/utils/types';
import GroupSummaryTab from './GroupSummaryTab';
import DeputiesDetailTab from './DeputiesDetailTab';

interface VoteDetailsTabsProps {
  selectedTab: string;
  setSelectedTab: React.Dispatch<React.SetStateAction<string>>;
  voteDetails: any;
  voteId: string;
  legislature: string;
  groupsData: Record<string, GroupVoteDetail>;
  setGroupsData: React.Dispatch<React.SetStateAction<Record<string, GroupVoteDetail>>>;
}

const VoteDetailsTabs: React.FC<VoteDetailsTabsProps> = ({
  selectedTab,
  setSelectedTab,
  voteDetails,
  voteId,
  legislature,
  groupsData,
  setGroupsData
}) => {
  return (
    <Tabs value={selectedTab} onValueChange={setSelectedTab}>
      <TabsList className="w-full sm:w-auto">
        <TabsTrigger value="summary" className="flex items-center">
          <BarChart3 size={16} className="mr-2" />
          Résumé par groupe
        </TabsTrigger>
        <TabsTrigger value="details" className="flex items-center">
          <Users size={16} className="mr-2" />
          Détail des députés
        </TabsTrigger>
      </TabsList>

      <TabsContent value="summary" className="mt-6">
        <GroupSummaryTab 
          voteDetails={voteDetails} 
          voteId={voteId || ''} 
          legislature={legislature}
          groupsData={groupsData}
          setGroupsData={setGroupsData}
          setSelectedTab={setSelectedTab}
        />
      </TabsContent>

      <TabsContent value="details" className="mt-6">
        <DeputiesDetailTab groupsData={groupsData} />
      </TabsContent>
    </Tabs>
  );
};

export default VoteDetailsTabs;
