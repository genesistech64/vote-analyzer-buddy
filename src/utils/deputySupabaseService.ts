
import { DeputeInfo, StatusMessage } from '@/utils/types';
import { toast } from 'sonner';

export const getDeputyFromSupabase = async (
  deputyId: string,
  legislature: string = '17'
): Promise<DeputeInfo | null> => {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    // Instead of using the RPC function which is causing errors, directly query the deputies table
    const { data, error } = await supabase
      .from('deputies')
      .select('*')
      .eq('deputy_id', deputyId)
      .eq('legislature', legislature)
      .single();

    if (error) {
      console.error('Error fetching deputy from Supabase:', error);
      return null;
    }

    if (data) {
      return {
        id: data.deputy_id,
        prenom: data.first_name,
        nom: data.last_name,
        profession: data.profession || 'Non renseignée',
        groupe_politique: data.political_group || 'Non renseigné',
        groupe_politique_id: data.political_group_id || 'Non renseigné'
      };
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error fetching deputy from Supabase:', error);
    return null;
  }
};

export const prefetchDeputiesFromSupabase = async (
  deputyIds: string[],
  legislature: string = '17'
): Promise<StatusMessage> => {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    // Log the prefetch attempt with details
    console.log(`[prefetchDeputiesFromSupabase] Attempting to prefetch ${deputyIds.length} deputies for legislature ${legislature}`);
    
    // Fetch all deputies in one go
    const { data, error } = await supabase
      .from('deputies')
      .select()
      .in('deputy_id', deputyIds)
      .eq('legislature', legislature);
    
    if (error) {
      console.error('Error prefetching deputies from Supabase:', error);
      return {
        status: 'error',
        message: 'Error prefetching deputies from Supabase',
        details: error.message
      };
    }
    
    if (data && data.length > 0) {
      console.log(`[prefetchDeputiesFromSupabase] Successfully prefetched ${data.length} deputies`);
      return {
        status: 'complete',
        message: `Successfully prefetched ${data.length} deputies`
      };
    } else {
      console.warn(`[prefetchDeputiesFromSupabase] No deputies found in Supabase for the ${deputyIds.length} requested IDs`);
      return {
        status: 'warning',
        message: 'No deputies found in Supabase'
      };
    }
  } catch (error) {
    console.error('Error prefetching deputies from Supabase:', error);
    return {
      status: 'error',
      message: 'Error prefetching deputies from Supabase',
      details: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Update the return type for triggerDeputiesSync
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
    const { supabase } = await import('@/integrations/supabase/client');
    
    console.log(`Triggering deputies sync for legislature ${legislature}, force=${force}`);
    
    // Show a loading toast
    const toastId = toast.loading('Synchronisation des députés en cours...');
    
    // Try direct fetch from Assemblée Nationale instead of using the function
    // This is a workaround for testing if direct fetch works better
    try {
      // Attempt direct fetch of deputies data
      const url = `https://data.assemblee-nationale.fr/api/v2/deputies?legislature=${legislature}`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (response.ok) {
        console.log('Direct fetch to deputies API succeeded');
        toast.success('Synchronisation directe des données réussie', {
          id: toastId, 
          description: 'Utilisation de l\'API directe'
        });
      } else {
        console.warn('Direct fetch failed, falling back to edge function');
      }
    } catch (directError) {
      console.warn('Direct fetch error:', directError);
    }
    
    // Call the edge function to sync deputies
    const { data, error } = await supabase.functions.invoke('sync-deputies', {
      body: { legislature, force }
    });

    if (error) {
      console.error('Error invoking sync-deputies function:', error);
      
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
    console.log('Deputies sync result:', data);
    
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
      
      // If there are errors but we also have deputies count, it may be partial success
      if (data?.deputies_count && data.deputies_count > 0) {
        toast.success('Synchronisation partielle réussie', {
          id: toastId,
          description: `${data.deputies_count} députés synchronisés avec quelques erreurs`
        });
      } else {
        toast.error('Erreur de synchronisation des députés', {
          id: toastId,
          description: errorMessage
        });
      }
      
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
    console.error('Exception syncing deputies:', error);
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
