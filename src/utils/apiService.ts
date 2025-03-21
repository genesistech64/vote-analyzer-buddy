
import { ApiVoteResponse, DeputeInfo, DeputeFullInfo, DeputeSearchResult, DeportInfo, StatusMessage, VotePosition, OrganeDetailInfo } from './types';

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
 * Extrait l'ID de député d'un objet ou d'une chaîne
 */
const extractDeputyId = (deputyIdInput: any): string => {
  // Si c'est déjà une chaîne simple, on la retourne
  if (typeof deputyIdInput === 'string') {
    return deputyIdInput;
  }
  
  // Si c'est un objet complexe (cas de l'API)
  if (deputyIdInput && typeof deputyIdInput === 'object') {
    // Si l'objet a une propriété #text, on l'utilise
    if ('#text' in deputyIdInput) {
      return String(deputyIdInput['#text']);
    }
    
    // Si l'objet a une propriété uid, on l'utilise
    if ('uid' in deputyIdInput) {
      return String(deputyIdInput.uid);
    }
    
    // Si l'objet a une propriété id, on l'utilise
    if ('id' in deputyIdInput) {
      return String(deputyIdInput.id);
    }
  }
  
  // Si on ne peut pas extraire un ID valide
  console.error('Invalid deputy ID format:', deputyIdInput);
  return '';
};

/**
 * Extrait une valeur d'une propriété qui peut être une chaîne ou un objet complexe
 */
const extractStringValue = (input: any): string => {
  if (input === null || input === undefined) {
    return '';
  }
  
  if (typeof input === 'string') {
    return input;
  }
  
  if (typeof input === 'object') {
    // Cas de l'API avec valeur dans #text
    if ('#text' in input) {
      return String(input['#text']);
    }
    
    // Cas de l'API avec valeur dans value
    if ('value' in input) {
      return String(input.value);
    }
    
    // Cas spécifique pour la profession
    if ('libelleCourant' in input) {
      return String(input.libelleCourant);
    }
    
    // Cas spécifique pour l'etatCivil (nom, prénom)
    if ('ident' in input) {
      const ident = input.ident;
      if (ident && typeof ident === 'object') {
        if ('nom' in ident) {
          return extractStringValue(ident.nom);
        }
        if ('prenom' in ident) {
          return extractStringValue(ident.prenom);
        }
      }
    }
  }
  
  // Si on ne peut pas extraire une valeur, on retourne une chaîne vide
  return '';
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
    console.log("[API] Raw deputy data:", data);
    
    // Si plusieurs députés sont trouvés (homonymes)
    if (data.error && data.options) {
      return {
        success: false,
        multipleResults: true,
        options: data.options
      };
    }
    
    // Extraction des données complexes
    let prenom = '';
    let nom = '';
    
    // Gestion spécifique pour etatCivil.ident (structure complexe)
    if (data.etatCivil && typeof data.etatCivil === 'object' && data.etatCivil.ident) {
      const ident = data.etatCivil.ident;
      prenom = extractStringValue(ident.prenom || '');
      nom = extractStringValue(ident.nom || '');
    } else {
      // Fallback si la structure est différente
      prenom = extractStringValue(data.prenom);
      nom = extractStringValue(data.nom);
    }
    
    // Extraction des autres informations
    const id = extractDeputyId(data.id || data.uid);
    let profession = '';
    
    // Gestion spécifique pour la profession (structure complexe)
    if (data.profession && typeof data.profession === 'object') {
      profession = extractStringValue(data.profession);
    } else {
      profession = extractStringValue(data.profession);
    }
    
    console.log("[API] Extracted deputy info:", { id, prenom, nom, profession });
    
    // Un seul député trouvé avec ses informations
    return {
      success: true,
      deputeInfo: {
        id,
        prenom,
        nom,
        profession: profession || 'Non renseignée'
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
 * Récupère les détails complets d'un député par ID
 */
export const getDeputyDetails = async (deputyId: string): Promise<DeputeFullInfo> => {
  try {
    console.log(`[API] Fetching details for deputy: ${deputyId}`);
    
    // S'assurer que l'ID est au bon format
    if (!/^PA\d+$/i.test(deputyId.trim())) {
      throw new Error(`Format d'identifiant de député invalide: ${deputyId}`);
    }
    
    const response = await fetch(`${API_BASE_URL}/depute?depute_id=${deputyId.trim()}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Adaptation aux nouveaux champs de l'API
    return {
      id: data.id || deputyId,
      prenom: data.prenom,
      nom: data.nom,
      profession: data.profession || 'Non renseignée',
      civilite: data.civilite,
      date_naissance: data.date_naissance,
      lieu_naissance: data.lieu_naissance,
      groupe_politique: data.groupe_politique,
      organes: data.organes,
      contacts: data.contacts
    };
    
  } catch (error) {
    console.error('[API] Error fetching deputy details:', error);
    throw error;
  }
};

/**
 * Récupère les détails d'un organe par ID
 */
export const getOrganeDetails = async (organeId: string): Promise<OrganeDetailInfo> => {
  try {
    console.log(`[API] Fetching details for organe: ${organeId}`);
    
    const response = await fetch(`${API_BASE_URL}/organes?organe_id=${organeId.trim()}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('[API] Error fetching organe details:', error);
    throw error;
  }
};

/**
 * Récupère les votes d'un député depuis l'API
 */
export const fetchDeputyVotes = async (
  deputyId: any,
  updateStatus: (status: StatusMessage) => void
): Promise<DeputyVoteData[]> => {
  try {
    // Extraire l'ID du député, qu'il soit sous forme de chaîne ou d'objet
    const deputyIdString = extractDeputyId(deputyId);
    
    // Vérifier que l'ID est valide
    if (!deputyIdString) {
      console.error('[API] Invalid deputyId after extraction:', deputyId);
      updateStatus({
        status: 'error',
        message: 'Identifiant de député invalide',
        details: 'Format d\'identifiant non reconnu'
      });
      return [];
    }
    
    updateStatus({
      status: 'loading',
      message: 'Interrogation de l\'API des votes...',
    });
    
    console.log(`[API] Fetching votes for deputy: ${deputyIdString}`);
    
    // Détermine si c'est un ID ou un nom
    const isDeputeId = /^PA\d+$/i.test(deputyIdString.trim());
    const searchParam = isDeputeId ? 'depute_id' : 'nom';
    
    const response = await fetch(`${API_BASE_URL}/votes?${searchParam}=${encodeURIComponent(deputyIdString.trim())}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      // En cas d'erreur HTTP, on gère différents codes d'erreur
      if (response.status === 404) {
        updateStatus({
          status: 'error',
          message: 'Député introuvable',
          details: `Aucun vote trouvé pour "${deputyIdString}". Vérifiez l'identifiant ou le nom et réessayez.`
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
        details: `Vérifiez l'identifiant ou le nom du député "${deputyIdString}" et réessayez.`
      });
    } else {
      updateStatus({
        status: 'complete',
        message: `${votesData.length} votes analysés`,
        details: `Votes trouvés pour le député ${deputyIdString}`
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
  deputyId: any
): Promise<DeportInfo[]> => {
  try {
    // Extraire l'ID du député, qu'il soit sous forme de chaîne ou d'objet
    const deputyIdString = extractDeputyId(deputyId);
    
    // Vérifier que l'ID est valide
    if (!deputyIdString) {
      console.error('[API] Invalid deputyId for deports after extraction:', deputyId);
      return [];
    }
    
    // Si ce n'est pas un format d'ID valide, on arrête
    if (!/^PA\d+$/i.test(deputyIdString.trim())) {
      console.warn('[API] Not a valid deputy ID format for deports:', deputyIdString);
      return [];
    }
    
    console.log(`[API] Fetching deports for deputy: ${deputyIdString}`);
    const response = await fetch(`${API_BASE_URL}/deports?depute_id=${deputyIdString.trim()}`, {
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
    
    return data;
    
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
