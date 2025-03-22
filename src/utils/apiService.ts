import { 
  DeputeInfo, 
  DeputeSearchResult, 
  DeputyVoteData, 
  StatusMessage, 
  VotePosition,
  ApiVoteResponse,
  DeportInfo,
  DeputeFullInfo
} from './types';
import { toast } from 'sonner';

// Base URL for the API
const API_BASE_URL = 'https://api-dataan.onrender.com';

/**
 * Search for a deputy by name or ID
 */
export const searchDepute = async (
  query: string,
  setStatus: (status: StatusMessage) => void,
  legislature: string = "17"
): Promise<DeputeSearchResult> => {
  setStatus({
    status: 'loading',
    message: 'Recherche du député...'
  });

  // Determine if query is likely a deputy ID (format PAxxxxxx)
  const isDeputyId = /^PA\d+$/i.test(query);
  
  try {
    let result: DeputeSearchResult;
    
    // First try the enriched endpoint with legislature parameter
    try {
      console.log(`[API] Searching for deputy by ${isDeputyId ? 'depute_id' : 'nom'}: ${query} in legislature: ${legislature}`);
      
      // Form the search URL based on whether it looks like a deputy ID or a name
      const searchParam = isDeputyId ? 'depute_id' : 'nom';
      const url = `${API_BASE_URL}/depute_enrichi?${searchParam}=${encodeURIComponent(query)}&legislature=${legislature}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.log('[API] Endpoint enrichi non trouvé, essai avec l\'endpoint standard');
        throw new Error('Député non trouvé dans les données enrichies');
      }
      
      const data = await response.json();
      
      // Handle the case where multiple deputies might match the name
      if (Array.isArray(data)) {
        if (data.length === 0) {
          throw new Error('Aucun député trouvé');
        } else if (data.length === 1) {
          // Single deputy found
          const deputeInfo = parseDeputeInfo(data[0]);
          result = { success: true, deputeInfo };
        } else {
          // Multiple deputies found, let the user select one
          const options = data.map(d => ({
            id: d.uid || d.depute_id || d.id,
            prenom: d.prenom || '',
            nom: d.nom || ''
          }));
          
          result = { 
            success: true, 
            multipleResults: true,
            options 
          };
        }
      } else {
        // Single deputy found
        const deputeInfo = parseDeputeInfo(data);
        result = { success: true, deputeInfo };
      }
      
      setStatus({
        status: 'complete',
        message: 'Député trouvé'
      });
      
      return result;
      
    } catch (enrichiError) {
      console.log('[API] Error with enriched endpoint, trying standard endpoint:', enrichiError);
      
      // Fallback to standard endpoint without legislature parameter
      try {
        const searchParam = isDeputyId ? 'depute_id' : 'nom';
        const url = `${API_BASE_URL}/depute?${searchParam}=${encodeURIComponent(query)}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Député non trouvé (status: ${response.status})`);
        }
        
        const data = await response.json();
        
        // Handle the case where multiple deputies might match the name
        if (Array.isArray(data)) {
          if (data.length === 0) {
            throw new Error('Aucun député trouvé');
          } else if (data.length === 1) {
            // Single deputy found
            const deputeInfo = parseDeputeInfo(data[0]);
            result = { success: true, deputeInfo };
          } else {
            // Multiple deputies found, let the user select one
            const options = data.map(d => ({
              id: d.uid || d.depute_id || d.id,
              prenom: d.prenom || '',
              nom: d.nom || ''
            }));
            
            result = { 
              success: true, 
              multipleResults: true,
              options 
            };
          }
        } else {
          // Single deputy found
          const deputeInfo = parseDeputeInfo(data);
          result = { success: true, deputeInfo };
        }
        
        setStatus({
          status: 'complete',
          message: 'Député trouvé'
        });
        
        return result;
        
      } catch (standardError) {
        console.error('[API] Both endpoints failed:', standardError);
        setStatus({
          status: 'error',
          message: 'Député non trouvé',
          details: 'Vérifiez l\'orthographe ou utilisez un identifiant différent'
        });
        
        return { success: false };
      }
    }
    
  } catch (error) {
    console.error('[API] Search error:', error);
    setStatus({
      status: 'error',
      message: 'Erreur lors de la recherche',
      details: error instanceof Error ? error.message : String(error)
    });
    
    return { success: false };
  }
};

/**
 * Get detailed information about a deputy
 */
export const getDeputyDetails = async (
  deputyId: string,
  legislature: string = "17"
): Promise<DeputeFullInfo> => {
  try {
    // First try the enriched endpoint
    try {
      const response = await fetch(`${API_BASE_URL}/depute_enrichi?depute_id=${deputyId}&legislature=${legislature}`);
      
      if (!response.ok) {
        throw new Error('Deputy details not found in enriched data');
      }
      
      const data = await response.json();
      return parseDeputeFullInfo(data);
      
    } catch (enrichiError) {
      console.log('[API] Error with enriched endpoint, trying standard endpoint:', enrichiError);
      
      // Fallback to standard endpoint
      const response = await fetch(`${API_BASE_URL}/depute?depute_id=${deputyId}`);
      
      if (!response.ok) {
        throw new Error(`Deputy details not found (status: ${response.status})`);
      }
      
      const data = await response.json();
      return parseDeputeFullInfo(data);
    }
  } catch (error) {
    console.error('[API] Error fetching deputy details:', error);
    throw error;
  }
};

/**
 * Get information about a political group or any other type of "organe"
 */
export const getOrganeDetails = async (
  organeId: string,
  legislature: string = "17"
): Promise<any> => {
  try {
    // First try the enriched endpoint
    try {
      const response = await fetch(`${API_BASE_URL}/groupe_enrichi?organe_id=${organeId}&legislature=${legislature}`);
      
      if (!response.ok) {
        throw new Error('Groupe details not found in enriched data');
      }
      
      return await response.json();
      
    } catch (enrichiError) {
      console.log('[API] Error with enriched endpoint, trying standard endpoint:', enrichiError);
      
      // Fallback to standard endpoint
      const response = await fetch(`${API_BASE_URL}/organe?organe_id=${organeId}`);
      
      if (!response.ok) {
        throw new Error(`Organe details not found (status: ${response.status})`);
      }
      
      return await response.json();
    }
  } catch (error) {
    console.error('[API] Error fetching organe details:', error);
    throw error;
  }
};

/**
 * Get deputies belonging to a specific "organe" (group, commission, etc.)
 */
export const getDeputesByOrgane = async (
  organeId: string,
  organeType: string = "GP",
  legislature: string = "17",
  enrichi: boolean = true
): Promise<DeputeInfo[]> => {
  try {
    const endpoint = organeType === "GP" ? "deputes_par_groupe" : "deputes_par_organe";
    const url = `${API_BASE_URL}/${endpoint}?organe_id=${organeId}&legislature=${legislature}${enrichi ? '&enrichi=true' : ''}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch deputies for organe (status: ${response.status})`);
    }
    
    const data = await response.json();
    
    // Map the API response to our DeputeInfo type
    return Array.isArray(data) 
      ? data.map(d => parseDeputeInfo(d))
      : [];
      
  } catch (error) {
    console.error('[API] Error fetching deputies by organe:', error);
    throw error;
  }
};

/**
 * Fetch votes for a deputy
 */
export const fetchDeputyVotes = async (
  deputyId: string, 
  setStatus: (status: StatusMessage) => void,
  legislature: string = "17"
): Promise<DeputyVoteData[]> => {
  setStatus({
    status: 'loading',
    message: 'Analyse des votes en cours...',
    details: 'Récupération des scrutins de la législature'
  });

  try {
    const url = `${API_BASE_URL}/votes?depute_id=${deputyId}${legislature ? `&legislature=${legislature}` : ''}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Échec de récupération des votes (status: ${response.status})`);
    }
    
    const data: ApiVoteResponse[] = await response.json();
    
    setStatus({
      status: 'complete',
      message: `${data.length} votes analysés`,
    });
    
    return data.map(vote => ({
      numero: vote.numero,
      dateScrutin: vote.date,
      title: vote.titre,
      position: mapApiPositionToVotePosition(vote.position)
    }));
    
  } catch (error) {
    console.error('[API] Error fetching deputy votes:', error);
    setStatus({
      status: 'error',
      message: 'Erreur lors de l\'analyse des votes',
      details: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
};

/**
 * Fetch deports (voting restrictions) for a deputy
 */
export const fetchDeputyDeports = async (
  deputyId: string,
  legislature: string = "17"
): Promise<DeportInfo[]> => {
  try {
    const url = `${API_BASE_URL}/deports?depute_id=${deputyId}${legislature ? `&legislature=${legislature}` : ''}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      // If 404, just return empty array - deputy might not have deports
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Échec de récupération des déports (status: ${response.status})`);
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('[API] Error fetching deputy deports:', error);
    return []; // Return empty array on error
  }
};

/**
 * Export votes to CSV
 */
export const exportToCSV = (data: DeputyVoteData[], filename: string = 'votes-depute.csv'): void => {
  if (data.length === 0) {
    toast.error("Aucune donnée à exporter");
    return;
  }

  const csvRows = [];

  // Headers
  csvRows.push("Numero,Date,Title,Position");

  // Rows
  data.forEach(vote => {
    csvRows.push(
      `${vote.numero},${vote.dateScrutin},"${vote.title.replace(/"/g, '""')}",${vote.position}`
    );
  });

  // Assemble and trigger download
  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', filename);
  a.click();
};

/**
 * Helper function to map API position to our VotePosition type
 */
function mapApiPositionToVotePosition(apiPosition: string): VotePosition {
  // Convert to lowercase to match our type
  const position = apiPosition.toLowerCase();
  
  // Check if it matches one of our allowed types
  if (position === 'pour' || position === 'contre' || position === 'abstention' || position === 'absent') {
    return position as VotePosition;
  }
  
  // Default to absent for any other values
  return 'absent';
}

/**
 * Helper function to parse deputy info from API response
 */
function parseDeputeInfo(data: any): DeputeInfo {
  return {
    id: data.uid || data.depute_id || data.id || '',
    prenom: data.prenom || data.name_first || '',
    nom: data.nom || data.name_last || '',
    profession: data.profession || '',
    groupe_politique: data.groupe_politique || data.groupe_libelle || data.groupe || ''
  };
}

/**
 * Helper function to parse full deputy info from API response
 */
function parseDeputeFullInfo(data: any): DeputeFullInfo {
  return {
    id: data.uid || data.depute_id || data.id || '',
    prenom: data.prenom || data.name_first || '',
    nom: data.nom || data.name_last || '',
    profession: data.profession || '',
    civilite: data.civilite || '',
    date_naissance: data.date_naissance || '',
    lieu_naissance: data.lieu_naissance || '',
    groupe_politique: data.groupe_politique || data.groupe_libelle || data.groupe || '',
    groupe_politique_uid: data.groupe_politique_uid || data.groupe_uid || '',
    parti_politique: data.parti_politique || '',
    parti_politique_uid: data.parti_politique_uid || '',
    hatvp_url: data.hatvp_url || '',
    organes: data.organes || [],
    contacts: data.contacts || []
  };
}
