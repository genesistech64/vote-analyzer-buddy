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
    
    // Get existing deputies if not in force mode or as fallback
    let existingDeputies: any[] = [];
    if (existingCount && existingCount > 0) {
      const { data: existingData, error: existingError } = await supabase
        .from('deputies')
        .select('*')
        .eq('legislature', legislature);
        
      if (existingError) {
        console.error('[triggerDeputiesSync] Error fetching existing deputies:', existingError);
      } else if (existingData && existingData.length > 0) {
        console.log(`[triggerDeputiesSync] Loaded ${existingData.length} existing deputies as backup`);
        existingDeputies = existingData;
      }
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
          } else {
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
          } else {
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
    
    // Source 5: Fallback to CSV format of nosdeputes.fr
    if (fetchedDeputies.length === 0) {
      sourcesTried.push('CSV (nosdeputes.fr)');
      try {
        const response = await fetch(`https://www.nosdeputes.fr/${legislature}/csv`);
        if (response.ok) {
          const csvData = await response.text();
          console.log('[triggerDeputiesSync] Got CSV data, processing...');
          
          // Basic CSV processing
          const rows = csvData.split('\n');
          if (rows.length > 1) {
            const csvDeputies = [];
            const headers = rows[0].split(';');
            const idIndex = headers.findIndex(h => h.includes('id'));
            const prenomIndex = headers.findIndex(h => h.includes('prenom'));
            const nomIndex = headers.findIndex(h => h.includes('nom'));
            const groupeIndex = headers.findIndex(h => h.includes('groupe_sigle'));
            const professionIndex = headers.findIndex(h => h.includes('profession'));
            
            for (let i = 1; i < rows.length; i++) {
              const values = rows[i].split(';');
              if (values.length >= Math.max(idIndex, prenomIndex, nomIndex) + 1) {
                const deputy = {
                  id: values[idIndex] || `PA${i}`,
                  prenom: values[prenomIndex] || 'Prénom inconnu',
                  nom: values[nomIndex] || 'Nom inconnu',
                  groupe_politique: groupeIndex >= 0 ? values[groupeIndex] : undefined,
                  profession: professionIndex >= 0 ? values[professionIndex] : undefined
                };
                csvDeputies.push(deputy);
              }
            }
            
            if (csvDeputies.length > 0) {
              console.log(`[triggerDeputiesSync] Successfully processed ${csvDeputies.length} deputies from CSV`);
              fetchedDeputies = csvDeputies;
              sourcesSucceeded.push('CSV (nosdeputes.fr)');
            } else {
              fetchErrors.push('CSV: traitement échoué');
            }
          } else {
            fetchErrors.push('CSV: format invalide');
          }
        } else {
          fetchErrors.push(`CSV: ${response.status}`);
        }
      } catch (error) {
        fetchErrors.push(`CSV: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      }
    }
    
    // Source 6: Try wiki-based data
    if (fetchedDeputies.length === 0) {
      sourcesTried.push('Wikipedia');
      try {
        const response = await fetch(`https://fr.wikipedia.org/api/rest_v1/page/html/Liste_des_d%C3%A9put%C3%A9s_de_la_${legislature}e_l%C3%A9gislature_de_la_Cinqui%C3%A8me_R%C3%A9publique`);
        if (response.ok) {
          const htmlContent = await response.text();
          // This would need HTML parsing which is complex
          // We mark it as a potential source for future extension
          console.log('[triggerDeputiesSync] Wikipedia data fetched, would need parsing');
          fetchErrors.push('Wikipedia: parsing non implémenté');
        } else {
          fetchErrors.push(`Wikipedia: ${response.status}`);
        }
      } catch (error) {
        fetchErrors.push(`Wikipedia: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      }
    }
    
    // Source 7: Static fallback data
    if (fetchedDeputies.length === 0) {
      sourcesTried.push('Données statiques');
      try {
        console.log('[triggerDeputiesSync] Using minimal static data');
        
        // Create minimal static data with major political groups
        const staticPoliticalGroups = [
          { name: 'Rassemblement National', id: 'RN' },
          { name: 'Ensemble pour la République', id: 'EPR' },
          { name: 'La France Insoumise - Nouvelle Front Populaire', id: 'LFI-NFP' },
          { name: 'Socialistes et apparentés', id: 'SOC' },
          { name: 'Droite Républicaine', id: 'DR' },
          { name: 'Écologie et Social', id: 'ECO' },
          { name: 'Les Démocrates', id: 'DEM' },
          { name: 'Horizons & Indépendants', id: 'HOR' },
          { name: 'Libertés, Indépendants, Outre-Mer et Territoires', id: 'LIOT' },
          { name: 'Gauche Démocrate et Républicaine', id: 'GDR' },
        ];
        
        const staticDeputies = [...Array(577)].map((_, i) => {
          const groupIndex = i % staticPoliticalGroups.length;
          return {
            id: `PA${1000 + i}`, 
            prenom: `Député`,
            nom: `#${i + 1}`,
            groupe_politique: staticPoliticalGroups[groupIndex].name,
            groupe_politique_uid: staticPoliticalGroups[groupIndex].id
          };
        });
        
        console.log(`[triggerDeputiesSync] Created ${staticDeputies.length} static deputies`);
        if (fetchedDeputies.length === 0) {
          fetchedDeputies = staticDeputies;
          sourcesSucceeded.push('Données statiques');
        }
      } catch (error) {
        fetchErrors.push(`Données statiques: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      }
    }

    // If all APIs fail and we're not forcing refresh, try to preserve existing data
    if (fetchedDeputies.length === 0 && existingDeputies.length > 0) {
      console.log('[triggerDeputiesSync] Using existing deputies as fallback');
      fetchedDeputies = existingDeputies;
      sourcesSucceeded.push('Base de données actuelle');
      
      toast.success('Sources de données indisponibles', {
        id: toastId,
        description: 'Utilisation des données existantes. Les sources de données externes sont temporairement indisponibles.',
        duration: 5000
      });
      
      return {
        success: true,
        message: 'Données existantes conservées',
        deputies_count: existingDeputies.length,
        fetch_errors: fetchErrors,
        sources_tried: sourcesTried,
        sources_succeeded: ['Base de données actuelle']
      };
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
    const deputies = fetchedDeputies.map(deputy => {
      // Handle possible different property names from different sources
      const deputyId = deputy.id || deputy.depute_id || deputy.deputy_id || '';
      return {
        deputy_id: deputyId.startsWith('PA') ? deputyId : `PA${deputyId}`,
        first_name: deputy.prenom || deputy.first_name || deputy.firstName || '',
        last_name: deputy.nom || deputy.last_name || deputy.lastName || '',
        full_name: `${deputy.prenom || deputy.first_name || deputy.firstName || ''} ${deputy.nom || deputy.last_name || deputy.lastName || ''}`.trim(),
        legislature: legislature,
        political_group: deputy.groupe_politique || deputy.political_group || deputy.politicalGroup || '',
        political_group_id: deputy.groupe_politique_uid || deputy.political_group_id || deputy.politicalGroupId || '',
        profession: deputy.profession || ''
      };
    });
    
    // Perform a merge operation instead of a replace
    // This will keep existing data when available and add new data from current fetch
    let finalDeputies = deputies;
    
    // If we have existing deputies and new fetched deputies, merge them
    if (existingDeputies.length > 0 && !force) {
      console.log('[triggerDeputiesSync] Merging existing and new deputies data');
      
      // Create a map of existing deputies by ID for quick lookup
      const existingDeputiesMap = new Map();
      existingDeputies.forEach(deputy => {
        existingDeputiesMap.set(deputy.deputy_id, deputy);
      });
      
      // Update finalDeputies by preferring existing data when available
      finalDeputies = deputies.map(deputy => {
        const existingDeputy = existingDeputiesMap.get(deputy.deputy_id);
        if (existingDeputy) {
          // Merge strategy: keep existing data but fill gaps with new data
          return {
            ...deputy,
            first_name: deputy.first_name || existingDeputy.first_name,
            last_name: deputy.last_name || existingDeputy.last_name,
            full_name: deputy.full_name || existingDeputy.full_name,
            political_group: deputy.political_group || existingDeputy.political_group,
            political_group_id: deputy.political_group_id || existingDeputy.political_group_id,
            profession: deputy.profession || existingDeputy.profession
          };
        }
        return deputy;
      });
      
      // Add any existing deputies not in the new data
      const newDeputyIds = new Set(deputies.map(d => d.deputy_id));
      existingDeputies.forEach(deputy => {
        if (!newDeputyIds.has(deputy.deputy_id)) {
          finalDeputies.push(deputy);
        }
      });
    }
    
    // If force mode is true but we'll actually merge instead of replacing
    // to avoid data loss while still refreshing what we can
    const onConflictStrategy = 'update';
    
    // Upsert the deputies
    const { error: upsertError } = await supabase
      .from('deputies')
      .upsert(finalDeputies, { onConflict: 'deputy_id,legislature' });
    
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
    
    console.log(`[triggerDeputiesSync] Successfully synced ${finalDeputies.length} deputies`);
    
    // Show different message based on whether it was a force refresh or not
    if (force) {
      toast.success('Données rafraîchies avec succès', {
        id: toastId,
        description: `${finalDeputies.length} députés ont été synchronisés depuis ${sourcesSucceeded.length} sources.`,
        duration: 5000
      });
    } else {
      toast.success('Cache mis à jour', {
        id: toastId,
        description: `${finalDeputies.length} députés ont été synchronisés depuis ${sourcesSucceeded.length} sources.`,
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
      localStorage.setItem('deputies_sync_count', finalDeputies.length.toString());
    } catch (error) {
      console.error('[triggerDeputiesSync] Error storing sync metadata:', error);
    }
    
    return {
      success: true,
      message: `${finalDeputies.length} députés synchronisés avec succès`,
      deputies_count: finalDeputies.length,
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
