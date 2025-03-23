
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

export const getDeputyFromSupabase = async (deputyId: string, legislature?: string): Promise<DeputeInfo | null> => {
  try {
    console.log(`[Supabase] Fetching deputy ${deputyId} for legislature ${legislature || 'latest'}`);
    
    // Vérifier d'abord dans la table des députés avant d'utiliser l'appel RPC
    const { data: directQueryData, error: directQueryError } = await supabase
      .from('deputies')
      .select('*')
      .eq('deputy_id', deputyId)
      .eq('legislature', legislature || '17')
      .single();
      
    if (directQueryData && !directQueryError) {
      console.log(`[Supabase] Found deputy directly:`, directQueryData);
      return mapDeputyToDeputeInfo(directQueryData as DeputySupabaseData);
    }
    
    // Si la requête directe échoue, essayons la fonction RPC
    const { data, error } = await supabase
      .rpc('get_deputy', { 
        p_deputy_id: deputyId,
        p_legislature: legislature
      });
    
    if (error) {
      console.error('[Supabase] Error fetching deputy:', error);
      return null;
    }
    
    if (!data || data.length === 0) {
      console.log(`[Supabase] No deputy found with ID ${deputyId}`);
      return null;
    }
    
    console.log(`[Supabase] Found deputy:`, data[0]);
    return mapDeputyToDeputeInfo(data[0]);
  } catch (err) {
    console.error('[Supabase] Error in getDeputyFromSupabase:', err);
    return null;
  }
};

// Alias the getDeputyFromSupabase function to match the import in DeputiesDetailTab
export const getDeputyInfoFromSupabase = getDeputyFromSupabase;

export const prefetchDeputiesFromSupabase = async (deputyIds: string[], legislature?: string): Promise<void> => {
  try {
    if (!deputyIds.length) return;
    
    console.log(`[Supabase] Prefetching ${deputyIds.length} deputies for legislature ${legislature || 'latest'}`);
    
    // Requête directe à la table deputies
    const { data, error } = await supabase
      .from('deputies')
      .select('*')
      .in('deputy_id', deputyIds)
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
    
    const result = await syncDeputies(legislature);
    
    if (result) {
      toast.success('Synchronisation des députés réussie', {
        description: `Les députés ont été mis à jour. Veuillez rafraîchir la page pour voir les changements.`
      });
    }
    
    return {
      success: result,
      message: result ? 'Synchronisation des députés réussie' : 'Échec de la synchronisation des députés'
    };
  } catch (error) {
    console.error('[Supabase] Error triggering deputies sync:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Une erreur est survenue lors de la synchronisation'
    };
  }
};

export const syncDeputies = async (legislature?: string): Promise<boolean> => {
  try {
    const { data: syncData, error: syncError } = await supabase.functions.invoke('sync-deputies', {
      body: { legislature: legislature || '17' }
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
export const addDeputyToCache = (deputy: DeputeInfo): void => {
  import('./deputyCache').then(deputyCache => {
    // Instead of using addDeputyToCache which doesn't exist,
    // we'll create a temporary object and use the existing methods
    const tempDeputy = {
      id: deputy.id,
      prenom: deputy.prenom,
      nom: deputy.nom,
      groupe_politique: deputy.groupe_politique,
      loading: false,
      lastFetchAttempt: Date.now(),
      failedAttempts: 0
    };
    
    // Check if already in cache
    if (!deputyCache.default.isDeputyInCache(deputy.id)) {
      // Queue the deputy with high priority to be loaded
      deputyCache.default.queueDeputyFetch(deputy.id, true);
    }
  });
};
