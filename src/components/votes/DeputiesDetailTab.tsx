
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCcw, AlertTriangle, Info } from 'lucide-react';
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
  prioritizeDeputies
} from '@/utils/deputyCache';
import { 
  getDeputyFromSupabase, 
  prefetchDeputiesFromSupabase,
  triggerDeputiesSync
} from '@/utils/deputySupabaseService';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';

interface DeputiesDetailTabProps {
  groupsData: Record<string, GroupVoteDetail>;
  legislature?: string;
}

const DeputiesDetailTab: React.FC<DeputiesDetailTabProps> = ({ groupsData, legislature = '17' }) => {
  const [loadingDeputies, setLoadingDeputies] = useState<Record<string, boolean>>({});
  const [visibleRows, setVisibleRows] = useState<Set<string>>(new Set());
  const [deputyInfo, setDeputyInfo] = useState<Record<string, {prenom: string, nom: string, loading: boolean}>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [tableEmpty, setTableEmpty] = useState(false);
  const tableRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [retryCount, setRetryCount] = useState(0);
  const [loadingStats, setLoadingStats] = useState({ loaded: 0, total: 0 });
  
  const ensureDeputyIdFormat = (deputyId: string): string => {
    if (!deputyId) return '';
    return deputyId.startsWith('PA') ? deputyId : `PA${deputyId}`;
  };
  
  // Extract all deputy IDs from groups data up front
  const getAllDeputyIds = useCallback(() => {
    const allIds: string[] = [];
    
    Object.values(groupsData).forEach(groupDetail => {
      if (!groupDetail) return;
      
      const deputies = processDeputiesFromVoteDetail(groupDetail);
      deputies.forEach(deputy => {
        if (deputy.id && typeof deputy.id === 'string') {
          const formattedId = ensureDeputyIdFormat(deputy.id);
          allIds.push(formattedId);
        }
      });
    });
    
    return [...new Set(allIds)]; // Remove duplicates
  }, [groupsData]);
  
  // Setup intersection observer with improved margins and thresholds
  const setupIntersectionObserver = useCallback(() => {
    const options = {
      root: null,
      rootMargin: '800px', // Increased from 300px to 800px to load more deputies ahead of time
      threshold: 0.1
    };
    
    const observer = new IntersectionObserver((entries) => {
      // Batch process visible deputies
      const newVisibleIds: string[] = [];
      
      entries.forEach(entry => {
        const deputyId = entry.target.getAttribute('data-deputy-id');
        if (!deputyId) return;
        
        const formattedId = ensureDeputyIdFormat(deputyId);
        
        if (entry.isIntersecting) {
          newVisibleIds.push(formattedId);
        } else {
          setVisibleRows(prev => {
            const newSet = new Set(prev);
            newSet.delete(formattedId);
            return newSet;
          });
        }
      });
      
      // Add all newly visible deputies at once
      if (newVisibleIds.length > 0) {
        setVisibleRows(prev => {
          const newSet = new Set(prev);
          newVisibleIds.forEach(id => newSet.add(id));
          return newSet;
        });
        
        // Load deputies in batches
        loadDeputiesBatch(newVisibleIds);
      }
    }, options);
    
    Object.entries(tableRefs.current).forEach(([deputyId, element]) => {
      if (element) {
        observer.observe(element);
      }
    });
    
    return () => observer.disconnect();
  }, []);
  
  // Load deputies in batches
  const loadDeputiesBatch = useCallback((deputyIds: string[]) => {
    // Pre-load deputies from localStorage first for immediate display
    const idsToLoad: string[] = [];
    
    deputyIds.forEach(id => {
      try {
        const storageKey = `deputy_v1_${id}`;
        const data = localStorage.getItem(storageKey);
        if (data) {
          try {
            const parsed = JSON.parse(data);
            const now = Date.now();
            
            // If valid data in localStorage, use it immediately
            if (parsed.timestamp && (now - parsed.timestamp) < 24 * 60 * 60 * 1000 && parsed.prenom && parsed.nom) {
              setDeputyInfo(prev => ({
                ...prev,
                [id]: {
                  prenom: parsed.prenom,
                  nom: parsed.nom,
                  loading: false
                }
              }));
              
              setLoadingDeputies(prev => ({
                ...prev,
                [id]: false
              }));
            } else {
              idsToLoad.push(id);
            }
          } catch (e) {
            idsToLoad.push(id);
          }
        } else {
          idsToLoad.push(id);
        }
      } catch (e) {
        idsToLoad.push(id);
      }
    });
    
    // For any remaining IDs, load from Supabase
    if (idsToLoad.length > 0) {
      // Set loading state for these IDs
      const loadingState: Record<string, boolean> = {};
      idsToLoad.forEach(id => {
        loadingState[id] = true;
        
        // Also set temporary loading state in deputyInfo
        setDeputyInfo(prev => ({
          ...prev,
          [id]: {
            prenom: '',
            nom: '',
            loading: true
          }
        }));
      });
      
      setLoadingDeputies(prev => ({ ...prev, ...loadingState }));
      
      // Update loading stats
      setLoadingStats(prev => ({
        ...prev,
        total: prev.total + idsToLoad.length
      }));
      
      // Load from Supabase in batches
      loadDeputiesFromSupabase(idsToLoad);
    }
  }, [legislature]);
  
  // Load deputies from Supabase with batch processing
  const loadDeputiesFromSupabase = useCallback(async (deputyIds: string[]) => {
    if (!deputyIds.length) return;
    
    try {
      // Split into batches of 20 for better performance
      const BATCH_SIZE = 20;
      
      for (let i = 0; i < deputyIds.length; i += BATCH_SIZE) {
        const batchIds = deputyIds.slice(i, i + BATCH_SIZE);
        
        // Create batch array of promises
        const promises = batchIds.map(async (deputyId) => {
          try {
            const deputy = await getDeputyFromSupabase(deputyId, legislature);
            
            if (deputy && deputy.prenom && deputy.nom) {
              setDeputyInfo(prev => ({
                ...prev,
                [deputyId]: {
                  prenom: deputy.prenom,
                  nom: deputy.nom,
                  loading: false
                }
              }));
              
              setLoadingDeputies(prev => ({
                ...prev,
                [deputyId]: false
              }));
              
              setLoadingStats(prev => ({
                ...prev,
                loaded: prev.loaded + 1
              }));
              
              return { id: deputyId, success: true };
            } else {
              // Try direct API call
              try {
                const apiUrl = `https://api-dataan.onrender.com/depute?depute_id=${deputyId}`;
                const response = await fetch(apiUrl);
                
                if (!response.ok) {
                  throw new Error(`API error: ${response.status}`);
                }
                
                const data = await response.json();
                
                if (data && !data.error) {
                  const prenom = data.prenom || data.etatCivil?.ident?.prenom;
                  const nom = data.nom || data.etatCivil?.ident?.nom;
                  
                  if (prenom && nom) {
                    setDeputyInfo(prev => ({
                      ...prev,
                      [deputyId]: {
                        prenom,
                        nom,
                        loading: false
                      }
                    }));
                    
                    setLoadingDeputies(prev => ({
                      ...prev,
                      [deputyId]: false
                    }));
                    
                    setLoadingStats(prev => ({
                      ...prev,
                      loaded: prev.loaded + 1
                    }));
                    
                    // Cache for future use
                    prioritizeDeputies([deputyId]);
                    return { id: deputyId, success: true };
                  }
                }
                
                throw new Error('Invalid API response');
              } catch (apiError) {
                // Fallback to memory cache as last resort
                const cachedDeputy = getDeputyInfo(deputyId);
                
                if (cachedDeputy && cachedDeputy.prenom && cachedDeputy.nom) {
                  setDeputyInfo(prev => ({
                    ...prev,
                    [deputyId]: {
                      prenom: cachedDeputy.prenom,
                      nom: cachedDeputy.nom,
                      loading: false
                    }
                  }));
                  
                  setLoadingDeputies(prev => ({
                    ...prev,
                    [deputyId]: false
                  }));
                  
                  setLoadingStats(prev => ({
                    ...prev,
                    loaded: prev.loaded + 1
                  }));
                  
                  return { id: deputyId, success: true };
                }
                
                // If all attempts fail, set a placeholder
                setDeputyInfo(prev => ({
                  ...prev,
                  [deputyId]: {
                    prenom: '',
                    nom: `Député ${deputyId.replace('PA', '')}`,
                    loading: false
                  }
                }));
                
                setLoadingDeputies(prev => ({
                  ...prev,
                  [deputyId]: false
                }));
                
                return { id: deputyId, success: false };
              }
            }
          } catch (err) {
            console.error(`[DeputiesDetailTab] Error loading deputy ${deputyId}:`, err);
            
            // Set fallback name
            setDeputyInfo(prev => ({
              ...prev,
              [deputyId]: {
                prenom: '',
                nom: `Député ${deputyId.replace('PA', '')}`,
                loading: false
              }
            }));
            
            setLoadingDeputies(prev => ({
              ...prev,
              [deputyId]: false
            }));
            
            return { id: deputyId, success: false };
          }
        });
        
        // Process batch
        await Promise.allSettled(promises);
        
        // Brief delay between batches
        if (i + BATCH_SIZE < deputyIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } catch (err) {
      console.error('[DeputiesDetailTab] Error in batch loading:', err);
    }
  }, [legislature]);
  
  // Check if deputies table is available
  useEffect(() => {
    const checkDeputiesTable = async () => {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { count, error } = await supabase
          .from('deputies')
          .select('*', { count: 'exact', head: true });
          
        if ((count === 0 || count === null) && !error) {
          console.log('[DeputiesDetailTab] Deputies table is empty!');
          setTableEmpty(true);
          toast.info("Base de données des députés vide", { 
            description: "Pour voir les noms des députés, cliquez sur le bouton 'Synchroniser les députés'",
            duration: 8000
          });
        } else {
          console.log(`[DeputiesDetailTab] Deputies table has ${count} entries`);
          setTableEmpty(false);
        }
      } catch (err) {
        console.error('Error checking deputies table:', err);
      }
    };
    
    checkDeputiesTable();
  }, [legislature]);
  
  // Pre-process all deputy IDs and set up initial loading status
  useEffect(() => {
    if (Object.keys(groupsData).length > 0) {
      const allDeputyIds = getAllDeputyIds();
      const loadingStatus: Record<string, boolean> = {};
      
      // Start with all deputies marked as loading
      allDeputyIds.forEach(id => {
        loadingStatus[id] = true;
      });
      
      setLoadingDeputies(loadingStatus);
      setLoadingStats({
        loaded: 0,
        total: allDeputyIds.length
      });
      
      // Pre-fill with localStorage data where available
      allDeputyIds.forEach(id => {
        try {
          const storageKey = `deputy_v1_${id}`;
          const data = localStorage.getItem(storageKey);
          if (data) {
            try {
              const parsed = JSON.parse(data);
              const now = Date.now();
              
              if (parsed.timestamp && (now - parsed.timestamp) < 24 * 60 * 60 * 1000 && parsed.prenom && parsed.nom) {
                setDeputyInfo(prev => ({
                  ...prev,
                  [id]: {
                    prenom: parsed.prenom,
                    nom: parsed.nom,
                    loading: false
                  }
                }));
                
                loadingStatus[id] = false;
                setLoadingStats(prev => ({
                  ...prev,
                  loaded: prev.loaded + 1
                }));
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        } catch (e) {
          // Ignore localStorage errors
        }
      });
      
      setLoadingDeputies(loadingStatus);
      
      // Prefetch in batches
      if (allDeputyIds.length > 0) {
        // Prefetch from Supabase first to populate cache
        prefetchDeputiesFromSupabase(allDeputyIds, legislature)
          .then(() => {
            // Then update memory cache
            return prefetchDeputies(allDeputyIds);
          })
          .catch(err => {
            console.error('Erreur lors du préchargement des députés:', err);
          });
      }
    }
  }, [groupsData, getAllDeputyIds, legislature]);
  
  // Set up intersection observer
  useEffect(() => {
    const observer = setupIntersectionObserver();
    return observer;
  }, [setupIntersectionObserver]);
  
  // Retry loading if deputies are still loading after timeout
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
          loadDeputiesBatch(visibleDeputies);
        }
        
        setRetryCount(prev => prev + 1);
      }
    }, 10000);
    
    return () => clearTimeout(timeout);
  }, [loadingDeputies, retryCount, visibleRows, loadDeputiesBatch]);
  
  // Render deputy name with optimized loading
  const renderDeputyName = (deputyId: string) => {
    const formattedId = ensureDeputyIdFormat(deputyId);
    
    if (deputyInfo[formattedId]) {
      if (deputyInfo[formattedId].loading) {
        return (
          <div className="flex items-center space-x-2">
            <Skeleton className="h-4 w-[180px]" />
          </div>
        );
      }
      
      const fullName = `${deputyInfo[formattedId].prenom} ${deputyInfo[formattedId].nom}`.trim();
      if (fullName === `` || fullName === ` ` || fullName === `Député ${formattedId.replace('PA', '')}`) {
        return (
          <div className="flex items-center space-x-2">
            <Skeleton className="h-4 w-[180px]" />
          </div>
        );
      }
      
      return fullName;
    }
    
    // If not found, queue loading and show skeleton
    if (!loadingDeputies[formattedId]) {
      setLoadingDeputies(prev => ({
        ...prev,
        [formattedId]: true
      }));
      
      if (visibleRows.has(formattedId)) {
        loadDeputiesBatch([formattedId]);
      }
    }
    
    return (
      <div className="flex items-center space-x-2">
        <Skeleton className="h-4 w-[180px]" />
      </div>
    );
  };
  
  // Assign refs to elements for intersection observation
  const assignRef = (deputyId: string) => (element: HTMLDivElement | null) => {
    if (element) {
      const formattedId = ensureDeputyIdFormat(deputyId);
      tableRefs.current[formattedId] = element;
    }
  };
  
  // Sync deputies function
  const handleSyncDeputies = async () => {
    setIsSyncing(true);
    setSyncError(null);
    setSyncProgress(0);
    
    try {
      const result = await triggerDeputiesSync(legislature, true);
      
      if (result.success) {
        toast.success("Synchronisation réussie", {
          description: `${result.deputies_count || 0} députés ont été synchronisés.`,
          duration: 5000
        });
        
        setTableEmpty(false);
        
        // Reset state to force reload
        setDeputyInfo({});
        setLoadingDeputies({});
        setLoadingStats({ loaded: 0, total: 0 });
        
        const visibleDeputies = Array.from(visibleRows);
        if (visibleDeputies.length > 0) {
          loadDeputiesBatch(visibleDeputies);
        }
        
        const allDeputyIds = getAllDeputyIds();
        
        if (allDeputyIds.length > 0) {
          setTimeout(() => {
            prefetchDeputiesFromSupabase(allDeputyIds, legislature)
              .then(() => {
                const visibleIds = Array.from(visibleRows);
                prioritizeDeputies(visibleIds);
                loadDeputiesBatch(visibleIds);
              });
          }, 2000);
        }
      } else {
        const errorMessage = result.message || 'Erreur inconnue';
        setSyncError(errorMessage);
        
        toast.error("Échec de la synchronisation", {
          description: errorMessage,
          duration: 5000
        });
        
        if (result.fetch_errors && result.fetch_errors.length > 0) {
          console.error("Fetch errors:", result.fetch_errors);
        }
        
        if (result.sync_errors && result.sync_errors.length > 0) {
          console.error("Sync errors:", result.sync_errors);
        }
      }
    } catch (error) {
      console.error("Erreur lors de la synchronisation des députés:", error);
      
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      setSyncError(errorMessage);
      
      toast.error("Erreur lors de la synchronisation", {
        description: errorMessage,
        duration: 5000
      });
    } finally {
      setIsSyncing(false);
      setSyncProgress(100);
    }
  };

  // Show loading progress if loading stats are available
  const showLoadingProgress = loadingStats.total > 0 && loadingStats.loaded < loadingStats.total;
  const loadingProgress = loadingStats.total ? Math.min(100, Math.round(loadingStats.loaded / loadingStats.total * 100)) : 0;

  if (tableEmpty || syncError) {
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
            variant="default" 
            disabled={isSyncing}
            size="sm"
          >
            <RefreshCcw className={`h-4 w-4 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Synchronisation...' : 'Synchroniser les députés'}
          </Button>
        </CardHeader>
        <CardContent>
          {syncError ? (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Erreur de synchronisation</AlertTitle>
              <AlertDescription>
                {syncError}
                <div className="mt-2">
                  Veuillez essayer à nouveau. Si le problème persiste, contactez l'administrateur.
                </div>
              </AlertDescription>
            </Alert>
          ) : tableEmpty ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>La base de données des députés est vide</AlertTitle>
              <AlertDescription>
                Pour voir les noms des députés, veuillez cliquer sur le bouton "Synchroniser les députés" ci-dessus. 
                Cette opération peut prendre quelques instants.
              </AlertDescription>
            </Alert>
          ) : null}
          
          <div className="mt-4">
            {Object.keys(groupsData).length > 0 ? (
              <div className="space-y-8">
                {Object.entries(groupsData).map(([groupId, groupDetail]) => {
                  if (!groupDetail) return null;
                  
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
                            {deputies.length > 0 && deputies.map((vote, index) => {
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
                                        {`Député ${formattedDeputyId.replace('PA', '')}`}
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
                            })}
                          </TableBody>
                        </Table>
                      </div>
                      <Separator className="my-6" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>Cliquez sur l'icône d'information dans l'onglet "Résumé par groupe" pour voir le détail des votes des députés d'un groupe</p>
                <Alert variant="default" className="mt-4">
                  <Info className="h-4 w-4" />
                  <AlertTitle>Comment voir les noms des députés ?</AlertTitle>
                  <AlertDescription>
                    Une fois que vous avez synchronisé les députés, retournez à l'onglet "Résumé par groupe" et cliquez sur l'icône d'information à côté d'un groupe pour charger les détails de vote pour ce groupe.
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

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
          <div className="flex items-center space-x-4">
            {showLoadingProgress && (
              <div className="flex items-center text-xs text-muted-foreground">
                <div className="w-[150px] mr-2">
                  <Progress value={loadingProgress} className="h-2" />
                </div>
                <span>{`${loadingStats.loaded}/${loadingStats.total} députés chargés`}</span>
              </div>
            )}
            <Button 
              onClick={handleSyncDeputies} 
              variant="outline" 
              disabled={isSyncing}
              size="sm"
            >
              <RefreshCcw className={`h-4 w-4 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Synchronisation...' : 'Synchroniser les députés'}
            </Button>
          </div>
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
          {isSyncing ? 'Synchronisation...' : 'Synchroniser les députés'}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-gray-500">
          <p>Cliquez sur l'icône d'information dans l'onglet "Résumé par groupe" pour voir le détail des votes des députés d'un groupe</p>
          <Alert variant="default" className="mt-4">
            <Info className="h-4 w-4" />
            <AlertTitle>Comment voir les détails des votes ?</AlertTitle>
            <AlertDescription>
              Pour afficher les détails des votes par député, allez dans l'onglet "Résumé par groupe" et cliquez sur l'icône d'information à côté d'un groupe politique.
            </AlertDescription>
          </Alert>
        </div>
      </CardContent>
    </Card>
  );
};

export default DeputiesDetailTab;
