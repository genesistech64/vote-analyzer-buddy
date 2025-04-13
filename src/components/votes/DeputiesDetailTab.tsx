import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCcw, AlertTriangle, Info, Bug, ServerCrash } from 'lucide-react';
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
  triggerDeputiesSync,
  debugDatabaseState
} from '@/utils/deputySupabaseService';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Configuration pour le debug
const DEBUG = true;
const LOG_PREFIX = '[DeputiesDetailTab]';

// Fonction utilitaire pour les logs
const log = (message: string, data?: any) => {
  if (DEBUG) {
    if (data) {
      console.log(`${LOG_PREFIX} ${message}`, data);
    } else {
      console.log(`${LOG_PREFIX} ${message}`);
    }
  }
};

interface DeputiesDetailTabProps {
  groupsData: Record<string, GroupVoteDetail>;
  legislature?: string;
  voteDetails?: any; // Ajout pour accéder aux informations du vote
  apiDataError?: boolean; // Nouveau prop pour indiquer les problèmes d'API
}

const DeputiesDetailTab: React.FC<DeputiesDetailTabProps> = ({ 
  groupsData, 
  legislature = '17',
  voteDetails,
  apiDataError = false
}) => {
  const [loadingDeputies, setLoadingDeputies] = useState<Record<string, boolean>>({});
  const [visibleRows, setVisibleRows] = useState<Set<string>>(new Set());
  const [deputyInfo, setDeputyInfo] = useState<Record<string, {prenom: string, nom: string, loading: boolean}>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [tableEmpty, setTableEmpty] = useState(false);
  const tableRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [retryCount, setRetryCount] = useState(0);
  const [databaseState, setDatabaseState] = useState<any>(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  
  const ensureDeputyIdFormat = (deputyId: string): string => {
    if (!deputyId) return '';
    return deputyId.startsWith('PA') ? deputyId : `PA${deputyId}`;
  };

  // Fonction pour obtenir des informations de débogage
  const getDebugInfo = async () => {
    log('Récupération des informations de débogage');
    setShowDebugInfo(true);
    
    try {
      const state = await debugDatabaseState(legislature);
      setDatabaseState(state);
      
      log('État de la base de données:', state);
      
      if (state.error) {
        toast.error('Erreur de diagnostic', {
          description: `Erreur lors de la vérification de la base de données: ${state.error}`
        });
      } else {
        toast.success('Diagnostic terminé', {
          description: `${state.totalDeputies} députés trouvés dans la base de données`
        });
      }
    } catch (err) {
      console.error('Erreur lors du diagnostic:', err);
      toast.error('Erreur de diagnostic', {
        description: 'Une erreur est survenue lors du diagnostic'
      });
    }
  };
  
  const setupIntersectionObserver = useCallback(() => {
    log('Configuration de l\'observateur d\'intersection');
    const options = {
      root: null,
      rootMargin: '100px',
      threshold: 0.1
    };
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const deputyId = entry.target.getAttribute('data-deputy-id');
        if (!deputyId) return;
        
        const formattedId = ensureDeputyIdFormat(deputyId);
        
        if (entry.isIntersecting) {
          log(`Député ${formattedId} visible dans la vue`);
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
        log(`Observateur attaché à l'élément avec ID ${deputyId}`);
      }
    });
    
    return () => {
      log('Déconnexion de l\'observateur d\'intersection');
      observer.disconnect();
    };
  }, []);
  
  useEffect(() => {
    const checkDeputiesTable = async () => {
      try {
        log('Vérification de l\'état de la table deputies');
        const { supabase } = await import('@/integrations/supabase/client');
        const { count, error } = await supabase
          .from('deputies')
          .select('*', { count: 'exact', head: true });
          
        if ((count === 0 || count === null) && !error) {
          log('Table des députés vide!');
          setTableEmpty(true);
        } else {
          log(`Table des députés contient ${count} députés`);
          setTableEmpty(false);
        }
      } catch (err) {
        console.error(`${LOG_PREFIX} Erreur lors de la vérification de la table deputies:`, err);
      }
    };
    
    checkDeputiesTable();
  }, [legislature]);
  
  useEffect(() => {
    if (Object.keys(groupsData).length > 0) {
      log(`Traitement des données pour ${Object.keys(groupsData).length} groupes`);
      const allDeputyIds: string[] = [];
      const loadingStatus: Record<string, boolean> = {};
      
      Object.entries(groupsData).forEach(([groupId, groupDetail]) => {
        if (!groupDetail) {
          log(`Données manquantes pour le groupe ${groupId}`);
          return;
        }
        
        log(`Traitement des députés pour le groupe ${groupId}`);
        const deputies = processDeputiesFromVoteDetail(groupDetail);
        log(`${deputies.length} députés trouvés dans le groupe ${groupId}`);
        
        deputies.forEach(deputy => {
          if (deputy.id && typeof deputy.id === 'string') {
            const formattedId = ensureDeputyIdFormat(deputy.id);
            allDeputyIds.push(formattedId);
            loadingStatus[formattedId] = true;
            log(`Député ajouté à la liste de préchargement: ${formattedId}`);
          }
        });
      });
      
      setLoadingDeputies(loadingStatus);
      
      if (allDeputyIds.length > 0) {
        log(`Préchargement de ${allDeputyIds.length} députés pour l'onglet de détail`);
        
        prefetchDeputiesFromSupabase(allDeputyIds, legislature)
          .then((result) => {
            log(`Résultat du préchargement depuis Supabase:`, result);
            return prefetchDeputies(allDeputyIds);
          })
          .then(result => {
            log(`Résultat du préchargement depuis le cache:`, result);
          })
          .catch(err => {
            console.error(`${LOG_PREFIX} Erreur lors du préchargement des députés:`, err);
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
                  log(`Le député ${id} est visible mais toujours en chargement, tentative de récupération depuis Supabase`);
                  loadDeputyFromSupabase(id);
                }
              }
            });
            
            return newLoading;
          });
          
          if (!stillLoading) {
            log('Tous les députés sont chargés, arrêt de la vérification périodique');
            clearInterval(checkInterval);
          }
        }, 500);
        
        return () => clearInterval(checkInterval);
      }
    } else {
      log('Aucune donnée de groupe disponible');
    }
  }, [groupsData, legislature, visibleRows, deputyInfo]);
  
  useEffect(() => {
    log('Configuration de l\'observateur d\'intersection');
    const observer = setupIntersectionObserver();
    return observer;
  }, [setupIntersectionObserver]);
  
  useEffect(() => {
    const timeout = setTimeout(() => {
      const stillLoading = Object.values(loadingDeputies).some(loading => loading);
      if (stillLoading && retryCount < 3) {
        log(`Chargement des députés lent (tentative ${retryCount + 1}/3)`);
        toast.error("Chargement des députés lent", {
          description: "Le chargement des noms de députés prend plus de temps que prévu. Tentative de rechargement...",
          duration: 3000
        });
        
        const visibleDeputies = Array.from(visibleRows);
        if (visibleDeputies.length > 0) {
          log(`Tentative de rechargement pour ${visibleDeputies.length} députés visibles`);
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
    const formattedId = ensureDeputyIdFormat(deputyId);
    
    if (deputyInfo[formattedId] && !deputyInfo[formattedId].loading) {
      log(`Député ${formattedId} déjà chargé, pas besoin de recharger`);
      return;
    }
    
    log(`Début du chargement du député ${formattedId} depuis Supabase`);
    
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
        log(`Député trouvé dans Supabase: ${deputy.prenom} ${deputy.nom}`);
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
        log(`Député non trouvé dans Supabase, tentative depuis le cache: ${formattedId}`);
        const cachedDeputy = getDeputyInfo(formattedId);
        
        if (cachedDeputy && cachedDeputy.prenom && cachedDeputy.nom) {
          log(`Député trouvé dans le cache: ${cachedDeputy.prenom} ${cachedDeputy.nom}`);
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
          log(`Député non trouvé, utilisation d'un identifiant comme valeur par défaut: ${formattedId}`);
          setDeputyInfo(prev => ({
            ...prev,
            [formattedId]: {
              prenom: '',
              nom: `Député ${formattedId.replace('PA', '')}`,
              loading: false
            }
          }));
          
          setLoadingDeputies(prev => ({
            ...prev,
            [formattedId]: false
          }));
        }
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} Erreur lors du chargement du député ${formattedId}:`, err);
      
      setDeputyInfo(prev => ({
        ...prev,
        [formattedId]: {
          prenom: '',
          nom: `Député ${formattedId.replace('PA', '')}`,
          loading: false
        }
      }));
      
      setLoadingDeputies(prev => ({
        ...prev,
        [formattedId]: false
      }));
    }
  };

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
      
      return `${deputyInfo[formattedId].prenom} ${deputyInfo[formattedId].nom}`.trim();
    }
    
    log(`Demande de chargement du député ${formattedId} car non présent dans deputyInfo`);
    loadDeputyFromSupabase(formattedId);
    
    return (
      <div className="flex items-center space-x-2">
        <Skeleton className="h-4 w-[180px]" />
      </div>
    );
  };

  const assignRef = (deputyId: string) => (element: HTMLDivElement | null) => {
    if (element) {
      const formattedId = ensureDeputyIdFormat(deputyId);
      tableRefs.current[formattedId] = element;
    }
  };

  const handleSyncDeputies = async () => {
    setIsSyncing(true);
    setSyncError(null);
    
    try {
      log('Démarrage de la synchronisation des députés');
      const result = await triggerDeputiesSync(legislature, true);
      
      if (result.success) {
        log(`Synchronisation réussie: ${result.deputies_count} députés synchronisés`);
        toast.success("Synchronisation réussie", {
          description: `${result.deputies_count || 0} députés ont été synchronisés.`,
          duration: 5000
        });
        
        setTableEmpty(false);
        
        // Clear deputy info cache to force reload
        setDeputyInfo({});
        
        const visibleDeputies = Array.from(visibleRows);
        if (visibleDeputies.length > 0) {
          log(`Rechargement de ${visibleDeputies.length} députés visibles après synchronisation`);
          setTimeout(() => {
            visibleDeputies.forEach(id => {
              loadDeputyFromSupabase(id);
            });
          }, 3000);
        }
        
        const allDeputyIds: string[] = [];
        Object.values(groupsData).forEach(groupDetail => {
          if (!groupDetail) return;
          const deputies = processDeputiesFromVoteDetail(groupDetail);
          deputies.forEach(deputy => {
            if (deputy.id) {
              const formattedId = ensureDeputyIdFormat(deputy.id);
              allDeputyIds.push(formattedId);
            }
          });
        });
        
        if (allDeputyIds.length > 0) {
          log(`Préchargement de ${allDeputyIds.length} députés après synchronisation`);
          setTimeout(() => {
            prefetchDeputiesFromSupabase(allDeputyIds, legislature)
              .then(() => {
                const visibleIds = Array.from(visibleRows);
                log(`Rechargement de ${visibleIds.length} députés visibles après préchargement`);
                visibleIds.forEach(id => loadDeputyFromSupabase(id));
              });
          }, 4000);
        }
      } else {
        const errorMessage = result.message || 'Erreur inconnue';
        log(`Échec de la synchronisation: ${errorMessage}`);
        setSyncError(errorMessage);
        
        toast.error("Échec de la synchronisation", {
          description: errorMessage,
          duration: 5000
        });
        
        // Show more detailed error info
        if (result.fetch_errors && result.fetch_errors.length > 0) {
          console.error(`${LOG_PREFIX} Erreurs de récupération:`, result.fetch_errors);
        }
        
        if (result.sync_errors && result.sync_errors.length > 0) {
          console.error(`${LOG_PREFIX} Erreurs de synchronisation:`, result.sync_errors);
        }
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Exception lors de la synchronisation des députés:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      setSyncError(errorMessage);
      
      toast.error("Erreur lors de la synchronisation", {
        description: errorMessage,
        duration: 5000
      });
    } finally {
      setIsSyncing(false);
    }
  };

  if (apiDataError) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Détail des votes par député</CardTitle>
            <CardDescription>
              Liste complète des votes de chaque député classés par groupe politique
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={getDebugInfo} 
              variant="outline" 
              size="sm"
            >
              <Bug className="h-4 w-4 mr-1" />
              Diagnostic
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showDebugInfo && databaseState && (
            <Alert variant="default" className="mb-4">
              <AlertTitle>Informations de diagnostic</AlertTitle>
              <AlertDescription>
                <div className="mt-2 space-y-2 text-sm">
                  <p><strong>Nombre total de députés:</strong> {databaseState.totalDeputies}</p>
                  <p><strong>Table existe:</strong> {databaseState.tableExists ? 'Oui' : 'Non'}</p>
                  <p><strong>Erreur:</strong> {databaseState.error || 'Aucune'}</p>
                  {databaseState.randomSample && databaseState.randomSample.length > 0 && (
                    <div>
                      <p><strong>Échantillon de la base de données:</strong></p>
                      <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-[200px]">
                        {JSON.stringify(databaseState.randomSample, null, 2)}
                      </pre>
                    </div>
                  )}
                  <p><strong>Nombre de groupes chargés:</strong> {Object.keys(groupsData).length}</p>
                  <p><strong>Nombres de députés visibles:</strong> {visibleRows.size}</p>
                  <p><strong>Nombres de députés chargés:</strong> {Object.keys(deputyInfo).length}</p>
                </div>
              </AlertDescription>
            </Alert>
          )}
          
          <Alert variant="destructive">
            <ServerCrash className="h-4 w-4" />
            <AlertTitle>L'API de l'Assemblée Nationale est inaccessible</AlertTitle>
            <AlertDescription>
              <p className="mb-2">
                Impossible de récupérer les données des députés car l'API de l'Assemblée Nationale semble inaccessible.
              </p>
              <p className="mb-2">
                Les serveurs renvoient des erreurs 404 (Not Found) pour toutes les URL testées.
              </p>
              <p>
                Si vous avez besoin d'accéder aux détails des députés, veuillez réessayer plus tard quand les serveurs de l'Assemblée Nationale seront de nouveau disponibles.
              </p>
            </AlertDescription>
          </Alert>
          
          <div className="mt-4">
            {Object.keys(groupsData).length > 0 ? (
              <div className="space-y-8">
                {Object.entries(groupsData).map(([groupId, groupDetail]) => {
                  if (!groupDetail) return null;
                  
                  const groupName = groupDetail.groupe ? getGroupName(groupDetail.groupe) : (
                    (groupDetail as any).nom || getGroupName(groupDetail) || 'Groupe inconnu'
                  );
                  
                  const deputies = processDeputiesFromVoteDetail(groupDetail);
                  log(`Affichage de ${deputies.length} députés pour le groupe ${groupName}`);
                  
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
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

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
          <div className="flex gap-2">
            <Button 
              onClick={getDebugInfo} 
              variant="outline" 
              size="sm"
            >
              <Bug className="h-4 w-4 mr-1" />
              Diagnostic
            </Button>
            <Button 
              onClick={handleSyncDeputies} 
              variant="default" 
              disabled={isSyncing}
              size="sm"
            >
              <RefreshCcw className={`h-4 w-4 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Synchronisation...' : 'Synchroniser les députés'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showDebugInfo && databaseState && (
            <Alert variant="default" className="mb-4">
              <AlertTitle>Informations de diagnostic</AlertTitle>
              <AlertDescription>
                <div className="mt-2 space-y-2 text-sm">
                  <p><strong>Nombre total de députés:</strong> {databaseState.totalDeputies}</p>
                  <p><strong>Table existe:</strong> {databaseState.tableExists ? 'Oui' : 'Non'}</p>
                  <p><strong>Erreur:</strong> {databaseState.error || 'Aucune'}</p>
                  {databaseState.randomSample && databaseState.randomSample.length > 0 && (
                    <div>
                      <p><strong>Échantillon de la base de données:</strong></p>
                      <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-[200px]">
                        {JSON.stringify(databaseState.randomSample, null, 2)}
                      </pre>
                    </div>
                  )}
                  <p><strong>Nombre de groupes chargés:</strong> {Object.keys(groupsData).length}</p>
                  <p><strong>Nombres de députés visibles:</strong> {visibleRows.size}</p>
                  <p><strong>Nombres de députés chargés:</strong> {Object.keys(deputyInfo).length}</p>
                </div>
              </AlertDescription>
            </Alert>
          )}
          
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
                  log(`Affichage de ${deputies.length} députés pour le groupe ${groupName}`);
                  
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
          <div className="flex gap-2">
            <Button 
              onClick={getDebugInfo} 
              variant="outline" 
              size="sm"
            >
              <Bug className="h-4 w-4 mr-1" />
              Diagnostic
            </Button>
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
          {showDebugInfo && databaseState && (
            <Alert variant="default" className="mb-4">
              <AlertTitle>Informations de diagnostic</AlertTitle>
              <AlertDescription>
                <div className="mt-2 space-y-2 text-sm">
                  <p><strong>Nombre total de députés:</strong> {databaseState.totalDeputies}</p>
                  <p><strong>Table existe:</strong> {databaseState.tableExists ? 'Oui' : 'Non'}</p>
                  <p><strong>Erreur:</strong> {databaseState.error || 'Aucune'}</p>
                  {databaseState.randomSample && databaseState.randomSample.length > 0 && (
                    <div>
                      <p><strong>Échantillon de la base de données:</strong></p>
                      <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-[200px]">
                        {JSON.stringify(databaseState.randomSample, null, 2)}
                      </pre>
                    </div>
                  )}
                  <p><strong>Nombre de groupes chargés:</strong> {Object.keys(groupsData).length}</p>
                  <p><strong>Nombres de députés visibles:</strong> {visibleRows.size}</p>
                  <p><strong>Nombres de députés chargés:</strong> {Object.keys(deputyInfo).length}</p>
                </div>
              </AlertDescription>
            </Alert>
          )}
          
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
              log(`Affichage de ${deputies.length} députés pour le groupe ${groupName}`);
              
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
        <div className="flex gap-2">
          <Button 
            onClick={getDebugInfo} 
            variant="outline" 
            size="sm"
          >
            <Bug className="h-4 w-4 mr-1" />
            Diagnostic
          </Button>
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
        {showDebugInfo && databaseState && (
          <Alert variant="default" className="mb-4">
            <AlertTitle>Informations de diagnostic</AlertTitle>
            <AlertDescription>
              <div className="mt-2 space-y-2 text-sm">
                <p><strong>Nombre total de députés:</strong> {databaseState.totalDeputies}</p>
                <p><strong>Table existe:</strong> {databaseState.tableExists ? 'Oui' : 'Non'}</p>
                <p><strong>Erreur:</strong> {databaseState.error || 'Aucune'}</p>
                {databaseState.randomSample && databaseState.randomSample.length > 0 && (
                  <div>
                    <p><strong>Échantillon de la base de données:</strong></p>
                    <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-[200px]">
                      {JSON.stringify(databaseState.randomSample, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}
        
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
