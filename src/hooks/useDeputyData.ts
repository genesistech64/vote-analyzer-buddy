
import { useState, useEffect, useCallback } from 'react';
import { getDeputyFromSupabase } from '@/utils/deputySupabaseService';
import { DeputeInfo } from '@/utils/types';
import { getDeputyInfo, prioritizeDeputies } from '@/utils/deputyCache';

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

      // First try to get from cache
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

      // If not in cache, try to get from Supabase
      const data = await getDeputyFromSupabase(deputyId, legislature);
      if (data) {
        const deputeData: DeputeInfo = {
          id: data.id,
          prenom: data.prenom,
          nom: data.nom,
          profession: data.profession || 'Non renseignée',
          groupe_politique: data.groupe_politique,
          groupe_politique_id: data.groupe_politique_id
        };
        setDeputyInfo(deputeData);
      } else {
        if (retryCount < MAX_RETRIES) {
          console.log(`Retry ${retryCount + 1}/${MAX_RETRIES} for deputy ${deputyId}`);
          setRetryCount(prev => prev + 1);
          setTimeout(() => {
            loadDeputyData();
          }, 2000 * (retryCount + 1));
          
          // Explicitly prioritize this deputy in the cache system
          prioritizeDeputies([deputyId]);
          return;
        }
        setDeputyInfo(null);
      }
    } catch (err) {
      console.error(`Error loading deputy data for ${deputyId}:`, err);
      if (retryCount >= MAX_RETRIES) {
        setError(err instanceof Error ? err.message : 'Une erreur est survenue');
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
