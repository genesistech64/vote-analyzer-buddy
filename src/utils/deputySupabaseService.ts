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
    const { count, error: countError } = await supabase
      .from('deputies')
      .select('*', { count: 'exact', head: true })
      .eq('legislature', legislature);
    
    if (countError) {
      console.log('[triggerDeputiesSync] Count check failed:', countError);
    } else {
      console.log(`[triggerDeputiesSync] Current deputies count: ${count || 0}`);
    }
    
    // Call the improved sync-deputies function with pagination
    const { data, error } = await supabase.functions.invoke('sync-deputies', {
      body: { legislature, force, use_pagination: true, batch_size: 100 }
    });

    if (error) {
      console.error('[triggerDeputiesSync] Error invoking sync-deputies function:', error);
      
      // Update toast to show error
      toast.error('Erreur de synchronisation des députés', {
        id: toastId,
        description: error.message
      });
      
      return {
        success: false,
        message: `Error syncing deputies: ${error.message}`,
        fetch_errors: [error.message],
        sync_errors: []
      };
    }

    // The response should already be JSON
    console.log('[triggerDeputiesSync] Deputies sync result:', data);
    
    // Update the toast based on the result
    if (data && data.success) {
      toast.success('Synchronisation des députés réussie', {
        id: toastId,
        description: `${data.deputies_count || 0} députés synchronisés`
      });
    } else {
      const errorMessage = data?.message || 'No deputies fetched, cannot proceed with sync';
      const fetchErrors = data?.fetch_errors || [];
      const syncErrors = data?.sync_errors || [];
      
      toast.error('Erreur de synchronisation des députés', {
        id: toastId,
        description: errorMessage
      });
      
      // If there are specific fetch errors, show more detail in a separate toast
      if (fetchErrors.length > 0) {
        toast.error('Détails de l\'erreur de synchronisation', {
          description: `Source des données : ${fetchErrors[0].substring(0, 100)}` // Show first error, truncated
        });
      }
      
      // Also show sync errors if there are any
      if (syncErrors.length > 0) {
        toast.error('Erreurs de synchronisation avec la base de données', {
          description: `${syncErrors.length} erreur(s) lors de la synchronisation.`
        });
      }
    }
    
    return data as DeputiesSyncResult;
  } catch (error) {
    console.error('[triggerDeputiesSync] Exception syncing deputies:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error syncing deputies';
    
    // Show error toast
    toast.error('Erreur de synchronisation des députés', {
      description: errorMessage
    });
    
    return {
      success: false,
      message: errorMessage,
      fetch_errors: [errorMessage],
      sync_errors: []
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
