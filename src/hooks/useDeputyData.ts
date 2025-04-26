
import { useState, useEffect, useCallback } from 'react';
import { getDeputyFromSupabase } from '@/utils/deputySupabaseService';
import { DeputeInfo } from '@/utils/types';
import { getDeputyInfo, prioritizeDeputies } from '@/utils/deputyCache';
import { toast } from 'sonner';

export const useDeputyData = (deputyId: string, legislature: string) => {
  const [deputyInfo, setDeputyInfo] = useState<DeputeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

  const loadDeputyData = useCallback(async () => {
    if (!deputyId || !legislature) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // First try to get from memory cache
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
        setDeputyInfo(formattedCachedData);
        setIsLoading(false);
        return;
      }

      // If not in memory cache, try to get from Supabase
      const supabaseData = await getDeputyFromSupabase(deputyId, legislature);
      if (supabaseData) {
        setDeputyInfo(supabaseData);
        setIsLoading(false);
        return;
      }

      // If not in Supabase, try to get directly from API
      console.log(`[useDeputyData] Fetching deputy ${deputyId} from API`);
      const apiUrl = `https://api-dataan.onrender.com/depute?depute_id=${deputyId}`;
      
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const rawData = await response.json();
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
          setDeputyInfo(deputeData);
          prioritizeDeputies([deputyId]); // Add to memory cache for future use
        } else if (retryCount < MAX_RETRIES) {
          console.log(`[useDeputyData] Retry ${retryCount + 1}/${MAX_RETRIES} for deputy ${deputyId}`);
          setRetryCount(prev => prev + 1);
          setTimeout(() => {
            loadDeputyData();
          }, 2000 * (retryCount + 1));
          return;
        } else {
          console.error(`[useDeputyData] Failed to load deputy ${deputyId} after ${MAX_RETRIES} retries`);
          setDeputyInfo(null);
          toast.error("Impossible de charger les informations du député", {
            description: "Les données ne sont pas disponibles pour le moment."
          });
        }
      } else {
        if (retryCount < MAX_RETRIES) {
          console.log(`[useDeputyData] Retry ${retryCount + 1}/${MAX_RETRIES} for deputy ${deputyId}`);
          setRetryCount(prev => prev + 1);
          setTimeout(() => {
            loadDeputyData();
          }, 2000 * (retryCount + 1));
          return;
        }
        
        console.error(`[useDeputyData] No valid data returned for deputy ${deputyId}`);
        setDeputyInfo(null);
        toast.error("Impossible de charger les informations du député", {
          description: "Les données ne sont pas disponibles pour le moment."
        });
      }
    } catch (err) {
      console.error(`[useDeputyData] Error loading deputy data for ${deputyId}:`, err);
      if (retryCount >= MAX_RETRIES) {
        setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        toast.error("Erreur lors du chargement", {
          description: err instanceof Error ? err.message : 'Une erreur est survenue'
        });
      } else {
        setRetryCount(prev => prev + 1);
        setTimeout(() => {
          loadDeputyData();
        }, 2000 * (retryCount + 1));
        return;
      }
    } finally {
      if (retryCount >= MAX_RETRIES) {
        setIsLoading(false);
      }
    }
  }, [deputyId, legislature, retryCount]);

  useEffect(() => {
    loadDeputyData();
  }, [loadDeputyData]);

  return { deputyInfo, isLoading, error };
};
