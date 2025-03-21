import { ApiVoteResponse, DeputeInfo, DeputeSearchResult, DeportInfo, StatusMessage, VotePosition } from './types';

const API_BASE_URL = 'https://api-dataan.onrender.com';

/**
 * Normalise les positions de vote de l'API (avec majuscules) vers notre format interne (minuscules)
 */
const normalizePosition = (apiPosition: string): VotePosition => {
  const positionMap: Record<string, VotePosition> = {
    'Pour': 'pour',
    'Contre': 'contre',
    'Abstention': 'abstention',
    'Absent': 'absent'
  };
  
  return positionMap[apiPosition] || 'absent';
};

/**
 * Transforme les données de l'API vers notre format interne
 */
const transformApiData = (apiData: ApiVoteResponse[]): DeputyVoteData[] => {
  return apiData.map(vote => ({
    numero: vote.numero,
    dateScrutin: vote.date,
    title: vote.titre,
    position: normalizePosition(vote.position)
  }));
};

/**
 * Recherche un député par ID ou nom
 */
export const searchDepute = async (
  query: string,
  updateStatus: (status: StatusMessage) => void
): Promise<DeputeSearchResult> => {
  try {
    updateStatus({
      status: 'loading',
      message: 'Recherche du député...',
    });
    
    // Détermine si le format ressemble à un ID de député (PAxxxx)
    const isDeputeId = /^PA\d+$/i.test(query.trim());
    const searchParam = isDeputeId ? 'depute_id' : 'nom';
    
    console.log(`[API] Searching for deputy by ${searchParam}: ${query}`);
    const response = await fetch(`${API_BASE_URL}/depute?${searchParam}=${encodeURIComponent(query.trim())}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        updateStatus({
          status: 'error',
          message: 'Député introuvable',
          details: `Aucun député trouvé pour "${query}". Vérifiez le nom ou l'identifiant et réessayez.`
        });
        return { success: false };
      }
      
      throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Si plusieurs députés sont trouvés (homonymes)
    if (data.error && data.options) {
      return {
        success: false,
        multipleResults: true,
        options: data.options
      };
    }
    
    // Un seul député trouvé avec ses informations
    return {
      success: true,
      deputeInfo: {
        id: data.uid,
        prenom: data.etatCivil.ident.prenom,
        nom: data.etatCivil.ident.nom,
        profession: data.profession?.libelleCourant || 'Non renseignée'
      }
    };
    
  } catch (error) {
    console.error('[API] Error searching for deputy:', error);
    
    updateStatus({
      status: 'error',
      message: 'Erreur lors de la recherche du député',
      details: error instanceof Error ? error.message : 'Une erreur inconnue est survenue'
    });
    
    return { success: false };
  }
};

/**
 * Récupère les votes d'un député depuis l'API
 */
export const fetchDeputyVotes = async (
  deputyId: string,
  updateStatus: (status: StatusMessage) => void
): Promise<DeputyVoteData[]> => {
  try {
    updateStatus({
      status: 'loading',
      message: 'Interrogation de l\'API des votes...',
    });
    
    console.log(`[API] Fetching votes for deputy: ${deputyId}`);
    
    // Détermine si c'est un ID ou un nom
    const isDeputeId = /^PA\d+$/i.test(deputyId.trim());
    const searchParam = isDeputeId ? 'depute_id' : 'nom';
    
    const response = await fetch(`${API_BASE_URL}/votes?${searchParam}=${encodeURIComponent(deputyId.trim())}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      // En cas d'erreur HTTP, on gère différents codes d'erreur
      if (response.status === 404) {
        updateStatus({
          status: 'error',
          message: 'Député introuvable',
          details: `Aucun vote trouvé pour "${deputyId}". Vérifiez l'identifiant ou le nom et réessayez.`
        });
        return [];
      }
      
      throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
    }
    
    // Récupération des données JSON
    const apiData: ApiVoteResponse[] = await response.json();
    console.log(`[API] Received ${apiData.length} votes`);
    
    // Transformation des données
    const votesData = transformApiData(apiData);
    
    if (votesData.length === 0) {
      updateStatus({
        status: 'complete',
        message: 'Aucun vote trouvé pour ce député',
        details: `Vérifiez l'identifiant ou le nom du député "${deputyId}" et réessayez.`
      });
    } else {
      updateStatus({
        status: 'complete',
        message: `${votesData.length} votes analysés`,
        details: `Votes trouvés pour le député ${deputyId}`
      });
    }
    
    return votesData;
    
  } catch (error) {
    console.error('[API] Error fetching deputy votes:', error);
    
    updateStatus({
      status: 'error',
      message: 'Erreur lors de la connexion à l\'API',
      details: error instanceof Error ? error.message : 'Une erreur inconnue est survenue'
    });
    
    throw error;
  }
};

/**
 * Récupère les déports (restrictions de vote) d'un député
 */
export const fetchDeputyDeports = async (
  deputyId: string
): Promise<DeportInfo[]> => {
  try {
    if (!deputyId.trim() || !/^PA\d+$/i.test(deputyId)) {
      return [];
    }
    
    console.log(`[API] Fetching deports for deputy: ${deputyId}`);
    const response = await fetch(`${API_BASE_URL}/deports?depute_id=${deputyId.trim()}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Si le message indique qu'aucun déport n'a été trouvé
    if (data.message && data.message.includes('Aucun déport')) {
      return [];
    }
    
    // Transformation des données de déport
    return data.map((deport: any) => ({
      id: deport.uid,
      deputeId: deport.refActeur,
      portee: deport.portee.libelle,
      cible: deport.cible.referenceTextuelle
    }));
    
  } catch (error) {
    console.error('[API] Error fetching deputy deports:', error);
    return [];
  }
};

/**
 * Exporte les données au format CSV
 */
export function exportToCSV(data: DeputyVoteData[]): void {
  if (data.length === 0) return;
  
  // Prepare CSV content
  const headers = ['Numéro', 'Date', 'Sujet', 'Position'];
  
  // Map vote positions to French
  const positionMap: Record<VotePosition, string> = {
    pour: 'Pour',
    contre: 'Contre',
    abstention: 'Abstention',
    absent: 'Absent'
  };
  
  // Create CSV rows
  const rows = data.map(item => [
    item.numero,
    formatDate(item.dateScrutin),
    item.title.replace(/"/g, '""'), // Escape quotes in CSV
    positionMap[item.position]
  ]);
  
  // Combine headers and rows
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
  
  // Create and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  link.setAttribute('href', url);
  link.setAttribute('download', `votes_depute_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function formatDate(dateString: string): string {
  if (!dateString) return '';
  
  try {
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  } catch (e) {
    return dateString;
  }
}

// Alias pour compatibilité avec le code existant
export interface DeputyVoteData {
  numero: string;
  dateScrutin: string;
  title: string;
  position: VotePosition;
}
