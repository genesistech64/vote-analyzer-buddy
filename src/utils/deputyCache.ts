import { getDeputyDetails } from './apiService';
import { DeputeFullInfo } from './types';

interface DeputyInfo {
  id: string;
  prenom: string;
  nom: string;
  groupe_politique?: string;
  groupe_politique_uid?: string;
  loading?: boolean;
  lastFetchAttempt?: number;
}

// In-memory cache for deputies
const deputiesCache: Record<string, DeputyInfo> = {};

// Queue for pending deputy ID requests
let pendingDeputyIds: string[] = [];
let priorityDeputyIds: string[] = [];
let isFetchingBatch = false;

// Max number of retries for fetching a deputy
const MAX_RETRIES = 2;

/**
 * Add a deputy ID to the fetch queue
 */
export const queueDeputyFetch = (deputyId: string, priority = false): void => {
  // Skip if no ID provided
  if (!deputyId) return;
  
  // Clean the ID and verify format
  const cleanId = deputyId.trim();
  
  // Skip if ID is not in correct format
  if (!cleanId || !/^PA\d+$/i.test(cleanId)) {
    return;
  }
  
  // If already in cache and has valid data, no need to fetch again
  if (deputiesCache[cleanId] && deputiesCache[cleanId].prenom && deputiesCache[cleanId].nom) {
    return;
  }
  
  // Check if the deputy was recently fetched and failed
  const deputy = deputiesCache[cleanId];
  const now = Date.now();
  if (deputy && deputy.lastFetchAttempt && (now - deputy.lastFetchAttempt < 10000)) {
    // Skip if we tried to fetch in the last 10 seconds and it failed
    return;
  }
  
  // Add to cache with loading state if not already there
  if (!deputiesCache[cleanId]) {
    deputiesCache[cleanId] = {
      id: cleanId,
      prenom: '',
      nom: '',
      loading: true,
      lastFetchAttempt: now
    };
  } else {
    // Update loading state
    deputiesCache[cleanId].loading = true;
    deputiesCache[cleanId].lastFetchAttempt = now;
  }
  
  // Add to the appropriate queue if not already there
  if (priority) {
    if (!priorityDeputyIds.includes(cleanId)) {
      priorityDeputyIds.push(cleanId);
    }
  } else {
    if (!pendingDeputyIds.includes(cleanId) && !priorityDeputyIds.includes(cleanId)) {
      pendingDeputyIds.push(cleanId);
    }
  }
  
  // Start batch processing if not already running
  if (!isFetchingBatch) {
    processPendingDeputies();
  }
};

/**
 * Process all pending deputy ID requests in batches
 */
const processPendingDeputies = async (): Promise<void> => {
  if ((priorityDeputyIds.length === 0 && pendingDeputyIds.length === 0) || isFetchingBatch) {
    return;
  }
  
  try {
    isFetchingBatch = true;
    
    // Take from priority queue first, then regular queue
    let batchIds: string[] = [];
    
    if (priorityDeputyIds.length > 0) {
      // Take all priority IDs (limited to 10 max)
      batchIds = priorityDeputyIds.slice(0, 10);
      priorityDeputyIds = priorityDeputyIds.slice(10);
    } else {
      // Take up to 10 IDs from the regular queue
      batchIds = pendingDeputyIds.slice(0, 10);
      pendingDeputyIds = pendingDeputyIds.slice(10);
    }
    
    console.log(`[DeputyCache] Fetching batch of ${batchIds.length} deputies`);
    
    // Fetch details for each deputy in parallel
    await Promise.all(
      batchIds.map(async (id) => {
        try {
          const details = await getDeputyDetails(id);
          
          if (details) {
            let prenom = '', nom = '';
            let groupePolitique = '';
            let groupePolitiqueUid = '';
            
            // Extract info from the API response
            if (details.etatCivil && details.etatCivil.ident) {
              prenom = details.etatCivil.ident.prenom || '';
              nom = details.etatCivil.ident.nom || '';
            } else {
              prenom = details.prenom || '';
              nom = details.nom || '';
            }
            
            // Try to extract group information from mandats
            if (details.mandats && details.mandats.mandat) {
              const mandats = Array.isArray(details.mandats.mandat) 
                ? details.mandats.mandat 
                : [details.mandats.mandat];
              
              // Find the first mandat with an organeRef (political group)
              const politicalGroupMandat = mandats.find(m => 
                m.organes && m.organes.organeRef && 
                typeof m.organes.organeRef === 'string' && 
                m.organes.organeRef.startsWith('PO')
              );
              
              if (politicalGroupMandat && politicalGroupMandat.organes) {
                groupePolitiqueUid = politicalGroupMandat.organes.organeRef;
                // Try to get the group name
                if (politicalGroupMandat.nomOrgane) {
                  groupePolitique = politicalGroupMandat.nomOrgane;
                }
              }
            } else {
              groupePolitique = details.groupe_politique || '';
              groupePolitiqueUid = details.groupe_politique_uid || '';
            }
            
            deputiesCache[id] = {
              id,
              prenom,
              nom,
              groupe_politique: groupePolitique,
              groupe_politique_uid: groupePolitiqueUid,
              loading: false,
              lastFetchAttempt: Date.now()
            };
            
            console.log(`[DeputyCache] Added ${id}: ${prenom} ${nom} (${groupePolitiqueUid})`);
          } else {
            console.warn(`[DeputyCache] Invalid data structure for deputy ${id}:`, details);
            // Mark as no longer loading but keep placeholder
            if (deputiesCache[id]) {
              deputiesCache[id].loading = false;
              deputiesCache[id].lastFetchAttempt = Date.now();
            }
          }
        } catch (err) {
          console.error(`[DeputyCache] Error fetching deputy ${id}:`, err);
          // Mark as no longer loading but keep placeholder
          if (deputiesCache[id]) {
            deputiesCache[id].loading = false;
            deputiesCache[id].lastFetchAttempt = Date.now();
          }
        }
      })
    );
    
    // Continue processing if there are more IDs
    if (priorityDeputyIds.length > 0 || pendingDeputyIds.length > 0) {
      setTimeout(processPendingDeputies, 300); // Add a small delay to avoid overwhelming the API
    } else {
      isFetchingBatch = false;
    }
  } catch (error) {
    console.error('[DeputyCache] Error in batch processing:', error);
    isFetchingBatch = false;
    
    // Retry after a delay if there are still pending IDs
    if (priorityDeputyIds.length > 0 || pendingDeputyIds.length > 0) {
      setTimeout(processPendingDeputies, 2000);
    }
  }
};

/**
 * Get deputy information by ID, returns from cache or queues a fetch
 */
export const getDeputyInfo = (deputyId: string): DeputyInfo | null => {
  if (!deputyId) return null;
  
  const cleanId = deputyId.trim();
  
  // Return from cache if available (even if loading)
  if (deputiesCache[cleanId]) {
    return deputiesCache[cleanId];
  }
  
  // Queue a fetch if not in cache (with regular priority)
  queueDeputyFetch(cleanId);
  
  // Return a temporary placeholder with loading state
  return {
    id: cleanId,
    prenom: '',
    nom: `Député ${cleanId}`,
    loading: true,
    lastFetchAttempt: Date.now()
  };
};

/**
 * Check if a deputy ID exists in the cache and has complete data
 */
export const isDeputyInCache = (deputyId: string): boolean => {
  const deputy = deputiesCache[deputyId];
  return !!(deputy && deputy.prenom && deputy.nom);
};

/**
 * Check if a deputy is currently loading
 */
export const isDeputyLoading = (deputyId: string): boolean => {
  const deputy = deputiesCache[deputyId];
  return !!(deputy && deputy.loading);
};

/**
 * Format deputy name from ID
 */
export const formatDeputyName = (deputyId: string): string => {
  const deputy = getDeputyInfo(deputyId);
  
  if (!deputy) return `Député ${deputyId}`;
  
  if (deputy.prenom && deputy.nom) {
    return `${deputy.prenom} ${deputy.nom}`;
  }
  
  return `Député ${deputyId}`;
};

/**
 * Prefetch a list of deputy IDs
 */
export const prefetchDeputies = (deputyIds: string[], highPriority = false): void => {
  if (!Array.isArray(deputyIds) || deputyIds.length === 0) return;
  
  console.log(`[DeputyCache] Prefetching ${deputyIds.length} deputies${highPriority ? ' (high priority)' : ''}`);
  
  // Queue each unique ID that's not already in cache with complete data
  const uniqueIds = [...new Set(deputyIds.filter(id => id && typeof id === 'string'))];
  uniqueIds.forEach(id => {
    const deputy = deputiesCache[id];
    // Skip if already cached with complete data
    if (deputy && deputy.prenom && deputy.nom) return;
    
    queueDeputyFetch(id, highPriority);
  });
};

export default {
  getDeputyInfo,
  queueDeputyFetch,
  formatDeputyName,
  prefetchDeputies,
  isDeputyInCache,
  isDeputyLoading
};
