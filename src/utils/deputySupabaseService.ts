
import { DeputeInfo, StatusMessage } from '@/utils/types';

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
    
    // Remove the responseType property as it doesn't exist in FunctionInvokeOptions
    const { data, error } = await supabase.functions.invoke('sync-deputies', {
      body: { legislature, force }
    });

    if (error) {
      console.error('Error invoking sync-deputies function:', error);
      return {
        success: false,
        message: `Error syncing deputies: ${error.message}`,
        fetch_errors: [error.message],
        sync_errors: []
      };
    }

    // The response should already be JSON
    return data as DeputiesSyncResult;
  } catch (error) {
    console.error('Exception syncing deputies:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error syncing deputies';
    
    return {
      success: false,
      message: errorMessage,
      fetch_errors: [errorMessage],
      sync_errors: []
    };
  }
};
