import { ApiVoteResponse, DeputeInfo, DeputeVoteDetail, GroupVoteDetail, VotePosition } from './types';

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
