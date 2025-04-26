
import { useState, useEffect } from 'react';
import { getDeputyFromSupabase } from '@/utils/deputySupabaseService';
import { DeputeInfo } from '@/utils/types';
import { getDeputyInfo } from '@/utils/deputyCache';

export const useDeputyData = (deputyId: string, legislature: string) => {
  const [deputyInfo, setDeputyInfo] = useState<DeputeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDeputyData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // First try to get from cache and ensure it matches DeputeInfo type
        const cachedData = getDeputyInfo(deputyId);
        if (cachedData) {
          const formattedCachedData: DeputeInfo = {
            id: cachedData.id,
            prenom: cachedData.prenom,
            nom: cachedData.nom,
            profession: 'Non renseignée', // Default value for cached data
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
          setDeputyInfo(null);
        }
      } catch (err) {
        console.error(`Error loading deputy data for ${deputyId}:`, err);
        setError(err instanceof Error ? err.message : 'Une erreur est survenue');
      } finally {
        setIsLoading(false);
      }
    };

    if (deputyId && legislature) {
      loadDeputyData();
    }
  }, [deputyId, legislature]);

  return { deputyInfo, isLoading, error };
};
