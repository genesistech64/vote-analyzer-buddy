
import { getDeputyDetails } from './apiService';

interface DeputyInfo {
  id: string;
  prenom: string;
  nom: string;
  groupe_politique?: string;
  groupe_politique_uid?: string;
}

// In-memory cache for deputies
const deputiesCache: Record<string, DeputyInfo> = {};

// Queue for pending deputy ID requests
let pendingDeputyIds: string[] = [];
let isFetchingBatch = false;

/**
 * Add a deputy ID to the fetch queue
 */
export const queueDeputyFetch = (deputyId: string): void => {
  // Clean the ID and verify format
  const cleanId = deputyId.trim();
  
  // Skip if ID is not in correct format or already in cache
  if (!cleanId || !/^PA\d+$/i.test(cleanId) || deputiesCache[cleanId]) {
    return;
  }
  
  // Add to queue if not already there
  if (!pendingDeputyIds.includes(cleanId)) {
    pendingDeputyIds.push(cleanId);
    
    // Start batch processing if not already running
    if (!isFetchingBatch) {
      processPendingDeputies();
    }
  }
};

/**
 * Process all pending deputy ID requests in batches
 */
const processPendingDeputies = async (): Promise<void> => {
  if (pendingDeputyIds.length === 0 || isFetchingBatch) {
    return;
  }
  
  try {
    isFetchingBatch = true;
    
    // Take up to 10 IDs at a time
    const batchIds = pendingDeputyIds.slice(0, 10);
    pendingDeputyIds = pendingDeputyIds.slice(10);
    
    console.log(`[DeputyCache] Fetching batch of ${batchIds.length} deputies`);
    
    // Fetch details for each deputy in parallel
    await Promise.all(
      batchIds.map(async (id) => {
        try {
          // Skip if already in cache
          if (deputiesCache[id]) return;
          
          const details = await getDeputyDetails(id);
          
          deputiesCache[id] = {
            id,
            prenom: details.prenom || '',
            nom: details.nom || '',
            groupe_politique: details.groupe_politique || '',
            groupe_politique_uid: details.groupe_politique_uid || ''
          };
          
          console.log(`[DeputyCache] Added ${id}: ${details.prenom} ${details.nom}`);
        } catch (err) {
          console.error(`[DeputyCache] Error fetching deputy ${id}:`, err);
          // Add a placeholder to prevent continuous retry
          deputiesCache[id] = {
            id,
            prenom: '',
            nom: `Député ${id}`,
            groupe_politique: '',
            groupe_politique_uid: ''
          };
        }
      })
    );
    
    // Continue processing if there are more IDs
    if (pendingDeputyIds.length > 0) {
      setTimeout(processPendingDeputies, 300); // Add a small delay to avoid overwhelming the API
    } else {
      isFetchingBatch = false;
    }
  } catch (error) {
    console.error('[DeputyCache] Error in batch processing:', error);
    isFetchingBatch = false;
    
    // Retry after a delay if there are still pending IDs
    if (pendingDeputyIds.length > 0) {
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
  
  // Return from cache if available
  if (deputiesCache[cleanId]) {
    return deputiesCache[cleanId];
  }
  
  // Queue a fetch if not in cache
  queueDeputyFetch(cleanId);
  
  // Return a temporary placeholder
  return {
    id: cleanId,
    prenom: '',
    nom: `Député ${cleanId}`,
    groupe_politique: '',
    groupe_politique_uid: ''
  };
};

/**
 * Check if a deputy ID exists in the cache
 */
export const isDeputyInCache = (deputyId: string): boolean => {
  return !!deputiesCache[deputyId];
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
export const prefetchDeputies = (deputyIds: string[]): void => {
  if (!Array.isArray(deputyIds) || deputyIds.length === 0) return;
  
  console.log(`[DeputyCache] Prefetching ${deputyIds.length} deputies`);
  
  // Queue each unique ID that's not already in cache
  const uniqueIds = [...new Set(deputyIds)];
  uniqueIds.forEach(id => queueDeputyFetch(id));
};

export default {
  getDeputyInfo,
  queueDeputyFetch,
  formatDeputyName,
  prefetchDeputies,
  isDeputyInCache
};
