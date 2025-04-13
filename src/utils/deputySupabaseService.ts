
import { DeputeInfo, StatusMessage } from '@/utils/types';
import { toast } from 'sonner';

export const getDeputyFromSupabase = async (
  deputyId: string,
  legislature: string = '17'
): Promise<DeputeInfo | null> => {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    // Standardize the deputy ID format
    const formattedDeputyId = deputyId.startsWith('PA') ? deputyId : `PA${deputyId}`;
    
    console.log(`Fetching deputy from Supabase: ${formattedDeputyId} for legislature ${legislature}`);
    
    // Query the deputies table
    const { data, error } = await supabase
      .from('deputies')
      .select('*')
      .eq('deputy_id', formattedDeputyId)
      .eq('legislature', legislature)
      .maybeSingle();

    if (error) {
      console.error('Error fetching deputy from Supabase:', error);
      return null;
    }

    if (data) {
      console.log(`Found deputy in database: ${data.first_name} ${data.last_name}`);
      return {
        id: data.deputy_id,
        prenom: data.first_name,
        nom: data.last_name,
        profession: data.profession || 'Non renseignée',
        groupe_politique: data.political_group || 'Non renseigné',
        groupe_politique_id: data.political_group_id || 'Non renseigné'
      };
    } else {
      console.log(`Deputy not found in database: ${formattedDeputyId}`);
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
    
    // Format all IDs to ensure consistency
    const formattedIds = deputyIds.map(id => id.startsWith('PA') ? id : `PA${id}`);
    
    // Log the prefetch attempt with details
    console.log(`[prefetchDeputiesFromSupabase] Attempting to prefetch ${formattedIds.length} deputies for legislature ${legislature}`);
    
    // Batch processing to avoid large queries
    const batchSize = 20;
    let fetchedCount = 0;
    
    for (let i = 0; i < formattedIds.length; i += batchSize) {
      const batchIds = formattedIds.slice(i, i + batchSize);
      
      // Fetch deputies in this batch
      const { data, error } = await supabase
        .from('deputies')
        .select()
        .in('deputy_id', batchIds)
        .eq('legislature', legislature);
      
      if (error) {
        console.error(`Error prefetching batch ${i/batchSize + 1}:`, error);
        continue;
      }
      
      if (data && data.length > 0) {
        fetchedCount += data.length;
        console.log(`[prefetchDeputiesFromSupabase] Batch ${Math.floor(i/batchSize) + 1}: fetched ${data.length} deputies`);
      }
    }
    
    console.log(`[prefetchDeputiesFromSupabase] Successfully prefetched ${fetchedCount} deputies in total`);
    
    return {
      status: fetchedCount > 0 ? 'complete' : 'warning',
      message: fetchedCount > 0 
        ? `Successfully prefetched ${fetchedCount} deputies` 
        : 'No deputies found in database'
    };
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

    // Add retry mechanism for the edge function call
    let attempts = 0;
    const maxAttempts = 3;
    let success = false;
    let data: any = null;
    let error: any = null;
    
    while (attempts < maxAttempts && !success) {
      attempts++;
      
      try {
        // Call the edge function to sync deputies with a timeout
        const syncPromise = supabase.functions.invoke('sync-deputies', {
          body: { legislature, force }
        });
        
        // Add timeout for the function call
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Function call timed out')), 60000); // 60 seconds
        });
        
        // Fix TypeScript error: Explicitly type the result
        const result = await Promise.race([syncPromise, timeoutPromise]) as {
          data: any;
          error: any;
        };
        
        if (result.error) {
          error = result.error;
          console.error(`Attempt ${attempts}: Error invoking sync-deputies function:`, error);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
          continue;
        }
        
        data = result.data;
        success = true;
      } catch (callError) {
        error = callError;
        console.error(`Attempt ${attempts}: Exception invoking sync-deputies function:`, callError);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
      }
    }
    
    if (!success) {
      console.error(`Failed to sync deputies after ${maxAttempts} attempts:`, error);
      
      // Update toast to show error
      toast.error('Erreur de synchronisation des députés', {
        id: toastId,
        description: error?.message || 'Erreur lors de l\'appel à la fonction de synchronisation'
      });
      
      return {
        success: false,
        message: `Error syncing deputies: ${error?.message || 'Function call failed'}`,
        fetch_errors: [error?.message || 'Function call failed'],
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
