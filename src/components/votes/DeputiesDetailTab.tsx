
import React, { useEffect, useState, useRef, useCallback } from 'react';
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
import { 
  prefetchDeputies, 
  formatDeputyName, 
  getDeputyInfo, 
  queueDeputyFetch, 
  prioritizeDeputies 
} from '@/utils/deputyCache';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

interface DeputiesDetailTabProps {
  groupsData: Record<string, GroupVoteDetail>;
}

const DeputiesDetailTab: React.FC<DeputiesDetailTabProps> = ({ groupsData }) => {
  const [loadingDeputies, setLoadingDeputies] = useState<Record<string, boolean>>({});
  const [visibleRows, setVisibleRows] = useState<Set<string>>(new Set());
  const tableRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const loadingTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const [retryCount, setRetryCount] = useState(0);
  
  // Setup intersection observer to detect which deputies are currently visible
  const setupIntersectionObserver = useCallback(() => {
    const options = {
      root: null,
      rootMargin: '100px',
      threshold: 0.1
    };
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const deputyId = entry.target.getAttribute('data-deputy-id');
        if (!deputyId) return;
        
        if (entry.isIntersecting) {
          setVisibleRows(prev => {
            const newSet = new Set(prev);
            newSet.add(deputyId);
            return newSet;
          });
          
          // Prioritize loading this deputy
          prioritizeDeputies([deputyId]);
        } else {
          setVisibleRows(prev => {
            const newSet = new Set(prev);
            newSet.delete(deputyId);
            return newSet;
          });
        }
      });
    }, options);
    
    // Observe all deputy rows
    Object.entries(tableRefs.current).forEach(([deputyId, element]) => {
      if (element) {
        observer.observe(element);
      }
    });
    
    return () => observer.disconnect();
  }, []);
  
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
      
      // Initial loading state
      setLoadingDeputies(loadingStatus);
      
      if (allDeputyIds.length > 0) {
        console.log(`Prefetching ${allDeputyIds.length} deputies for detail tab`);
        prefetchDeputies(allDeputyIds);
        
        // Set up a periodic check for deputies being loaded
        const checkInterval = setInterval(() => {
          let stillLoading = false;
          
          // Update loading status for all deputies
          setLoadingDeputies(prevLoading => {
            const newLoading = { ...prevLoading };
            
            allDeputyIds.forEach(id => {
              const deputy = getDeputyInfo(id);
              // Consider a deputy loaded if it has both prenom and nom populated
              if (deputy && deputy.prenom && deputy.nom) {
                newLoading[id] = false;
              } else {
                stillLoading = true;
                // Prioritize visible rows
                if (visibleRows.has(id)) {
                  prioritizeDeputies([id]);
                }
              }
            });
            
            return newLoading;
          });
          
          // Clear the interval if all deputies are loaded or after the max timeout
          if (!stillLoading) {
            clearInterval(checkInterval);
          }
        }, 500);
        
        // Clean up the interval when component unmounts
        return () => clearInterval(checkInterval);
      }
    }
  }, [groupsData, visibleRows]);
  
  // Setup intersection observer
  useEffect(() => {
    const observer = setupIntersectionObserver();
    return observer;
  }, [setupIntersectionObserver]);
  
  // Setup timeout to show error message if loading takes too long
  useEffect(() => {
    const timeout = setTimeout(() => {
      const stillLoading = Object.values(loadingDeputies).some(loading => loading);
      if (stillLoading && retryCount < 3) {
        toast.error("Chargement des députés lent", {
          description: "Le chargement des noms de députés prend plus de temps que prévu. Tentative de rechargement...",
          duration: 3000
        });
        
        // Retry loading visible deputies
        const visibleDeputies = Array.from(visibleRows);
        if (visibleDeputies.length > 0) {
          prioritizeDeputies(visibleDeputies);
        }
        
        setRetryCount(prev => prev + 1);
      }
    }, 10000); // 10 seconds
    
    return () => clearTimeout(timeout);
  }, [loadingDeputies, retryCount, visibleRows]);

  // Helper function to render deputy name with fallback and loading state
  const renderDeputyName = (deputyId: string) => {
    const isLoading = loadingDeputies[deputyId];
    const deputy = getDeputyInfo(deputyId);
    
    if (isLoading || (deputy && deputy.loading)) {
      return (
        <div className="flex items-center space-x-2">
          <Skeleton className="h-4 w-[180px]" />
        </div>
      );
    }
    
    if (deputy && deputy.prenom && deputy.nom) {
      return `${deputy.prenom} ${deputy.nom}`;
    }
    
    // Fallback display
    return formatDeputyName(deputyId);
  };
  
  // Function to assign ref and set up deputy row reference
  const assignRef = (deputyId: string) => (element: HTMLDivElement | null) => {
    if (element) {
      tableRefs.current[deputyId] = element;
    }
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
                                <div
                                  ref={assignRef(vote.id)}
                                  data-deputy-id={vote.id}
                                >
                                  <Link 
                                    to={`/deputy/${vote.id}`}
                                    className="hover:text-primary"
                                  >
                                    {renderDeputyName(vote.id)}
                                  </Link>
                                </div>
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
