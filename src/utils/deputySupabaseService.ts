import { DeputeInfo, StatusMessage } from '@/utils/types';
import { toast } from 'sonner';
import { prioritizeDeputies } from '@/utils/deputyCache';

// Helper function to ensure deputy ID has PA prefix
export const ensureDeputyIdFormat = (deputyId: string): string => {
  if (!deputyId) return '';
  return deputyId.startsWith('PA') ? deputyId : `PA${deputyId}`;
};

export const getDeputyFromSupabase = async (
  deputyId: string,
  legislature: string = '17'
): Promise<DeputeInfo | null> => {
  try {
    // Standardize the ID format
    const formattedId = ensureDeputyIdFormat(deputyId);
    console.log(`[getDeputyFromSupabase] Fetching deputy ${formattedId} (legislature ${legislature})`);
    
    const { supabase } = await import('@/integrations/supabase/client');
    
    // Query the deputies table
    const { data, error } = await supabase
      .from('deputies')
      .select('*')
      .eq('deputy_id', formattedId)
      .eq('legislature', legislature)
      .maybeSingle();

    if (error) {
      console.error(`[getDeputyFromSupabase] Error fetching deputy ${formattedId}:`, error);
      return null;
    }

    if (data) {
      console.log(`[getDeputyFromSupabase] Found deputy ${data.first_name} ${data.last_name}`);
      return {
        id: data.deputy_id,
        prenom: data.first_name,
        nom: data.last_name,
        profession: data.profession || 'Non renseignée',
        groupe_politique: data.political_group || 'Non renseigné',
        groupe_politique_id: data.political_group_id || 'Non renseigné'
      };
    }

    console.log(`[getDeputyFromSupabase] Deputy ${formattedId} not found in database`);
    
    // Prioritize this deputy in the cache system since it's not in Supabase
    prioritizeDeputies([formattedId]);
    
    return null;
  } catch (error) {
    console.error(`[getDeputyFromSupabase] Exception fetching deputy ${deputyId}:`, error);
    return null;
  }
};

export const prefetchDeputiesFromSupabase = async (
  deputyIds: string[],
  legislature: string = '17'
): Promise<StatusMessage> => {
  try {
    if (!deputyIds || deputyIds.length === 0) {
      console.warn('[prefetchDeputiesFromSupabase] Empty or invalid deputy IDs list');
      return {
        status: 'warning',
        message: 'Liste d\'IDs de députés vide ou invalide',
        fetchedCount: 0
      };
    }
    
    // Standardize all IDs
    const formattedIds = deputyIds.map(ensureDeputyIdFormat).filter(id => id.length > 2);
    
    console.log(`[prefetchDeputiesFromSupabase] Attempting to prefetch ${formattedIds.length} deputies for legislature ${legislature}`);
    
    const { supabase } = await import('@/integrations/supabase/client');
    
    // Process in smaller batches for better performance and stability
    const BATCH_SIZE = 50;
    const results = [];
    
    for (let i = 0; i < formattedIds.length; i += BATCH_SIZE) {
      const batchIds = formattedIds.slice(i, i + BATCH_SIZE);
      
      // Fetch a batch of deputies
      const { data, error } = await supabase
        .from('deputies')
        .select()
        .in('deputy_id', batchIds)
        .eq('legislature', legislature);
      
      if (error) {
        console.error(`[prefetchDeputiesFromSupabase] Error prefetching batch ${Math.floor(i/BATCH_SIZE) + 1}:`, error);
      } else if (data) {
        results.push(...data);
      }
    }
    
    if (results.length > 0) {
      const foundIds = results.map(d => d.deputy_id);
      const missingIds = formattedIds.filter(id => !foundIds.includes(id));
      
      console.log(`[prefetchDeputiesFromSupabase] Successfully prefetched ${results.length}/${formattedIds.length} deputies`);
      
      if (missingIds.length > 0) {
        console.warn(`[prefetchDeputiesFromSupabase] Missing ${missingIds.length} deputies: ${missingIds.slice(0, 5).join(', ')}${missingIds.length > 5 ? '...' : ''}`);
        
        // Prioritize missing IDs in the memory cache
        prioritizeDeputies(missingIds);
      }
      
      return {
        status: 'complete',
        message: `Préchargement réussi de ${results.length}/${formattedIds.length} députés`,
        details: missingIds.length > 0 ? `${missingIds.length} députés manquants` : undefined,
        fetchedCount: results.length,
        total: formattedIds.length
      };
    } else {
      console.warn(`[prefetchDeputiesFromSupabase] No deputies found in Supabase for the ${formattedIds.length} requested IDs`);
      
      // Check if the deputies table is empty
      const { count, error: countError } = await supabase
        .from('deputies')
        .select('*', { count: 'exact', head: true });
        
      if (countError) {
        console.error('[prefetchDeputiesFromSupabase] Error checking deputies count:', countError);
      } else if (count === 0) {
        console.warn('[prefetchDeputiesFromSupabase] Deputies table appears to be empty');
        return {
          status: 'warning',
          message: 'La base de données des députés est vide',
          details: 'Une synchronisation initiale est nécessaire',
          fetchedCount: 0,
          total: formattedIds.length
        };
      }
      
      // Prioritize all requested IDs in the memory cache
      prioritizeDeputies(formattedIds);
      
      return {
        status: 'warning',
        message: 'Aucun député trouvé dans la base de données',
        details: `IDs recherchés: ${formattedIds.slice(0, 5).join(', ')}${formattedIds.length > 5 ? '...' : ''}`,
        fetchedCount: 0,
        total: formattedIds.length
      };
    }
  } catch (error) {
    console.error('[prefetchDeputiesFromSupabase] Exception during prefetch:', error);
    return {
      status: 'error',
      message: 'Erreur lors du préchargement des députés',
      details: error instanceof Error ? error.message : 'Erreur inconnue',
      fetchedCount: 0
    };
  }
};

export interface DeputiesSyncResult {
  success: boolean;
  message: string;
  deputies_count?: number;
  fetch_errors?: string[];
  sync_errors?: string[];
}

export const triggerDeputiesSync = async (
  legislature: string = '17',
  force: boolean = false
): Promise<DeputiesSyncResult> => {
  try {
    console.log(`[triggerDeputiesSync] Starting sync for legislature ${legislature}, force=${force}`);
    
    const { supabase } = await import('@/integrations/supabase/client');
    
    // Show a loading toast
    const toastId = toast.loading('Synchronisation des députés en cours...');
    
    // First, check if there are deputies in the table
    const { count: existingCount, error: countError } = await supabase
      .from('deputies')
      .select('*', { count: 'exact', head: true })
      .eq('legislature', legislature);
    
    if (countError) {
      console.log('[triggerDeputiesSync] Count check failed:', countError);
    } else {
      console.log(`[triggerDeputiesSync] Current deputies count: ${existingCount || 0}`);
    }
    
    // Try to fetch from multiple sources
    let fetchedDeputies: any[] = [];
    let fetchErrors: string[] = [];
    
    // Try first source - Render API
    try {
      const response = await fetch(`https://api-dataan.onrender.com/api/v1/legislature/${legislature}/deputes/tous`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          fetchedDeputies = data;
        }
      } else {
        fetchErrors.push(`API principale: ${response.status}`);
      }
    } catch (error) {
      fetchErrors.push(`API principale: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
    
    // If first source fails, try second source - active deputies
    if (fetchedDeputies.length === 0) {
      try {
        const response = await fetch(`https://api-dataan.onrender.com/api/v1/legislature/${legislature}/deputes/actifs`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            fetchedDeputies = data;
          }
        } else {
          fetchErrors.push(`API secondaire: ${response.status}`);
        }
      } catch (error) {
        fetchErrors.push(`API secondaire: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      }
    }
    
    // If both APIs fail, try to preserve existing data if not forcing
    if (fetchedDeputies.length === 0 && !force && existingCount && existingCount > 0) {
      toast.warning('APIs indisponibles', {
        id: toastId,
        description: 'Utilisation des données existantes. Les APIs de données sont temporairement indisponibles.'
      });
      
      return {
        success: true,
        message: 'Données existantes conservées',
        deputies_count: existingCount,
        fetch_errors: fetchErrors
      };
    }
    
    // If we have no data at all
    if (fetchedDeputies.length === 0) {
      const errorMessage = 'Impossible de récupérer les données des députés';
      console.error('[triggerDeputiesSync]', errorMessage, fetchErrors);
      
      toast.error('Erreur de synchronisation', {
        id: toastId,
        description: `${errorMessage}. Les APIs sont temporairement indisponibles. Veuillez réessayer plus tard.`
      });
      
      return {
        success: false,
        message: errorMessage,
        fetch_errors: fetchErrors,
        sync_errors: []
      };
    }
    
    // Process the fetched deputies
    const deputies = fetchedDeputies.map(deputy => ({
      deputy_id: deputy.id || deputy.depute_id,
      first_name: deputy.prenom || deputy.first_name,
      last_name: deputy.nom || deputy.last_name,
      full_name: `${deputy.prenom || deputy.first_name} ${deputy.nom || deputy.last_name}`.trim(),
      legislature: legislature,
      political_group: deputy.groupe_politique || deputy.political_group,
      political_group_id: deputy.groupe_politique_uid || deputy.political_group_id,
      profession: deputy.profession
    }));
    
    // Upsert the deputies
    const { error: upsertError } = await supabase
      .from('deputies')
      .upsert(deputies, { onConflict: 'deputy_id,legislature' });
    
    if (upsertError) {
      console.error('[triggerDeputiesSync] Error upserting deputies:', upsertError);
      
      toast.error('Erreur lors de la mise à jour', {
        id: toastId,
        description: 'Les données n\'ont pas pu être mises à jour dans la base de données.'
      });
      
      return {
        success: false,
        message: `Erreur lors de la mise à jour: ${upsertError.message}`,
        fetch_errors: fetchErrors,
        sync_errors: [upsertError.message]
      };
    }
    
    console.log(`[triggerDeputiesSync] Successfully synced ${deputies.length} deputies`);
    
    toast.success('Synchronisation réussie', {
      id: toastId,
      description: `${deputies.length} députés ont été synchronisés.`
    });
    
    return {
      success: true,
      message: `${deputies.length} députés synchronisés avec succès`,
      deputies_count: deputies.length,
      fetch_errors: fetchErrors.length > 0 ? fetchErrors : undefined
    };
    
  } catch (error) {
    console.error('[triggerDeputiesSync] Unexpected error:', error);
    
    toast.error('Erreur inattendue', {
      description: error instanceof Error ? error.message : 'Une erreur est survenue lors de la synchronisation'
    });
    
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Erreur inconnue lors de la synchronisation',
      fetch_errors: [],
      sync_errors: [error instanceof Error ? error.message : 'Erreur inconnue']
    };
  }
};

export const checkDeputiesTableStatus = async (
  legislature: string = '17'
): Promise<{empty: boolean, count: number}> => {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    const { count, error } = await supabase
      .from('deputies')
      .select('*', { count: 'exact', head: true })
      .eq('legislature', legislature);
    
    if (error) {
      console.error('[checkDeputiesTableStatus] Error checking deputies table:', error);
      return { empty: true, count: 0 };
    }
    
    return { 
      empty: count === 0 || count === null,
      count: count || 0
    };
  } catch (error) {
    console.error('[checkDeputiesTableStatus] Exception checking deputies table:', error);
    return { empty: true, count: 0 };
  }
};
