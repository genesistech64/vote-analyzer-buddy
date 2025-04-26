import { getDeputyDetails } from './apiService';
import { DeputeFullInfo } from './types';
import { toast } from 'sonner';

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
let activeBatchCount = 0;

// Cache settings
const MAX_RETRIES = 3;
const FETCH_TIMEOUT = 15000;
const RETRY_COOLING_PERIOD = 5000;
const MAX_CONCURRENT_BATCHES = 4;
const BATCH_SIZE = 10;

// Local storage cache configuration
const CACHE_VERSION = 'v1';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000;

/**
 * Add a deputy ID to the fetch queue with improved error handling
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
  
  // Try to get from localStorage first
  const cachedData = getFromLocalStorage(cleanId);
  if (cachedData) {
    // If valid data in localStorage, update in-memory cache
    deputiesCache[cleanId] = {
      ...cachedData,
      loading: false,
      lastFetchAttempt: Date.now(),
      failedAttempts: 0
    };
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
 * Store deputy data in localStorage with expiry
 */
const saveToLocalStorage = (deputyId: string, data: DeputyInfo): void => {
  try {
    const storageKey = `deputy_${CACHE_VERSION}_${deputyId}`;
    const storageData = {
      ...data,
      timestamp: Date.now()
    };
    localStorage.setItem(storageKey, JSON.stringify(storageData));
  } catch (error) {
    console.warn('[DeputyCache] Failed to save to localStorage:', error);
    // If localStorage is full, clear old items
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      clearOldCacheEntries();
    }
  }
};

/**
 * Get deputy data from localStorage if not expired
 */
const getFromLocalStorage = (deputyId: string): DeputyInfo | null => {
  try {
    const storageKey = `deputy_${CACHE_VERSION}_${deputyId}`;
    const data = localStorage.getItem(storageKey);
    if (!data) return null;
    
    const parsed = JSON.parse(data);
    const now = Date.now();
    
    // Check if cached data is expired
    if (parsed.timestamp && (now - parsed.timestamp) < CACHE_EXPIRY && parsed.prenom && parsed.nom) {
      return {
        id: deputyId,
        prenom: parsed.prenom,
        nom: parsed.nom,
        groupe_politique: parsed.groupe_politique,
        groupe_politique_uid: parsed.groupe_politique_uid,
        profession: parsed.profession,
        loading: false,
        lastFetchAttempt: now,
        failedAttempts: 0
      };
    }
    
    // Remove expired data
    localStorage.removeItem(storageKey);
    return null;
  } catch (error) {
    console.warn('[DeputyCache] Failed to retrieve from localStorage:', error);
    return null;
  }
};

/**
 * Clear old cache entries when storage is full
 */
const clearOldCacheEntries = (): void => {
  try {
    const keysToRemove: string[] = [];
    const now = Date.now();
    
    // Find old cache entries to remove
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`deputy_${CACHE_VERSION}_`)) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          // Remove if older than 1 week
          if (data.timestamp && (now - data.timestamp) > 7 * 24 * 60 * 60 * 1000) {
            keysToRemove.push(key);
          }
        } catch (e) {
          // If can't parse, just remove it
          keysToRemove.push(key);
        }
      }
    }
    
    // Remove the old entries
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    console.log(`[DeputyCache] Cleared ${keysToRemove.length} old cache entries`);
  } catch (error) {
    console.error('[DeputyCache] Error clearing old cache:', error);
  }
};

/**
 * Process all pending deputy ID requests in batches with improved performance
 */
const processPendingDeputies = async (): Promise<void> => {
  if ((priorityDeputyIds.length === 0 && pendingDeputyIds.length === 0) || 
      activeBatchCount >= MAX_CONCURRENT_BATCHES) {
    return;
  }
  
  activeBatchCount++;
  
  try {
    // Take from priority queue first, then regular queue
    let batchIds: string[] = [];
    
    if (priorityDeputyIds.length > 0) {
      // Take priority IDs (limited to batch size)
      batchIds = priorityDeputyIds.slice(0, BATCH_SIZE);
      priorityDeputyIds = priorityDeputyIds.slice(BATCH_SIZE);
    } else {
      // Take from the regular queue
      batchIds = pendingDeputyIds.slice(0, BATCH_SIZE);
      pendingDeputyIds = pendingDeputyIds.slice(BATCH_SIZE);
    }
    
    console.log(`[DeputyCache] Fetching batch of ${batchIds.length} deputies`);
    
    // Use Promise.allSettled to process all requests regardless of failures
    const results = await Promise.allSettled(
      batchIds.map(async (id) => {
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
            
            const deputyInfo = {
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
            
            // Update in-memory cache
            deputiesCache[id] = deputyInfo;
            
            // Save to localStorage
            saveToLocalStorage(id, deputyInfo);
            
            console.log(`[DeputyCache] Added ${id}: ${prenom} ${nom} (${groupePolitiqueUid})`);
            return { id, success: true };
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
          return { id, success: false, error: err };
        }
      })
    );
    
    // Continue processing if there are more IDs with a small delay to avoid overwhelming the API
    if (priorityDeputyIds.length > 0 || pendingDeputyIds.length > 0) {
      setTimeout(processPendingDeputies, 200);
    } else {
      activeBatchCount--;
    }
  } catch (error) {
    console.error('[DeputyCache] Error in batch processing:', error);
    activeBatchCount--;
    
    // Retry after a delay if there are still pending IDs
    if (priorityDeputyIds.length > 0 || pendingDeputyIds.length > 0) {
      setTimeout(processPendingDeputies, 1000);
    }
  }
};

/**
 * Get deputy information by ID with improved caching
 */
export const getDeputyInfo = (deputyId: string): DeputyInfo | null => {
  if (!deputyId) return null;
  
  const cleanId = deputyId.trim();
  
  // Try to get from localStorage first
  const localData = getFromLocalStorage(cleanId);
  if (localData && localData.prenom && localData.nom) {
    // Update in-memory cache if needed
    if (!deputiesCache[cleanId] || !deputiesCache[cleanId].prenom || !deputiesCache[cleanId].nom) {
      deputiesCache[cleanId] = localData;
    }
    return localData;
  }
  
  // Return from in-memory cache if available
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
          // Queue for retry with priority
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
 * Prefetch a list of deputy IDs with optimized batch processing
 */
export const prefetchDeputies = (deputyIds: string[], highPriority = false): void => {
  if (!Array.isArray(deputyIds) || deputyIds.length === 0) return;
  
  console.log(`[DeputyCache] Prefetching ${deputyIds.length} deputies${highPriority ? ' (high priority)' : ''}`);
  
  // Queue each unique ID that's not already in cache with complete data
  const uniqueIds = [...new Set(deputyIds.filter(id => id && typeof id === 'string'))];
  
  // Process in batches to avoid overwhelming the queue
  const batchSize = 50;
  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batch = uniqueIds.slice(i, i + batchSize);
    
    setTimeout(() => {
      batch.forEach(id => {
        const localData = getFromLocalStorage(id);
        if (localData && localData.prenom && localData.nom) {
          // Update in-memory cache without queuing
          deputiesCache[id] = localData;
        } else {
          // Skip if already cached with complete data
          const deputy = deputiesCache[id];
          if (deputy && deputy.prenom && deputy.nom) return;
          
          queueDeputyFetch(id, highPriority);
        }
      });
    }, Math.floor(i / batchSize) * 100); // Stagger the batches
  }
};

/**
 * Explicitly prioritize loading specific deputies immediately with better performance
 */
export const prioritizeDeputies = (deputyIds: string[]): void => {
  if (!Array.isArray(deputyIds) || deputyIds.length === 0) return;
  
  console.log(`[DeputyCache] Prioritizing ${deputyIds.length} deputies`);
  
  // Force high priority queue and immediate reload
  const uniqueIds = [...new Set(deputyIds.filter(id => id && typeof id === 'string'))];
  
  // Process in smaller batches for more immediate response
  const batchSize = 20;
  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batch = uniqueIds.slice(i, i + batchSize);
    
    setTimeout(() => {
      batch.forEach(id => {
        // Reset any failure counts
        if (deputiesCache[id]) {
          deputiesCache[id].failedAttempts = 0;
        }
        queueDeputyFetch(id, true);
      });
    }, Math.floor(i / batchSize) * 50); // Small delays between batches
  }
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
  
  // Clear localStorage cache too
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`deputy_${CACHE_VERSION}_`)) {
        localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.error('[DeputyCache] Error clearing localStorage cache:', error);
  }
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
