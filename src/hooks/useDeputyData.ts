
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

        // First try to get from cache
        const cachedData = getDeputyInfo(deputyId);
        if (cachedData) {
          setDeputyInfo(cachedData);
          setIsLoading(false);
          return;
        }

        // If not in cache, try to get from Supabase
        const data = await getDeputyFromSupabase(deputyId, legislature);
        if (data) {
          // Ensure the data conforms to DeputeInfo type
          const deputeData: DeputeInfo = {
            id: data.id || '',
            prenom: data.prenom || '',
            nom: data.nom || '',
            profession: data.profession || 'Non renseignée',
            groupe_politique: data.groupe_politique || undefined,
            groupe_politique_id: data.groupe_politique_id || undefined
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
