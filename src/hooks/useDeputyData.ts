
import { useState, useEffect, useCallback, useRef } from 'react';
import { getDeputyFromSupabase } from '@/utils/deputySupabaseService';
import { DeputeInfo } from '@/utils/types';
import { getDeputyInfo, prioritizeDeputies, prefetchDeputies } from '@/utils/deputyCache';
import { toast } from 'sonner';

export const useDeputyData = (deputyId: string, legislature: string) => {
  const [deputyInfo, setDeputyInfo] = useState<DeputeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryCountRef = useRef(0);
  const isMountedRef = useRef(true);
  const MAX_RETRIES = 3;

  // Use a ref to store signal to abort fetch requests on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadDeputyData = useCallback(async () => {
    if (!deputyId || !legislature || !isMountedRef.current) {
      setIsLoading(false);
      return;
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      setIsLoading(true);
      setError(null);

      // Try to get from memory cache first (fastest option)
      const cachedData = getDeputyInfo(deputyId);
      if (cachedData && cachedData.prenom && cachedData.nom) {
        const formattedCachedData: DeputeInfo = {
          id: cachedData.id,
          prenom: cachedData.prenom,
          nom: cachedData.nom,
          profession: cachedData.profession || 'Non renseignée',
          groupe_politique: cachedData.groupe_politique,
          groupe_politique_id: cachedData.groupe_politique_uid
        };
        if (isMountedRef.current) {
          setDeputyInfo(formattedCachedData);
          setIsLoading(false);
        }
        return;
      }

      // Check local storage cache
      const localStorageKey = `deputy_${deputyId}_${legislature}`;
      const storedData = localStorage.getItem(localStorageKey);
      if (storedData) {
        try {
          const parsedData = JSON.parse(storedData);
          const timestamp = parsedData._timestamp || 0;
          const currentTime = new Date().getTime();
          
          // Use cached data if it's less than a day old (86400000 ms = 24 hours)
          if (currentTime - timestamp < 86400000 && parsedData.prenom && parsedData.nom) {
            if (isMountedRef.current) {
              setDeputyInfo({
                id: deputyId,
                prenom: parsedData.prenom,
                nom: parsedData.nom,
                profession: parsedData.profession || 'Non renseignée',
                groupe_politique: parsedData.groupe_politique,
                groupe_politique_id: parsedData.groupe_politique_uid
              });
              setIsLoading(false);
            }
            
            // Also update memory cache for future use
            prioritizeDeputies([deputyId]);
            return;
          }
        } catch (e) {
          // Ignore parsing errors, just continue with fetching
          console.warn(`[useDeputyData] Error parsing local storage data for deputy ${deputyId}:`, e);
        }
      }

      // If not in cache, try to get from Supabase
      const supabaseData = await getDeputyFromSupabase(deputyId, legislature);
      if (signal.aborted) return;
      
      if (supabaseData) {
        if (isMountedRef.current) {
          setDeputyInfo(supabaseData);
          setIsLoading(false);
        }
        
        // Cache in localStorage for future use
        localStorage.setItem(localStorageKey, JSON.stringify({
          ...supabaseData,
          _timestamp: new Date().getTime()
        }));
        
        return;
      }

      // If not in Supabase, try to get directly from API
      console.log(`[useDeputyData] Fetching deputy ${deputyId} from API`);
      const apiUrl = `https://api-dataan.onrender.com/depute?depute_id=${deputyId}`;
      
      const response = await fetch(apiUrl, { signal });
      if (signal.aborted) return;
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const rawData = await response.json();
      if (signal.aborted) return;
      
      console.log('[useDeputyData] API response:', rawData);
      
      if (rawData && !rawData.error) {
        const deputeData: DeputeInfo = {
          id: deputyId,
          prenom: rawData.prenom || rawData.etatCivil?.ident?.prenom || 'Non renseigné',
          nom: rawData.nom || rawData.etatCivil?.ident?.nom || 'Non renseigné',
          profession: rawData.profession || 'Non renseignée',
          groupe_politique: rawData.groupe_politique || 'Non renseigné',
          groupe_politique_id: rawData.groupe_politique_uid || ''
        };

        console.log('[useDeputyData] Processed deputy data:', deputeData);

        if (deputeData.prenom !== 'Non renseigné' || deputeData.nom !== 'Non renseigné') {
          if (isMountedRef.current) {
            setDeputyInfo(deputeData);
            setIsLoading(false);
          }
          
          // Cache in localStorage for future use
          localStorage.setItem(localStorageKey, JSON.stringify({
            ...deputeData,
            _timestamp: new Date().getTime()
          }));
          
          prioritizeDeputies([deputyId]); // Add to memory cache for future use
        } else if (retryCountRef.current < MAX_RETRIES) {
          console.log(`[useDeputyData] Retry ${retryCountRef.current + 1}/${MAX_RETRIES} for deputy ${deputyId}`);
          retryCountRef.current += 1;
          setTimeout(() => {
            if (isMountedRef.current) {
              loadDeputyData();
            }
          }, 2000 * (retryCountRef.current));
          return;
        } else {
          console.error(`[useDeputyData] Failed to load deputy ${deputyId} after ${MAX_RETRIES} retries`);
          if (isMountedRef.current) {
            setDeputyInfo(null);
            toast.error("Impossible de charger les informations du député", {
              description: "Les données ne sont pas disponibles pour le moment."
            });
            setIsLoading(false);
          }
        }
      } else {
        if (retryCountRef.current < MAX_RETRIES) {
          console.log(`[useDeputyData] Retry ${retryCountRef.current + 1}/${MAX_RETRIES} for deputy ${deputyId}`);
          retryCountRef.current += 1;
          setTimeout(() => {
            if (isMountedRef.current) {
              loadDeputyData();
            }
          }, 2000 * (retryCountRef.current));
          return;
        }
        
        console.error(`[useDeputyData] No valid data returned for deputy ${deputyId}`);
        if (isMountedRef.current) {
          setDeputyInfo(null);
          toast.error("Impossible de charger les informations du député", {
            description: "Les données ne sont pas disponibles pour le moment."
          });
          setIsLoading(false);
        }
      }
    } catch (err) {
      // Ignore aborted fetch errors
      if (signal.aborted) return;
      
      console.error(`[useDeputyData] Error loading deputy data for ${deputyId}:`, err);
      if (retryCountRef.current >= MAX_RETRIES && isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        toast.error("Erreur lors du chargement", {
          description: err instanceof Error ? err.message : 'Une erreur est survenue'
        });
        setIsLoading(false);
      } else if (isMountedRef.current) {
        retryCountRef.current += 1;
        setTimeout(() => {
          if (isMountedRef.current) {
            loadDeputyData();
          }
        }, 2000 * (retryCountRef.current));
      }
    }
  }, [deputyId, legislature]);

  useEffect(() => {
    isMountedRef.current = true;
    retryCountRef.current = 0;
    loadDeputyData();
    
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadDeputyData]);

  return { deputyInfo, isLoading, error };
};
