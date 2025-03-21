import { ApiVoteResponse, DeputeInfo, DeputeFullInfo, DeputeSearchResult, DeportInfo, StatusMessage, VotePosition } from './types';

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
    
    // Extraction des données pertinentes de l'API
    let deputeFullInfo: DeputeFullInfo = {
      id: deputyId,
      prenom: data.etatCivil?.ident?.prenom || '',
      nom: data.etatCivil?.ident?.nom || '',
      profession: data.profession?.libelleCourant || 'Non renseignée'
    };
    
    // Ajout des informations supplémentaires si disponibles
    if (data.etatCivil?.infoNaissance) {
      deputeFullInfo.dateNaissance = data.etatCivil.infoNaissance.dateNais;
      deputeFullInfo.lieuNaissance = data.etatCivil.infoNaissance.villeNais;
      deputeFullInfo.departementNaissance = data.etatCivil.infoNaissance.depNais;
    }
    
    // Récupération des informations de mandat
    if (data.mandats && Array.isArray(data.mandats.mandat)) {
      // Chercher le mandat actuel (législature courante)
      const currentMandate = data.mandats.mandat.find((m: any) => 
        m.typeOrgane === 'ASSEMBLEE' && !m.dateFin
      );
      
      if (currentMandate) {
        // Information de circonscription
        if (currentMandate.election && currentMandate.election.lieu) {
          const lieu = currentMandate.election.lieu;
          deputeFullInfo.circonscription = `${lieu.numCirco}e circonscription ${lieu.departement} (${lieu.numDepartement})`;
        }
        
        // Date de prise de fonction
        if (currentMandate.mandature && currentMandate.mandature.datePriseFonction) {
          deputeFullInfo.datePriseFonction = currentMandate.mandature.datePriseFonction;
        }
        
        // Collaborateurs
        if (currentMandate.collaborateurs && Array.isArray(currentMandate.collaborateurs.collaborateur)) {
          deputeFullInfo.collaborateurs = currentMandate.collaborateurs.collaborateur.map(
            (c: any) => `${c.qualite} ${c.prenom} ${c.nom}`
          );
        }
      }
      
      // Chercher le groupe politique
      const groupMandate = data.mandats.mandat.find((m: any) => 
        m.typeOrgane === 'GP' && !m.dateFin
      );
      
      if (groupMandate && groupMandate.organes && groupMandate.organes.organeRef) {
        // Idéalement, on voudrait faire une requête supplémentaire pour obtenir le nom du groupe
        // mais pour simplifier, on utilise l'ID du groupe
        deputeFullInfo.groupe = groupMandate.organes.organeRef;
      }
    }
    
    // URL HATVP
    if (data.uri_hatvp) {
      deputeFullInfo.urlHatvp = data.uri_hatvp;
    }
    
    // Extraction des adresses électroniques
    if (data.adresses && Array.isArray(data.adresses.adresse)) {
      deputeFullInfo.adresses = {};
      
      data.adresses.adresse.forEach((adresse: any) => {
        if (adresse.type === '15' && adresse.valElec) { // Email
          deputeFullInfo.adresses!.mail = adresse.valElec;
        } else if (adresse.type === '22' && adresse.valElec) { // Site web
          deputeFullInfo.adresses!.web = adresse.valElec;
        } else if (adresse.type === '24' && adresse.valElec) { // Twitter
          deputeFullInfo.adresses!.twitter = adresse.valElec;
        } else if (adresse.type === '25' && adresse.valElec) { // Facebook
          deputeFullInfo.adresses!.facebook = adresse.valElec;
        }
      });
    }
    
    return deputeFullInfo;
    
  } catch (error) {
    console.error('[API] Error fetching deputy details:', error);
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
