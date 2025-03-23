
import { ApiVoteResponse, DeputeInfo, DeputeVoteDetail, DeputesParGroupe, DeputeSearchResult, DeputyVoteData, GroupVoteDetail, OrganeInfo, ProcessStatus, StatusMessage, VotePosition, GroupeVote } from './types';
import JsZip from 'jszip';

const API_BASE_URL = 'https://www.nosdeputes.fr/scrutin';

// Fonction pour récupérer les votes d'un député
export const getVotesForDeputy = async (deputyId: string, legislature: string = '17'): Promise<ApiVoteResponse[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/acteur/${deputyId}/votes/${legislature}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.votes as ApiVoteResponse[];
  } catch (error) {
    console.error("Could not fetch votes:", error);
    return [];
  }
};

// Fonction pour récupérer les informations d'un député
export const getDeputyInfo = async (deputyId: string): Promise<DeputeInfo | null> => {
  try {
    const response = await fetch(`https://www.nosdeputes.fr/acteur/${deputyId}/json`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // Vérifiez si les données de l'acteur existent
    if (data && data.acteur) {
      const depute = data.acteur.data;
      return {
        id: deputyId,
        prenom: depute.prenom,
        nom: depute.nom,
        profession: depute.profession,
        groupe_politique: depute.groupe_politique // Assurez-vous que cette propriété existe dans votre interface DeputeInfo
      };
    } else {
      console.warn("Deputy data not found in the API response.");
      return null;
    }
  } catch (error) {
    console.error("Could not fetch deputy info:", error);
    return null;
  }
};

// Fonction pour récupérer les détails d'un vote
export const getVoteDetails = async (voteId: string, legislature: string = '17', useScrutinVotesDetail: boolean = false): Promise<any> => {
  try {
    let endpoint = `/scrutin/${voteId}/${legislature}`;
    if (useScrutinVotesDetail) {
      endpoint = `/scrutin_votes_detail?scrutin_numero=${voteId}`;
    }
    console.log(`[API] Calling endpoint: ${endpoint}`);
    const response = await fetch(`${API_BASE_URL}${endpoint}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Could not fetch vote details:", error);
    return null;
  }
};

// Mise à jour de la fonction pour extraire les détails des votes par député
export const processGroupVoteDetail = (data: any, groupId: string, groupName: string): GroupVoteDetail => {
  if (!data) return {} as GroupVoteDetail;

  const votes: DeputeVoteDetail[] = [];
  
  // Traiter les députés qui ont voté "pour"
  if (data.decompte?.pours?.votant) {
    const poursVotants = Array.isArray(data.decompte.pours.votant) 
      ? data.decompte.pours.votant 
      : [data.decompte.pours.votant];
    
    poursVotants.forEach((votant: any) => {
      votes.push({
        id: votant.acteurRef,
        prenom: votant.prenom || '',
        nom: votant.nom || '',
        position: 'pour'
      });
    });
  }
  
  // Traiter les députés qui ont voté "contre"
  if (data.decompte?.contres?.votant) {
    const contresVotants = Array.isArray(data.decompte.contres.votant) 
      ? data.decompte.contres.votant 
      : [data.decompte.contres.votant];
    
    contresVotants.forEach((votant: any) => {
      votes.push({
        id: votant.acteurRef,
        prenom: votant.prenom || '',
        nom: votant.nom || '',
        position: 'contre'
      });
    });
  }
  
  // Traiter les députés qui se sont abstenus
  if (data.decompte?.abstentions?.votant) {
    const abstentionsVotants = Array.isArray(data.decompte.abstentions.votant) 
      ? data.decompte.abstentions.votant 
      : [data.decompte.abstentions.votant];
    
    abstentionsVotants.forEach((votant: any) => {
      votes.push({
        id: votant.acteurRef,
        prenom: votant.prenom || '',
        nom: votant.nom || '',
        position: 'abstention'
      });
    });
  }
  
  // Traiter les députés absents
  if (data.decompte?.nonVotants?.votant) {
    const nonVotantsVotants = Array.isArray(data.decompte.nonVotants.votant) 
      ? data.decompte.nonVotants.votant 
      : [data.decompte.nonVotants.votant];
    
    nonVotantsVotants.forEach((votant: any) => {
      votes.push({
        id: votant.acteurRef,
        prenom: votant.prenom || '',
        nom: votant.nom || '',
        position: 'absent'
      });
    });
  }

  return {
    scrutin: {
      numero: data.scrutin?.numero || '',
      titre: data.scrutin?.titre || ''
    },
    groupe: {
      uid: groupId,
      nom: groupName,
      positionMajoritaire: data.position_majoritaire as VotePosition || 'absent'
    },
    votes
  };
};

// Mise à jour de la fonction pour récupérer les détails d'un vote par groupe
export const getGroupVoteDetail = async (groupId: string, voteId: string, legislature: string = '17'): Promise<GroupVoteDetail> => {
  try {
    console.log(`[API] Calling endpoint: /groupe_vote_detail?organe_id=${groupId}&scrutin_numero=${voteId}&legislature=${legislature}`);
    const response = await fetch(`${API_BASE_URL}/groupe_vote_detail?organe_id=${groupId}&scrutin_numero=${voteId}&legislature=${legislature}`);
    
    if (!response.ok) {
      throw new Error(`Error fetching group vote detail: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Group vote detail data:', data);
    
    // Trouver le nom du groupe à partir des données
    const groupName = data.groupe?.nom || '';
    
    return processGroupVoteDetail(data, groupId, groupName);
  } catch (error) {
    console.error('Error fetching group vote detail:', error);
    throw error;
  }
};

// New functions to export

// Fonction pour récupérer les informations détaillées d'un député
export const getDeputyDetails = async (deputyId: string, legislature: string = '17'): Promise<any> => {
  try {
    const response = await fetch(`https://www.nosdeputes.fr/${legislature}/csv/deputes.csv`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const csvText = await response.text();
    const lines = csvText.split('\n');
    const headers = lines[0].split(';');
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(';');
      const deputyData: any = {};
      
      for (let j = 0; j < headers.length; j++) {
        deputyData[headers[j]] = values[j];
      }
      
      if (deputyData.id === deputyId) {
        return {
          id: deputyId,
          prenom: deputyData.prenom || '',
          nom: deputyData.nom || '',
          profession: deputyData.profession || '',
          groupe_politique: deputyData.groupe_politique || '',
          civilite: deputyData.civilite || '',
          date_naissance: deputyData.date_naissance || '',
          lieu_naissance: deputyData.lieu_naissance || '',
          groupe_politique_uid: deputyData.groupe_politique_uid || '',
          organes: [],
          contacts: []
        };
      }
    }
    
    // Si le député n'est pas trouvé dans le CSV, essayez l'API normale
    return getDeputyInfo(deputyId);
  } catch (error) {
    console.error("Could not fetch deputy details:", error);
    // Fallback à l'API normale
    return getDeputyInfo(deputyId);
  }
};

// Fonction pour chercher un député par nom ou identifiant
export const searchDepute = async (query: string, setStatus: (status: StatusMessage) => void, legislature: string = '17'): Promise<DeputeSearchResult> => {
  try {
    setStatus({
      status: 'loading',
      message: `Recherche du député ${query}...`
    });
    
    // Traiter directement si c'est un ID
    if (query.startsWith('PA') || query.match(/^[A-Z]{2}\d+$/)) {
      const deputyInfo = await getDeputyInfo(query);
      if (deputyInfo) {
        return {
          success: true,
          deputeInfo: deputyInfo
        };
      }
    }
    
    // Sinon, rechercher par nom
    const response = await fetch(`https://www.nosdeputes.fr/search/${query}/csv`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const csvText = await response.text();
    const lines = csvText.split('\n');
    
    if (lines.length <= 1) {
      return {
        success: false,
        multipleResults: false
      };
    }
    
    const headers = lines[0].split(';');
    const results = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = lines[i].split(';');
      const deputyData: any = {};
      
      for (let j = 0; j < headers.length; j++) {
        deputyData[headers[j]] = values[j];
      }
      
      results.push({
        id: deputyData.id || '',
        prenom: deputyData.prenom || '',
        nom: deputyData.nom || ''
      });
    }
    
    if (results.length === 0) {
      return {
        success: false,
        multipleResults: false
      };
    } else if (results.length === 1) {
      const deputyInfo = await getDeputyInfo(results[0].id);
      return {
        success: true,
        deputeInfo: deputyInfo || {
          id: results[0].id,
          prenom: results[0].prenom,
          nom: results[0].nom,
          profession: ''
        }
      };
    } else {
      return {
        success: false,
        multipleResults: true,
        options: results
      };
    }
  } catch (error) {
    console.error("Could not search deputy:", error);
    setStatus({
      status: 'error',
      message: "Erreur lors de la recherche",
      details: error instanceof Error ? error.message : "Une erreur inconnue est survenue"
    });
    return {
      success: false,
      multipleResults: false
    };
  }
};

// Fonction pour récupérer les votes d'un député et les transformer en format interne
export const fetchDeputyVotes = async (deputyId: string, setStatus: (status: StatusMessage) => void, legislature: string = '17'): Promise<DeputyVoteData[]> => {
  try {
    setStatus({
      status: 'loading',
      message: "Récupération des votes..."
    });
    
    const apiVotes = await getVotesForDeputy(deputyId, legislature);
    
    setStatus({
      status: 'loading',
      message: `${apiVotes.length} votes trouvés, transformation des données...`
    });
    
    // Transformer le format API vers le format interne
    const transformedVotes: DeputyVoteData[] = apiVotes.map(apiVote => ({
      numero: apiVote.numero,
      dateScrutin: apiVote.date,
      title: apiVote.titre,
      position: apiVote.position.toLowerCase() as VotePosition
    }));
    
    setStatus({
      status: 'complete',
      message: `${transformedVotes.length} votes analysés avec succès`
    });
    
    return transformedVotes;
  } catch (error) {
    console.error("Could not fetch deputy votes:", error);
    setStatus({
      status: 'error',
      message: "Erreur lors de la récupération des votes",
      details: error instanceof Error ? error.message : "Une erreur inconnue est survenue"
    });
    return [];
  }
};

// Fonction pour récupérer les déports d'un député
export const fetchDeputyDeports = async (deputyId: string, legislature: string = '17'): Promise<any[]> => {
  try {
    const response = await fetch(`https://www.nosdeputes.fr/depute/deport/${deputyId}/${legislature}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.deports || [];
  } catch (error) {
    console.error("Could not fetch deputy deports:", error);
    return [];
  }
};

// Fonction pour exporter les votes en CSV
export const exportToCSV = (votes: DeputyVoteData[]): void => {
  if (!votes || votes.length === 0) {
    console.warn("No votes to export");
    return;
  }
  
  // Créer le contenu CSV
  const headers = ["Numéro", "Date", "Titre", "Position"];
  const rows = votes.map(vote => [
    vote.numero,
    vote.dateScrutin,
    vote.title,
    vote.position
  ]);
  
  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.join(';'))
  ].join('\n');
  
  // Télécharger le fichier
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'votes_depute.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Fonction pour récupérer les députés d'un organe
export const getDeputesByOrgane = async (organeId: string, organeName: string, organeType: string): Promise<DeputesParGroupe> => {
  try {
    const response = await fetch(`https://www.nosdeputes.fr/organisme/${organeId}/json`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Organe data:', data);
    
    const organeInfo: OrganeInfo = {
      uid: organeId,
      nom: organeName,
      type: organeType,
      date_debut: data.organisme?.date_debut || '',
      date_fin: data.organisme?.date_fin || null,
      legislature: data.organisme?.legislature || ''
    };
    
    const deputes: DeputeInfo[] = [];
    
    if (data.organisme?.membres) {
      const membres = Array.isArray(data.organisme.membres) 
        ? data.organisme.membres 
        : [data.organisme.membres];
      
      for (const membre of membres) {
        if (membre.acteur) {
          deputes.push({
            id: membre.acteur.id || '',
            prenom: membre.acteur.prenom || '',
            nom: membre.acteur.nom || '',
            profession: membre.acteur.profession || '',
            groupe_politique: membre.acteur.groupe_politique || ''
          });
        }
      }
    }
    
    return {
      organeInfo,
      deputes
    };
  } catch (error) {
    console.error("Could not fetch deputes by organe:", error);
    return {
      organeInfo: {
        uid: organeId,
        nom: organeName,
        type: organeType,
        date_debut: '',
        date_fin: null,
        legislature: ''
      },
      deputes: []
    };
  }
};

// Fonction pour récupérer les votes d'un groupe
export const getGroupVotes = async (groupId: string, legislature: string = '17'): Promise<GroupeVote[]> => {
  try {
    const response = await fetch(`https://www.nosdeputes.fr/organisme/${groupId}/votes/${legislature}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Group votes data:', data);
    
    if (!data.votes || !Array.isArray(data.votes)) {
      return [];
    }
    
    return data.votes.map((vote: any) => ({
      numero: vote.numero || '',
      dateScrutin: vote.date || '',
      title: vote.titre || '',
      positionMajoritaire: (vote.position_majoritaire || 'absent').toLowerCase() as VotePosition,
      nombrePour: parseInt(vote.nombre_pours || '0'),
      nombreContre: parseInt(vote.nombre_contres || '0'),
      nombreAbstention: parseInt(vote.nombre_abstentions || '0'),
      nombreAbsent: parseInt(vote.nombre_non_votants || '0')
    }));
  } catch (error) {
    console.error("Could not fetch group votes:", error);
    return [];
  }
};
