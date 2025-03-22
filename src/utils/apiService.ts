import { ApiVoteResponse, DeputeInfo, DeputeFullInfo, DeputeSearchResult, DeportInfo, StatusMessage, VotePosition, OrganeDetailInfo, DataGouvDeputeInfo, DeputyVoteData, DeputesParGroupe, GroupePolitiqueInfo, getGroupePolitiqueCouleur, OrganeInfo } from './types';

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
    
    // Fusion des données - correction de dateNaissance à date_naissance
    return {
      ...deputyInfo,
      // Ajouter uniquement les informations qui n'existent pas déjà ou qui sont vides
      circo: extraInfo.circo || deputyInfo.circo,
      departement: extraInfo.departement || deputyInfo.departement,
      age: extraInfo.age || deputyInfo.age,
      date_naissance: deputyInfo.date_naissance || extraInfo.dateNaissance,  // Corrected property name
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

// Constante pour l'API data.gouv.fr pour les groupes politiques
const GROUPES_POLITIQUES_DATASET_ID = '4612d596-9a78-4ec6-b60c-ccc1ee11f8c0';
const DATA_GOUV_BASE_URL = 'https://www.data.gouv.fr/api/1';

/**
 * Récupère les informations sur les groupes politiques depuis data.gouv.fr
 */
export const fetchGroupesPolitiques = async (legislature?: string): Promise<GroupePolitiqueInfo[]> => {
  try {
    console.log('[DataGouv API] Fetching political groups data');
    
    // Construire l'URL pour récupérer le dataset des groupes politiques
    const url = `${DATA_GOUV_BASE_URL}/datasets/${GROUPES_POLITIQUES_DATASET_ID}/resources/`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      throw new Error(`Erreur API data.gouv: ${response.status} ${response.statusText}`);
    }
    
    const resourcesData = await response.json();
    console.log(`[DataGouv API] Received ${resourcesData.data?.length || 0} resources`);
    
    // Trouver la ressource la plus récente pour les groupes politiques
    // (souvent la première dans la liste)
    if (!resourcesData.data || !Array.isArray(resourcesData.data) || resourcesData.data.length === 0) {
      throw new Error('Aucune ressource trouvée pour les groupes politiques');
    }
    
    // Utiliser la première ressource CSV ou JSON disponible
    const resource = resourcesData.data.find(r => 
      r.format?.toLowerCase() === 'csv' || 
      r.format?.toLowerCase() === 'json'
    );
    
    if (!resource || !resource.url) {
      throw new Error('Aucune ressource CSV ou JSON trouvée');
    }
    
    console.log(`[DataGouv API] Using resource: ${resource.title}, format: ${resource.format}`);
    
    // Récupérer les données de la ressource
    const dataResponse = await fetch(resource.url, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!dataResponse.ok) {
      throw new Error(`Erreur lors de la récupération des données: ${dataResponse.status}`);
    }
    
    // Traiter les données selon le format
    let groupesData;
    
    if (resource.format?.toLowerCase() === 'json') {
      groupesData = await dataResponse.json();
    } else if (resource.format?.toLowerCase() === 'csv') {
      // Pour le CSV, on devrait le parser mais pour simplifier, on va récupérer
      // directement les données tabulaires depuis l'API
      const csvText = await dataResponse.text();
      // Parser le CSV (implementation simplifiée)
      groupesData = parseCSV(csvText);
    } else {
      throw new Error(`Format non supporté: ${resource.format}`);
    }
    
    console.log(`[DataGouv API] Parsed ${groupesData.length} political groups`);
    
    // Filtrer par législature si nécessaire
    const filteredGroups = legislature 
      ? groupesData.filter((g: any) => g.legislature === legislature || g.legislature === Number(legislature))
      : groupesData;
    
    // Transformer en notre format interne
    const groupesPolitiques: GroupePolitiqueInfo[] = filteredGroups.map((g: any) => ({
      uid: g.uid || g.id || '',
      nom: g.nom || g.sigle || '',
      nomComplet: g.nomComplet || g.libelle || '',
      couleur: g.couleur || getGroupePolitiqueCouleur(g.nom || g.sigle),
      acronyme: g.acronyme || g.sigle,
      legislature: String(g.legislature || ''),
      dateDebut: g.dateDebut || g.date_debut || '',
      dateFin: g.dateFin || g.date_fin || '',
      effectif: g.effectif ? Number(g.effectif) : undefined
    }));
    
    console.log(`[DataGouv API] Processed ${groupesPolitiques.length} political groups`);
    return groupesPolitiques;
    
  } catch (error) {
    console.error('[DataGouv API] Error fetching political groups data:', error);
    // En cas d'erreur, on retourne un tableau vide
    return [];
  }
};

/**
 * Fonction simplifiée pour parser un CSV
 */
function parseCSV(csv: string): any[] {
  // Séparer les lignes
  const lines = csv.split('\n');
  
  // La première ligne contient les en-têtes
  const headers = lines[0].split(',').map(h => h.trim());
  
  // Traiter chaque ligne
  return lines.slice(1)
    .filter(line => line.trim().length > 0) // Ignorer les lignes vides
    .map(line => {
      const values = line.split(',').map(v => v.trim());
      const obj: any = {};
      
      // Associer chaque valeur à son en-tête
      headers.forEach((header, i) => {
        obj[header] = values[i] || '';
      });
      
      return obj;
    });
}

/**
 * Enrichit les informations d'un député en ajoutant le groupe politique
 * basé sur les données de data.gouv.fr
 */
export const enrichDeputeWithGroupePolitique = async (
  deputeInfo: DeputeFullInfo,
  legislature?: string
): Promise<DeputeFullInfo> => {
  try {
    // Si le député a déjà un groupe politique, on n'a rien à faire
    if (deputeInfo.groupe_politique && deputeInfo.groupe_politique_uid) {
      return deputeInfo;
    }
    
    // Récupérer les groupes politiques
    const groupes = await fetchGroupesPolitiques(legislature);
    if (groupes.length === 0) {
      console.log(`[API] No political groups found for legislature ${legislature}`);
      return deputeInfo;
    }
    
    // Chercher un rattachement dans les organes du député
    if (deputeInfo.organes && deputeInfo.organes.length > 0) {
      // Filtrer les organes de type "Groupe Politique" (GP)
      const gpOrganes = deputeInfo.organes.filter(o => o.type === 'GP');
      
      for (const organe of gpOrganes) {
        // Chercher le groupe correspondant dans notre liste
        const groupe = groupes.find(g => 
          g.uid === organe.uid || 
          g.nom === organe.nom || 
          g.nomComplet === organe.nom
        );
        
        if (groupe) {
          console.log(`[API] Found political group match: ${groupe.nom} for deputy ${deputeInfo.id}`);
          
          // Mettre à jour les informations du député
          return {
            ...deputeInfo,
            groupe_politique: groupe.nom,
            groupe_politique_uid: groupe.uid
          };
        }
      }
    }
    
    console.log(`[API] No political group match found for deputy ${deputeInfo.id}`);
    return deputeInfo;
    
  } catch (error) {
    console.error('[API] Error enriching deputy with political group:', error);
    return deputeInfo;
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
    
    // Étape 1: Enrichir les informations du député avec les données de data.gouv.fr
    try {
      deputeInfo = await enrichDeputyInfo(deputeInfo);
      console.log('[API] Enriched deputy details with data.gouv.fr data');
    } catch (error) {
      console.error('[API] Error enriching deputy info with data.gouv.fr:', error);
    }
    
    // Étape 2: Enrichir avec les informations de groupe politique
    try {
      deputeInfo = await enrichDeputeWithGroupePolitique(deputeInfo, legislature);
      console.log('[API] Enriched deputy with political group data');
    } catch (error) {
      console.error('[API] Error enriching deputy with political group data:', error);
    }
    
    console.log('[API] Final deputy info:', deputeInfo);
    return deputeInfo;
    
  } catch (error) {
    console.error('[API] Error fetching deputy details:', error);
    throw error;
  }
};

/**
 * Récupère les votes d'un député
 */
export const fetchDeputyVotes = async (
  deputyId: string,
  updateStatus: (status: StatusMessage) => void,
  legislature?: string
): Promise<DeputyVoteData[]> => {
  try {
    updateStatus({
      status: 'loading',
      message: 'Récupération des votes...',
    });

    console.log(`[API] Fetching votes for deputy: ${deputyId} in legislature: ${legislature || 'default'}`);
    
    let url = `${API_BASE_URL}/votes?depute_id=${deputyId}`;
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
    console.log('[API] Raw votes data:', data);
    
    if (!data || !Array.isArray(data)) {
      throw new Error('Format de données invalide retourné par l\'API');
    }
    
    const votesData = transformApiData(data as ApiVoteResponse[]);
    console.log(`[API] Transformed ${votesData.length} votes data`);
    
    updateStatus({
      status: 'complete',
      message: `${votesData.length} votes analysés`,
    });
    
    return votesData;
  } catch (error) {
    console.error('[API] Error fetching deputy votes:', error);
    
    updateStatus({
      status: 'error',
      message: 'Erreur lors de la récupération des votes',
      details: error instanceof Error ? error.message : 'Une erreur inconnue est survenue'
    });
    
    return [];
  }
};

/**
 * Récupère les déports (restrictions de vote) d'un député
 */
export const fetchDeputyDeports = async (
  deputyId: string,
  legislature?: string
): Promise<DeportInfo[]> => {
  try {
    console.log(`[API] Fetching deports for deputy: ${deputyId} in legislature: ${legislature || 'default'}`);
    
    let url = `${API_BASE_URL}/deports?depute_id=${deputyId}`;
    if (legislature) {
      url += `&legislature=${legislature}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[API] No deports found for deputy ${deputyId}`);
        return [];
      }
      throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('[API] Deports data:', data);
    
    if (data.message && data.message.includes('Aucun déport')) {
      console.log(`[API] No deports found for deputy ${deputyId}`);
      return [];
    }
    
    if (!data || !Array.isArray(data)) {
      console.warn('[API] Invalid deports data format:', data);
      return [];
    }
    
    const deportsData: DeportInfo[] = data.map((deport: any) => ({
      id: deport.id || '',
      deputeId: deport.depute_id || deputyId,
      refActeur: deport.ref_acteur || '',
      motif: deport.motif || '',
      dateDebut: deport.date_debut || '',
      dateFin: deport.date_fin || null,
      portee: deport.portee || '',
      cible: deport.cible || ''
    }));
    
    console.log(`[API] Processed ${deportsData.length} deports for deputy ${deputyId}`);
    return deportsData;
    
  } catch (error) {
    console.error('[API] Error fetching deputy deports:', error);
    return [];
  }
};

/**
 * Exporte les données de vote au format CSV
 */
export const exportToCSV = (data: DeputyVoteData[], deputyName: string): void => {
  try {
    if (!data || data.length === 0) {
      console.warn('[API] No data to export');
      return;
    }
    
    console.log(`[API] Exporting ${data.length} votes to CSV for ${deputyName}`);
    
    // Créer les en-têtes du CSV
    const headers = ['Numéro', 'Date', 'Titre', 'Position'];
    
    // Créer les lignes de données
    const csvRows = [
      headers.join(','), // En-têtes
      ...data.map(vote => {
        const formattedDate = vote.dateScrutin ? new Date(vote.dateScrutin).toLocaleDateString('fr-FR') : '';
        // Échapper les virgules et guillemets dans le titre
        const safeTitle = vote.title ? `"${vote.title.replace(/"/g, '""')}"` : '';
        
        return [
          vote.numero,
          formattedDate,
          safeTitle,
          vote.position
        ].join(',');
      })
    ];
    
    // Joindre toutes les lignes avec des sauts de ligne
    const csvContent = csvRows.join('\n');
    
    // Créer un objet Blob
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Créer un URL pour le Blob
    const url = URL.createObjectURL(blob);
    
    // Créer un élément <a> pour le téléchargement
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const sanitizedName = deputyName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.setAttribute('download', `votes_${sanitizedName}_${new Date().toISOString().slice(0, 10)}.csv`);
    
    // Cacher le lien
    link.style.visibility = 'hidden';
    
    // Ajouter le lien au DOM
    document.body.appendChild(link);
    
    // Cliquer sur le lien pour déclencher le téléchargement
    link.click();
    
    // Nettoyer
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log('[API] CSV export completed');
  } catch (error) {
    console.error('[API] Error exporting data to CSV:', error);
  }
};

/**
 * Récupère les députés d'un organe donné
 */
export const getDeputesByOrgane = async (
  organeId: string,
  organeName: string,
  organeType: string
): Promise<DeputesParGroupe> => {
  try {
    console.log(`[API] Fetching deputies for organe: ${organeId}, ${organeName}, ${organeType}`);
    
    const url = `${API_BASE_URL}/organe/membres?organe_id=${organeId}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('[API] Raw organe members data:', data);
    
    // Information sur l'organe
    const organeInfo: OrganeInfo = {
      type: organeType || 'GP',
      nom: organeName || data.nom || 'Organe sans nom',
      date_debut: data.dateDebut || '',
      date_fin: data.dateFin || null,
      legislature: data.legislature || '',
      uid: organeId
    };
    
    // Traitement des membres
    let deputes: DeputeInfo[] = [];
    
    if (data.membres && Array.isArray(data.membres)) {
      deputes = await Promise.all(data.membres.map(async (membre: any) => {
        const deputeId = extractDeputyId(membre.uid || membre.id || membre);
        
        try {
          // Obtenir les détails de chaque député
          const deputeDetails = await getDeputyDetails(deputeId);
          return {
            id: deputeId,
            prenom: deputeDetails.prenom || 'Prénom non disponible',
            nom: deputeDetails.nom || 'Nom non disponible',
            profession: deputeDetails.profession || 'Profession non renseignée',
            groupe_politique: deputeDetails.groupe_politique
          };
        } catch (error) {
          console.error(`[API] Error fetching details for deputy ${deputeId}:`, error);
          return {
            id: deputeId,
            prenom: 'Prénom non disponible',
            nom: 'Nom non disponible',
            profession: 'Profession non renseignée'
          };
        }
      }));
    }
    
    console.log(`[API] Processed ${deputes.length} deputies for organe ${organeId}`);
    
    return {
      organeInfo,
      deputes
    };
    
  } catch (error) {
    console.error('[API] Error fetching deputies by organe:', error);
    
    // Retourner une structure vide en cas d'erreur
    return {
      organeInfo: {
        type: organeType || 'GP',
        nom: organeName || 'Organe non trouvé',
        date_debut: '',
        date_fin: null,
        legislature: '',
        uid: organeId
      },
      deputes: []
    };
  }
};
