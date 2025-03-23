
import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import { getGroupVoteDetail } from '@/utils/apiService';
import { getGroupePolitiqueCouleur, GroupVoteDetail, VotePosition } from '@/utils/types';
import { 
  positionIcons, 
  positionLabels, 
  positionClasses, 
  normalizePosition, 
  getPositionCounts 
} from './voteDetailsUtils';

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
  
  const renderGroupsSummary = () => {
    if (voteDetails.groupes && Array.isArray(voteDetails.groupes) && voteDetails.groupes.length > 0) {
      return voteDetails.groupes.map((groupe: any) => {
        const groupId = groupe.organeRef || groupe.uid;
        const nomGroupe = groupe.nom || groupe.libelle || 'Groupe inconnu';
        const positionMajoritaire = normalizePosition(groupe.positionMajoritaire || groupe.position_majoritaire);
        
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
                onClick={() => {
                  setSelectedTab('details');
                  if (!groupsData[groupId]) {
                    toast.info(`Chargement des détails pour ${nomGroupe}...`);
                    getGroupVoteDetail(groupId, voteId, legislature)
                      .then(details => {
                        setGroupsData(prev => ({
                          ...prev,
                          [groupId]: details
                        }));
                      })
                      .catch(err => {
                        toast.error(`Erreur lors du chargement des détails pour ${nomGroupe}`);
                        console.error(err);
                      });
                  }
                }}
              >
                <Info size={16} />
              </Button>
            </TableCell>
          </TableRow>
        );
      });
    }
    else if (voteDetails.groupes && typeof voteDetails.groupes === 'object') {
      return Object.entries(voteDetails.groupes).map(([groupId, groupe]: [string, any]) => {
        const nomGroupe = groupe.libelle || groupe.nom || 'Groupe inconnu';
        const positionMajoritaire = normalizePosition(groupe.position_majoritaire || groupe.positionMajoritaire || 'absent');
        
        const pourCount = groupe.pours?.length || 0;
        const contreCount = groupe.contres?.length || 0;
        const abstentionCount = groupe.abstentions?.length || 0;
        const absentCount = groupe.nonVotants?.length || 0;
        
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
              {pourCount}
            </TableCell>
            <TableCell className="text-center font-medium text-vote-contre">
              {contreCount}
            </TableCell>
            <TableCell className="text-center font-medium text-vote-abstention">
              {abstentionCount}
            </TableCell>
            <TableCell className="text-center font-medium text-vote-absent">
              {absentCount}
            </TableCell>
            <TableCell className="text-center">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setSelectedTab('details');
                  if (!groupsData[groupId]) {
                    toast.info(`Chargement des détails pour ${nomGroupe}...`);
                    getGroupVoteDetail(groupId, voteId, legislature)
                      .then(details => {
                        setGroupsData(prev => ({
                          ...prev,
                          [groupId]: details
                        }));
                      })
                      .catch(err => {
                        toast.error(`Erreur lors du chargement des détails pour ${nomGroupe}`);
                        console.error(err);
                      });
                  }
                }}
              >
                <Info size={16} />
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
