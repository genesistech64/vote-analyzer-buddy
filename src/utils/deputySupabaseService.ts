import { DeputeInfo, StatusMessage } from '@/utils/types';

export const getDeputyFromSupabase = async (
  deputyId: string,
  legislature: string = '17'
): Promise<DeputeInfo | null> => {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase.rpc('get_deputy', {
      p_deputy_id: deputyId,
      p_legislature: legislature
    });

    if (error) {
      console.error('Error fetching deputy from Supabase:', error);
      return null;
    }

    if (data && data.length > 0) {
      const deputy = data[0];
      return {
        id: deputy.deputy_id,
        prenom: deputy.first_name,
        nom: deputy.last_name,
        profession: deputy.profession || 'Non renseignée',
        groupe_politique: deputy.political_group || 'Non renseigné',
        groupe_politique_id: deputy.political_group_id || 'Non renseigné'
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
      console.warn('[prefetchDeputiesFromSupabase] No deputies found in Supabase');
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
interface DeputiesSyncResult {
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
    const { data, error } = await supabase.functions.invoke('sync-deputies', {
      body: { legislature, force }
    });

    if (error) {
      console.error('Error syncing deputies:', error.message);
      return {
        success: false,
        message: `Error syncing deputies: ${error.message}`
      };
    }

    return data as DeputiesSyncResult;
  } catch (error) {
    console.error('Exception syncing deputies:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error syncing deputies'
    };
  }
};
