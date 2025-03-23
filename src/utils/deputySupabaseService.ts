
import { supabase } from "@/integrations/supabase/client";
import { DeputyInfo } from './types';

// Cache en mémoire temporaire
const localCache: Record<string, DeputyInfo> = {};

/**
 * Récupère les informations d'un député depuis Supabase
 */
export const getDeputyInfoFromSupabase = async (
  deputyId: string, 
  legislature?: string
): Promise<DeputyInfo | null> => {
  // Vérifier si l'ID est valide
  if (!deputyId || typeof deputyId !== 'string') {
    console.warn('[SupabaseService] ID de député invalide:', deputyId);
    return null;
  }
  
  const cleanId = deputyId.trim();
  
  // Clé de cache unique qui inclut la législature
  const cacheKey = `${cleanId}_${legislature || 'latest'}`;
  
  // Vérifier le cache local d'abord
  if (localCache[cacheKey]) {
    return localCache[cacheKey];
  }
  
  try {
    // Requête à Supabase
    let query = supabase
      .from('deputies')
      .select('*');
    
    // Ajouter le filtre sur l'ID du député
    query = query.eq('deputy_id', cleanId);
    
    // Ajouter le filtre sur la législature si spécifiée
    if (legislature) {
      query = query.eq('legislature', legislature);
    } else {
      // Sinon, trier par législature décroissante et prendre le premier
      query = query.order('legislature', { ascending: false }).limit(1);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('[SupabaseService] Erreur lors de la récupération du député:', error);
      return null;
    }
    
    if (!data || data.length === 0) {
      console.warn(`[SupabaseService] Député non trouvé: ${cleanId} (législature: ${legislature || 'latest'})`);
      return null;
    }
    
    // Mapper les données Supabase vers notre format interne
    const deputy = data[0];
    const deputyInfo: DeputyInfo = {
      id: cleanId,
      prenom: deputy.first_name,
      nom: deputy.last_name,
      groupe_politique: deputy.political_group,
      groupe_politique_uid: deputy.political_group_id,
      loading: false,
      lastFetchAttempt: Date.now(),
      failedAttempts: 0
    };
    
    // Mettre en cache localement
    localCache[cacheKey] = deputyInfo;
    
    return deputyInfo;
  } catch (err) {
    console.error('[SupabaseService] Erreur inattendue:', err);
    return null;
  }
};

/**
 * Format le nom d'un député à partir de son ID
 */
export const formatDeputyNameFromSupabase = async (
  deputyId: string, 
  legislature?: string
): Promise<string> => {
  const deputy = await getDeputyInfoFromSupabase(deputyId, legislature);
  
  if (!deputy) return `Député ${deputyId.substring(2)}`;
  
  if (deputy.prenom && deputy.nom) {
    return `${deputy.prenom} ${deputy.nom}`;
  }
  
  return `Député ${deputyId.substring(2)}`;
};

/**
 * Précharge les députés par lots à partir de leurs IDs
 */
export const prefetchDeputiesFromSupabase = async (
  deputyIds: string[], 
  legislature?: string
): Promise<void> => {
  if (!Array.isArray(deputyIds) || deputyIds.length === 0) return;
  
  try {
    // Filtrer les ID valides et uniques
    const uniqueIds = [...new Set(deputyIds.filter(id => id && typeof id === 'string'))];
    
    // Requête à Supabase
    let query = supabase
      .from('deputies')
      .select('*')
      .in('deputy_id', uniqueIds);
    
    // Ajouter le filtre sur la législature si spécifiée
    if (legislature) {
      query = query.eq('legislature', legislature);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('[SupabaseService] Erreur lors du prefetch des députés:', error);
      return;
    }
    
    if (!data || data.length === 0) {
      console.warn(`[SupabaseService] Aucun député trouvé parmi les ${uniqueIds.length} IDs`);
      return;
    }
    
    console.log(`[SupabaseService] ${data.length}/${uniqueIds.length} députés préchargés de Supabase`);
    
    // Mettre en cache tous les députés récupérés
    data.forEach(deputy => {
      const cacheKey = `${deputy.deputy_id}_${legislature || 'latest'}`;
      
      localCache[cacheKey] = {
        id: deputy.deputy_id,
        prenom: deputy.first_name,
        nom: deputy.last_name,
        groupe_politique: deputy.political_group,
        groupe_politique_uid: deputy.political_group_id,
        loading: false,
        lastFetchAttempt: Date.now(),
        failedAttempts: 0
      };
    });
    
  } catch (err) {
    console.error('[SupabaseService] Erreur inattendue lors du prefetch:', err);
  }
};

/**
 * Déclenche la synchronisation des députés via l'Edge Function
 */
export const triggerDeputiesSync = async (
  legislature: string = '17',
  force: boolean = false
): Promise<{success: boolean, message: string}> => {
  try {
    const { data, error } = await supabase.functions.invoke('sync-deputies', {
      body: { legislature, force },
    });
    
    if (error) {
      console.error('[SupabaseService] Erreur lors de la synchronisation:', error);
      return { success: false, message: error.message };
    }
    
    return { 
      success: true, 
      message: `Synchronisation ${data.success ? 'réussie' : 'échouée'}: ${data.updated || 0} députés mis à jour` 
    };
  } catch (err) {
    console.error('[SupabaseService] Erreur lors de l\'appel de la fonction:', err);
    return { 
      success: false, 
      message: err instanceof Error ? err.message : 'Erreur lors de la synchronisation' 
    };
  }
};

export default {
  getDeputyInfoFromSupabase,
  formatDeputyNameFromSupabase,
  prefetchDeputiesFromSupabase,
  triggerDeputiesSync
};
