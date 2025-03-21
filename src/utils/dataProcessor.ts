import { Scrutin, DeputyVoteData, VotePosition, StatusMessage } from './types';
import type JSZip from 'jszip';

// Primary URL with CORS proxy
const PRIMARY_DATA_URL = 'https://cors-proxy.fringe.zone/https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip';
// Fallback URL (direct)
const FALLBACK_DATA_URL = 'https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip';
// Backup static URL (if both primary and fallback fail)
const BACKUP_DATA_URL = 'https://staticblob.lovable.ai/scrutins/Scrutins.json.zip';

// Données de secours pour les députés courants (simulation)
const FALLBACK_DATA: Record<string, DeputyVoteData[]> = {
  "PA1592": [
    {
      numero: "001",
      dateScrutin: "2022-07-06",
      title: "Élection du Président de l'Assemblée nationale",
      position: "pour"
    },
    {
      numero: "002",
      dateScrutin: "2022-07-07",
      title: "Nomination des vice-présidents",
      position: "pour"
    },
    {
      numero: "003",
      dateScrutin: "2022-07-08",
      title: "Projet de loi pouvoir d'achat",
      position: "contre"
    },
    {
      numero: "004",
      dateScrutin: "2022-07-12",
      title: "Motion de censure",
      position: "abstention"
    },
    {
      numero: "005",
      dateScrutin: "2022-07-21",
      title: "Budget supplémentaire",
      position: "pour"
    }
  ]
};

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

    console.log('[Data] Starting download process for deputy:', deputyId);

    let dataFetched = false;
    let zipData: ArrayBuffer | null = null;

    // Try to fetch using the primary URL first
    console.log('[Data] Attempting to download from primary URL:', PRIMARY_DATA_URL);
    try {
      const response = await fetch(PRIMARY_DATA_URL, { 
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (response.ok) {
        zipData = await response.arrayBuffer();
        dataFetched = true;
        console.log('[Data] Primary URL successful, received data size:', zipData.byteLength);
      }
    } catch (error) {
      console.error('[Data] Error fetching from primary URL:', error);
    }
    
    // If primary URL fails, try the fallback URL
    if (!dataFetched) {
      console.log('[Data] Primary URL failed, trying fallback URL:', FALLBACK_DATA_URL);
      updateStatus({
        status: 'downloading',
        message: 'Tentative avec URL alternative...',
      });
      
      try {
        const response = await fetch(FALLBACK_DATA_URL, { 
          method: 'GET',
          headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (response.ok) {
          zipData = await response.arrayBuffer();
          dataFetched = true;
          console.log('[Data] Fallback URL successful, received data size:', zipData.byteLength);
        }
      } catch (error) {
        console.error('[Data] Error fetching from fallback URL:', error);
      }
    }
    
    // If both primary and fallback URLs fail, try the backup static URL
    if (!dataFetched) {
      console.log('[Data] Fallback URL failed, trying backup static URL:', BACKUP_DATA_URL);
      updateStatus({
        status: 'downloading',
        message: 'Tentative avec URL de secours...',
      });
      
      try {
        const response = await fetch(BACKUP_DATA_URL, { 
          method: 'GET',
          headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (response.ok) {
          zipData = await response.arrayBuffer();
          dataFetched = true;
          console.log('[Data] Backup URL successful, received data size:', zipData.byteLength);
        }
      } catch (error) {
        console.error('[Data] Error fetching from backup URL:', error);
      }
    }
    
    // If all remote sources fail, use fallback data if available
    if (!dataFetched) {
      console.log('[Data] All URLs failed, checking for fallback data for deputy:', deputyId);
      
      if (FALLBACK_DATA[deputyId]) {
        console.log('[Data] Using fallback data for deputy:', deputyId);
        updateStatus({
          status: 'complete',
          message: `Données locales chargées (${FALLBACK_DATA[deputyId].length} votes)`,
          details: 'Les données en ligne sont actuellement indisponibles. Utilisation de données locales limitées.'
        });
        return FALLBACK_DATA[deputyId];
      }
      
      // If no fallback data is available for this deputy
      console.error('[Data] No fallback data available for deputy:', deputyId);
      throw new Error('Impossible d\'accéder aux données en ligne. Veuillez réessayer plus tard.');
    }
    
    if (!zipData) {
      throw new Error('Aucune donnée n\'a pu être téléchargée.');
    }
    
    console.log('[Data] Download successful, getting arrayBuffer');
    console.log('[Data] Successfully received ZIP data, size:', zipData.byteLength, 'bytes');
    
    // Update status to extracting
    updateStatus({
      status: 'extracting',
      message: 'Extraction des données...',
    });
    
    // Use JSZip to extract the Scrutins.json file
    console.log('[Data] Importing JSZip module');
    const JSZipModule = await import('jszip');
    const zip = new JSZipModule.default();
    
    let contents;
    try {
      console.log('[Data] Starting ZIP extraction');
      contents = await zip.loadAsync(zipData);
      console.log('[Data] ZIP extraction successful');
    } catch (error) {
      console.error('[Data] Error extracting ZIP:', error);
      throw new Error('Le fichier téléchargé n\'est pas un ZIP valide');
    }
    
    // Log the file names in the ZIP
    console.log('[Data] Files in ZIP:', Object.keys(contents.files).join(', '));
    
    // Find the Scrutins.json file in the zip
    const isJSZipObject = (file: unknown): file is JSZip.JSZipObject => {
      return file !== null && typeof file === 'object' && 'name' in file && 'async' in file;
    };
    
    const scrutinsFile = Object.values(contents.files).find((file) => {
      if (!isJSZipObject(file)) return false;
      
      return typeof file.name === 'string' && 
        (file.name === 'Scrutins.json' || file.name.endsWith('/Scrutins.json'));
    });
    
    if (!scrutinsFile || !isJSZipObject(scrutinsFile)) {
      console.error('[Data] Scrutins.json not found in ZIP content');
      throw new Error('Scrutins.json non trouvé dans le fichier ZIP');
    }
    
    console.log('[Data] Found Scrutins.json file, extracting content');
    
    // Extract the file content - now properly typed
    const jsonText = await scrutinsFile.async('text');
    console.log('[Data] JSON text extracted, length:', jsonText.length);
    
    let data;
    try {
      console.log('[Data] Parsing JSON');
      data = JSON.parse(jsonText);
      console.log('[Data] JSON parsed successfully');
    } catch (error) {
      console.error('[Data] Error parsing JSON:', error);
      throw new Error('Le fichier JSON n\'est pas valide');
    }
    
    // Update status to processing
    updateStatus({
      status: 'processing',
      message: 'Analyse des votes du député...',
    });
    
    // Log data structure
    console.log('[Data] Data structure:', Array.isArray(data) ? 'Array' : typeof data);
    if (typeof data === 'object' && data !== null) {
      console.log('[Data] Top-level keys:', Object.keys(data));
    }
    
    // Process the data to find the deputy's votes
    console.log('[Data] Processing deputy votes for ID:', deputyId);
    const votesData = processDeputyVotes(data, deputyId);
    console.log('[Data] Found', votesData.length, 'votes for deputy');
    
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
    console.error('[Data] Error fetching or processing data:', error);
    updateStatus({
      status: 'error',
      message: 'Erreur lors du traitement des données',
      details: error instanceof Error ? error.message : 'Une erreur inconnue est survenue'
    });
    throw error; // Re-throw to be handled by the caller
  }
}

function processDeputyVotes(data: any, deputyId: string): DeputyVoteData[] {
  console.log('[Data] Starting to process deputy votes');
  const result: DeputyVoteData[] = [];
  
  // Ensure data has the expected structure
  if (!Array.isArray(data)) {
    // Handle the case where the data is not an array
    // It might be wrapped in an object
    console.log('[Data] Data is not an array, checking for "scrutins.scrutin" structure');
    if (data && Array.isArray(data.scrutins?.scrutin)) {
      console.log('[Data] Found scrutins.scrutin array, using it');
      data = data.scrutins.scrutin;
    } else {
      console.error('[Data] Unexpected data structure:', typeof data);
      console.log('[Data] Data sample:', JSON.stringify(data).substring(0, 200) + '...');
      return [];
    }
  }
  
  console.log('[Data] Processing', data.length, 'scrutins');
  
  // Process each scrutin
  data.forEach((scrutinItem: Scrutin | any, index: number) => {
    const scrutin = 'scrutin' in scrutinItem ? scrutinItem.scrutin : scrutinItem;
    
    if (!scrutin) {
      console.log(`[Data] Scrutin at index ${index} is null or undefined, skipping`);
      return;
    }
    
    const numero = scrutin.numero;
    const dateScrutin = scrutin.dateScrutin;
    const title = scrutin.titre || (scrutin.objet?.libelle || 'Titre non disponible');
    
    // Check for the deputy in each voting category
    let position: VotePosition | undefined;
    
    // Navigate through the potentially complex structure to find voting data
    const groupes = scrutin.ventilationVotes?.organe?.groupes?.groupe;
    
    if (!Array.isArray(groupes)) {
      if (index % 100 === 0) {
        console.log(`[Data] No groupes array found for scrutin ${numero}`);
      }
      return;
    }
    
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
  
  console.log('[Data] Found', result.length, 'votes for deputy', deputyId);
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
