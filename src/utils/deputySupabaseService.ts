
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DeputeInfo } from './types';

// Interface for the Deputy data in Supabase
interface DeputySupabaseData {
  id: string;
  deputy_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  legislature: string;
  political_group: string | null;
  political_group_id: string | null;
  profession: string | null;
  created_at: string;
  updated_at: string;
}

// Convert Supabase deputy data to app's DeputeInfo format
const mapDeputyToDeputeInfo = (deputy: DeputySupabaseData): DeputeInfo => {
  return {
    id: deputy.deputy_id,
    prenom: deputy.first_name,
    nom: deputy.last_name,
    profession: deputy.profession || '',
    groupe_politique: deputy.political_group || undefined
  };
};

// Ensure deputy ID is properly formatted with PA prefix
const formatDeputyId = (deputyId: string): string => {
  // If it's already properly formatted with PA prefix, return as is
  if (deputyId.startsWith('PA')) {
    return deputyId;
  }
  
  // Otherwise, add the PA prefix
  return `PA${deputyId}`;
};

export const getDeputyFromSupabase = async (deputyId: string, legislature?: string): Promise<DeputeInfo | null> => {
  try {
    // Ensure deputyId is properly formatted
    const formattedDeputyId = formatDeputyId(deputyId);
    
    console.log(`[Supabase] Fetching deputy ${formattedDeputyId} for legislature ${legislature || 'latest'}`);
    
    // First attempt: Direct query to the deputies table
    const { data: directQueryData, error: directQueryError } = await supabase
      .from('deputies')
      .select('*')
      .eq('deputy_id', formattedDeputyId)
      .eq('legislature', legislature || '17')
      .single();
      
    if (directQueryData && !directQueryError) {
      console.log(`[Supabase] Found deputy directly:`, directQueryData);
      return mapDeputyToDeputeInfo(directQueryData as DeputySupabaseData);
    } else {
      console.log(`[Supabase] Direct query error or no data:`, directQueryError || 'No data found');
    }
    
    // Second attempt: Try a more flexible query without the .single() that might be causing errors
    const { data: flexQueryData, error: flexQueryError } = await supabase
      .from('deputies')
      .select('*')
      .eq('deputy_id', formattedDeputyId)
      .eq('legislature', legislature || '17');
      
    if (flexQueryData && flexQueryData.length > 0 && !flexQueryError) {
      console.log(`[Supabase] Found deputy with flex query:`, flexQueryData[0]);
      return mapDeputyToDeputeInfo(flexQueryData[0] as DeputySupabaseData);
    } else {
      console.log(`[Supabase] Flex query error or no data:`, flexQueryError || 'No data found');
    }
    
    // Check if the deputies table is empty
    const { count, error: countError } = await supabase
      .from('deputies')
      .select('*', { count: 'exact', head: true });
      
    if ((count === 0 || count === null) && !countError) {
      console.log('[Supabase] Deputies table is empty! Triggering sync...');
      
      // Trigger sync in the background without awaiting
      syncDeputies(legislature || '17', true)
        .then(success => {
          if (success) {
            console.log('[Supabase] Deputies table synced successfully.');
            toast.info('Synchronisation des députés terminée', {
              description: 'Veuillez rafraîchir la page pour voir les noms des députés.'
            });
          }
        })
        .catch(err => {
          console.error('[Supabase] Error syncing deputies:', err);
        });
        
      // Return a temporary placeholder for the deputy
      return {
        id: formattedDeputyId,
        prenom: '',
        nom: `Député ${formattedDeputyId.replace('PA', '')}`,
        profession: '',
        groupe_politique: undefined
      };
    }
    
    // Third attempt: Try RPC function
    const { data, error } = await supabase
      .rpc('get_deputy', { 
        p_deputy_id: formattedDeputyId,
        p_legislature: legislature || '17'
      });
    
    if (error) {
      console.error('[Supabase] Error fetching deputy via RPC:', error);
      
      // Fourth attempt: Last resort fallback - try a more flexible query without legislature constraint
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('deputies')
        .select('*')
        .eq('deputy_id', formattedDeputyId)
        .order('updated_at', { ascending: false })
        .limit(1);
        
      if (fallbackData && fallbackData.length > 0 && !fallbackError) {
        console.log(`[Supabase] Found deputy via fallback query:`, fallbackData[0]);
        return mapDeputyToDeputeInfo(fallbackData[0] as DeputySupabaseData);
      }
      
      console.error('[Supabase] All attempts to fetch deputy failed');
      return {
        id: formattedDeputyId,
        prenom: '',
        nom: `Député ${formattedDeputyId.replace('PA', '')}`,
        profession: '',
        groupe_politique: undefined
      };
    }
    
    if (!data || (Array.isArray(data) && data.length === 0)) {
      console.log(`[Supabase] No deputy found with ID ${formattedDeputyId}`);
      return {
        id: formattedDeputyId,
        prenom: '',
        nom: `Député ${formattedDeputyId.replace('PA', '')}`,
        profession: '',
        groupe_politique: undefined
      };
    }
    
    const deputyData = Array.isArray(data) ? data[0] : data;
    console.log(`[Supabase] Found deputy via RPC:`, deputyData);
    return mapDeputyToDeputeInfo(deputyData);
  } catch (err) {
    console.error('[Supabase] Error in getDeputyFromSupabase:', err);
    return {
      id: deputyId,
      prenom: '',
      nom: `Député ${deputyId.replace('PA', '')}`,
      profession: '',
      groupe_politique: undefined
    };
  }
};

// Alias the getDeputyFromSupabase function to match the import in DeputiesDetailTab
export const getDeputyInfoFromSupabase = getDeputyFromSupabase;

export const prefetchDeputiesFromSupabase = async (deputyIds: string[], legislature?: string): Promise<void> => {
  try {
    if (!deputyIds.length) return;
    
    // Ensure all deputyIds are properly formatted
    const formattedDeputyIds = deputyIds.map(formatDeputyId);
    
    console.log(`[Supabase] Prefetching ${formattedDeputyIds.length} deputies for legislature ${legislature || 'latest'}`);
    
    // Check if the deputies table is empty
    const { count, error: countError } = await supabase
      .from('deputies')
      .select('*', { count: 'exact', head: true });

    if ((count === 0 || count === null) && !countError) {
      console.log('[Supabase] Deputies table is empty! Triggering sync before prefetch...');
      
      // Force a sync before attempting to prefetch
      const syncSuccess = await syncDeputies(legislature || '17', true);
      if (!syncSuccess) {
        console.error('[Supabase] Failed to sync deputies before prefetch');
        toast.error('Échec de la synchronisation des députés', {
          description: 'La récupération des noms des députés a échoué. Veuillez réessayer.'
        });
        return;
      }
      
      // Wait a moment for the sync to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Requête directe à la table deputies
    const { data, error } = await supabase
      .from('deputies')
      .select('*')
      .in('deputy_id', formattedDeputyIds)
      .eq('legislature', legislature || '17');
    
    if (error) {
      console.error('[Supabase] Error prefetching deputies:', error);
      return;
    }
    
    console.log(`[Supabase] Successfully prefetched ${data?.length || 0} deputies`);
    
    // Now we would typically cache these deputies in memory
    // This would integrate with your existing deputyCache system
    if (data && data.length > 0) {
      // Import deputyCache dynamically to avoid circular dependencies
      const deputyCache = await import('./deputyCache');
      
      data.forEach(deputy => {
        const deputeInfo = mapDeputyToDeputeInfo(deputy as DeputySupabaseData);
        // Using queueDeputyFetch instead of directly adding to cache
        deputyCache.default.queueDeputyFetch(deputeInfo.id, true);
      });
    }
  } catch (err) {
    console.error('[Supabase] Error in prefetchDeputiesFromSupabase:', err);
  }
};

export const triggerDeputiesSync = async (legislature?: string, showToast = false): Promise<{success: boolean, message: string}> => {
  try {
    if (showToast) {
      toast.info('Synchronisation des députés en cours...', {
        description: 'Cela peut prendre quelques instants'
      });
    }
    
    const result = await syncDeputies(legislature || '17', true);
    
    if (result) {
      toast.success('Synchronisation des députés réussie', {
        description: `Les députés ont été mis à jour. Veuillez rafraîchir la page pour voir les changements.`
      });
      
      // Force a reload of deputies data 
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 2 seconds to let the backend sync finish
      
      // Re-fetch a sample of deputies to verify sync worked
      const { data: sampleData } = await supabase
        .from('deputies')
        .select('deputy_id')
        .eq('legislature', legislature || '17')
        .limit(10);
        
      if (sampleData && sampleData.length > 0) {
        const sampleIds = sampleData.map(d => d.deputy_id);
        await prefetchDeputiesFromSupabase(sampleIds, legislature || '17');
      }
      
      // Check if deputies table now has data
      const { count, error: countError } = await supabase
        .from('deputies')
        .select('*', { count: 'exact', head: true });
        
      if ((count === 0 || count === null) && !countError) {
        toast.warning('Base de données toujours vide', {
          description: 'La table des députés est toujours vide. Essayez de rafraîchir la page et de synchroniser à nouveau.'
        });
      } else {
        toast.success(`${count} députés dans la base de données`, {
          description: 'La synchronisation a bien fonctionné.'
        });
      }
    } else {
      toast.error('Échec de la synchronisation des députés', {
        description: "La synchronisation n'a pas réussi. Veuillez réessayer plus tard."
      });
    }
    
    return {
      success: result,
      message: result ? 'Synchronisation des députés réussie' : 'Échec de la synchronisation des députés'
    };
  } catch (error) {
    console.error('[Supabase] Error triggering deputies sync:', error);
    toast.error('Erreur lors de la synchronisation', {
      description: error instanceof Error ? error.message : 'Une erreur inattendue est survenue'
    });
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Une erreur est survenue lors de la synchronisation'
    };
  }
};

export const syncDeputies = async (legislature: string, force = false): Promise<boolean> => {
  try {
    console.log('[Supabase] Starting deputies sync for legislature:', legislature, 'force:', force);
    
    const { data: syncData, error: syncError } = await supabase.functions.invoke('sync-deputies', {
      body: { legislature, force }
    });
    
    if (syncError) {
      console.error('[Supabase] Error syncing deputies:', syncError);
      toast.error('Échec de la synchronisation des députés', {
        description: syncError.message
      });
      return false;
    }
    
    console.log('[Supabase] Deputies sync completed:', syncData);
    return true;
  } catch (err) {
    console.error('[Supabase] Error in syncDeputies:', err);
    toast.error('Erreur lors de la synchronisation', {
      description: err instanceof Error ? err.message : 'Une erreur inattendue est survenue'
    });
    return false;
  }
};

// Helper function to add deputy data to the local cache
export const addDeputyToCache = async (deputy: DeputeInfo): Promise<void> => {
  try {
    const deputyCache = await import('./deputyCache');
    
    // Check if already in cache
    if (!deputyCache.default.isDeputyInCache(deputy.id)) {
      // Queue the deputy with high priority to be loaded
      deputyCache.default.queueDeputyFetch(deputy.id, true);
    }
  } catch (err) {
    console.error('[Supabase] Error in addDeputyToCache:', err);
  }
};
