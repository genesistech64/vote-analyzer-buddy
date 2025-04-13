// Follow Deno's ES modules conventions
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Handle CORS preflight requests
const handleCors = (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }
  return null;
};

// Extract JSON from request
const extractJSON = async (req: Request) => {
  try {
    return await req.json();
  } catch (error) {
    return { error: "Invalid JSON" };
  }
};

// NEW: Define more reliable URLs - focusing on official API endpoints
const primaryUrls = [
  // Direct API endpoints (official API)
  "https://www.assemblee-nationale.fr/dyn/opendata/list-deputes",
  "https://www.assemblee-nationale.fr/dyn/opendata/deputes.json",
  "https://www.nosdeputes.fr/deputes/enmandat/json",
  "https://www.nosdeputes.fr/deputes/tous/json"
];

// Keep legacy URLs as fallbacks
const alternativeUrls = [
  // Direct API URLs that might work
  "https://data.assemblee-nationale.fr/api/v2/deputies?legislature=17",
  "https://data.assemblee-nationale.fr/api/v2/deputies/list?legislature=17",
  "https://data.assemblee-nationale.fr/api/v2/legislature/17/deputies",
  
  // Traditional file-based URLs
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/tous_acteurs_mandats_organes_xi_legislature/tous_acteurs_tous_mandats_tous_organes_xi_legislature.json",
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/deputes_actifs/AMO30_deputes_actifs_mandats_actifs_organes_xvii.json",
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/deputes_en_exercice_mandats_actifs_organes/AMO10_deputes_en_exercice_mandats_actifs_organes.json",
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/deputes/AMO10_deputes.json",
  
  // Try different formats and capitalization
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/acteurs/json/acteurs.json",
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/acteurs/JSON/acteurs.json",
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/acteurs/json/tous_acteurs.json",
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/acteurs/JSON/tous_acteurs.json"
];

// Alternative URL for legislature 16
const alternativeUrlsLeg16 = [
  "https://www.assemblee-nationale.fr/dyn/opendata/list-deputes",
  "https://www.assemblee-nationale.fr/dyn/opendata/deputes.json",
  "https://www.nosdeputes.fr/deputes/enmandat/json",
  "https://www.nosdeputes.fr/deputes/tous/json",
  "https://data.assemblee-nationale.fr/api/v2/deputies?legislature=16",
  "https://data.assemblee-nationale.fr/static/openData/repository/16/amo/tous_acteurs_mandats_organes_xi_legislature/tous_acteurs_tous_mandats_tous_organes_xi_legislature.json",
  "https://data.assemblee-nationale.fr/static/openData/repository/16/amo/deputes_actifs/AMO30_deputes_actifs_mandats_actifs_organes_xvi.json",
  "https://data.assemblee-nationale.fr/static/openData/repository/16/amo/deputes/AMO10_deputes.json"
];

// Define interfaces for API responses
interface ActeursResponse {
  export?: {
    acteurs?: {
      acteur?: Acteur[];
    };
  };
  acteurs?: Acteur[];
  results?: Acteur[];
  deputy?: Acteur[];
  deputes?: Acteur[];
  membres?: Acteur[];
}

interface Acteur {
  uid?: {
    "#text"?: string;
  } | string;
  id?: string;
  uid_an?: string;
  etatCivil?: {
    ident?: {
      civ?: string;
      prenom?: string;
      nom?: string;
      alpha?: string;
    };
    infoNaissance?: {
      dateNais?: string;
      villeNais?: string;
      depNais?: string;
      paysNais?: string;
    };
    profession?: string;
  };
  identity?: {
    firstName?: string;
    lastName?: string;
    gender?: string;
  };
  nom?: string;
  prenom?: string;
  nom_de_famille?: string;
  mandats?: {
    mandat?: Mandat[] | Mandat;
  } | Mandat[];
  mandats_data?: Mandat[];
  mandates?: Mandat[];
  profession?: {
    libelleCourant?: string;
  } | string;
  groupe?: {
    id?: string;
    name?: string;
  };
  groupePolitique?: string;
  groupePolitiqueId?: string;
}

interface Mandat {
  uid?: {
    "#text"?: string;
  } | string;
  id?: string;
  election?: {
    lieu?: {
      departement?: string;
    };
  };
  typeOrgane?: string;
  type?: string;
  legislature?: string;
  dateFin?: string;
  infosQualite?: {
    codeQualite?: string;
  };
  organisme?: {
    uid?: string;
    libelle?: string;
  };
  group?: {
    id?: string;
    name?: string;
  };
  groupe?: {
    id?: string;
    name?: string;
  };
  suppleant?: {
    uid?: string;
  };
}

interface OrganismeResponse {
  export?: {
    organes?: {
      organe?: Organe[];
    };
  };
  organes?: Organe[];
  groups?: Organe[];
  organizations?: Organe[];
}

interface Organe {
  uid?: {
    "#text"?: string;
  } | string;
  id?: string;
  codeType?: string;
  type?: string;
  libelle?: string;
  libelleAbrege?: string;
  libelleEdition?: string;
  name?: string;
  shortName?: string;
  viMoDe?: {
    dateDebut?: string;
    dateFin?: string;
  };
  legislature?: string;
  positionPolitique?: {
    organePolitique?: {
      uid?: string;
      libelle?: string;
    };
  };
}

interface DeputyData {
  deputy_id: string;
  first_name: string;
  last_name: string;
  legislature: string;
  political_group: string | null;
  political_group_id: string | null;
  profession: string | null;
}

// NEW: Enhanced fetchDeputiesData function with better error handling and more sources
const fetchDeputiesData = async (legislature: string): Promise<{
  deputies: DeputyData[];
  errors: string[];
}> => {
  console.log(`Fetching deputies data for legislature ${legislature}`);
  
  const errors: string[] = [];
  let deputies: DeputyData[] = [];
  let foundValidData = false;
  
  // First try the primary URLs which are more likely to work
  for (const url of primaryUrls) {
    if (foundValidData) break;
    
    try {
      console.log(`Attempting to fetch from primary source: ${url}`);
      
      // Add legislature param if not in URL already
      const fetchUrl = url.includes('?') ? 
        `${url}&legislature=${legislature}` : 
        url;
      
      const response = await fetch(fetchUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AN-Vote-Analyzer/1.0'
        }
      });
      
      if (!response.ok) {
        console.log(`HTTP error for ${url}: ${response.status}`);
        continue;
      }
      
      // Check content type
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn(`Warning: Response is not JSON (${contentType}) for ${url}`);
      }
      
      // Try to parse the response
      const data = await response.json();
      
      // Check if the data has a structure we recognize
      if (!data) {
        console.log(`No data returned from ${url}`);
        continue;
      }
      
      console.log(`Successfully fetched data from ${url}, analyzing structure...`);
      
      // Handle different data structures from the various sources
      let processedDeputies: DeputyData[] = [];
      
      // nosdeputés.fr format
      if (data.deputes && Array.isArray(data.deputes)) {
        console.log(`Found nosdeputes.fr format with ${data.deputes.length} deputies`);
        processedDeputies = processNosDeputesFormat(data.deputes, legislature);
      }
      // assemblee-nationale.fr format (newer API)
      else if (data.deputes && typeof data.deputes === 'object') {
        console.log(`Found assemblee-nationale.fr format with ${Object.keys(data.deputes).length} deputies`);
        processedDeputies = processANNewFormat(data.deputes, legislature);
      }
      // Official API format
      else if (data.results && Array.isArray(data.results)) {
        console.log(`Found API format with ${data.results.length} deputies`);
        processedDeputies = processApiFormat(data.results, legislature);
      }
      // Export format
      else if (data.export && data.export.acteurs && data.export.acteurs.acteur) {
        console.log(`Found export format with ${data.export.acteurs.acteur.length} acteurs`);
        processedDeputies = processExportFormat(data.export.acteurs.acteur, legislature);
      }
      // Simple deputies array
      else if (data.deputes && Array.isArray(data.deputes)) {
        console.log(`Found deputes array with ${data.deputes.length} deputies`);
        processedDeputies = processSimpleFormat(data.deputes, legislature);
      }
      // Direct acteurs array
      else if (data.acteurs && Array.isArray(data.acteurs)) {
        console.log(`Found acteurs array with ${data.acteurs.length} acteurs`);
        processedDeputies = processSimpleFormat(data.acteurs, legislature);
      }
      // Another possible format
      else if (data.deputy && Array.isArray(data.deputy)) {
        console.log(`Found deputy array with ${data.deputy.length} deputies`);
        processedDeputies = processSimpleFormat(data.deputy, legislature);
      }
      
      // If we found valid data, add it to our results
      if (processedDeputies.length > 0) {
        console.log(`Successfully processed ${processedDeputies.length} deputies from ${url}`);
        
        // Add these deputies to our collection
        deputies = processedDeputies;
        foundValidData = true;
        break;
      } else {
        console.warn(`Could not find valid deputy data in response from ${url}`);
      }
      
    } catch (error) {
      const errorMessage = `Error fetching from ${url}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMessage);
      errors.push(errorMessage);
    }
  }
  
  // If primary sources failed, try fallback URLs
  if (!foundValidData) {
    console.log("Primary sources failed, trying fallback URLs...");
    
    // Select appropriate URLs based on legislature
    const urls = legislature === "16" ? alternativeUrlsLeg16 : alternativeUrls;
    
    // Try each URL until we find one that works
    for (const url of urls) {
      if (foundValidData) break;
      
      try {
        console.log(`Attempting to fetch from fallback: ${url}`);
        
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'AN-Vote-Analyzer/1.0'
          }
        });
        
        if (!response.ok) {
          console.log(`HTTP error for ${url}: ${response.status}`);
          continue;
        }
        
        // Process the data similarly to primary sources
        const data = await response.json();
        
        if (!data) {
          console.log(`No data returned from ${url}`);
          continue;
        }
        
        console.log(`Successfully fetched data from ${url}, analyzing structure...`);
        
        // Try multiple possible data structures
        let processedDeputies: DeputyData[] = [];
        
        // Use the same processing logic as before
        if (data.results && Array.isArray(data.results)) {
          console.log(`Found API format with ${data.results.length} deputies`);
          processedDeputies = processApiFormat(data.results, legislature);
        }
        else if (data.export && data.export.acteurs && data.export.acteurs.acteur) {
          console.log(`Found export format with ${data.export.acteurs.acteur.length} acteurs`);
          processedDeputies = processExportFormat(data.export.acteurs.acteur, legislature);
        }
        else if (data.deputes && Array.isArray(data.deputes)) {
          console.log(`Found deputes array with ${data.deputes.length} deputies`);
          processedDeputies = processSimpleFormat(data.deputes, legislature);
        }
        else if (data.acteurs && Array.isArray(data.acteurs)) {
          console.log(`Found acteurs array with ${data.acteurs.length} acteurs`);
          processedDeputies = processSimpleFormat(data.acteurs, legislature);
        }
        else if (data.deputy && Array.isArray(data.deputy)) {
          console.log(`Found deputy array with ${data.deputy.length} deputies`);
          processedDeputies = processSimpleFormat(data.deputy, legislature);
        }
        
        if (processedDeputies.length > 0) {
          console.log(`Successfully processed ${processedDeputies.length} deputies from ${url}`);
          deputies = processedDeputies;
          foundValidData = true;
          break;
        }
        
      } catch (error) {
        const errorMessage = `Error fetching from ${url}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMessage);
        errors.push(errorMessage);
      }
    }
  }
  
  if (!foundValidData) {
    errors.push("Could not find valid deputies data in any of the attempted sources");
  }
  
  return { deputies, errors };
};

// NEW: Process data from nosdeputes.fr format
const processNosDeputesFormat = (deputies: any[], legislature: string): DeputyData[] => {
  return deputies.map(deputy => {
    try {
      // In nosdeputes.fr format, the structure is a bit different
      const slugId = deputy.slug || '';
      // Convert slug to PA format if possible
      const deputyId = deputy.id_an ? 
        (deputy.id_an.startsWith('PA') ? deputy.id_an : `PA${deputy.id_an}`) : 
        `ND${slugId}`;  // Use slug as fallback with ND prefix to mark it's from nosdeputes
      
      // Get names, taking into account different format possibilities
      const firstName = deputy.prenom || '';
      const lastName = deputy.nom_de_famille || deputy.nom || '';
      
      return {
        deputy_id: deputyId,
        first_name: firstName,
        last_name: lastName,
        legislature,
        political_group: deputy.groupe_sigle || null,
        political_group_id: deputy.groupe_sigle || null,
        profession: deputy.profession || null
      };
    } catch (error) {
      console.error(`Error processing deputy: ${error}`);
      return null;
    }
  }).filter(Boolean) as DeputyData[];
};

// NEW: Process newer assemblee-nationale.fr format
const processANNewFormat = (deputesObj: any, legislature: string): DeputyData[] => {
  const deputies: DeputyData[] = [];
  
  try {
    // Convert object to array if needed
    const deputesArray = Array.isArray(deputesObj) ? 
      deputesObj : 
      Object.values(deputesObj);
    
    for (const deputy of deputesArray) {
      try {
        // Extract ID, ensuring it has PA prefix
        const rawId = deputy.uid || deputy.matricule || deputy.id || '';
        const deputyId = rawId.startsWith('PA') ? rawId : `PA${rawId}`;
        
        // Extract name information
        let firstName = '';
        let lastName = '';
        
        if (deputy.etatCivil && deputy.etatCivil.ident) {
          firstName = deputy.etatCivil.ident.prenom || '';
          lastName = deputy.etatCivil.ident.nom || '';
        } else {
          firstName = deputy.prenom || '';
          lastName = deputy.nom || '';
        }
        
        // Extract political group
        let politicalGroup = null;
        let politicalGroupId = null;
        
        if (deputy.groupePolitique) {
          politicalGroup = deputy.groupePolitique.libelle || deputy.groupePolitique;
          politicalGroupId = deputy.groupePolitique.code || deputy.groupePolitique;
        }
        
        deputies.push({
          deputy_id: deputyId,
          first_name: firstName,
          last_name: lastName,
          legislature,
          political_group: politicalGroup,
          political_group_id: politicalGroupId,
          profession: deputy.profession || null
        });
      } catch (error) {
        console.error(`Error processing deputy in AN format: ${error}`);
      }
    }
  } catch (error) {
    console.error(`Error processing AN format: ${error}`);
  }
  
  return deputies;
};

// Process API format
const processApiFormat = (results: any[], legislature: string): DeputyData[] => {
  const deputies: DeputyData[] = [];
  
  for (const deputy of results) {
    try {
      // Extract basic information
      const deputyId = deputy.uid || deputy.id || deputy.uid_an || "";
      const formattedId = deputyId.startsWith('PA') ? deputyId : `PA${deputyId}`;
      
      // Extract name information
      let firstName = "";
      let lastName = "";
      
      if (deputy.identity) {
        firstName = deputy.identity.firstName || "";
        lastName = deputy.identity.lastName || "";
      } else if (deputy.etatCivil && deputy.etatCivil.ident) {
        firstName = deputy.etatCivil.ident.prenom || "";
        lastName = deputy.etatCivil.ident.nom || "";
      } else {
        firstName = deputy.prenom || deputy.first_name || "";
        lastName = deputy.nom || deputy.nom_de_famille || deputy.last_name || "";
      }
      
      // Extract profession
      let profession = null;
      if (typeof deputy.profession === 'string') {
        profession = deputy.profession;
      } else if (deputy.profession && deputy.profession.libelleCourant) {
        profession = deputy.profession.libelleCourant;
      }
      
      // Extract political group
      let politicalGroupId = null;
      let politicalGroupName = null;
      
      if (deputy.groupe) {
        politicalGroupId = deputy.groupe.id || "";
        politicalGroupName = deputy.groupe.name || "";
      } else if (deputy.group) {
        politicalGroupId = deputy.group.id || "";
        politicalGroupName = deputy.group.name || "";
      } else {
        politicalGroupId = deputy.groupePolitiqueId || "";
        politicalGroupName = deputy.groupePolitique || "";
      }
      
      deputies.push({
        deputy_id: formattedId,
        first_name: firstName,
        last_name: lastName,
        legislature,
        political_group: politicalGroupName,
        political_group_id: politicalGroupId,
        profession,
      });
    } catch (error) {
      console.error(`Error processing deputy: ${error}`);
    }
  }
  
  return deputies;
};

// Process export format
const processExportFormat = (acteurs: any[], legislature: string): DeputyData[] => {
  const deputies: DeputyData[] = [];
  
  for (const acteur of acteurs) {
    try {
      // Extract uid (deputy ID)
      let deputyId = "";
      if (acteur.uid && typeof acteur.uid === 'object' && "#text" in acteur.uid) {
        deputyId = acteur.uid["#text"] || "";
      } else if (typeof acteur.uid === 'string') {
        deputyId = acteur.uid;
      } else {
        deputyId = acteur.id || "";
      }
      
      // Format ID with PA prefix if needed
      const formattedId = deputyId.startsWith('PA') ? deputyId : `PA${deputyId}`;
      
      // Extract name information
      let firstName = "";
      let lastName = "";
      
      if (acteur.etatCivil && acteur.etatCivil.ident) {
        firstName = acteur.etatCivil.ident.prenom || "";
        lastName = acteur.etatCivil.ident.nom || "";
      } else {
        firstName = acteur.prenom || "";
        lastName = acteur.nom || "";
      }
      
      // Extract profession
      let profession = null;
      if (typeof acteur.profession === 'string') {
        profession = acteur.profession;
      } else if (acteur.profession && acteur.profession.libelleCourant) {
        profession = acteur.profession.libelleCourant;
      } else if (acteur.etatCivil && acteur.etatCivil.profession) {
        profession = acteur.etatCivil.profession;
      }
      
      // Find political group
      let politicalGroupId = null;
      let politicalGroupName = null;
      
      // Try to extract group from mandats
      if (acteur.mandats) {
        const mandats = Array.isArray(acteur.mandats.mandat) 
          ? acteur.mandats.mandat 
          : [acteur.mandats.mandat];
        
        const politicalGroupMandat = mandats.find(
          (m: any) => m.typeOrgane === "GP" || m.type === "GP"
        );
        
        if (politicalGroupMandat) {
          if (politicalGroupMandat.organisme) {
            politicalGroupId = politicalGroupMandat.organisme.uid || "";
            politicalGroupName = politicalGroupMandat.organisme.libelle || "";
          } else if (politicalGroupMandat.groupe) {
            politicalGroupId = politicalGroupMandat.groupe.id || "";
            politicalGroupName = politicalGroupMandat.groupe.name || "";
          }
        }
      }
      
      deputies.push({
        deputy_id: formattedId,
        first_name: firstName,
        last_name: lastName,
        legislature,
        political_group: politicalGroupName,
        political_group_id: politicalGroupId,
        profession,
      });
    } catch (error) {
      console.error(`Error processing acteur: ${error}`);
    }
  }
  
  return deputies;
};

// Process simple format
const processSimpleFormat = (deputies: any[], legislature: string): DeputyData[] => {
  return deputies.map(deputy => {
    try {
      // Extract uid (deputy ID)
      let deputyId = "";
      if (deputy.uid && typeof deputy.uid === 'object' && "#text" in deputy.uid) {
        deputyId = deputy.uid["#text"] || "";
      } else if (typeof deputy.uid === 'string') {
        deputyId = deputy.uid;
      } else {
        deputyId = deputy.id || deputy.uid_an || "";
      }
      
      // Format ID with PA prefix if needed
      const formattedId = deputyId.startsWith('PA') ? deputyId : `PA${deputyId}`;
      
      return {
        deputy_id: formattedId,
        first_name: deputy.prenom || deputy.first_name || "",
        last_name: deputy.nom || deputy.last_name || deputy.nom_de_famille || "",
        legislature,
        political_group: deputy.groupe_politique || deputy.groupePolitique || 
                         (deputy.groupe && deputy.groupe.name) || null,
        political_group_id: deputy.groupe_politique_id || deputy.groupePolitiqueId || 
                           (deputy.groupe && deputy.groupe.id) || null,
        profession: deputy.profession || null,
      };
    } catch (error) {
      console.error(`Error processing deputy: ${error}`);
      return null;
    }
  }).filter(Boolean) as DeputyData[];
};

// Function to synchronize deputies with the database
const syncDeputiesToDatabase = async (
  supabaseClient: any,
  deputies: DeputyData[],
  force = false
): Promise<{ success: boolean; errors: string[]; count: number }> => {
  const errors: string[] = [];
  let successCount = 0;
  
  if (deputies.length === 0) {
    return { success: false, errors: ["No deputies to sync"], count: 0 };
  }
  
  try {
    // If force is true, we'll delete all deputies for the legislature
    if (force) {
      const { legislature } = deputies[0];
      const { error: deleteError } = await supabaseClient
        .from("deputies")
        .delete()
        .eq("legislature", legislature);
      
      if (deleteError) {
        console.error(`Error deleting deputies: ${deleteError.message}`);
        errors.push(`Error deleting deputies: ${deleteError.message}`);
      } else {
        console.log(`Successfully deleted deputies for legislature ${legislature}`);
      }
    }
    
    // First, ensure we have our unique index
    const indexResult = await supabaseClient.rpc(
      'create_unique_index_if_not_exists',
      {
        p_table_name: 'deputies',
        p_index_name: 'deputies_deputy_id_legislature_idx',
        p_column_names: 'deputy_id, legislature'
      }
    );
    
    console.log('Index creation result:', indexResult);
    
    // Process deputies in smaller batches for better stability
    const batchSize = 5;
    
    for (let i = 0; i < deputies.length; i += batchSize) {
      const batch = deputies.slice(i, i + batchSize);
      
      try {
        const batchNum = Math.floor(i/batchSize) + 1;
        const totalBatches = Math.ceil(deputies.length/batchSize);
        console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} deputies)`);
        
        // CRITICAL: Exclude full_name completely to use database DEFAULT value
        const cleanBatch = batch.map(deputy => {
          // Create a new object excluding full_name
          const { 
            deputy_id, 
            first_name, 
            last_name, 
            legislature, 
            political_group, 
            political_group_id, 
            profession 
          } = deputy;
          
          return {
            deputy_id,
            first_name,
            last_name,
            legislature,
            political_group,
            political_group_id,
            profession
          };
        });
        
        // Use upsert to handle duplicates gracefully
        const { data, error } = await supabaseClient
          .from("deputies")
          .upsert(cleanBatch, { 
            onConflict: 'deputy_id,legislature',
            ignoreDuplicates: false 
          });
        
        if (error) {
          console.error(`Error batch inserting deputies: ${error.message}`);
          errors.push(`Error batch inserting deputies: ${error.message}`);
          
          // If batch insert fails, try one by one
          console.log("Trying individual inserts...");
          for (const deputy of batch) {
            try {
              // Create a new object explicitly excluding full_name
              const { 
                deputy_id, 
                first_name, 
                last_name, 
                legislature, 
                political_group, 
                political_group_id, 
                profession 
              } = deputy;
              
              const cleanDeputy = {
                deputy_id,
                first_name,
                last_name,
                legislature,
                political_group,
                political_group_id,
                profession
              };
              
              const { error: singleError } = await supabaseClient
                .from("deputies")
                .upsert([cleanDeputy], { 
                  onConflict: 'deputy_id,legislature',
                  ignoreDuplicates: false 
                });
              
              if (singleError) {
                console.error(`Error for ${deputy.deputy_id}: ${singleError.message}`);
                errors.push(`Error for ${deputy.deputy_id}: ${singleError.message}`);
              } else {
                successCount++;
                console.log(`Successfully inserted deputy ${deputy.deputy_id}`);
              }
            } catch (individualError) {
              console.error(`Exception for ${deputy.deputy_id}: ${individualError instanceof Error ? individualError.message : String(individualError)}`);
              errors.push(`Exception for ${deputy.deputy_id}: ${individualError instanceof Error ? individualError.message : String(individualError)}`);
            }
          }
        } else {
          successCount += batch.length;
          console.log(`Successfully inserted batch ${batchNum}/${totalBatches}`);
        }
      } catch (batchError) {
        console.error(`Batch exception: ${batchError instanceof Error ? batchError.message : String(batchError)}`);
        errors.push(`Batch exception: ${batchError instanceof Error ? batchError.message : String(batchError)}`);
        
        // If batch insert fails, try one by one
        for (const deputy of batch) {
          try {
            // Create a new object excluding full_name
            const { 
              deputy_id, 
              first_name, 
              last_name, 
              legislature, 
              political_group, 
              political_group_id, 
              profession 
            } = deputy;
            
            const cleanDeputy = {
              deputy_id,
              first_name,
              last_name,
              legislature,
              political_group,
              political_group_id,
              profession
            };
            
            const { error: singleError } = await supabaseClient
              .from("deputies")
              .upsert([cleanDeputy], { 
                onConflict: 'deputy_id,legislature',
                ignoreDuplicates: false 
              });
            
            if (singleError) {
              console.error(`Error for ${deputy.deputy_id}: ${singleError.message}`);
              errors.push(`Error for ${deputy.deputy_id}: ${singleError.message}`);
            } else {
              successCount++;
              console.log(`Successfully inserted deputy ${deputy.deputy_id}`);
            }
          } catch (individualError) {
            console.error(`Exception for ${deputy.deputy_id}: ${individualError instanceof Error ? individualError.message : String(individualError)}`);
            errors.push(`Exception for ${deputy.deputy_id}: ${individualError instanceof Error ? individualError.message : String(individualError)}`);
          }
        }
      }
    }
    
    // Update sync status
    await updateSyncStatus(supabaseClient, "success", errors.join("\n"));
    
    return {
      success: successCount > 0,
      errors,
      count: successCount,
    };
  } catch (error) {
    const errorMessage = `Database sync error: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMessage);
    errors.push(errorMessage);
    
    // Update sync status
    await updateSyncStatus(supabaseClient, "error", errors.join("\n"));
    
    return {
      success: false,
      errors,
      count: successCount,
    };
  }
};

// Function to update sync status
const updateSyncStatus = async (
  supabaseClient: any,
  status: string,
  logs: string
) => {
  try {
    const { error } = await supabaseClient
      .from("data_sync")
      .upsert(
        {
          id: "deputies",
          status,
          logs,
          last_sync: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    
    if (error) {
      console.error(`Error updating sync status: ${error.message}`);
    } else {
      console.log(`Successfully updated sync status to ${status}`);
    }
  } catch (error) {
    console.error(`Exception updating sync status: ${error instanceof Error ? error.message : String(error)}`);
  }
};

serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  
  try {
    // Parse the request body
    const { legislature = "17", force = false } = await extractJSON(req);
    
    console.log(`Starting deputies sync for legislature: ${legislature}, force: ${force}`);
    
    // Create Supabase client using env vars
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing environment variables (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)");
      return new Response(
        JSON.stringify({
          success: false,
          message: "Missing environment variables (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)",
          fetch_errors: ["Missing environment variables"],
          sync_errors: []
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 200,
        }
      );
    }
    
    const supabaseClient = {
      from: (table: string) => {
        return {
          select: (columns: string = "*") => {
            return {
              eq: (column: string, value: any) => {
                return fetch(`${supabaseUrl}/rest/v1/${table}?${column}=eq.${value}&select=${columns}`, {
                  headers: {
                    "Content-Type": "application/json",
                    "apikey": supabaseKey,
                    "Authorization": `Bearer ${supabaseKey}`,
                  },
                }).then(res => res.json());
              },
              delete: () => {
                return {
                  eq: (column: string, value: any) => {
                    return fetch(`${supabaseUrl}/rest/v1/${table}?${column}=eq.${value}`, {
                      method: "DELETE",
                      headers: {
                        "Content-Type": "application/json",
                        "apikey": supabaseKey,
                        "Authorization": `Bearer ${supabaseKey}`,
                      },
                    }).then(res => {
                      if (res.ok) return { error: null };
                      return res.json().then(error => ({ error }));
                    });
                  }
                };
              }
            };
          },
          upsert: (data: any, options?: any) => {
            const url = `${supabaseUrl}/rest/v1/${table}`;
            const headers: Record<string, string> = {
              "Content-Type": "application/json",
              "apikey": supabaseKey,
              "Authorization": `Bearer ${supabaseKey}`,
              "Prefer": "return=minimal",
            };
            
            if (options?.onConflict) {
              headers["Prefer"] += `,resolution=merge-duplicates`;
              headers["on-conflict"] = options.onConflict;
            }
            
            return fetch(url, {
              method: "POST",
              headers,
              body: JSON.stringify(data),
            }).then(res => {
              if (res.ok) return { data, error: null };
              return res.json().then(error => ({ error }));
            });
          },
        };
      },
      rpc: (functionName: string, params: any = {}) => {
        const url = `${supabaseUrl}/rest/v1/rpc/${functionName}`;
        
        return fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Profile": "public"
          },
          body: JSON.stringify(params),
        }).then(res => {
          if (res.ok) return res.status === 204 ? { data: null, error: null } : res.json().then(data => ({ data, error: null }));
          return res.json().then(error => ({ error }));
        });
      },
    };
    
    // Update sync status to "in_progress"
    await updateSyncStatus(supabaseClient, "in_progress", "Sync started");
    
    try {
      // Fetch and sync deputies using the enhanced method
      console.log("Fetching deputies data...");
      const { deputies, errors: fetchErrors } = await fetchDeputiesData(legislature);
      
      if (fetchErrors.length > 0) {
        console.warn("Fetch errors:", fetchErrors);
      }
      
      console.log(`Fetched ${deputies.length} deputies`);
      
      if (deputies.length === 0) {
        console.error("No deputies fetched, cannot proceed with sync");
        await updateSyncStatus(supabaseClient, "error", `No deputies fetched: ${fetchErrors.join(", ")}`);
        
        return new Response(
          JSON.stringify({
            success: false,
            message: "No deputies fetched, cannot proceed with sync",
            fetch_errors: fetchErrors,
            sync_errors: [],
            deputies_count: 0
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
            status: 200,
          }
        );
      }
      
      console.log("Syncing deputies to database...");
      const { success, errors: syncErrors, count } = await syncDeputiesToDatabase(
        supabaseClient,
        deputies,
        force
      );
      
      // Prepare response
      const response = {
        success: success && deputies.length > 0,
        message: success ? `Synced ${count} deputies successfully` : "Sync failed",
        deputies_count: count,
        fetch_errors: fetchErrors,
        sync_errors: syncErrors,
      };
      
      // Update sync status
      await updateSyncStatus(
        supabaseClient, 
        success ? "success" : "error", 
        `Fetch errors: ${fetchErrors.join(", ")}\nSync errors: ${syncErrors.join(", ")}`
      );
      
      console.log(`Sync completed with status: ${success ? 'success' : 'failure'}`);
      
      // Return the response with 200 status to avoid client-side error handling issues
      return new Response(JSON.stringify(response), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 200,
      });
    } catch (fetchSyncError) {
      const errorMessage = fetchSyncError instanceof Error ? fetchSyncError.message : String(fetchSyncError);
      console.error(`Error in fetch/sync process: ${errorMessage}`);
      
      await updateSyncStatus(supabaseClient, "error", `Error in fetch/sync process: ${errorMessage}`);
      
      return new Response(
        JSON.stringify({
          success: false,
          message: `Error in fetch/sync process: ${errorMessage}`,
          fetch_errors: [errorMessage],
          sync_errors: [],
          deputies_count: 0
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 200,
        }
      );
    }
  } catch (error) {
    // Handle any uncaught exceptions
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Unhandled exception: ${errorMessage}`);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: `Unhandled exception: ${errorMessage}`,
        fetch_errors: [errorMessage],
        sync_errors: [],
        deputies_count: 0
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 200,
      }
    );
  }
});
