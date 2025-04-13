
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Fetches a deputy from Supabase by ID
 */
export const getDeputyFromSupabase = async (deputyId: string, legislature?: string) => {
  if (!deputyId) return null;
  
  const cleanId = deputyId.trim();
  console.log(`Fetching deputy from Supabase: ${cleanId} for legislature ${legislature || 'any'}`);
  
  try {
    const { data, error } = await supabase
      .rpc('get_deputy', { 
        p_deputy_id: cleanId,
        p_legislature: legislature || null
      });
    
    if (error) {
      console.error('Error fetching deputy from Supabase:', error);
      return null;
    }
    
    if (!data || data.length === 0) {
      console.info(`Deputy not found in database: ${cleanId}`);
      
      // Try alternative format (with or without PA prefix)
      const alternativeId = cleanId.startsWith('PA') ? cleanId.substring(2) : `PA${cleanId}`;
      console.info(`Trying alternative ID format: ${alternativeId}`);
      
      const { data: alternativeData, error: alternativeError } = await supabase
        .rpc('get_deputy', { 
          p_deputy_id: alternativeId,
          p_legislature: legislature || null
        });
      
      if (alternativeError || !alternativeData || alternativeData.length === 0) {
        return null;
      }
      
      return alternativeData[0];
    }
    
    return data[0];
  } catch (err) {
    console.error(`Error fetching deputy ${deputyId}:`, err);
    return null;
  }
};

/**
 * Prefetches multiple deputies from Supabase
 */
export const prefetchDeputiesFromSupabase = async (deputyIds: string[], legislature?: string) => {
  if (!Array.isArray(deputyIds) || deputyIds.length === 0) return [];
  
  // Deduplicate IDs
  const uniqueIds = [...new Set(deputyIds.filter(id => id))];
  
  try {
    const results = await Promise.allSettled(
      uniqueIds.map(id => getDeputyFromSupabase(id, legislature))
    );
    
    const deputiesData = results
      .filter((result): result is PromiseFulfilledResult<any> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value);
    
    return deputiesData;
  } catch (err) {
    console.error('Error prefetching deputies from Supabase:', err);
    return [];
  }
};

/**
 * Trigger deputies synchronization
 */
export const triggerDeputiesSync = async (legislature?: string, force: boolean = false) => {
  try {
    const { data, error } = await supabase.functions.invoke('sync-deputies', {
      body: { 
        legislature: legislature || '17',
        force: force
      }
    });
    
    if (error) {
      console.error('Error syncing deputies:', error);
      return { 
        success: false, 
        message: error.message,
        deputies_count: 0
      };
    }
    
    return { 
      success: true, 
      message: data?.message || 'Synchronization started',
      deputies_count: data?.deputies_count || 0
    };
  } catch (err) {
    console.error('Error syncing deputies:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { 
      success: false, 
      message: message,
      deputies_count: 0
    };
  }
};

/**
 * Synchronizes deputies data
 * @deprecated Use triggerDeputiesSync instead
 */
export const syncDeputies = async (legislature?: string) => {
  try {
    const { data, error } = await supabase.functions.invoke('sync-deputies', {
      body: { legislature: legislature || '17' }
    });
    
    if (error) {
      console.error('Error syncing deputies:', error);
      toast.error('Error syncing deputies', { description: error.message });
      return { success: false, error: error.message };
    }
    
    return { success: true, data };
  } catch (err) {
    console.error('Error syncing deputies:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    toast.error('Error syncing deputies', { description: message });
    return { success: false, error: message };
  }
};

/**
 * Checks sync status
 */
export const checkSyncStatus = async () => {
  try {
    const { data, error } = await supabase
      .from('data_sync')
      .select('*')
      .order('last_sync', { ascending: false })
      .limit(1);
    
    if (error) {
      console.error('Error checking sync status:', error);
      return { lastSync: null, status: 'unknown', error: error.message };
    }
    
    if (!data || data.length === 0) {
      return { lastSync: null, status: 'never', error: null };
    }
    
    return { 
      lastSync: data[0].last_sync, 
      status: data[0].status,
      logs: data[0].logs,
      error: null
    };
  } catch (err) {
    console.error('Error checking sync status:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { lastSync: null, status: 'error', error: message };
  }
};

/**
 * Counts deputies in database
 */
export const countDeputies = async (legislature?: string) => {
  try {
    let query = supabase
      .from('deputies')
      .select('*', { count: 'exact', head: true });
    
    if (legislature) {
      query = query.eq('legislature', legislature);
    }
    
    const { count, error } = await query;
    
    if (error) {
      console.error('Error counting deputies:', error);
      return 0;
    }
    
    return count || 0;
  } catch (err) {
    console.error('Error counting deputies:', err);
    return 0;
  }
};

/**
 * Alias for countDeputies for backward compatibility
 */
export const countDeputiesInDb = countDeputies;

/**
 * Cleans up deputies database
 */
export const cleanupDeputiesDatabase = async (legislature?: string) => {
  try {
    console.log(`Cleaning up deputies database for legislature ${legislature || 'all'}`);
    
    const { data, error } = await supabase.functions.invoke('cleanup-deputies', {
      body: { legislature: legislature || null }
    });
    
    if (error) {
      console.error('Error cleaning up deputies database:', error);
      return { 
        status: 'error', 
        message: error.message
      };
    }
    
    return { 
      status: 'complete', 
      message: data?.message || 'Database cleanup completed'
    };
  } catch (err) {
    console.error('Error cleaning up deputies database:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { 
      status: 'error', 
      message
    };
  }
};

/**
 * Inserts a deputy into the database
 */
export interface DeputyData {
  deputy_id: string;
  first_name: string;
  last_name: string;
  legislature: string;
  political_group?: string;
  political_group_id?: string;
  profession?: string;
}

export const insertDeputy = async (deputy: DeputyData) => {
  try {
    // Ensure the deputy ID is properly formatted
    let deputyId = deputy.deputy_id;
    if (!deputyId.startsWith('PA') && !deputyId.startsWith('ND')) {
      deputyId = `PA${deputyId}`;
    }
    
    // Create a full name
    const fullName = `${deputy.first_name} ${deputy.last_name}`.trim();
    
    const { data, error } = await supabase
      .from('deputies')
      .insert([{
        deputy_id: deputyId,
        first_name: deputy.first_name,
        last_name: deputy.last_name,
        full_name: fullName,
        legislature: deputy.legislature,
        political_group: deputy.political_group || null,
        political_group_id: deputy.political_group_id || null,
        profession: deputy.profession || null
      }]);
    
    if (error) {
      console.error('Error inserting deputy:', error);
      toast.error('Error adding deputy', { description: error.message });
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Error inserting deputy:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    toast.error('Error adding deputy', { description: message });
    return false;
  }
};
