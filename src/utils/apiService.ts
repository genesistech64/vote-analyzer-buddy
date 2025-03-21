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
  if (typeof deputyIdInput === 'string') {
    return deputyIdInput;
  }
  
  if (deputyIdInput && typeof deputyIdInput === 'object') {
    if ('#text' in deputyIdInput) {
      return String(deputyIdInput['#text']);
    }
    
    if ('uid' in deputyIdInput) {
      return String(deputyIdInput.uid);
    }
    
    if ('id' in deputyIdInput) {
      return String(deputyIdInput.id);
    }
  }
  
  console.error('Invalid deputy ID format:', deputyIdInput);
  return '';
};

/**
 * Extrait une valeur d'une propriété qui peut être une chaîne ou un objet complexe
 */
export const extractStringValue = (input: any): string => {
  if (input === null || input === undefined) {
    return '';
  }
  
  if (typeof input === 'string') {
    return input;
  }
  
  if (typeof input === 'object') {
    if ('#text' in input) {
      return String(input['#text']);
    }
    
    if ('value' in input) {
      return String(input.value);
    }
    
    if ('libelleCourant' in input) {
      return String(input.libelleCourant);
    }
    
    if ('ident' in input) {
      const ident = input.ident;
      if (ident && typeof ident === 'object') {
        if ('nom' in ident) {
          return extractStringValue(ident.nom);
        }
        if ('prenom' in ident) {
          return extractStringValue(ident.prenom);
        }
        if ('civ' in ident) {
          return extractStringValue(ident.civ);
        }
      }
    }
    
    if ('infoNaissance' in input) {
      const infoNaissance = input.infoNaissance;
      if (infoNaissance && typeof infoNaissance === 'object') {
        if ('dateNais' in infoNaissance) {
          return extractStringValue(infoNaissance.dateNais);
        }
        if ('villeNais' in infoNaissance && 'paysNais' in infoNaissance) {
          const ville = extractStringValue(infoNaissance.villeNais);
          const pays = extractStringValue(infoNaissance.paysNais);
          return `${ville} (${infoNaissance.depNais || ''}), ${pays}`;
        }
      }
    }
    
    const keys = Object.keys(input);
    if (keys.length > 0) {
      for (const key of ['libelle', 'name', 'valeur', 'valElec', 'typeLibelle']) {
        if (key in input && (typeof input[key] === 'string' || typeof input[key] === 'number')) {
          return String(input[key]);
        }
      }
      for (const key of keys) {
        if (typeof input[key] === 'string' || typeof input[key] === 'number') {
          return String(input[key]);
        }
      }
    }
  }
  
  return '';
};

/**
 * Extrait les organes d'un député à partir des mandats
 */
const extractOrganes = (mandats: any[]): any[] => {
  if (!Array.isArray(mandats)) {
    console.warn('Mandats is not an array:', mandats);
    return [];
  }
  
  const organes: any[] = [];
  
  mandats.forEach(mandat => {
    try {
      const type = extractStringValue(mandat.typeOrgane);
      const nomOrgane = mandat.nomOrgane 
        ? extractStringValue(mandat.nomOrgane) 
        : (mandat.infosQualite && mandat.infosQualite.libQualite 
           ? extractStringValue(mandat.infosQualite.libQualite) 
           : '');
      
      const dateDebut = extractStringValue(mandat.dateDebut);
      const dateFin = mandat.dateFin ? extractStringValue(mandat.dateFin) : null;
      const legislature = extractStringValue(mandat.legislature);
      
      let uid = '';
      if (mandat.organeRef) {
        uid = typeof mandat.organeRef === 'object' ? extractStringValue(mandat.organeRef) : mandat.organeRef;
      } else if (mandat.uid) {
        uid = typeof mandat.uid === 'object' ? extractStringValue(mandat.uid) : mandat.uid;
      } else if (mandat.refOrgane) {
        uid = typeof mandat.refOrgane === 'object' ? extractStringValue(mandat.refOrgane) : mandat.refOrgane;
      }
      
      console.log(`[Organe extraction] Type: ${type}, Nom: ${nomOrgane}, UID: ${uid}`);
      
      if (type && (nomOrgane || dateDebut)) {
        organes.push({
          type,
          nom: nomOrgane,
          date_debut: dateDebut,
          date_fin: dateFin,
          legislature,
          uid
        });
      }
    } catch (err) {
      console.error('Error extracting organe information:', err);
    }
  });
  
  return organes;
};

/**
 * Extrait les contacts d'un député à partir des adresses
 */
const extractContacts = (adresses: any): any[] => {
  if (!adresses || !adresses.adresse) {
    console.warn('Adresses not found or missing adresse property:', adresses);
    return [];
  }
  
  const adresseArray = Array.isArray(adresses.adresse) ? adresses.adresse : [adresses.adresse];
  
  const contacts: any[] = [];
  
  adresseArray.forEach(adresse => {
    try {
      const type = extractStringValue(adresse.typeLibelle || adresse.type);
      let valeur = '';
      
      if (adresse.valElec) {
        valeur = extractStringValue(adresse.valElec);
      } else if (adresse.numeroRue && adresse.nomRue) {
        valeur = `${extractStringValue(adresse.numeroRue)} ${extractStringValue(adresse.nomRue)}`;
        if (adresse.codePostal && adresse.ville) {
          valeur += `, ${extractStringValue(adresse.codePostal)} ${extractStringValue(adresse.ville)}`;
        }
      }
      
      if (type && valeur) {
        contacts.push({
          type,
          valeur
        });
      }
    } catch (err) {
      console.error('Error extracting contact information:', err);
    }
  });
  
  return contacts;
};

/**
 * Recherche un député par ID ou nom
 */
export const searchDepute = async (
  query: string,
  updateStatus: (status: StatusMessage) => void,
  legislature?: string
): Promise<DeputeSearchResult> => {
  try {
    updateStatus({
      status: 'loading',
      message: 'Recherche du député...',
    });
    
    const isDeputeId = /^PA\d+$/i.test(query.trim());
    const searchParam = isDeputeId ? 'depute_id' : 'nom';
    
    console.log(`[API] Searching for deputy by ${searchParam}: ${query} in legislature: ${legislature || 'default'}`);
    
    let url = `${API_BASE_URL}/depute?${searchParam}=${encodeURIComponent(query.trim())}`;
    if (legislature) {
      url += `&legislature=${legislature}`;
    }
    
    const response = await fetch(url, {
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
    
    if (data.error && data.options) {
      console.log("[API] Multiple deputies found:", data.options);
      updateStatus({
        status: 'complete',
        message: 'Plusieurs députés trouvés',
        details: 'Veuillez sélectionner un député dans la liste.'
      });
      
      return {
        success: false,
        multipleResults: true,
        options: data.options
      };
    }
    
    let id, prenom, nom, profession;
    
    if (data.uid || data['@xmlns']) {
      id = extractDeputyId(data.uid || '');
      
      if (data.etatCivil && data.etatCivil.ident) {
        prenom = extractStringValue(data.etatCivil.ident.prenom);
        nom = extractStringValue(data.etatCivil.ident.nom);
      } else {
        prenom = '';
        nom = '';
      }
      
      profession = data.profession ? extractStringValue(data.profession) : '';
    } else {
      id = data.id || '';
      prenom = data.prenom || '';
      nom = data.nom || '';
      profession = data.profession || '';
    }
    
    if (!id) {
      id = query.trim();
    }
    
    console.log("[API] Extracted deputy info:", { id, prenom, nom, profession });
    
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
export const getDeputyDetails = async (deputyId: string, legislature?: string): Promise<DeputeFullInfo> => {
  try {
    console.log(`[API] Fetching details for deputy: ${deputyId} in legislature: ${legislature || 'default'}`);
    
    if (!/^PA\d+$/i.test(deputyId.trim())) {
      throw new Error(`Format d'identifiant de député invalide: ${deputyId}`);
    }
    
    let url = `${API_BASE_URL}/depute?depute_id=${deputyId.trim()}`;
    if (legislature) {
      url += `&legislature=${legislature}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('[API] Raw deputy details:', data);
    
    let deputeInfo: DeputeFullInfo;
    
    if (data.uid || data['@xmlns'] || data.etatCivil) {
      console.log('[API] Processing complex API format for details');
      
      const id = extractDeputyId(data.uid || deputyId);
      
      let prenom = '', nom = '', civilite = '';
      if (data.etatCivil && data.etatCivil.ident) {
        prenom = extractStringValue(data.etatCivil.ident.prenom);
        nom = extractStringValue(data.etatCivil.ident.nom);
        civilite = extractStringValue(data.etatCivil.ident.civ);
      }
      
      let date_naissance = '', lieu_naissance = '';
      if (data.etatCivil && data.etatCivil.infoNaissance) {
        date_naissance = extractStringValue(data.etatCivil.infoNaissance.dateNais);
        
        const villeNais = extractStringValue(data.etatCivil.infoNaissance.villeNais);
        const depNais = extractStringValue(data.etatCivil.infoNaissance.depNais);
        const paysNais = extractStringValue(data.etatCivil.infoNaissance.paysNais);
        
        lieu_naissance = villeNais;
        if (depNais && villeNais !== depNais) lieu_naissance += ` (${depNais})`;
        if (paysNais) lieu_naissance += `, ${paysNais}`;
      }
      
      const profession = data.profession ? extractStringValue(data.profession) : '';
      
      let groupe_politique = '';
      let groupe_politique_uid = '';
      
      if (data.mandats && data.mandats.mandat) {
        const mandats = Array.isArray(data.mandats.mandat) ? data.mandats.mandat : [data.mandats.mandat];
        
        const gpMandat = mandats.find(m => {
          const typeOrgane = extractStringValue(m.typeOrgane);
          return typeOrgane === 'GP';
        });
        
        if (gpMandat) {
          groupe_politique = gpMandat.nomOrgane ? extractStringValue(gpMandat.nomOrgane) : '';
          
          if (gpMandat.organeRef) {
            groupe_politique_uid = typeof gpMandat.organeRef === 'object' 
              ? extractStringValue(gpMandat.organeRef) 
              : gpMandat.organeRef;
          }
          
          console.log(`[API] Extracted political group: ${groupe_politique}, UID: ${groupe_politique_uid}`);
        }
      }
      
      const organes = data.mandats && data.mandats.mandat ? 
        extractOrganes(Array.isArray(data.mandats.mandat) ? data.mandats.mandat : [data.mandats.mandat]) : [];
      
      const contacts = data.adresses ? extractContacts(data.adresses) : [];
      
      const hatvp_url = data.uri_hatvp ? extractStringValue(data.uri_hatvp) : '';
      
      deputeInfo = {
        id,
        prenom,
        nom,
        profession,
        civilite,
        date_naissance,
        lieu_naissance,
        groupe_politique,
        groupe_politique_uid,
        organes,
        contacts,
        hatvp_url
      };
    } else {
      console.log('[API] Processing simple API format for details');
      
      deputeInfo = {
        id: data.id || deputyId,
        prenom: data.prenom || '',
        nom: data.nom || '',
        profession: data.profession || '',
        civilite: data.civilite || '',
        date_naissance: data.date_naissance || '',
        lieu_naissance: data.lieu_naissance || '',
        groupe_politique: data.groupe_politique || '',
        groupe_politique_uid: data.groupe_politique_uid || '',
        organes: data.organes || [],
        contacts: data.contacts || [],
        hatvp_url: data.hatvp_url || ''
      };
    }
    
    console.log('[API] Processed deputy details:', deputeInfo);
    return deputeInfo;
    
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
  updateStatus: (status: StatusMessage) => void,
  legislature?: string
): Promise<DeputyVoteData[]> => {
  try {
    const deputyIdString = extractDeputyId(deputyId);
    
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
    
    console.log(`[API] Fetching votes for deputy: ${deputyIdString} in legislature: ${legislature || 'default'}`);
    
    const isValidDeputeId = /^PA\d+$/i.test(deputyIdString.trim());
    let validDeputeId = deputyIdString;
    
    if (!isValidDeputeId) {
      console.log(`[API] Deputy ID not in PAxxxx format. Searching for deputy by name: ${deputyIdString}`);
      updateStatus({
        status: 'loading',
        message: 'Recherche du député par nom...',
      });
      
      try {
        const searchResult = await searchDepute(deputyIdString, updateStatus, legislature);
        
        if (searchResult.success && searchResult.deputeInfo && searchResult.deputeInfo.id) {
          validDeputeId = searchResult.deputeInfo.id;
          console.log(`[API] Found deputy ID: ${validDeputeId} for name: ${deputyIdString}`);
        } else if (searchResult.multipleResults && searchResult.options && searchResult.options.length > 0) {
          console.log(`[API] Multiple deputies found with name: ${deputyIdString}`);
          updateStatus({
            status: 'warning',
            message: 'Plusieurs députés trouvés avec ce nom',
            details: 'Veuillez sélectionner un député spécifique dans la liste des résultats.'
          });
          return [];
        } else {
          console.log(`[API] No deputy found with name: ${deputyIdString}`);
          updateStatus({
            status: 'error',
            message: 'Député introuvable',
            details: `Aucun député trouvé avec le nom "${deputyIdString}".`
          });
          return [];
        }
      } catch (error) {
        console.error('[API] Error searching for deputy by name:', error);
        updateStatus({
          status: 'error',
          message: 'Erreur lors de la recherche du député',
          details: error instanceof Error ? error.message : 'Une erreur inconnue est survenue'
        });
        return [];
      }
    }
    
    if (!validDeputeId || !/^PA\d+$/i.test(validDeputeId.trim())) {
      console.error('[API] Could not obtain a valid deputy ID:', validDeputeId);
      updateStatus({
        status: 'error',
        message: 'Identifiant de député invalide',
        details: `Impossible d'obtenir un identifiant valide pour "${deputyIdString}"`
      });
      return [];
    }
    
    let url = `${API_BASE_URL}/votes?depute_id=${encodeURIComponent(validDeputeId.trim())}`;
    if (legislature) {
      url += `&legislature=${legislature}`;
    }
    
    updateStatus({
      status: 'loading',
      message: `Récupération des votes pour le député ${validDeputeId}...`,
    });
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('[API] No votes found (404) for deputy:', validDeputeId);
        updateStatus({
          status: 'complete',
          message: 'Aucun vote trouvé pour ce député',
          details: `Le député ${validDeputeId} n'a pas encore de votes enregistrés dans cette législature.`
        });
        return [];
      } else if (response.status === 422) {
        console.error('[API] Validation error (422) for deputy ID:', validDeputeId);
        updateStatus({
          status: 'error',
          message: 'Erreur de validation des paramètres',
          details: `L'API a rejeté l'identifiant de député "${validDeputeId}".`
        });
        return [];
      }
      
      throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
    }
    
    const apiData: ApiVoteResponse[] = await response.json();
    console.log(`[API] Received ${apiData.length} votes for deputy ${validDeputeId}:`, apiData);
    
    const votesData = transformApiData(apiData);
    
    if (votesData.length === 0) {
      updateStatus({
        status: 'complete',
        message: 'Aucun vote trouvé pour ce député',
        details: `Aucun vote enregistré pour le député ${validDeputeId}.`
      });
    } else {
      updateStatus({
        status: 'complete',
        message: `${votesData.length} votes analysés`,
        details: `Votes trouvés pour le député ${validDeputeId}`
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
    
    return [];
  }
};

/**
 * Récupère les déports (restrictions de vote) d'un député
 */
export const fetchDeputyDeports = async (
  deputyId: any,
  legislature?: string
): Promise<DeportInfo[]> => {
  try {
    const deputyIdString = extractDeputyId(deputyId);
    
    if (!deputyIdString) {
      console.error('[API] Invalid deputyId for deports after extraction:', deputyId);
      return [];
    }
    
    if (!/^PA\d+$/i.test(deputyIdString.trim())) {
      console.warn('[API] Not a valid deputy ID format for deports:', deputyIdString);
      return [];
    }
    
    console.log(`[API] Fetching deports for deputy: ${deputyIdString} in legislature: ${legislature || 'default'}`);
    
    let url = `${API_BASE_URL}/deports?depute_id=${deputyIdString.trim()}`;
    if (legislature) {
      url += `&legislature=${legislature}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('[API] No deports found (404) for deputy:', deputyIdString);
        return [];
      }
      throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('[API] Deports data:', data);
    
    if (data.message && data.message.includes('Aucun déport')) {
      return [];
    }
    
    if (Array.isArray(data)) {
      return data;
    }
    
    if (data.detail || data.error) {
      console.warn('[API] Error in deports data:', data);
      return [];
    }
    
    if (typeof data === 'object') {
      return [data];
    }
    
    return [];
    
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
  
  const headers = ['Numéro', 'Date', 'Sujet', 'Position'];
  
  const positionMap: Record<VotePosition, string> = {
    pour: 'Pour',
    contre: 'Contre',
    abstention: 'Abstention',
    absent: 'Absent'
  };
  
  const rows = data.map(item => [
    item.numero,
    formatDate(item.dateScrutin),
    item.title.replace(/"/g, '""'),
    positionMap[item.position]
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
  
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

export interface DeputyVoteData {
  numero: string;
  dateScrutin: string;
  title: string;
  position: VotePosition;
}

/**
 * Récupère la liste des députés appartenant à un organe spécifique (groupe politique, commission, etc.)
 */
export const getDeputesByOrgane = async (
  organeId: string,
  organeNom: string,
  organeType: string
): Promise<any> => {
  try {
    console.log(`[API] Fetching deputies for organe: ${organeId} (${organeNom})`);
    
    if (!organeId) {
      throw new Error('Identifiant d\'organe manquant');
    }
    
    const response = await fetch(`${API_BASE_URL}/organes?organe_id=${encodeURIComponent(organeId)}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('[API] Organe details:', data);
    
    if (data.message) {
      console.warn('[API] Error message from organe API:', data.message);
    }
    
    let deputes: DeputeInfo[] = [];
    
    if (data.membres && Array.isArray(data.membres.membre)) {
      console.log(`[API] Found ${data.membres.membre.length} members in organe`);
      
      deputes = data.membres.membre.map((membre: any) => {
        try {
          const id = extractDeputyId(membre.acteurRef || '');
          
          let prenom = '', nom = '';
          if (membre.etatCivil && membre.etatCivil.ident) {
            prenom = extractStringValue(membre.etatCivil.ident.prenom);
            nom = extractStringValue(membre.etatCivil.ident.nom);
          }
          
          return {
            id,
            prenom,
            nom,
            profession: ''
          };
        } catch (e) {
          console.error('[API] Error extracting deputy info from membre:', e);
          return {
            id: '',
            prenom: '',
            nom: '',
            profession: ''
          };
        }
      }).filter((d: DeputeInfo) => d.id !== '');
    } else {
      console.warn('[API] No membres.membre array found in organe data');
    }
    
    const organeInfo: any = {
      uid: organeId,
      type: organeType,
      nom: organeNom,
      date_debut: data.dateDebut || '',
      date_fin: data.dateFin || null,
      legislature: data.legislature || ''
    };
    
    return {
      organeInfo,
      deputes
    };
    
  } catch (error) {
    console.error('[API] Error fetching deputies by organe:', error);
    
    return {
      organeInfo: {
        uid: organeId,
        type: organeType,
        nom: organeNom,
        date_debut: '',
        date_fin: null,
        legislature: ''
      },
      deputes: []
    };
  }
};

/**
 * Récupère la liste complète des députés avec leurs organes associés
 */
export const getAllDeputies = async (): Promise<any[]> => {
  try {
    console.log('[API] Fetching complete deputies list with organs');
    
    const response = await fetch(`${API_BASE_URL}/deputes_complets`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`[API] Received ${data.length} deputies with their organs`);
    
    return data;
    
  } catch (error) {
    console.error('[API] Error fetching all deputies:', error);
    throw error;
  }
};
