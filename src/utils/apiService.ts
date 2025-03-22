import { ApiVoteResponse, DeputeInfo, DeputeFullInfo, DeputeSearchResult, DeportInfo, StatusMessage, VotePosition, OrganeDetailInfo, DataGouvDeputeInfo } from './types';

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
export const extractStringValue = (input: any): string => {
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
        if ('civ' in ident) {
          return extractStringValue(ident.civ);
        }
      }
    }
    
    // Cas spécifique pour infoNaissance
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
    
    // Si c'est un objet avec une autre structure, on essaye de récupérer une valeur lisible
    const keys = Object.keys(input);
    if (keys.length > 0) {
      for (const key of ['libelle', 'name', 'valeur', 'valElec', 'typeLibelle']) {
        if (key in input && (typeof input[key] === 'string' || typeof input[key] === 'number')) {
          return String(input[key]);
        }
      }
      // Si on ne trouve pas de clé lisible, on retourne la première valeur non-objet
      for (const key of keys) {
        if (typeof input[key] === 'string' || typeof input[key] === 'number') {
          return String(input[key]);
        }
      }
    }
  }
  
  // Si on ne peut pas extraire une valeur, on retourne une chaîne vide
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
      // Pour chaque mandat, extraire les informations de l'organe
      const type = extractStringValue(mandat.typeOrgane);
      const nomOrgane = mandat.nomOrgane 
        ? extractStringValue(mandat.nomOrgane) 
        : (mandat.infosQualite && mandat.infosQualite.libQualite 
           ? extractStringValue(mandat.infosQualite.libQualite) 
           : '');
      
      const dateDebut = extractStringValue(mandat.dateDebut);
      const dateFin = mandat.dateFin ? extractStringValue(mandat.dateFin) : null;
      const legislature = extractStringValue(mandat.legislature);
      
      // Extraction de l'identifiant de l'organe - plusieurs formats possibles
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
          uid // Ajout de l'identifiant unique de l'organe
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
  // Vérifier si adresses existe et a une propriété adresse qui est un tableau
  if (!adresses || !adresses.adresse) {
    console.warn('Adresses not found or missing adresse property:', adresses);
    return [];
  }
  
  // Si adresse n'est pas un tableau, le convertir en tableau
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
 * Endpoint URL for the data.gouv.fr tabular API
 */
const DATA_GOUV_API_URL = 'https://tabular-api.data.gouv.fr/api';
const DEPUTES_DATASET_RID = '092bd7bb-1543-405b-b53c-932ebb49bb8e';

/**
 * Récupère les données complémentaires des députés à partir de data.gouv.fr
 */
export const fetchDataGouvDeputes = async (): Promise<Map<string, DataGouvDeputeInfo>> => {
  try {
    console.log('[DataGouv API] Fetching deputy data from data.gouv.fr');
    
    // Construire l'URL pour récupérer les données tabulaires
    const url = `${DATA_GOUV_API_URL}/resources/${DEPUTES_DATASET_RID}/data/?page_size=600`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      throw new Error(`Erreur API data.gouv: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`[DataGouv API] Received ${data.data?.length || 0} deputies from data.gouv.fr`);
    
    // Créer une map pour accéder rapidement aux données par ID de député
    const deputesMap = new Map<string, DataGouvDeputeInfo>();
    
    if (data.data && Array.isArray(data.data)) {
      data.data.forEach((depute: any) => {
        // L'ID du député doit être présent et au bon format
        const deputeId = depute.ID?.trim();
        if (deputeId && /^PA\d+$/i.test(deputeId)) {
          // Extraire les informations pertinentes
          const deputeInfo: DataGouvDeputeInfo = {
            id: deputeId,
            age: depute.Age ? parseInt(depute.Age, 10) : undefined,
            dateNaissance: depute["Date de naissance"],
            circo: depute["Numéro de circonscription"],
            departement: depute.Département,
            csp: depute["Catégorie socio-professionnelle"],
            mandatsCount: depute["Nombre de mandats"],
            twitter: depute.Twitter,
            facebook: depute.Facebook,
            website: depute.SiteWeb || depute["Site web"],
            presenceRate: depute["Taux de présence"],
            participationRate: depute["Taux de participation"],
            amendmentsProposed: depute["Amendements proposés"],
            amendmentsAccepted: depute["Amendements adoptés"],
            questionsCount: depute["Questions posées"]
          };
          
          deputesMap.set(deputeId, deputeInfo);
        }
      });
    }
    
    console.log(`[DataGouv API] Processed ${deputesMap.size} valid deputies data`);
    return deputesMap;
    
  } catch (error) {
    console.error('[DataGouv API] Error fetching deputy data from data.gouv.fr:', error);
    throw error;
  }
};

/**
 * Enrichit les informations d'un député avec les données de data.gouv.fr
 */
export const enrichDeputyInfo = async (
  deputyInfo: DeputeFullInfo, 
  dataGouvDeputes?: Map<string, DataGouvDeputeInfo>
): Promise<DeputeFullInfo> => {
  try {
    // Si les données de data.gouv.fr ne sont pas fournies, on les récupère
    const deputesData = dataGouvDeputes || await fetchDataGouvDeputes();
    
    // Cherche les informations complémentaires pour ce député
    const extraInfo = deputesData.get(deputyInfo.id);
    
    if (!extraInfo) {
      console.log(`[DataGouv API] No additional data found for deputy ${deputyInfo.id}`);
      return deputyInfo;
    }
    
    console.log(`[DataGouv API] Enriching deputy ${deputyInfo.id} with data.gouv.fr data`);
    
    // Fusion des données
    return {
      ...deputyInfo,
      // Ajouter uniquement les informations qui n'existent pas déjà ou qui sont vides
      circo: extraInfo.circo || deputyInfo.circo,
      departement: extraInfo.departement || deputyInfo.departement,
      age: extraInfo.age || deputyInfo.age,
      dateNaissance: deputyInfo.date_naissance || extraInfo.dateNaissance,
      csp: extraInfo.csp || deputyInfo.csp,
      mandatsCount: extraInfo.mandatsCount || deputyInfo.mandatsCount,
      twitter: extraInfo.twitter || deputyInfo.twitter,
      facebook: extraInfo.facebook || deputyInfo.facebook,
      website: extraInfo.website || deputyInfo.website,
      presenceRate: extraInfo.presenceRate || deputyInfo.presenceRate,
      participationRate: extraInfo.participationRate || deputyInfo.participationRate,
      amendmentsProposed: extraInfo.amendmentsProposed || deputyInfo.amendmentsProposed,
      amendmentsAccepted: extraInfo.amendmentsAccepted || deputyInfo.amendmentsAccepted,
      questionsCount: extraInfo.questionsCount || deputyInfo.questionsCount
    };
    
  } catch (error) {
    console.error('[DataGouv API] Error enriching deputy info:', error);
    // En cas d'erreur, on retourne les informations d'origine sans enrichissement
    return deputyInfo;
  }
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
    
    // Détermine si le format ressemble à un ID de député (PAxxxx)
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
    
    // Si plusieurs députés sont trouvés (homonymes)
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
    
    // Extraction des données - format direct ou complexe
    let id, prenom, nom, profession;
    
    // Traiter le format complexe avec structures imbriquées
    if (data.uid || data['@xmlns']) {
      // Format complexe de l'API
      console.log("[API] Processing complex API format");
      
      id = extractDeputyId(data.uid || '');
      
      // Traitement spécifique pour etatCivil.ident
      if (data.etatCivil && data.etatCivil.ident) {
        prenom = extractStringValue(data.etatCivil.ident.prenom);
        nom = extractStringValue(data.etatCivil.ident.nom);
      } else {
        prenom = '';
        nom = '';
      }
      
      // Traitement profession
      profession = data.profession ? extractStringValue(data.profession) : '';
    } else {
      // Format direct plus simple (celui de la documentation)
      console.log("[API] Processing simple API format");
      
      id = data.id || '';
      prenom = data.prenom || '';
      nom = data.nom || '';
      profession = data.profession || '';
    }
    
    // S'assurer que l'ID est valide
    if (!id) {
      id = query.trim();
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

// Modification de la fonction getDeputyDetails pour intégrer les données enrichies
export const getDeputyDetails = async (deputyId: string, legislature?: string): Promise<DeputeFullInfo> => {
  try {
    console.log(`[API] Fetching details for deputy: ${deputyId} in legislature: ${legislature || 'default'}`);
    
    // S'assurer que l'ID est au bon format
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
    
    // Déterminer le format de données (complexe ou simple)
    if (data.uid || data['@xmlns'] || data.etatCivil) {
      // Format complexe de l'API
      console.log('[API] Processing complex API format for details');
      
      const id = extractDeputyId(data.uid || deputyId);
      
      // Extraction des infos d'état civil
      let prenom = '', nom = '', civilite = '';
      if (data.etatCivil && data.etatCivil.ident) {
        prenom = extractStringValue(data.etatCivil.ident.prenom);
        nom = extractStringValue(data.etatCivil.ident.nom);
        civilite = extractStringValue(data.etatCivil.ident.civ);
      }
      
      // Extraction date et lieu de naissance
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
      
      // Extraction profession
      const profession = data.profession ? extractStringValue(data.profession) : '';
      
      // Extraction groupe politique
      let groupe_politique = '';
      let groupe_politique_uid = ''; // Ajout de l'identifiant du groupe politique
      
      if (data.mandats && data.mandats.mandat) {
        // Convertir en tableau si ce n'est pas le cas
        const mandats = Array.isArray(data.mandats.mandat) ? data.mandats.mandat : [data.mandats.mandat];
        
        // Recherche du mandat de type GP (Groupe Politique)
        const gpMandat = mandats.find(m => {
          const typeOrgane = extractStringValue(m.typeOrgane);
          return typeOrgane === 'GP';
        });
        
        if (gpMandat) {
          groupe_politique = gpMandat.nomOrgane ? extractStringValue(gpMandat.nomOrgane) : '';
          
          // Extraction de l'identifiant du groupe politique
          if (gpMandat.organeRef) {
            groupe_politique_uid = typeof gpMandat.organeRef === 'object' 
              ? extractStringValue(gpMandat.organeRef) 
              : gpMandat.organeRef;
          }
          
          console.log(`[API] Extracted political group: ${groupe_politique}, UID: ${groupe_politique_uid}`);
        }
      }
      
      // Extraction des organes (commissions, groupes, etc.)
      const organes = data.mandats && data.mandats.mandat ? 
        extractOrganes(Array.isArray(data.mandats.mandat) ? data.mandats.mandat : [data.mandats.mandat]) : [];
      
      // Extraction des contacts
      const contacts = data.adresses ? extractContacts(data.adresses) : [];
      
      // Extraction du lien HATVP si disponible
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
        groupe_politique_uid, // Ajout de l'identifiant du groupe politique
        organes,
        contacts,
        hatvp_url
      };
    } else {
      // Format direct plus simple (celui de la documentation)
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
        groupe_politique_uid: data.groupe_politique_uid || '', // Ajout de l'identifiant du groupe politique
        organes: data.organes || [],
        contacts: data.contacts || [],
        hatvp_url: data.hatvp_url || ''
      };
    }
    
    // Enrichir les informations du député avec les données de data.gouv.fr
    try {
      const enrichedInfo = await enrichDeputyInfo(deputeInfo);
      console.log('[API] Enriched deputy details with data.gouv.fr data:', enrichedInfo);
      return enrichedInfo;
    } catch (error) {
      console.error('[API] Error enriching deputy info with data.gouv.fr:', error);
      // En cas d'erreur d'enrichissement, on retourne les informations de base
      return deputeInfo;
    }
    
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
    
    console.log(`[API] Fetching votes for deputy: ${deputyIdString} in legislature: ${legislature || 'default'}`);
    
    // Détermine si c'est un ID ou un nom
    const isDeputeId = /^PA\d+$/i.test(deputyIdString.trim());
    const searchParam = isDeputeId ? 'depute_id' : 'nom';
    
    let url = `${API_BASE_URL}/votes?${searchParam}=${encodeURIComponent(deputyIdString.trim())}`;
    if (legislature) {
      url += `&legislature=${legislature}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      // En cas d'erreur HTTP, on gère différents codes d'erreur
      if (response.status === 404) {
        console.log('[API] No votes found (404) for deputy:', deputyIdString);
        
        updateStatus({
          status: 'complete',
          message: 'Aucun vote trouvé pour ce député',
          details: `Le député ${deputyIdString} n'a pas encore de votes enregistrés dans cette législature.`
        });
        
        // Retourner un tableau vide mais ne pas traiter comme une erreur
        // car c'est un cas valide (nouveau député sans votes encore)
        return [];
      }
      
      throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
    }
    
    // Récupération des données JSON
    const apiData: ApiVoteResponse[] = await response.json();
    console.log(`[API] Received ${apiData.length} votes for deputy ${deputyIdString}:`, apiData);
    
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
    
    // On retourne un tableau vide en cas d'erreur
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
    
    // Si le message indique qu'aucun déport n'a été trouvé
    if (data.message && data.message.includes('Aucun déport')) {
      return [];
    }
    
    // Si les données sont un tableau, on le renvoie directement
    if (Array.isArray(data)) {
      return data;
    }
    
    // Si les données sont un objet avec un message d'erreur
    if (data.detail || data.error) {
      console.warn('[API] Error in deports data:', data);
      return [];
    }
    
    // Dans tous les autres cas, on essaye de transformer l'objet en tableau
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
