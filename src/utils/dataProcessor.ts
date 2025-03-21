import { Scrutin, DeputyVoteData, VotePosition, StatusMessage } from './types';

const DATA_URL = 'https://cors-proxy.fringe.zone/https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip';

export async function fetchAndProcessData(
  deputyId: string, 
  updateStatus: (status: StatusMessage) => void
): Promise<DeputyVoteData[]> {
  try {
    // Update status to downloading
    updateStatus({
      status: 'downloading',
      message: 'Téléchargement des données en cours...',
    });

    // Fetch the zip file
    const response = await fetch(DATA_URL);
    
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.status}`);
    }
    
    const zipData = await response.arrayBuffer();
    
    // Update status to extracting
    updateStatus({
      status: 'extracting',
      message: 'Extraction des données...',
    });
    
    // Use JSZip to extract the Scrutins.json file
    const JSZip = await import('jszip');
    const zip = new JSZip.default();
    const contents = await zip.loadAsync(zipData);
    
    // Find the Scrutins.json file in the zip
    const scrutinsFile = Object.values(contents.files).find(file => 
      file.name === 'Scrutins.json' || file.name.endsWith('/Scrutins.json')
    );
    
    if (!scrutinsFile) {
      throw new Error('Scrutins.json not found in the zip file');
    }
    
    // Extract the file content
    const jsonText = await scrutinsFile.async('text');
    const data = JSON.parse(jsonText);
    
    // Update status to processing
    updateStatus({
      status: 'processing',
      message: 'Analyse des votes du député...',
    });
    
    // Process the data to find the deputy's votes
    const votesData = processDeputyVotes(data, deputyId);
    
    if (votesData.length === 0) {
      updateStatus({
        status: 'complete',
        message: 'Aucun vote trouvé pour ce député',
        details: 'Vérifiez l\'identifiant du député et réessayez'
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
    console.error('Error fetching or processing data:', error);
    updateStatus({
      status: 'error',
      message: 'Erreur lors du traitement des données',
      details: error instanceof Error ? error.message : 'Une erreur inconnue est survenue'
    });
    return [];
  }
}

function processDeputyVotes(data: any, deputyId: string): DeputyVoteData[] {
  const result: DeputyVoteData[] = [];
  
  // Ensure data has the expected structure
  if (!Array.isArray(data)) {
    // Handle the case where the data is not an array
    // It might be wrapped in an object
    if (data && Array.isArray(data.scrutins?.scrutin)) {
      data = data.scrutins.scrutin;
    } else {
      console.error('Unexpected data structure:', data);
      return [];
    }
  }
  
  // Process each scrutin
  data.forEach((scrutinItem: Scrutin | any) => {
    const scrutin = 'scrutin' in scrutinItem ? scrutinItem.scrutin : scrutinItem;
    
    if (!scrutin) return;
    
    const numero = scrutin.numero;
    const dateScrutin = scrutin.dateScrutin;
    const title = scrutin.titre || (scrutin.objet?.libelle || 'Titre non disponible');
    
    // Check for the deputy in each voting category
    let position: VotePosition | undefined;
    
    // Navigate through the potentially complex structure to find voting data
    const groupes = scrutin.ventilationVotes?.organe?.groupes?.groupe;
    
    if (Array.isArray(groupes)) {
      for (const groupe of groupes) {
        const decompte = groupe.vote?.decompteNominatif;
        
        if (!decompte) continue;
        
        // Check in "pour" votes
        if (decompte.pours?.votant && Array.isArray(decompte.pours.votant)) {
          if (decompte.pours.votant.some(v => v.acteurRef === deputyId)) {
            position = 'pour';
            break;
          }
        }
        
        // Check in "contre" votes
        if (decompte.contres?.votant && Array.isArray(decompte.contres.votant)) {
          if (decompte.contres.votant.some(v => v.acteurRef === deputyId)) {
            position = 'contre';
            break;
          }
        }
        
        // Check in "abstention" votes
        if (decompte.abstentions?.votant && Array.isArray(decompte.abstentions.votant)) {
          if (decompte.abstentions.votant.some(v => v.acteurRef === deputyId)) {
            position = 'abstention';
            break;
          }
        }
        
        // Check in "nonVotants" (absent)
        if (decompte.nonVotants?.votant && Array.isArray(decompte.nonVotants.votant)) {
          if (decompte.nonVotants.votant.some(v => v.acteurRef === deputyId)) {
            position = 'absent';
            break;
          }
        }
      }
    }
    
    // If deputy was found in any vote category, add to result
    if (position) {
      result.push({
        numero,
        dateScrutin,
        title,
        position
      });
    }
  });
  
  return result;
}

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
