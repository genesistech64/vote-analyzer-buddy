
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { GroupVoteDetail, getGroupePolitiqueCouleur } from '@/utils/types';
import { 
  positionIcons, 
  positionLabels, 
  positionClasses,
  processDeputiesFromVoteDetail,
  getGroupName
} from './voteDetailsUtils';
import { prefetchDeputies, formatDeputyName } from '@/utils/deputyCache';

interface DeputiesDetailTabProps {
  groupsData: Record<string, GroupVoteDetail>;
}

const DeputiesDetailTab: React.FC<DeputiesDetailTabProps> = ({ groupsData }) => {
  // Extract all deputy IDs from groupsData for prefetching
  useEffect(() => {
    if (Object.keys(groupsData).length > 0) {
      const allDeputyIds: string[] = [];
      
      Object.values(groupsData).forEach(groupDetail => {
        if (!groupDetail) return;
        
        // Process deputies from each voting position in the group
        if (groupDetail.votes) {
          // Process "pour" votes
          if (groupDetail.votes.pours && groupDetail.votes.pours.votant) {
            const votants = Array.isArray(groupDetail.votes.pours.votant) 
              ? groupDetail.votes.pours.votant 
              : [groupDetail.votes.pours.votant];
              
            votants.forEach(votant => {
              if (votant.acteurRef) {
                const deputyId = typeof votant.acteurRef === 'object' 
                  ? votant.acteurRef['#text'] 
                  : votant.acteurRef;
                  
                if (deputyId) allDeputyIds.push(deputyId);
              }
            });
          }
          
          // Process "contre" votes
          if (groupDetail.votes.contres && groupDetail.votes.contres.votant) {
            const votants = Array.isArray(groupDetail.votes.contres.votant) 
              ? groupDetail.votes.contres.votant 
              : [groupDetail.votes.contres.votant];
              
            votants.forEach(votant => {
              if (votant.acteurRef) {
                const deputyId = typeof votant.acteurRef === 'object' 
                  ? votant.acteurRef['#text'] 
                  : votant.acteurRef;
                  
                if (deputyId) allDeputyIds.push(deputyId);
              }
            });
          }
          
          // Process "abstention" votes
          if (groupDetail.votes.abstentions && groupDetail.votes.abstentions.votant) {
            const votants = Array.isArray(groupDetail.votes.abstentions.votant) 
              ? groupDetail.votes.abstentions.votant 
              : [groupDetail.votes.abstentions.votant];
              
            votants.forEach(votant => {
              if (votant.acteurRef) {
                const deputyId = typeof votant.acteurRef === 'object' 
                  ? votant.acteurRef['#text'] 
                  : votant.acteurRef;
                  
                if (deputyId) allDeputyIds.push(deputyId);
              }
            });
          }
          
          // Process "nonVotants" votes
          if (groupDetail.votes.nonVotants && groupDetail.votes.nonVotants.votant) {
            const votants = Array.isArray(groupDetail.votes.nonVotants.votant) 
              ? groupDetail.votes.nonVotants.votant 
              : [groupDetail.votes.nonVotants.votant];
              
            votants.forEach(votant => {
              if (votant.acteurRef) {
                const deputyId = typeof votant.acteurRef === 'object' 
                  ? votant.acteurRef['#text'] 
                  : votant.acteurRef;
                  
                if (deputyId) allDeputyIds.push(deputyId);
              }
            });
          }
        }
        
        // Also use the generic processDeputiesFromVoteDetail function for the decompte structure
        const deputies = processDeputiesFromVoteDetail(groupDetail);
        deputies.forEach(deputy => {
          if (deputy.id && typeof deputy.id === 'string' && deputy.id.startsWith('PA')) {
            allDeputyIds.push(deputy.id);
          }
        });
      });
      
      if (allDeputyIds.length > 0) {
        console.log(`Prefetching ${allDeputyIds.length} deputies for detail tab`);
        prefetchDeputies(allDeputyIds);
      }
    }
  }, [groupsData]);

  if (Object.keys(groupsData).length > 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Détail des votes par député</CardTitle>
          <CardDescription>
            Liste complète des votes de chaque député classés par groupe politique
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {Object.entries(groupsData).map(([groupId, groupDetail]) => {
              if (!groupDetail) {
                console.warn(`Missing group data for groupId: ${groupId}`);
                return null;
              }

              // Use nom as the primary group name source
              const groupName = groupDetail.groupe ? getGroupName(groupDetail.groupe) : (
                groupDetail.nom || getGroupName(groupDetail) || 'Groupe inconnu'
              );
              
              const deputies = processDeputiesFromVoteDetail(groupDetail);
              
              // Log the groupDetail and the processed deputies for debugging
              console.log(`Group: ${groupName} (${groupId})`, groupDetail);
              console.log(`Deputies processed: ${deputies.length}`, deputies);
              
              return (
                <div key={groupId}>
                  <div className="flex items-center mb-3">
                    <div 
                      className="w-4 h-4 rounded-full mr-2" 
                      style={{ 
                        backgroundColor: getGroupePolitiqueCouleur(groupName)
                      }}
                    />
                    <h3 className="text-lg font-semibold">{groupName}</h3>
                  </div>
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Député</TableHead>
                          <TableHead className="text-center">Position</TableHead>
                          <TableHead className="text-center w-24">Délégation</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deputies.length > 0 ? (
                          deputies.map((vote, index) => (
                            <TableRow key={`${vote.id}-${index}`}>
                              <TableCell>
                                <Link 
                                  to={`/deputy/${vote.id}`}
                                  className="hover:text-primary"
                                >
                                  {formatDeputyName(vote.id)}
                                </Link>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center space-x-2">
                                  {positionIcons[vote.position]}
                                  <span className={`font-medium ${positionClasses[vote.position]}`}>
                                    {positionLabels[vote.position]}
                                  </span>
                                  {vote.causePosition && (
                                    <Badge variant="outline" className="ml-2 text-xs">
                                      {vote.causePosition === 'PAN' ? 'Président' : 
                                       vote.causePosition === 'PSE' ? 'Séance' : vote.causePosition}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                {vote.delegation ? (
                                  <Badge>Par délégation</Badge>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-8 text-gray-500">
                              Aucun détail de vote disponible
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <Separator className="my-6" />
                </div>
              );
            }).filter(Boolean)}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Détail des votes par député</CardTitle>
        <CardDescription>
          Liste complète des votes de chaque député classés par groupe politique
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-gray-500">
          Cliquez sur l'icône d'information dans l'onglet "Résumé par groupe" pour voir le détail des votes des députés d'un groupe
        </div>
      </CardContent>
    </Card>
  );
};

export default DeputiesDetailTab;
