
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
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
  getDeputyInfo
} from '@/utils/deputyCache';
import { 
  getDeputyFromSupabase, 
  prefetchDeputiesFromSupabase,
  triggerDeputiesSync
} from '@/utils/deputySupabaseService';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

interface DeputiesDetailTabProps {
  groupsData: Record<string, GroupVoteDetail>;
  legislature?: string;
}

const DeputiesDetailTab: React.FC<DeputiesDetailTabProps> = ({ groupsData, legislature = '17' }) => {
  const [loadingDeputies, setLoadingDeputies] = useState<Record<string, boolean>>({});
  const [visibleRows, setVisibleRows] = useState<Set<string>>(new Set());
  const [deputyInfo, setDeputyInfo] = useState<Record<string, {prenom: string, nom: string, loading: boolean}>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const tableRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [retryCount, setRetryCount] = useState(0);
  
  // Ensure deputy ID is properly formatted with PA prefix
  const ensureDeputyIdFormat = (deputyId: string): string => {
    if (!deputyId) return '';
    return deputyId.startsWith('PA') ? deputyId : `PA${deputyId}`;
  };
  
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
        
        // Ensure ID has PA prefix
        const formattedId = ensureDeputyIdFormat(deputyId);
        
        if (entry.isIntersecting) {
          setVisibleRows(prev => {
            const newSet = new Set(prev);
            newSet.add(formattedId);
            return newSet;
          });
          
          loadDeputyFromSupabase(formattedId);
        } else {
          setVisibleRows(prev => {
            const newSet = new Set(prev);
            newSet.delete(formattedId);
            return newSet;
          });
        }
      });
    }, options);
    
    Object.entries(tableRefs.current).forEach(([deputyId, element]) => {
      if (element) {
        observer.observe(element);
      }
    });
    
    return () => observer.disconnect();
  }, []);
  
  useEffect(() => {
    if (Object.keys(groupsData).length > 0) {
      const allDeputyIds: string[] = [];
      const loadingStatus: Record<string, boolean> = {};
      
      Object.values(groupsData).forEach(groupDetail => {
        if (!groupDetail) return;
        
        const deputies = processDeputiesFromVoteDetail(groupDetail);
        
        deputies.forEach(deputy => {
          if (deputy.id && typeof deputy.id === 'string') {
            // Ensure ID has PA prefix
            const formattedId = ensureDeputyIdFormat(deputy.id);
            allDeputyIds.push(formattedId);
            loadingStatus[formattedId] = true;
          }
        });
      });
      
      setLoadingDeputies(loadingStatus);
      
      if (allDeputyIds.length > 0) {
        console.log(`Préchargement de ${allDeputyIds.length} députés pour l'onglet de détail`);
        
        prefetchDeputiesFromSupabase(allDeputyIds, legislature)
          .then(() => {
            return prefetchDeputies(allDeputyIds);
          })
          .catch(err => {
            console.error('Erreur lors du préchargement des députés:', err);
          });
        
        const checkInterval = setInterval(() => {
          let stillLoading = false;
          
          setLoadingDeputies(prevLoading => {
            const newLoading = { ...prevLoading };
            
            allDeputyIds.forEach(id => {
              if (deputyInfo[id] && !deputyInfo[id].loading) {
                newLoading[id] = false;
              } else {
                stillLoading = true;
                if (visibleRows.has(id)) {
                  loadDeputyFromSupabase(id);
                }
              }
            });
            
            return newLoading;
          });
          
          if (!stillLoading) {
            clearInterval(checkInterval);
          }
        }, 500);
        
        return () => clearInterval(checkInterval);
      }
    }
  }, [groupsData, legislature]);
  
  useEffect(() => {
    const observer = setupIntersectionObserver();
    return observer;
  }, [setupIntersectionObserver]);
  
  useEffect(() => {
    const timeout = setTimeout(() => {
      const stillLoading = Object.values(loadingDeputies).some(loading => loading);
      if (stillLoading && retryCount < 3) {
        toast.error("Chargement des députés lent", {
          description: "Le chargement des noms de députés prend plus de temps que prévu. Tentative de rechargement...",
          duration: 3000
        });
        
        const visibleDeputies = Array.from(visibleRows);
        if (visibleDeputies.length > 0) {
          visibleDeputies.forEach(id => {
            loadDeputyFromSupabase(id);
          });
        }
        
        setRetryCount(prev => prev + 1);
      }
    }, 10000);
    
    return () => clearTimeout(timeout);
  }, [loadingDeputies, retryCount, visibleRows]);
  
  const loadDeputyFromSupabase = async (deputyId: string) => {
    // Ensure ID has PA prefix
    const formattedId = ensureDeputyIdFormat(deputyId);
    
    if (deputyInfo[formattedId] && !deputyInfo[formattedId].loading) {
      return;
    }
    
    setDeputyInfo(prev => ({
      ...prev,
      [formattedId]: {
        prenom: '',
        nom: '',
        loading: true
      }
    }));
    
    try {
      const deputy = await getDeputyFromSupabase(formattedId, legislature);
      
      if (deputy && deputy.prenom && deputy.nom) {
        setDeputyInfo(prev => ({
          ...prev,
          [formattedId]: {
            prenom: deputy.prenom,
            nom: deputy.nom,
            loading: false
          }
        }));
        
        setLoadingDeputies(prev => ({
          ...prev,
          [formattedId]: false
        }));
      } else {
        const cachedDeputy = getDeputyInfo(formattedId);
        
        if (cachedDeputy && cachedDeputy.prenom && cachedDeputy.nom) {
          setDeputyInfo(prev => ({
            ...prev,
            [formattedId]: {
              prenom: cachedDeputy.prenom,
              nom: cachedDeputy.nom,
              loading: false
            }
          }));
          
          setLoadingDeputies(prev => ({
            ...prev,
            [formattedId]: false
          }));
        } else {
          // If we can't find the deputy info, display the ID with PA prefix for clarity
          setDeputyInfo(prev => ({
            ...prev,
            [formattedId]: {
              prenom: '',
              nom: `Député ${formattedId}`,
              loading: false
            }
          }));
        }
      }
    } catch (err) {
      console.error(`Erreur lors du chargement du député ${formattedId}:`, err);
      
      setDeputyInfo(prev => ({
        ...prev,
        [formattedId]: {
          prenom: '',
          nom: `Député ${formattedId}`,
          loading: false
        }
      }));
    }
  };

  const renderDeputyName = (deputyId: string) => {
    // Ensure ID has PA prefix
    const formattedId = ensureDeputyIdFormat(deputyId);
    
    if (deputyInfo[formattedId]) {
      if (deputyInfo[formattedId].loading) {
        return (
          <div className="flex items-center space-x-2">
            <Skeleton className="h-4 w-[180px]" />
          </div>
        );
      }
      
      return `${deputyInfo[formattedId].prenom} ${deputyInfo[formattedId].nom}`.trim();
    }
    
    loadDeputyFromSupabase(formattedId);
    
    return (
      <div className="flex items-center space-x-2">
        <Skeleton className="h-4 w-[180px]" />
      </div>
    );
  };

  const assignRef = (deputyId: string) => (element: HTMLDivElement | null) => {
    if (element) {
      // Ensure ID has PA prefix
      const formattedId = ensureDeputyIdFormat(deputyId);
      tableRefs.current[formattedId] = element;
    }
  };

  const handleSyncDeputies = async () => {
    setIsSyncing(true);
    try {
      const result = await triggerDeputiesSync(legislature, true);
      if (result.success) {
        // Forcer le rechargement des députés visibles
        const visibleDeputies = Array.from(visibleRows);
        if (visibleDeputies.length > 0) {
          setTimeout(() => {
            visibleDeputies.forEach(id => {
              // Réinitialiser les infos du député pour forcer le rechargement
              setDeputyInfo(prev => ({
                ...prev,
                [id]: {
                  prenom: '',
                  nom: '',
                  loading: true
                }
              }));
              loadDeputyFromSupabase(id);
            });
          }, 2000); // Attendre 2 secondes pour que la synchronisation se termine
        }
      }
    } catch (error) {
      console.error("Erreur lors de la synchronisation des députés:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Helper function to format deputy ID for display in links
  const formatDeputyIdForLink = (deputyId: string): string => {
    // Ensure ID has PA prefix for link
    return ensureDeputyIdFormat(deputyId);
  };

  if (Object.keys(groupsData).length > 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Détail des votes par député</CardTitle>
            <CardDescription>
              Liste complète des votes de chaque député classés par groupe politique
            </CardDescription>
          </div>
          <Button 
            onClick={handleSyncDeputies} 
            variant="outline" 
            disabled={isSyncing}
            size="sm"
          >
            <RefreshCcw className={`h-4 w-4 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
            Synchroniser les députés
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {Object.entries(groupsData).map(([groupId, groupDetail]) => {
              if (!groupDetail) {
                console.warn(`Données de groupe manquantes pour groupId: ${groupId}`);
                return null;
              }

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
                          deputies.map((vote, index) => {
                            // Ensure deputy ID is formatted correctly
                            const formattedDeputyId = ensureDeputyIdFormat(vote.id);
                            
                            return (
                              <TableRow key={`${formattedDeputyId}-${index}`}>
                                <TableCell>
                                  <div
                                    ref={assignRef(formattedDeputyId)}
                                    data-deputy-id={formattedDeputyId}
                                  >
                                    <Link 
                                      to={`/deputy/${formattedDeputyId}`}
                                      className="hover:text-primary"
                                    >
                                      {renderDeputyName(formattedDeputyId)}
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
                            );
                          })
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
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Détail des votes par député</CardTitle>
          <CardDescription>
            Liste complète des votes de chaque député classés par groupe politique
          </CardDescription>
        </div>
        <Button 
          onClick={handleSyncDeputies} 
          variant="outline" 
          disabled={isSyncing}
          size="sm"
        >
          <RefreshCcw className={`h-4 w-4 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
          Synchroniser les députés
        </Button>
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
