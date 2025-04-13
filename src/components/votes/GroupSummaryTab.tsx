
import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Info, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getGroupVoteDetail } from '@/utils/apiService';
import { getGroupePolitiqueCouleur, GroupVoteDetail, VotePosition } from '@/utils/types';
import { 
  positionIcons, 
  positionLabels, 
  positionClasses, 
  normalizePosition, 
  getPositionCounts,
  getGroupName,
  processGroupsFromVoteDetail
} from './voteDetailsUtils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface GroupSummaryTabProps {
  voteDetails: any;
  voteId: string;
  legislature: string;
  groupsData: Record<string, GroupVoteDetail>;
  setGroupsData: React.Dispatch<React.SetStateAction<Record<string, GroupVoteDetail>>>;
  setSelectedTab: React.Dispatch<React.SetStateAction<string>>;
}

const GroupSummaryTab: React.FC<GroupSummaryTabProps> = ({
  voteDetails,
  voteId,
  legislature,
  groupsData,
  setGroupsData,
  setSelectedTab
}) => {
  
  const [isLoading, setIsLoading] = React.useState<Record<string, boolean>>({});
  
  // Process group data if groupsData is empty
  React.useEffect(() => {
    if (Object.keys(groupsData).length === 0 && voteDetails) {
      const initialGroups = processGroupsFromVoteDetail(voteDetails);
      if (Object.keys(initialGroups).length > 0) {
        setGroupsData(initialGroups);
      }
    }
  }, [voteDetails, groupsData, setGroupsData]);
  
  const loadGroupDetails = async (groupId: string, nomGroupe: string) => {
    if (groupsData[groupId]) {
      setSelectedTab('details');
      return;
    }

    try {
      setIsLoading(prev => ({ ...prev, [groupId]: true }));
      toast.info(`Chargement des détails pour ${nomGroupe}...`);
      
      const details = await getGroupVoteDetail(groupId, voteId, legislature);
      console.log(`Received details for group ${nomGroupe}:`, details);
      
      if (details) {
        setGroupsData(prev => ({
          ...prev,
          [groupId]: details
        }));
        setSelectedTab('details');
      } else {
        toast.error(`Erreur: Données vides pour ${nomGroupe}`);
      }
    } catch (err) {
      console.error(`Error fetching details for group ${nomGroupe}:`, err);
      toast.error(`Erreur lors du chargement des détails pour ${nomGroupe}`, {
        description: err instanceof Error ? err.message : 'Une erreur inconnue est survenue'
      });
    } finally {
      setIsLoading(prev => ({ ...prev, [groupId]: false }));
    }
  };
  
  const renderGroupsSummary = () => {
    // Handle undefined voteDetails
    if (!voteDetails) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="text-center py-8 text-gray-500">
            Chargement des données en cours...
          </TableCell>
        </TableRow>
      );
    }
    
    // Display error if no groups data is available
    if ((!voteDetails.groupes || !Array.isArray(voteDetails.groupes) || voteDetails.groupes.length === 0) && 
        (!voteDetails.groupes || typeof voteDetails.groupes !== 'object' || Object.keys(voteDetails.groupes).length === 0)) {
      return (
        <TableRow>
          <TableCell colSpan={7}>
            <Alert variant="warning" className="my-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Aucune donnée de groupe disponible</AlertTitle>
              <AlertDescription>
                Aucune information sur les groupes politiques n'a été trouvée pour ce scrutin.
              </AlertDescription>
            </Alert>
          </TableCell>
        </TableRow>
      );
    }
    
    // Special handling for scrutin_votes_detail format
    if (voteDetails.groupes && Array.isArray(voteDetails.groupes) && voteDetails.scrutin_numero) {
      return voteDetails.groupes.map((groupe: any) => {
        const groupId = groupe.organeRef || groupe.uid;
        const nomGroupe = getGroupName(groupe);
        const positionMajoritaire = normalizePosition(groupe.positionMajoritaire || groupe.position_majoritaire);
        
        // Calculate vote counts from the votes object
        let pour = 0;
        let contre = 0;
        let abstention = 0;
        let absent = 0;
        
        if (groupe.votes) {
          // Pour counts
          if (groupe.votes.pours && groupe.votes.pours.votant) {
            pour = Array.isArray(groupe.votes.pours.votant) 
              ? groupe.votes.pours.votant.length 
              : 1; // If there's a single votant, it's not in an array
          }
          
          // Contre counts
          if (groupe.votes.contres && groupe.votes.contres.votant) {
            contre = Array.isArray(groupe.votes.contres.votant) 
              ? groupe.votes.contres.votant.length 
              : 1;
          }
          
          // Abstention counts
          if (groupe.votes.abstentions && groupe.votes.abstentions.votant) {
            abstention = Array.isArray(groupe.votes.abstentions.votant) 
              ? groupe.votes.abstentions.votant.length 
              : 1;
          }
          
          // NonVotants counts
          if (groupe.votes.nonVotants && groupe.votes.nonVotants.votant) {
            absent = Array.isArray(groupe.votes.nonVotants.votant) 
              ? groupe.votes.nonVotants.votant.length 
              : 1;
          }
        }
        
        const counts = { pour, contre, abstention, absent };
        
        return (
          <TableRow key={groupId}>
            <TableCell>
              <Link 
                to={`/groupes/${groupId}`}
                className="font-medium hover:text-primary flex items-center"
              >
                <div 
                  className="w-3 h-3 rounded-full mr-2" 
                  style={{ 
                    backgroundColor: getGroupePolitiqueCouleur(nomGroupe)
                  }}
                />
                {nomGroupe}
              </Link>
            </TableCell>
            <TableCell className="text-center">
              <div className="flex items-center justify-center space-x-1">
                {positionIcons[positionMajoritaire]}
                <span className={`font-medium ${positionClasses[positionMajoritaire]}`}>
                  {positionLabels[positionMajoritaire]}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-center font-medium text-vote-pour">
              {counts.pour}
            </TableCell>
            <TableCell className="text-center font-medium text-vote-contre">
              {counts.contre}
            </TableCell>
            <TableCell className="text-center font-medium text-vote-abstention">
              {counts.abstention}
            </TableCell>
            <TableCell className="text-center font-medium text-vote-absent">
              {counts.absent}
            </TableCell>
            <TableCell className="text-center">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => loadGroupDetails(groupId, nomGroupe)}
                disabled={isLoading[groupId]}
                className={isLoading[groupId] ? "opacity-50 cursor-not-allowed" : ""}
              >
                {isLoading[groupId] ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                ) : (
                  <Info size={16} />
                )}
              </Button>
            </TableCell>
          </TableRow>
        );
      });
    }
    
    // Standard format handling (original code)
    else if (voteDetails.groupes && typeof voteDetails.groupes === 'object') {
      return Object.entries(voteDetails.groupes).map(([groupId, groupe]: [string, any]) => {
        const nomGroupe = getGroupName(groupe);
        const positionMajoritaire = normalizePosition(groupe.position_majoritaire || groupe.positionMajoritaire || 'absent');
        
        const counts = getPositionCounts(groupe);
        
        return (
          <TableRow key={groupId}>
            <TableCell>
              <Link 
                to={`/groupes/${groupId}`}
                className="font-medium hover:text-primary flex items-center"
              >
                <div 
                  className="w-3 h-3 rounded-full mr-2" 
                  style={{ 
                    backgroundColor: getGroupePolitiqueCouleur(nomGroupe)
                  }}
                />
                {nomGroupe}
              </Link>
            </TableCell>
            <TableCell className="text-center">
              <div className="flex items-center justify-center space-x-1">
                {positionIcons[positionMajoritaire]}
                <span className={`font-medium ${positionClasses[positionMajoritaire]}`}>
                  {positionLabels[positionMajoritaire]}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-center font-medium text-vote-pour">
              {counts.pour}
            </TableCell>
            <TableCell className="text-center font-medium text-vote-contre">
              {counts.contre}
            </TableCell>
            <TableCell className="text-center font-medium text-vote-abstention">
              {counts.abstention}
            </TableCell>
            <TableCell className="text-center font-medium text-vote-absent">
              {counts.absent}
            </TableCell>
            <TableCell className="text-center">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => loadGroupDetails(groupId, nomGroupe)}
                disabled={isLoading[groupId]}
                className={isLoading[groupId] ? "opacity-50 cursor-not-allowed" : ""}
              >
                {isLoading[groupId] ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                ) : (
                  <Info size={16} />
                )}
              </Button>
            </TableCell>
          </TableRow>
        );
      });
    }
    
    return (
      <TableRow>
        <TableCell colSpan={7} className="text-center py-8 text-gray-500">
          Aucune donnée disponible pour ce scrutin
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Positions par groupe politique</CardTitle>
        <CardDescription>
          Vue d'ensemble des positions de vote par groupe politique
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3">Groupe politique</TableHead>
                <TableHead className="text-center">Position majoritaire</TableHead>
                <TableHead className="text-center">Pour</TableHead>
                <TableHead className="text-center">Contre</TableHead>
                <TableHead className="text-center">Abstention</TableHead>
                <TableHead className="text-center">Non-votant</TableHead>
                <TableHead className="text-center w-20">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {renderGroupsSummary()}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default GroupSummaryTab;
