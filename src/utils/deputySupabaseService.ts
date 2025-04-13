
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
    
    // Show a loading toast that will be updated later
    const toastId = toast.loading('Synchronisation des députés en cours...', {
      description: 'Cette opération peut prendre quelques minutes'
    });
    
    // Try with alternative source first - nosdeputes.fr
    try {
      const nosDeputesResponse = await fetch(`https://www.nosdeputes.fr/deputes/enmandat/json`);
      if (nosDeputesResponse.ok) {
        const nosDeputesData = await nosDeputesResponse.json();
        if (nosDeputesData && nosDeputesData.deputes && nosDeputesData.deputes.length > 0) {
          console.log(`Found ${nosDeputesData.deputes.length} deputies in nosdeputes.fr, using this source`);
          // The rest of the sync will be handled by the edge function
        }
      }
    } catch (error) {
      console.log("Could not prefetch from nosdeputes.fr, continuing with edge function");
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
        description: error.message || 'Erreur lors de l\'appel à la fonction de synchronisation'
      });
      
      return {
        success: false,
        message: `Error syncing deputies: ${error.message}`,
        fetch_errors: [error.message],
        sync_errors: []
      };
    }

    // Log the response for debugging
    console.log('Deputies sync result:', data);
    
    // Handle the response based on different possible formats
    if (!data) {
      toast.error('Erreur de synchronisation des députés', {
        id: toastId,
        description: 'Pas de réponse reçue du serveur'
      });
      
      return {
        success: false,
        message: 'No response received from the server',
        fetch_errors: ['No response received from the server'],
        sync_errors: []
      };
    }
    
    // Update the toast based on the result
    if (data && data.success) {
      toast.success('Synchronisation des députés réussie', {
        id: toastId,
        description: `${data.deputies_count || 0} députés synchronisés`
      });
      
      // If there are warnings but overall success, show them
      if (data.fetch_errors && data.fetch_errors.length > 0) {
        toast.warning('Avertissements lors de la synchronisation', {
          description: `${data.fetch_errors.length} avertissement(s) pendant le processus, mais synchronisation réussie`
        });
      }
    } else {
      const errorMessage = data?.message || 'No deputies fetched, cannot proceed with sync';
      const fetchErrors = data?.fetch_errors || [];
      const syncErrors = data?.sync_errors || [];
      
      // If there are errors but we also have deputies count, it may be partial success
      if (data?.deputies_count && data.deputies_count > 0) {
        toast.warning('Synchronisation partielle réussie', {
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
        toast.error('Erreur lors de la récupération des données', {
          description: fetchErrors[0].substring(0, 150) + (fetchErrors[0].length > 150 ? '...' : '')
        });
      }
      
      // Also show sync errors if there are any
      if (syncErrors.length > 0) {
        toast.error('Erreurs de synchronisation avec la base de données', {
          description: `${syncErrors.length} erreur(s) lors de la synchronisation. Détails dans la console.`
        });
        
        // Log the full errors to console for debugging
        console.error('Sync errors:', syncErrors);
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

// Add a new function to check if deputies data exists
export const checkDeputiesDataExists = async (legislature: string = '17'): Promise<boolean> => {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    // Just count the deputies for this legislature
    const { count, error } = await supabase
      .from('deputies')
      .select('*', { count: 'exact', head: true })
      .eq('legislature', legislature);
    
    if (error) {
      console.error('Error checking deputies data:', error);
      return false;
    }
    
    return count !== null && count > 0;
  } catch (error) {
    console.error('Error checking deputies data:', error);
    return false;
  }
};
