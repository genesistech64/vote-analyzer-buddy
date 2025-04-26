
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
      const apiUrl = `https://recherche-entreprises.api.gouv.fr/api/1/legislature/${legislature}/organes/parlementaire/${deputyId}`;
      
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const rawData = await response.json();
      if (rawData) {
        const deputeData: DeputeInfo = {
          id: deputyId,
          prenom: rawData.personnalite?.prenom || 'Non renseigné',
          nom: rawData.personnalite?.nom || 'Non renseigné',
          profession: rawData.extras?.profession || 'Non renseignée',
          groupe_politique: rawData.extras?.groupePolitique?.libelle || 'Non renseigné',
          groupe_politique_id: rawData.extras?.groupePolitique?.id
        };

        setDeputyInfo(deputeData);
        prioritizeDeputies([deputyId]); // Add to memory cache for future use
      } else {
        if (retryCount < MAX_RETRIES) {
          console.log(`Retry ${retryCount + 1}/${MAX_RETRIES} for deputy ${deputyId}`);
          setRetryCount(prev => prev + 1);
          setTimeout(() => {
            loadDeputyData();
          }, 2000 * (retryCount + 1));
          return;
        }
        
        setDeputyInfo(null);
        toast.error("Impossible de charger les informations du député", {
          description: "Les données ne sont pas disponibles pour le moment."
        });
      }
    } catch (err) {
      console.error(`Error loading deputy data for ${deputyId}:`, err);
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
