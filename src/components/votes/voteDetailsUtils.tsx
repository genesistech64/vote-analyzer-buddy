import React from 'react';
import { 
  CheckCircle2, 
  XCircle,
  CircleDashed, 
  MinusCircle, 
  InfoIcon, 
  AlignLeft,
  User
} from 'lucide-react';
import { 
  Button 
} from "@/components/ui/button";
import { Link } from 'react-router-dom';
import { formatDeputyName } from '@/utils/deputyCache';

export const positionIcons: Record<string, React.ReactNode> = {
  pour: <CheckCircle2 className="w-4 h-4 text-vote-pour" />,
  contre: <XCircle className="w-4 h-4 text-vote-contre" />,
  abstention: <MinusCircle className="w-4 h-4 text-vote-abstention" />,
  absent: <CircleDashed className="w-4 h-4 text-gray-400" />,
};

export const positionLabels: Record<string, string> = {
  pour: 'Pour',
  contre: 'Contre',
  abstention: 'Abstention',
  absent: 'Absent',
};

export const positionClasses: Record<string, string> = {
  pour: 'text-vote-pour',
  contre: 'text-vote-contre',
  abstention: 'text-vote-abstention',
  absent: 'text-gray-400',
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return 'Date inconnue';
  
  try {
    // Parse the date in format YYYY-MM-DD
    const [year, month, day] = dateString.split('-').map(part => parseInt(part, 10));
    
    // Format the date in French locale
    const date = new Date(year, month - 1, day);
    
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString; // Return the original string if formatting fails
  }
};

export const generateAssembleeUrl = (legislature: string, scrutinNumero: string): string => {
  return `https://www.assemblee-nationale.fr/dyn/16/amendements/scrutins/${legislature}/jo${scrutinNumero}`;
};

export const getGroupName = (groupe: any): string => {
  // Handle different group name properties
  if (typeof groupe === 'string') return groupe;
  
  if (groupe.libelle) return groupe.libelle;
  if (groupe.nom) return groupe.nom;
  if (groupe.nomComplet) return groupe.nomComplet;
  if (groupe.nomCourt) return groupe.nomCourt;
  if (groupe.organeRef) return `Groupe ${groupe.organeRef}`;
  
  return 'Groupe inconnu';
};

interface DeputyVote {
  id: string;
  prenom: string;
  nom: string;
  position: string;
  delegation?: boolean;
  causePosition?: string;
}

export const processDeputiesFromVoteDetail = (groupDetail: any): DeputyVote[] => {
  if (!groupDetail) return [];
  
  const deputies: DeputyVote[] = [];
  
  // Process the 'decompte' field which contains votes by position
  if (groupDetail.decompte) {
    ['pours', 'contres', 'abstentions'].forEach(position => {
      const positionKey = position === 'pours' ? 'pour' : 
                         position === 'contres' ? 'contre' : 'abstention';
      
      if (groupDetail.decompte[position] && groupDetail.decompte[position].votant) {
        const votants = Array.isArray(groupDetail.decompte[position].votant) 
          ? groupDetail.decompte[position].votant 
          : [groupDetail.decompte[position].votant];
        
        votants.forEach((votant: any) => {
          // Extract acteurRef and handle both string and object formats
          let deputyId = '';
          if (typeof votant.acteurRef === 'object' && votant.acteurRef['#text']) {
            deputyId = votant.acteurRef['#text'];
          } else if (typeof votant.acteurRef === 'string') {
            deputyId = votant.acteurRef;
          } else if (votant.id) {
            deputyId = votant.id;
          }
          
          if (deputyId) {
            const deputy: DeputyVote = {
              id: deputyId,
              prenom: votant.prenom || '',
              nom: votant.nom || '',
              position: positionKey,
              delegation: !!votant.parDelegation
            };
            
            if (votant.causePosition) {
              deputy.causePosition = votant.causePosition;
            }
            
            deputies.push(deputy);
          }
        });
      }
    });
  }
  
  // Sort deputies by name
  deputies.sort((a, b) => {
    const aName = a.nom || a.id;
    const bName = b.nom || b.id;
    return aName.localeCompare(bName);
  });
  
  return deputies;
};

export const processGroupsFromVoteDetail = (voteDetails: any): Record<string, any> => {
  const groupsData: Record<string, any> = {};
  
  // Check if we have the detailed scrutin_votes_detail format
  if (voteDetails.groupes && Array.isArray(voteDetails.groupes)) {
    console.log('Processing groups from detailed scrutin_votes_detail format');
    
    voteDetails.groupes.forEach((groupe: any) => {
      // Extract group ID
      const groupeId = groupe.organeRef || groupe.uid || '';
      if (!groupeId) return;
      
      groupsData[groupeId] = groupe;
    });
    
    return groupsData;
  }
  
  // Check if we have the standard scrutin format
  if (voteDetails.scrutin && voteDetails.scrutin.ventilationVotes && voteDetails.scrutin.ventilationVotes.organe) {
    console.log('Processing groups from standard scrutin format');
    
    const organes = Array.isArray(voteDetails.scrutin.ventilationVotes.organe) 
      ? voteDetails.scrutin.ventilationVotes.organe 
      : [voteDetails.scrutin.ventilationVotes.organe];
    
    organes.forEach((organe: any) => {
      if (organe.organeRef) {
        const groupeId = typeof organe.organeRef === 'object' ? organe.organeRef['#text'] : organe.organeRef;
        
        groupsData[groupeId] = {
          ...organe,
          organeRef: groupeId,
          uid: groupeId
        };
      }
    });
    
    return groupsData;
  }
  
  // Check if we have the groups in a different format
  if (voteDetails.scrutin && voteDetails.scrutin.groupes && voteDetails.scrutin.groupes.groupe) {
    console.log('Processing groups from scrutin.groupes.groupe format');
    
    const groupes = Array.isArray(voteDetails.scrutin.groupes.groupe) 
      ? voteDetails.scrutin.groupes.groupe 
      : [voteDetails.scrutin.groupes.groupe];
    
    groupes.forEach((groupe: any) => {
      const groupeId = groupe.organeRef || '';
      if (!groupeId) return;
      
      groupsData[groupeId] = groupe;
    });
    
    return groupsData;
  }
  
  console.log('Could not find groups in expected format');
  return {};
};
