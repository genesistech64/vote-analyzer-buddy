
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

// Define direct URLs that are known to work for the Assemblée Nationale API
// Legislature 16 URLs
const apiBaseUrlLeg16 = "https://data.assemblee-nationale.fr/static/openData/repository/16/amo";
const acteurUrlsLeg16 = [
  "https://data.assemblee-nationale.fr/static/openData/repository/16/amo/acteurs/JSON/acteurs.json",
  "https://data.assemblee-nationale.fr/static/openData/repository/16/amo/acteurs/JSON/tous_acteurs.json"
];
const organesUrlsLeg16 = [
  "https://data.assemblee-nationale.fr/static/openData/repository/16/amo/organes/JSON/organes.json",
  "https://data.assemblee-nationale.fr/static/openData/repository/16/amo/organes/JSON/organismes.json"
];

// Legislature 17 URLs
const apiBaseUrlLeg17 = "https://data.assemblee-nationale.fr/static/openData/repository/17/amo";
const acteurUrlsLeg17 = [
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/acteurs/JSON/acteurs.json",
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/acteurs/JSON/tous_acteurs.json"
];
const organesUrlsLeg17 = [
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/organes/JSON/organes.json",
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/organes/JSON/organismes.json",
  // Add more potential URLs that might work
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/organes_groupes/JSON/organes.json",
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/organes_groupes/JSON/organismes.json"
];

// Define interfaces for API responses
interface ActeursResponse {
  export: {
    acteurs: {
      acteur: Acteur[];
    };
  };
}

interface Acteur {
  uid: {
    "#text": string;
  };
  etatCivil: {
    ident: {
      civ: string;
      prenom: string;
      nom: string;
      alpha: string;
    };
    infoNaissance?: {
      dateNais: string;
      villeNais: string;
      depNais: string;
      paysNais: string;
    };
    profession?: string;
  };
  mandats?: {
    mandat: Mandat[] | Mandat;
  };
  profession?: {
    libelleCourant: string;
  };
}

interface Mandat {
  uid: {
    "#text": string;
  };
  election?: {
    lieu?: {
      departement?: string;
    };
  };
  typeOrgane?: string;
  legislature?: string;
  dateFin?: string;
  infosQualite?: {
    codeQualite?: string;
  };
  organisme?: {
    uid?: string;
    libelle?: string;
  };
  suppleant?: {
    uid?: string;
  };
}

interface OrganismeResponse {
  export: {
    organes: {
      organe: Organe[];
    };
  };
}

interface Organe {
  uid: {
    "#text": string;
  };
  codeType: string;
  libelle: string;
  libelleAbrege?: string;
  libelleEdition?: string;
  viMoDe: {
    dateDebut: string;
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

interface OrganesPolitiquesResponse {
  export: {
    organes: {
      organe: Organe[];
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

// Improved fetchWithRetry function with multiple URLs and retry logic
const fetchWithRetry = async (
  urls: string[],
  options = {},
  retries = 3,
  backoff = 300
): Promise<Response> => {
  let lastError: Error | null = null;
  let attempts = 0;
  
  for (const url of urls) {
    for (let i = 0; i < retries; i++) {
      attempts++;
      try {
        console.log(`Attempting to fetch ${url}, attempt ${i+1}/${retries}`);
        const response = await fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            'Accept': 'application/json',
          }
        });
        
        if (!response.ok) {
          const status = response.status;
          throw new Error(`HTTP error! status: ${status}, URL: ${url}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.warn(`Warning: Response is not JSON (${contentType}) for ${url}`);
        }
        
        console.log(`Successfully fetched ${url}`);
        return response;
      } catch (err) {
        console.log(`Fetch attempt ${i+1} failed for ${url}: ${err.message}`);
        lastError = err instanceof Error ? err : new Error(String(err));
        if (i < retries - 1) {
          const waitTime = backoff * Math.pow(2, i);
          console.log(`Waiting ${waitTime}ms before retry...`);
          await new Promise(r => setTimeout(r, waitTime));
        }
      }
    }
  }
  
  throw new Error(`All fetch attempts (${attempts}) failed. Last error: ${lastError?.message || 'Unknown error'}`);
};

// Direct fetch function for hardcoded URLs
const directFetch = async (urls: string[]): Promise<Response> => {
  for (const url of urls) {
    try {
      console.log(`Trying direct fetch to: ${url}`);
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (response.ok) {
        console.log(`Direct fetch successful for ${url}`);
        return response;
      }
      
      console.log(`Direct fetch failed for ${url}: HTTP ${response.status}`);
    } catch (error) {
      console.log(`Error during direct fetch to ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  throw new Error('All direct fetch attempts failed');
};

// Updated fetchAllData function with correct API URLs for each legislature and multiple fallbacks
const fetchAllData = async (legislature: string): Promise<{
  deputies: DeputyData[];
  errors: string[];
}> => {
  console.log(`Fetching data for legislature ${legislature}`);
  
  const errors: string[] = [];
  const deputies: DeputyData[] = [];
  
  try {
    // Determine base URL and direct URLs based on legislature
    const baseApiUrl = legislature === "16" ? apiBaseUrlLeg16 : apiBaseUrlLeg17;
    const directOrganeUrls = legislature === "16" ? organesUrlsLeg16 : organesUrlsLeg17;
    const directActeurUrls = legislature === "16" ? acteurUrlsLeg16 : acteurUrlsLeg17;
    
    // 1. Try multiple approaches to fetch organes data
    console.log("Attempting to fetch political groups data (organes)...");
    let organesData: OrganismeResponse | null = null;
    
    try {
      // First try: Direct hardcoded URLs that are known to work
      const organesResponse = await directFetch(directOrganeUrls);
      organesData = await organesResponse.json();
      console.log("Successfully fetched organes data via direct URLs");
    } catch (directError) {
      console.error(`Failed direct fetch for organes: ${directError instanceof Error ? directError.message : String(directError)}`);
      errors.push(`Direct fetch error: ${directError instanceof Error ? directError.message : String(directError)}`);
      
      try {
        // Second try: Dynamic URL construction with fallbacks
        const organesUrls = [
          `${baseApiUrl}/organes/json/organes.json`,
          `${baseApiUrl}/organes/json/organismes.json`,
          `${baseApiUrl}/organes/json/organe.json`,
          `${baseApiUrl}/organes/JSON/organes.json`,
          `${baseApiUrl}/organes/JSON/organismes.json`,
          `${baseApiUrl}/organes/json/organe_${legislature}.json`,
          `${baseApiUrl}/organes/json/organismes_${legislature}.json`,
          `${baseApiUrl}/organes/JSON/organe_${legislature}.json`,
          `${baseApiUrl}/organes/JSON/organismes_${legislature}.json`,
          // Add more potential URL patterns
          `${baseApiUrl}/organes_groupes/json/organes.json`,
          `${baseApiUrl}/organes_groupes/json/organismes.json`,
          `${baseApiUrl}/organes_groupes/JSON/organes.json`,
          `${baseApiUrl}/organes_groupes/JSON/organismes.json`,
          // Try going back one level up in the URL hierarchy
          `https://data.assemblee-nationale.fr/static/openData/repository/${legislature}/organes/JSON/organes.json`,
          `https://data.assemblee-nationale.fr/static/openData/repository/${legislature}/organes/JSON/organismes.json`
        ];
        
        const organesResponse = await fetchWithRetry(organesUrls);
        organesData = await organesResponse.json();
        console.log("Successfully fetched organes data via fallback URLs");
      } catch (fallbackError) {
        console.error(`Failed fallback fetch for organes: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        errors.push(`Fallback fetch error: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        
        // ATTEMPT TO CONTINUE WITHOUT POLITICAL GROUP INFO
        console.log("WARNING: Continuing without political group data - deputies will have null political group values");
      }
    }
    
    // Create a map of political group IDs to names (if we have the data)
    const politicalGroupMap = new Map<string, string>();
    if (organesData) {
      const groupesPolitiques = organesData.export.organes.organe.filter(
        (o) => o.codeType === "GP"
      );
      
      console.log(`Found ${groupesPolitiques.length} political groups`);
      
      groupesPolitiques.forEach((group) => {
        politicalGroupMap.set(group.uid["#text"], group.libelle);
      });
    } else {
      console.warn("No political group data available - proceeding with deputies only");
    }
    
    // 3. Try multiple approaches to fetch acteurs data
    console.log("Attempting to fetch deputies data (acteurs)...");
    let acteursData: ActeursResponse | null = null;
    
    try {
      // First try: Direct hardcoded URLs that are known to work
      const acteursResponse = await directFetch(directActeurUrls);
      acteursData = await acteursResponse.json();
      console.log("Successfully fetched acteurs data via direct URLs");
    } catch (directError) {
      console.error(`Failed direct fetch for acteurs: ${directError instanceof Error ? directError.message : String(directError)}`);
      errors.push(`Direct fetch error for acteurs: ${directError instanceof Error ? directError.message : String(directError)}`);
      
      try {
        // Second try: Dynamic URL construction with fallbacks
        const acteursUrls = [
          `${baseApiUrl}/acteurs/json/acteurs.json`,
          `${baseApiUrl}/acteurs/json/tous_acteurs.json`,
          `${baseApiUrl}/acteurs/JSON/acteurs.json`,
          `${baseApiUrl}/acteurs/JSON/tous_acteurs.json`,
          `${baseApiUrl}/acteurs/json/acteurs_${legislature}.json`,
          `${baseApiUrl}/acteurs/json/tous_acteurs_${legislature}.json`,
          `${baseApiUrl}/acteurs/JSON/acteurs_${legislature}.json`,
          `${baseApiUrl}/acteurs/JSON/tous_acteurs_${legislature}.json`,
          // Try going back one level up in the URL hierarchy
          `https://data.assemblee-nationale.fr/static/openData/repository/${legislature}/acteurs/JSON/acteurs.json`,
          `https://data.assemblee-nationale.fr/static/openData/repository/${legislature}/acteurs/JSON/tous_acteurs.json`
        ];
        
        const acteursResponse = await fetchWithRetry(acteursUrls);
        acteursData = await acteursResponse.json();
        console.log("Successfully fetched acteurs data via fallback URLs");
      } catch (fallbackError) {
        console.error(`Failed fallback fetch for acteurs: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        errors.push(`Fallback fetch error for acteurs: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        throw new Error(`Could not fetch deputies data after multiple attempts`);
      }
    }
    
    if (!acteursData) {
      throw new Error("Failed to retrieve deputies data");
    }
    
    // 4. Filter and map acteurs to deputies
    const acteurs = acteursData.export.acteurs.acteur;
    console.log(`Processing ${acteurs.length} acteurs`);
    
    if (!acteurs || !Array.isArray(acteurs) || acteurs.length === 0) {
      throw new Error("No actors found in the data");
    }
    
    let processedCount = 0;
    let deputiesCount = 0;
    
    for (const acteur of acteurs) {
      try {
        processedCount++;
        
        // Skip acteurs without mandates
        if (!acteur.mandats) {
          if (processedCount % 100 === 0) {
            console.log(`Processed ${processedCount}/${acteurs.length} acteurs, found ${deputiesCount} deputies`);
          }
          continue;
        }
        
        // Ensure mandats is always an array
        const mandats = Array.isArray(acteur.mandats.mandat)
          ? acteur.mandats.mandat
          : [acteur.mandats.mandat];
        
        // Find the deputy mandate for this legislature
        const deputyMandat = mandats.find(
          (m) => m.typeOrgane === "ASSEMBLEE" && m.legislature === legislature
        );
        
        if (!deputyMandat) {
          if (processedCount % 100 === 0) {
            console.log(`Processed ${processedCount}/${acteurs.length} acteurs, found ${deputiesCount} deputies`);
          }
          continue;
        }
        
        // Find the political group mandate (active one without end date)
        const politicalGroupMandat = mandats.find(
          (m) => m.typeOrgane === "GP" && !m.dateFin
        );
        
        const deputyId = acteur.uid["#text"];
        const firstName = acteur.etatCivil.ident.prenom;
        const lastName = acteur.etatCivil.ident.nom;
        const profession = acteur.profession?.libelleCourant || acteur.etatCivil.profession || null;
        
        let politicalGroupId = null;
        let politicalGroupName = null;
        
        if (politicalGroupMandat && politicalGroupMandat.organisme && politicalGroupMandat.organisme.uid) {
          politicalGroupId = politicalGroupMandat.organisme.uid;
          politicalGroupName = politicalGroupMap.get(politicalGroupId) || politicalGroupMandat.organisme.libelle || null;
        }
        
        deputies.push({
          deputy_id: deputyId,
          first_name: firstName,
          last_name: lastName,
          legislature,
          political_group: politicalGroupName,
          political_group_id: politicalGroupId,
          profession,
        });
        
        deputiesCount++;
        
        // Log progress periodically
        if (deputiesCount <= 5 || deputiesCount % 50 === 0) {
          console.log(`Added deputy ${deputyId}: ${firstName} ${lastName}, Group: ${politicalGroupName || 'None'}`);
        }
        
        if (processedCount % 100 === 0) {
          console.log(`Processed ${processedCount}/${acteurs.length} acteurs, found ${deputiesCount} deputies`);
        }
      } catch (error) {
        const errorMessage = `Error processing acteur ${acteur.uid["#text"]}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMessage);
        errors.push(errorMessage);
      }
    }
    
    console.log(`Successfully processed ${deputies.length} deputies from ${acteurs.length} acteurs`);
    
    if (deputies.length === 0) {
      throw new Error(`No deputies found for legislature ${legislature} after processing ${acteurs.length} acteurs`);
    }
    
  } catch (error) {
    const errorMessage = `Error fetching data: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMessage);
    errors.push(errorMessage);
  }
  
  return { deputies, errors };
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
        
        // CRITICAL FIX: Do not include full_name in the data sent to the database
        // since it's generated by a trigger or has a DEFAULT constraint
        const cleanBatch = batch.map(deputy => {
          // Make sure we don't include the full_name field at all
          const { full_name, ...cleanDeputy } = deputy;
          return cleanDeputy;
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
              // CRITICAL FIX: Ensure we don't include full_name in individual inserts either
              const { full_name, ...deputyData } = deputy;
              
              const { error: singleError } = await supabaseClient
                .from("deputies")
                .upsert([deputyData], { 
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
            // CRITICAL FIX: Ensure we don't include full_name for individual inserts either
            const { full_name, ...deputyData } = deputy;
            
            const { error: singleError } = await supabaseClient
              .from("deputies")
              .upsert([deputyData], { 
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
      // Fetch and sync deputies
      console.log("Fetching deputies data...");
      const { deputies, errors: fetchErrors } = await fetchAllData(legislature);
      
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
