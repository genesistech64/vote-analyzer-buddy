
import { DeputeInfo, StatusMessage } from '@/utils/types';
import { toast } from 'sonner';

// Configuration pour le debug
const DEBUG = true;
const LOG_PREFIX = '[DeputySupabase]';

// Fonction utilitaire pour les logs
const log = (message: string, data?: any) => {
  if (DEBUG) {
    if (data) {
      console.log(`${LOG_PREFIX} ${message}`, data);
    } else {
      console.log(`${LOG_PREFIX} ${message}`);
    }
  }
};

export const getDeputyFromSupabase = async (
  deputyId: string,
  legislature: string = '17'
): Promise<DeputeInfo | null> => {
  try {
    log(`Tentative de récupération du député ID=${deputyId} (legislature=${legislature})`);
    
    // Format proper ID with PA prefix if needed
    const formattedId = deputyId.startsWith('PA') ? deputyId : `PA${deputyId}`;
    log(`ID formaté: ${formattedId}`);
    
    const { supabase } = await import('@/integrations/supabase/client');
    
    log(`Exécution de la requête sur la table deputies`);
    // Instead of using the RPC function which is causing errors, directly query the deputies table
    const { data, error } = await supabase
      .from('deputies')
      .select('*')
      .eq('deputy_id', formattedId)
      .eq('legislature', legislature)
      .single();

    if (error) {
      console.error(`${LOG_PREFIX} Erreur lors de la récupération du député ${formattedId}:`, error);
      return null;
    }

    if (data) {
      log(`Député trouvé:`, data);
      return {
        id: data.deputy_id,
        prenom: data.first_name,
        nom: data.last_name,
        profession: data.profession || 'Non renseignée',
        groupe_politique: data.political_group || 'Non renseigné',
        groupe_politique_id: data.political_group_id || 'Non renseigné'
      };
    } else {
      log(`Aucun député trouvé pour l'ID ${formattedId} dans la legislature ${legislature}`);
      return null;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Exception lors de la récupération du député:`, error);
    return null;
  }
};

export const prefetchDeputiesFromSupabase = async (
  deputyIds: string[],
  legislature: string = '17'
): Promise<StatusMessage> => {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    // Formater tous les IDs avec le préfixe PA si nécessaire
    const formattedIds = deputyIds.map(id => id.startsWith('PA') ? id : `PA${id}`);
    
    // Log détaillé de la tentative de préchargement
    log(`Tentative de préchargement de ${formattedIds.length} députés pour la legislature ${legislature}`);
    log(`Liste des IDs à précharger:`, formattedIds);
    
    // Fetch all deputies in one go
    const { data, error } = await supabase
      .from('deputies')
      .select()
      .in('deputy_id', formattedIds)
      .eq('legislature', legislature);
    
    if (error) {
      console.error(`${LOG_PREFIX} Erreur lors du préchargement des députés:`, error);
      return {
        status: 'error',
        message: 'Erreur lors du préchargement des députés',
        details: error.message
      };
    }
    
    if (data && data.length > 0) {
      log(`${data.length} députés préchargés avec succès`);
      
      // Log du premier et dernier élément pour vérification
      if (data.length > 0) {
        log(`Premier député préchargé:`, data[0]);
        log(`Dernier député préchargé:`, data[data.length - 1]);
      }
      
      // Vérifier les députés qui n'ont pas été trouvés
      const retrievedIds = data.map(d => d.deputy_id);
      const missingIds = formattedIds.filter(id => !retrievedIds.includes(id));
      
      if (missingIds.length > 0) {
        log(`${missingIds.length} députés n'ont pas été trouvés dans la base de données:`, missingIds);
      }
      
      return {
        status: 'complete',
        message: `${data.length} députés préchargés avec succès, ${missingIds.length} non trouvés`
      };
    } else {
      log(`Aucun député trouvé dans Supabase pour les ${formattedIds.length} IDs demandés`);
      // Vérifier s'il y a des députés dans la table
      const { count, error: countError } = await supabase
        .from('deputies')
        .select('*', { count: 'exact', head: true })
        .eq('legislature', legislature);
      
      if (countError) {
        log(`Erreur lors de la vérification du nombre de députés:`, countError);
      } else {
        log(`Nombre total de députés dans la table pour la législature ${legislature}: ${count}`);
      }
      
      return {
        status: 'warning',
        message: 'Aucun député trouvé dans Supabase',
        details: `La table contient ${count || 0} députés pour la législature ${legislature}`
      };
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Exception lors du préchargement des députés:`, error);
    return {
      status: 'error',
      message: 'Erreur lors du préchargement des députés',
      details: error instanceof Error ? error.message : 'Erreur inconnue'
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
    
    log(`Déclenchement de la synchronisation des députés pour la legislature ${legislature}, force=${force}`);
    
    // Show a loading toast
    const toastId = toast.loading('Synchronisation des députés en cours...');
    
    const { data, error } = await supabase.functions.invoke('sync-deputies', {
      body: { legislature, force }
    });

    if (error) {
      console.error(`${LOG_PREFIX} Erreur lors de l'appel à la fonction sync-deputies:`, error);
      
      // Update toast to show error
      toast.error('Erreur de synchronisation des députés', {
        id: toastId,
        description: error.message
      });
      
      return {
        success: false,
        message: `Error syncing deputies: ${error.message}`,
        fetch_errors: [error.message],
        sync_errors: []
      };
    }

    // The response should already be JSON
    log('Résultat de la synchronisation des députés:', data);
    
    // Update the toast based on the result
    if (data && data.success) {
      toast.success('Synchronisation des députés réussie', {
        id: toastId,
        description: `${data.deputies_count || 0} députés synchronisés`
      });
    } else {
      const errorMessage = data?.message || 'No deputies fetched, cannot proceed with sync';
      const fetchErrors = data?.fetch_errors || [];
      const syncErrors = data?.sync_errors || [];
      
      log('Erreur lors de la synchronisation:', errorMessage);
      log('Erreurs de récupération:', fetchErrors);
      log('Erreurs de synchronisation:', syncErrors);
      
      toast.error('Erreur de synchronisation des députés', {
        id: toastId,
        description: errorMessage
      });
      
      // If there are specific fetch errors, show more detail in a separate toast
      if (fetchErrors.length > 0) {
        toast.error('Détails de l\'erreur de synchronisation', {
          description: `Source des données : ${fetchErrors[0].substring(0, 100)}` // Show first error, truncated
        });
      }
      
      // Also show sync errors if there are any
      if (syncErrors.length > 0) {
        toast.error('Erreurs de synchronisation avec la base de données', {
          description: `${syncErrors.length} erreur(s) lors de la synchronisation.`
        });
      }
    }
    
    return data as DeputiesSyncResult;
  } catch (error) {
    console.error(`${LOG_PREFIX} Exception lors de la synchronisation des députés:`, error);
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

export const debugDatabaseState = async (legislature: string = '17'): Promise<{
  totalDeputies: number;
  tableExists: boolean;
  randomSample: any[];
  error?: string;
}> => {
  try {
    log(`Vérification de l'état de la base de données pour la legislature ${legislature}`);
    const { supabase } = await import('@/integrations/supabase/client');
    
    // Vérifier si la table existe
    const { data: tablesData, error: tablesError } = await supabase
      .from('deputies')
      .select('count(*)', { count: 'exact', head: true });
    
    if (tablesError) {
      log(`Erreur lors de la vérification de la table:`, tablesError);
      return {
        totalDeputies: 0,
        tableExists: false,
        randomSample: [],
        error: tablesError.message
      };
    }
    
    // Compter le nombre total de députés
    const { count, error: countError } = await supabase
      .from('deputies')
      .select('*', { count: 'exact', head: true })
      .eq('legislature', legislature);
    
    if (countError) {
      log(`Erreur lors du comptage des députés:`, countError);
      return {
        totalDeputies: 0,
        tableExists: true,
        randomSample: [],
        error: countError.message
      };
    }
    
    // Récupérer un échantillon aléatoire pour vérification
    const { data: sampleData, error: sampleError } = await supabase
      .from('deputies')
      .select('*')
      .eq('legislature', legislature)
      .limit(5);
    
    if (sampleError) {
      log(`Erreur lors de la récupération de l'échantillon:`, sampleError);
      return {
        totalDeputies: count || 0,
        tableExists: true,
        randomSample: [],
        error: sampleError.message
      };
    }
    
    log(`État de la base de données: ${count} députés trouvés pour la legislature ${legislature}`);
    log(`Échantillon de députés:`, sampleData);
    
    return {
      totalDeputies: count || 0,
      tableExists: true,
      randomSample: sampleData || []
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Exception lors de la vérification de l'état de la base de données:`, error);
    return {
      totalDeputies: 0,
      tableExists: false,
      randomSample: [],
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    };
  }
};
