
import React, { useEffect, useState } from 'react';
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
import { prefetchDeputies, formatDeputyName, getDeputyInfo, queueDeputyFetch } from '@/utils/deputyCache';
import { Skeleton } from '@/components/ui/skeleton';

interface DeputiesDetailTabProps {
  groupsData: Record<string, GroupVoteDetail>;
}

const DeputiesDetailTab: React.FC<DeputiesDetailTabProps> = ({ groupsData }) => {
  const [loadingDeputies, setLoadingDeputies] = useState<Record<string, boolean>>({});
  
  // Extract all deputy IDs from groupsData for prefetching
  useEffect(() => {
    if (Object.keys(groupsData).length > 0) {
      const allDeputyIds: string[] = [];
      const loadingStatus: Record<string, boolean> = {};
      
      Object.values(groupsData).forEach(groupDetail => {
        if (!groupDetail) return;
        
        // Process deputies from the vote detail
        const deputies = processDeputiesFromVoteDetail(groupDetail);
        
        // Collect all deputy IDs for prefetching
        deputies.forEach(deputy => {
          if (deputy.id && typeof deputy.id === 'string' && deputy.id.startsWith('PA')) {
            allDeputyIds.push(deputy.id);
            // Initialize loading status for each deputy
            loadingStatus[deputy.id] = true;
          }
        });
      });
      
      setLoadingDeputies(loadingStatus);
      
      if (allDeputyIds.length > 0) {
        console.log(`Prefetching ${allDeputyIds.length} deputies for detail tab`);
        prefetchDeputies(allDeputyIds);
        
        // Set up an interval to check for deputies being loaded into cache
        const checkInterval = setInterval(() => {
          const newLoadingStatus = { ...loadingStatus };
          let allLoaded = true;
          
          allDeputyIds.forEach(id => {
            // If this deputy is already marked as not loading, skip it
            if (!newLoadingStatus[id]) return;
            
            const deputy = getDeputyInfo(id);
            // Consider a deputy loaded if it has both prenom and nom populated
            if (deputy && deputy.prenom && deputy.nom) {
              newLoadingStatus[id] = false;
            } else {
              allLoaded = false;
              // Re-queue any deputies that haven't loaded yet
              queueDeputyFetch(id);
            }
          });
          
          setLoadingDeputies(newLoadingStatus);
          
          // Clear the interval if all deputies are loaded
          if (allLoaded) {
            clearInterval(checkInterval);
          }
        }, 500);
        
        // Clean up the interval when component unmounts
        return () => clearInterval(checkInterval);
      }
    }
  }, [groupsData]);

  // Helper function to render deputy name with fallback
  const renderDeputyName = (deputyId: string) => {
    const isLoading = loadingDeputies[deputyId];
    const deputyInfo = getDeputyInfo(deputyId);
    
    if (isLoading) {
      return (
        <div className="flex items-center space-x-2">
          <Skeleton className="h-4 w-[180px]" />
        </div>
      );
    }
    
    if (deputyInfo && deputyInfo.prenom && deputyInfo.nom) {
      return `${deputyInfo.prenom} ${deputyInfo.nom}`;
    }
    
    return formatDeputyName(deputyId);
  };

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
                (groupDetail as any).nom || getGroupName(groupDetail) || 'Groupe inconnu'
              );
              
              const deputies = processDeputiesFromVoteDetail(groupDetail);
              
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
                                  {renderDeputyName(vote.id)}
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
