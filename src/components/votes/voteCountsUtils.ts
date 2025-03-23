
/**
 * Extracts vote counts from various vote data formats
 */
export const extractVoteCounts = (data: any) => {
  console.log('Extracting vote counts from data:', data);
  
  if (data.groupes && Array.isArray(data.groupes)) {
    console.log('Found groupes array in detail format, calculating totals...');
    let totalPour = 0;
    let totalContre = 0;
    let totalAbstention = 0;
    
    data.groupes.forEach((groupe: any) => {
      if (groupe.votes) {
        if (groupe.votes.pours && groupe.votes.pours.votant) {
          const poursVotants = Array.isArray(groupe.votes.pours.votant) 
            ? groupe.votes.pours.votant.length 
            : 1;
          totalPour += poursVotants;
        }
        
        if (groupe.votes.contres && groupe.votes.contres.votant) {
          const contresVotants = Array.isArray(groupe.votes.contres.votant) 
            ? groupe.votes.contres.votant.length 
            : 1;
          totalContre += contresVotants;
        }
        
        if (groupe.votes.abstentions && groupe.votes.abstentions.votant) {
          const abstentionsVotants = Array.isArray(groupe.votes.abstentions.votant) 
            ? groupe.votes.abstentions.votant.length 
            : 1;
          totalAbstention += abstentionsVotants;
        }
      }
    });
    
    console.log('Calculated totals from groupes array:', {
      pour: totalPour,
      contre: totalContre,
      abstention: totalAbstention,
      votants: totalPour + totalContre + totalAbstention
    });
    
    if (totalPour > 0 || totalContre > 0 || totalAbstention > 0) {
      return {
        votants: totalPour + totalContre + totalAbstention,
        pour: totalPour,
        contre: totalContre,
        abstention: totalAbstention
      };
    }
  }
  
  if (data.syntheseVote) {
    console.log('Found syntheseVote:', data.syntheseVote);
    return {
      votants: parseInt(data.syntheseVote.nombreVotants || '0'),
      pour: parseInt(data.syntheseVote.decompte?.pour || '0'),
      contre: parseInt(data.syntheseVote.decompte?.contre || '0'),
      abstention: parseInt(data.syntheseVote.decompte?.abstentions || '0')
    };
  }
  
  if (data.nombreVotants !== undefined) {
    console.log('Found direct properties:', {
      nombreVotants: data.nombreVotants,
      nombrePour: data.nombrePour,
      nombreContre: data.nombreContre,
      nombreAbstentions: data.nombreAbstentions
    });
    return {
      votants: parseInt(data.nombreVotants || '0'),
      pour: parseInt(data.nombrePour || '0'),
      contre: parseInt(data.nombreContre || '0'),
      abstention: parseInt(data.nombreAbstentions || '0')
    };
  }
  
  if (data.miseAuPoint) {
    console.log('Found miseAuPoint:', data.miseAuPoint);
    return {
      votants: parseInt(data.miseAuPoint.nombreVotants || '0'),
      pour: parseInt(data.miseAuPoint.pour || '0'),
      contre: parseInt(data.miseAuPoint.contre || '0'),
      abstention: parseInt(data.miseAuPoint.abstentions || '0')
    };
  }
  
  if (data.scrutin) {
    console.log('Found scrutin:', data.scrutin);
    if (data.scrutin.decompteVoix) {
      return {
        votants: parseInt(data.scrutin.nombreVotants || '0'),
        pour: parseInt(data.scrutin.decompteVoix.pour || '0'),
        contre: parseInt(data.scrutin.decompteVoix.contre || '0'),
        abstention: parseInt(data.scrutin.decompteVoix.abstentions || '0')
      };
    }
    
    if (data.scrutin.decompteNominatif) {
      const decompte = data.scrutin.decompteNominatif;
      const pourCount = Array.isArray(decompte.pour?.votant) ? decompte.pour.votant.length : 0;
      const contreCount = Array.isArray(decompte.contre?.votant) ? decompte.contre.votant.length : 0;
      const abstentionCount = Array.isArray(decompte.abstentions?.votant) ? decompte.abstentions.votant.length : 0;
      const nonVotantCount = Array.isArray(decompte.nonVotant) ? decompte.nonVotant.length : 0;
      
      console.log('Found decompteNominatif counts:', {
        pour: pourCount,
        contre: contreCount,
        abstention: abstentionCount,
        nonVotant: nonVotantCount
      });
      
      return {
        votants: pourCount + contreCount + abstentionCount,
        pour: pourCount,
        contre: contreCount,
        abstention: abstentionCount
      };
    }
  }
  
  if (data.groupes && Array.isArray(data.groupes)) {
    console.log('Trying to calculate from groupes array');
    let totalPour = 0;
    let totalContre = 0;
    let totalAbstention = 0;
    
    data.groupes.forEach((groupe: any) => {
      if (groupe.vote) {
        totalPour += parseInt(groupe.vote.pour || '0');
        totalContre += parseInt(groupe.vote.contre || '0');
        totalAbstention += parseInt(groupe.vote.abstention || '0');
      }
    });
    
    if (totalPour > 0 || totalContre > 0 || totalAbstention > 0) {
      console.log('Calculated from groupes array:', {
        pour: totalPour,
        contre: totalContre,
        abstention: totalAbstention
      });
      
      return {
        votants: totalPour + totalContre + totalAbstention,
        pour: totalPour,
        contre: totalContre,
        abstention: totalAbstention
      };
    }
  }
  
  console.log('Could not extract vote counts from any known format');
  return {
    votants: 0,
    pour: 0,
    contre: 0,
    abstention: 0
  };
};
