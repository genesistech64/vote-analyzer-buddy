
import { Scrutin, DeputyVoteData, VotePosition, StatusMessage } from './types';

// Primary URL with CORS proxy
const PRIMARY_DATA_URL = 'https://cors-proxy.fringe.zone/https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip';
// Fallback URL (direct)
const FALLBACK_DATA_URL = 'https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip';
// Backup static URL (if both primary and fallback fail)
const BACKUP_DATA_URL = 'https://staticblob.lovable.ai/scrutins/Scrutins.json.zip';

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

    // Try to fetch using the primary URL first
    let response = await fetch(PRIMARY_DATA_URL, { 
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    }).catch(() => null);
    
    // If primary URL fails, try the fallback URL
    if (!response || !response.ok) {
      console.log('Primary URL failed, trying fallback...');
      updateStatus({
        status: 'downloading',
        message: 'Tentative avec URL alternative...',
      });
      
      response = await fetch(FALLBACK_DATA_URL, { 
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' }
      }).catch(() => null);
    }
    
    // If both primary and fallback URLs fail, try the backup static URL
    if (!response || !response.ok) {
      console.log('Fallback URL failed, trying backup static URL...');
      updateStatus({
        status: 'downloading',
        message: 'Tentative avec URL de secours...',
      });
      
      response = await fetch(BACKUP_DATA_URL, { 
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' }
      });
    }
    
    if (!response || !response.ok) {
      throw new Error(`Impossible de télécharger les données: ${response ? response.status : 'Network error'}`);
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
    
    let contents;
    try {
      contents = await zip.loadAsync(zipData);
    } catch (error) {
      console.error('Error extracting ZIP:', error);
      throw new Error('Le fichier téléchargé n\'est pas un ZIP valide');
    }
    
    // Find the Scrutins.json file in the zip
    const scrutinsFile = Object.values(contents.files).find(file => 
      file.name === 'Scrutins.json' || file.name.endsWith('/Scrutins.json')
    );
    
    if (!scrutinsFile) {
      throw new Error('Scrutins.json non trouvé dans le fichier ZIP');
    }
    
    // Extract the file content
    const jsonText = await scrutinsFile.async('text');
    let data;
    
    try {
      data = JSON.parse(jsonText);
    } catch (error) {
      console.error('Error parsing JSON:', error);
      throw new Error('Le fichier JSON n\'est pas valide');
    }
    
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
        details: `Vérifiez l'identifiant du député "${deputyId}" et réessayez. Assurez-vous qu'il s'agit d'un identifiant de la 17e législature.`
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
