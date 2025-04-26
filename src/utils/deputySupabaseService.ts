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
  sources_tried?: string[];
  sources_succeeded?: string[];
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
    const sourcesTried: string[] = [];
    const sourcesSucceeded: string[] = [];
    
    // Source 1: Render API for all deputies
    sourcesTried.push('API principale');
    try {
      const response = await fetch(`https://api-dataan.onrender.com/api/v1/legislature/${legislature}/deputes/tous`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          fetchedDeputies = data;
          console.log(`[triggerDeputiesSync] Successfully fetched ${data.length} deputies from primary API`);
          sourcesSucceeded.push('API principale');
        } else {
          fetchErrors.push('API principale: données invalides');
        }
      } else {
        fetchErrors.push(`API principale: ${response.status}`);
      }
    } catch (error) {
      fetchErrors.push(`API principale: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
    
    // Source 2: Render API for active deputies only
    if (fetchedDeputies.length === 0) {
      sourcesTried.push('API secondaire');
      try {
        const response = await fetch(`https://api-dataan.onrender.com/api/v1/legislature/${legislature}/deputes/actifs`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            fetchedDeputies = data;
            console.log(`[triggerDeputiesSync] Successfully fetched ${data.length} deputies from secondary API`);
            sourcesSucceeded.push('API secondaire');
          } else {
            fetchErrors.push('API secondaire: données invalides');
          }
        } else {
          fetchErrors.push(`API secondaire: ${response.status}`);
        }
      } catch (error) {
        fetchErrors.push(`API secondaire: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      }
    }

    // Source 3: Official Assemblée Nationale API
    sourcesTried.push('API Assemblée Nationale');
    try {
      const response = await fetch(`https://data.assemblee-nationale.fr/api/v1/deputies/legislature/${legislature}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.deputies && Array.isArray(data.deputies) && data.deputies.length > 0) {
          console.log(`[triggerDeputiesSync] Successfully fetched ${data.deputies.length} deputies from AN API`);
          sourcesSucceeded.push('API Assemblée Nationale');
          
          // Transform the data to match expected format
          const anDeputies = data.deputies.map((deputy: any) => ({
            id: deputy.id || `PA${deputy.uid}`,
            prenom: deputy.firstName || deputy.first_name,
            nom: deputy.lastName || deputy.last_name,
            groupe_politique: deputy.politicalGroup || deputy.political_group,
            groupe_politique_uid: deputy.politicalGroupId || deputy.political_group_id,
            profession: deputy.profession
          }));
          
          // If we have no deputies yet or we want to combine sources, add these
          if (fetchedDeputies.length === 0) {
            fetchedDeputies = anDeputies;
          } else if (!force) {
            // Merge deputies data to be more complete
            const mergedDeputies = [...fetchedDeputies];
            const existingIds = new Set(fetchedDeputies.map((d: any) => d.id || d.depute_id));
            
            // Add any deputies from AN API that we don't already have
            anDeputies.forEach((deputy: any) => {
              if (!existingIds.has(deputy.id)) {
                mergedDeputies.push(deputy);
              }
            });
            
            fetchedDeputies = mergedDeputies;
          }
        } else {
          fetchErrors.push('API Assemblée Nationale: données invalides');
        }
      } else {
        fetchErrors.push(`API Assemblée Nationale: ${response.status}`);
      }
    } catch (error) {
      fetchErrors.push(`API Assemblée Nationale: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
    
    // Source 4: nosdeputes.fr
    sourcesTried.push('nosdeputes.fr');
    try {
      const response = await fetch(`https://www.nosdeputes.fr/${legislature}/json`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.deputes && Array.isArray(data.deputes) && data.deputes.length > 0) {
          console.log(`[triggerDeputiesSync] Successfully fetched ${data.deputes.length} deputies from nosdeputes.fr`);
          sourcesSucceeded.push('nosdeputes.fr');
          
          const ndDeputies = data.deputes.map((item: any) => {
            const deputy = item.depute;
            return {
              id: deputy.id || `PA${deputy.slug.replace(/[^0-9]/g, '')}`,
              prenom: deputy.prenom || deputy.first_name,
              nom: deputy.nom || deputy.last_name,
              groupe_politique: deputy.groupe_sigle || deputy.political_group,
              groupe_politique_uid: deputy.groupe_uid || deputy.political_group_id,
              profession: deputy.profession
            };
          });
          
          // If we have no deputies yet or we want to combine sources, add these
          if (fetchedDeputies.length === 0) {
            fetchedDeputies = ndDeputies;
          } else if (!force) {
            // Merge deputies data to be more complete
            const mergedDeputies = [...fetchedDeputies];
            const existingIds = new Set(fetchedDeputies.map((d: any) => d.id || d.depute_id));
            
            // Add any deputies from nosdeputes.fr that we don't already have
            ndDeputies.forEach((deputy: any) => {
              if (!existingIds.has(deputy.id)) {
                mergedDeputies.push(deputy);
              }
            });
            
            fetchedDeputies = mergedDeputies;
          }
        } else {
          fetchErrors.push('nosdeputes.fr: données invalides ou vides');
        }
      } else {
        fetchErrors.push(`nosdeputes.fr: ${response.status}`);
      }
    } catch (error) {
      fetchErrors.push(`nosdeputes.fr: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
    
    // Source 5: Try wiki-based data as last resort
    if (fetchedDeputies.length === 0) {
      sourcesTried.push('Wikipedia');
      try {
        const response = await fetch(`https://fr.wikipedia.org/api/rest_v1/page/html/Liste_des_d%C3%A9put%C3%A9s_de_la_${legislature}e_l%C3%A9gislature_de_la_Cinqui%C3%A8me_R%C3%A9publique`);
        if (response.ok) {
          const htmlContent = await response.text();
          console.log('[triggerDeputiesSync] Wikipedia data fetched, would need parsing');
          // This would need HTML parsing which is complex
          // But we mark it as a potential source for future extension
          fetchErrors.push('Wikipedia: parsing non implémenté');
        } else {
          fetchErrors.push(`Wikipedia: ${response.status}`);
        }
      } catch (error) {
        fetchErrors.push(`Wikipedia: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      }
    }
    
    // If all APIs fail and we're not forcing refresh, try to preserve existing data
    if (fetchedDeputies.length === 0 && existingCount && existingCount > 0) {
      // Get existing deputies from database to keep them
      if (!force) {
        toast.success('Sources de données indisponibles', {
          id: toastId,
          description: 'Utilisation des données existantes. Les sources de données externes sont temporairement indisponibles.',
          duration: 5000
        });
        
        return {
          success: true,
          message: 'Données existantes conservées',
          deputies_count: existingCount,
          fetch_errors: fetchErrors,
          sources_tried: sourcesTried,
          sources_succeeded: []
        };
      } else {
        // Even in force mode, if we can't get new data, we keep existing data
        toast.warning('Sources de données indisponibles', {
          id: toastId,
          description: 'Actualisation impossible car les sources sont indisponibles. Les données existantes sont conservées.',
          duration: 5000
        });
        
        return {
          success: true,
          message: 'Données existantes conservées malgré la demande d\'actualisation forcée',
          deputies_count: existingCount,
          fetch_errors: fetchErrors,
          sources_tried: sourcesTried,
          sources_succeeded: []
        };
      }
    }
    
    // If we have no data at all
    if (fetchedDeputies.length === 0) {
      const errorMessage = 'Impossible de récupérer les données des députés - toutes les sources ont échoué';
      console.error('[triggerDeputiesSync]', errorMessage, fetchErrors);
      
      toast.error('Erreur de synchronisation', {
        id: toastId,
        description: `${errorMessage}. Les serveurs source sont temporairement indisponibles. Veuillez réessayer plus tard.`,
        duration: 8000
      });
      
      return {
        success: false,
        message: errorMessage,
        fetch_errors: fetchErrors,
        sync_errors: [],
        sources_tried: sourcesTried,
        sources_succeeded: sourcesSucceeded
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
    
    // If force mode is true but we'll actually merge instead of replacing
    // to avoid data loss while still refreshing what we can
    const onConflictStrategy = force ? 'update' : 'update';  // Both use update, but we distinguish the intent
    
    // Upsert the deputies
    const { error: upsertError } = await supabase
      .from('deputies')
      .upsert(deputies, { onConflict: 'deputy_id,legislature' });
    
    if (upsertError) {
      console.error('[triggerDeputiesSync] Error upserting deputies:', upsertError);
      
      toast.error('Erreur lors de la mise à jour', {
        id: toastId,
        description: 'Les données n\'ont pas pu être mises à jour dans la base de données.',
        duration: 5000
      });
      
      return {
        success: false,
        message: `Erreur lors de la mise à jour: ${upsertError.message}`,
        fetch_errors: fetchErrors,
        sync_errors: [upsertError.message],
        sources_tried: sourcesTried,
        sources_succeeded: sourcesSucceeded
      };
    }
    
    console.log(`[triggerDeputiesSync] Successfully synced ${deputies.length} deputies`);
    
    // Show different message based on whether it was a force refresh or not
    if (force) {
      toast.success('Données rafraîchies avec succès', {
        id: toastId,
        description: `${deputies.length} députés ont été synchronisés depuis ${sourcesSucceeded.length} sources.`,
        duration: 5000
      });
    } else {
      toast.success('Cache mis à jour', {
        id: toastId,
        description: `${deputies.length} députés ont été synchronisés depuis ${sourcesSucceeded.length} sources.`,
        duration: 5000
      });
    }
    
    // Clear local storage cache to force reload of fresh data
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('deputy_')) {
          localStorage.removeItem(key);
        }
      }
      console.log('[triggerDeputiesSync] Cleared local storage cache for deputies');
    } catch (error) {
      console.error('[triggerDeputiesSync] Error clearing localStorage cache:', error);
    }
    
    // Store sync metadata in localStorage for tracking
    try {
      localStorage.setItem('deputies_sync_sources', JSON.stringify(sourcesSucceeded));
      localStorage.setItem('deputies_sync_timestamp', Date.now().toString());
      localStorage.setItem('deputies_sync_count', deputies.length.toString());
    } catch (error) {
      console.error('[triggerDeputiesSync] Error storing sync metadata:', error);
    }
    
    return {
      success: true,
      message: `${deputies.length} députés synchronisés avec succès`,
      deputies_count: deputies.length,
      fetch_errors: fetchErrors.length > 0 ? fetchErrors : undefined,
      sources_tried: sourcesTried,
      sources_succeeded: sourcesSucceeded
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
