import { getDeputyDetails } from './apiService';
import { DeputeFullInfo } from './types';

interface DeputyInfo {
  id: string;
  prenom: string;
  nom: string;
  groupe_politique?: string;
  groupe_politique_uid?: string;
  profession?: string;
  loading?: boolean;
  lastFetchAttempt?: number;
  failedAttempts?: number;
}

// In-memory cache for deputies
const deputiesCache: Record<string, DeputyInfo> = {};

// Queue for pending deputy ID requests
let pendingDeputyIds: string[] = [];
let priorityDeputyIds: string[] = [];
let isFetchingBatch = false;

// Max number of retries for fetching a deputy
const MAX_RETRIES = 3;
// Timeout for deputy fetch (ms)
const FETCH_TIMEOUT = 15000;
// Cooling period after failed attempt (ms)
const RETRY_COOLING_PERIOD = 5000;
// Max concurrent batches
const MAX_CONCURRENT_BATCHES = 2;
// Current number of active batches
let activeBatchCount = 0;

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
  
  if (deputy) {
    // Skip if too many failed attempts
    if (deputy.failedAttempts && deputy.failedAttempts >= MAX_RETRIES) {
      // Only retry after a cooling period
      if (deputy.lastFetchAttempt && (now - deputy.lastFetchAttempt) < RETRY_COOLING_PERIOD * deputy.failedAttempts) {
        return;
      }
    }
    
    // Skip if we tried to fetch recently and it's still loading
    if (deputy.loading && deputy.lastFetchAttempt && (now - deputy.lastFetchAttempt) < FETCH_TIMEOUT) {
      return;
    }
  }
  
  // Add to cache with loading state if not already there
  if (!deputiesCache[cleanId]) {
    deputiesCache[cleanId] = {
      id: cleanId,
      prenom: '',
      nom: '',
      loading: true,
      lastFetchAttempt: now,
      failedAttempts: 0
    };
  } else {
    // Update loading state
    deputiesCache[cleanId].loading = true;
    deputiesCache[cleanId].lastFetchAttempt = now;
  }
  
  // Add to the appropriate queue if not already there
  if (priority) {
    if (!priorityDeputyIds.includes(cleanId)) {
      // If already in regular queue, remove it
      pendingDeputyIds = pendingDeputyIds.filter(id => id !== cleanId);
      // Add to priority queue
      priorityDeputyIds.push(cleanId);
    }
  } else {
    if (!pendingDeputyIds.includes(cleanId) && !priorityDeputyIds.includes(cleanId)) {
      pendingDeputyIds.push(cleanId);
    }
  }
  
  // Start batch processing if not already running
  if (activeBatchCount < MAX_CONCURRENT_BATCHES) {
    processPendingDeputies();
  }
};

/**
 * Process all pending deputy ID requests in batches
 */
const processPendingDeputies = async (): Promise<void> => {
  if ((priorityDeputyIds.length === 0 && pendingDeputyIds.length === 0) || 
      activeBatchCount >= MAX_CONCURRENT_BATCHES) {
    return;
  }
  
  activeBatchCount++;
  
  try {
    isFetchingBatch = true;
    
    // Take from priority queue first, then regular queue
    let batchIds: string[] = [];
    
    if (priorityDeputyIds.length > 0) {
      // Take all priority IDs (limited to 5 max)
      batchIds = priorityDeputyIds.slice(0, 5);
      priorityDeputyIds = priorityDeputyIds.slice(5);
    } else {
      // Take up to 5 IDs from the regular queue
      batchIds = pendingDeputyIds.slice(0, 5);
      pendingDeputyIds = pendingDeputyIds.slice(5);
    }
    
    console.log(`[DeputyCache] Fetching batch of ${batchIds.length} deputies`);
    
    // Set timeout for each deputy fetch
    const fetchPromises = batchIds.map(async (id) => {
      try {
        // Create a promise that rejects after FETCH_TIMEOUT ms
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Timeout fetching deputy ${id}`)), FETCH_TIMEOUT);
        });
        
        // Create the fetch promise
        const fetchPromise = getDeputyDetails(id);
        
        // Race between the timeout and the fetch
        const details = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (details) {
          let prenom = '', nom = '';
          let groupePolitique = '';
          let groupePolitiqueUid = '';
          let profession = 'Non renseignée';
          
          // Extract info from the API response
          if (details.etatCivil && details.etatCivil.ident) {
            prenom = details.etatCivil.ident.prenom || '';
            nom = details.etatCivil.ident.nom || '';
          } else {
            prenom = details.prenom || '';
            nom = details.nom || '';
          }
          
          // Try to extract group and profession information
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
            profession = details.profession || 'Non renseignée';
          }
          
          deputiesCache[id] = {
            id,
            prenom,
            nom,
            groupe_politique: groupePolitique,
            groupe_politique_uid: groupePolitiqueUid,
            profession,
            loading: false,
            lastFetchAttempt: Date.now(),
            failedAttempts: 0
          };
          
          console.log(`[DeputyCache] Added ${id}: ${prenom} ${nom} (${groupePolitiqueUid})`);
          return true;
        } else {
          throw new Error(`Invalid data structure for deputy ${id}`);
        }
      } catch (err) {
        console.error(`[DeputyCache] Error fetching deputy ${id}:`, err);
        // Update failures counter
        if (deputiesCache[id]) {
          const currentFailures = deputiesCache[id].failedAttempts || 0;
          deputiesCache[id].loading = false;
          deputiesCache[id].lastFetchAttempt = Date.now();
          deputiesCache[id].failedAttempts = currentFailures + 1;
          
          // After max retries, set a fallback name
          if (currentFailures + 1 >= MAX_RETRIES) {
            deputiesCache[id].prenom = '';
            deputiesCache[id].nom = `Député ${id.substring(2)}`;
          }
        }
        return false;
      }
    });
    
    // Fetch details for each deputy with a timeout
    await Promise.all(fetchPromises);
    
    // Continue processing if there are more IDs
    if (priorityDeputyIds.length > 0 || pendingDeputyIds.length > 0) {
      setTimeout(processPendingDeputies, 300); // Add a small delay to avoid overwhelming the API
    } else {
      isFetchingBatch = false;
      activeBatchCount--;
    }
  } catch (error) {
    console.error('[DeputyCache] Error in batch processing:', error);
    isFetchingBatch = false;
    activeBatchCount--;
    
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
    // If it's been loading for too long, mark it as failed
    if (deputiesCache[cleanId].loading && deputiesCache[cleanId].lastFetchAttempt) {
      const now = Date.now();
      if (now - deputiesCache[cleanId].lastFetchAttempt! > FETCH_TIMEOUT) {
        deputiesCache[cleanId].loading = false;
        const currentFailures = deputiesCache[cleanId].failedAttempts || 0;
        deputiesCache[cleanId].failedAttempts = currentFailures + 1;
        
        // After max retries, set a fallback name
        if (currentFailures + 1 >= MAX_RETRIES) {
          deputiesCache[cleanId].prenom = '';
          deputiesCache[cleanId].nom = `Député ${cleanId.substring(2)}`;
        } else {
          // Queue for retry
          queueDeputyFetch(cleanId, true);
        }
      }
    }
    return deputiesCache[cleanId];
  }
  
  // Queue a fetch if not in cache (with regular priority)
  queueDeputyFetch(cleanId);
  
  // Return a temporary placeholder with loading state
  return {
    id: cleanId,
    prenom: '',
    nom: `Député ${cleanId.substring(2)}`,
    loading: true,
    lastFetchAttempt: Date.now(),
    failedAttempts: 0
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
  
  if (!deputy) return `Député ${deputyId.substring(2)}`;
  
  if (deputy.prenom && deputy.nom) {
    return `${deputy.prenom} ${deputy.nom}`;
  }
  
  return `Député ${deputyId.substring(2)}`;
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

/**
 * Explicitly prioritize loading specific deputies immediately
 */
export const prioritizeDeputies = (deputyIds: string[]): void => {
  if (!Array.isArray(deputyIds) || deputyIds.length === 0) return;
  
  console.log(`[DeputyCache] Prioritizing ${deputyIds.length} deputies`);
  
  // Force high priority queue and immediate reload
  const uniqueIds = [...new Set(deputyIds.filter(id => id && typeof id === 'string'))];
  uniqueIds.forEach(id => {
    // Reset any failure counts
    if (deputiesCache[id]) {
      deputiesCache[id].failedAttempts = 0;
    }
    queueDeputyFetch(id, true);
  });
};

/**
 * Reset cache for testing or debugging
 */
export const clearDeputiesCache = (): void => {
  Object.keys(deputiesCache).forEach(key => {
    delete deputiesCache[key];
  });
  pendingDeputyIds = [];
  priorityDeputyIds = [];
  console.log('[DeputyCache] Cache cleared');
};

export default {
  getDeputyInfo,
  queueDeputyFetch,
  formatDeputyName,
  prefetchDeputies,
  prioritizeDeputies,
  isDeputyInCache,
  isDeputyLoading,
  clearDeputiesCache
};
