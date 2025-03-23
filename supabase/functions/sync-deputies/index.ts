
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

// Base URL for the Assemblée Nationale API
const apiBaseUrl = "https://www.assemblee-nationale.fr/dyn/opendata";

// Alternative base URL (added as fallback)
const altApiBaseUrl = "https://data.assemblee-nationale.fr/static/openData/repository";

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
  full_name: string | null;
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
  
  for (const url of urls) {
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`Attempting to fetch ${url}, attempt ${i+1}`);
        const response = await fetch(url, options);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response;
      } catch (err) {
        console.log(`Fetch attempt ${i+1} failed for ${url}: ${err.message}`);
        lastError = err;
        if (i < retries - 1) {
          const waitTime = backoff * Math.pow(2, i);
          console.log(`Waiting ${waitTime}ms before retry...`);
          await new Promise(r => setTimeout(r, waitTime));
        }
      }
    }
  }
  
  throw lastError || new Error("All fetch attempts failed");
};

// Main fetch function to get all data with improved error handling
const fetchAllData = async (legislature = "16"): Promise<{
  deputies: DeputyData[];
  errors: string[];
}> => {
  console.log(`Fetching data for legislature ${legislature}`);
  
  const errors: string[] = [];
  const deputies: DeputyData[] = [];
  
  try {
    // 1. Try to fetch all organes with retry and fallback URLs
    const organesUrls = [
      `${apiBaseUrl}/organe/legislature/${legislature}/json`,
      `${altApiBaseUrl}/${legislature}/amo/organes/json/organe_${legislature}.json`
    ];
    
    let organesResponse;
    try {
      organesResponse = await fetchWithRetry(organesUrls);
    } catch (error) {
      console.error(`Failed to fetch organes after multiple attempts: ${error.message}`);
      errors.push(`Error fetching organes: ${error.message}`);
      // Continue with empty political groups
      throw new Error(`Failed to fetch organes: ${error.message}`);
    }
    
    const organesData: OrganismeResponse = await organesResponse.json();
    
    // 2. Get all political groups
    const groupesPolitiques = organesData.export.organes.organe.filter(
      (o) => o.codeType === "GP"
    );
    
    console.log(`Found ${groupesPolitiques.length} political groups`);
    
    // Create a map of political group IDs to names
    const politicalGroupMap = new Map<string, string>();
    groupesPolitiques.forEach((group) => {
      politicalGroupMap.set(group.uid["#text"], group.libelle);
    });
    
    // 3. Fetch all acteurs with retry and fallback URLs
    const acteursUrls = [
      `${apiBaseUrl}/acteur/legislature/${legislature}/json`,
      `${altApiBaseUrl}/${legislature}/amo/acteurs/json/acteurs_${legislature}.json`
    ];
    
    let acteursResponse;
    try {
      acteursResponse = await fetchWithRetry(acteursUrls);
    } catch (error) {
      console.error(`Failed to fetch acteurs after multiple attempts: ${error.message}`);
      errors.push(`Error fetching acteurs: ${error.message}`);
      // Return empty data since we can't continue without deputies
      return { deputies: [], errors };
    }
    
    const acteursData: ActeursResponse = await acteursResponse.json();
    
    // 4. Filter and map acteurs to deputies
    const acteurs = acteursData.export.acteurs.acteur;
    console.log(`Processing ${acteurs.length} acteurs`);
    
    let processedCount = 0;
    
    for (const acteur of acteurs) {
      try {
        // Skip acteurs without mandates
        if (!acteur.mandats) continue;
        
        // Ensure mandats is always an array
        const mandats = Array.isArray(acteur.mandats.mandat)
          ? acteur.mandats.mandat
          : [acteur.mandats.mandat];
        
        // Find the deputy mandate
        const deputyMandat = mandats.find(
          (m) => m.typeOrgane === "ASSEMBLEE" && m.legislature === legislature
        );
        
        if (!deputyMandat) continue;
        
        // Find the political group mandate
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
        
        processedCount++;
        if (processedCount % 50 === 0) {
          console.log(`Processed ${processedCount}/${acteurs.length} acteurs`);
        }
        
        deputies.push({
          deputy_id: deputyId,
          first_name: firstName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`,
          legislature,
          political_group: politicalGroupName,
          political_group_id: politicalGroupId,
          profession,
        });
        
        // Log directly to help with debugging
        if (deputies.length <= 5 || deputies.length % 100 === 0) {
          console.log(`Direct insertion of deputy ${deputyId}: ${firstName} ${lastName}, Group: ${politicalGroupName}`);
        }
      } catch (error) {
        const errorMessage = `Error processing acteur ${acteur.uid["#text"]}: ${error.message}`;
        console.error(errorMessage);
        errors.push(errorMessage);
      }
    }
    
    console.log(`Successfully processed ${deputies.length} deputies`);
    
  } catch (error) {
    const errorMessage = `Error fetching data: ${error.message}`;
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
    
    // Process deputies in batches of 25 (reduced from 50 for stability)
    const batchSize = 25;
    for (let i = 0; i < deputies.length; i += batchSize) {
      const batch = deputies.slice(i, i + batchSize);
      
      try {
        console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(deputies.length/batchSize)}`);
        
        // Use upsert to handle duplicates gracefully
        const { data, error } = await supabaseClient
          .from("deputies")
          .upsert(batch, { 
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
              const { error: singleError } = await supabaseClient
                .from("deputies")
                .upsert([deputy], { 
                  onConflict: 'deputy_id,legislature',
                  ignoreDuplicates: false 
                });
              
              if (singleError) {
                console.error(`Error for ${deputy.deputy_id}: ${singleError.message}`);
                errors.push(`Error for ${deputy.deputy_id}: ${singleError.message}`);
              } else {
                successCount++;
              }
            } catch (individualError) {
              console.error(`Exception for ${deputy.deputy_id}: ${individualError.message}`);
              errors.push(`Exception for ${deputy.deputy_id}: ${individualError.message}`);
            }
          }
        } else {
          successCount += batch.length;
        }
      } catch (batchError) {
        console.error(`Batch exception: ${batchError.message}`);
        errors.push(`Batch exception: ${batchError.message}`);
        
        // If batch insert fails, try one by one
        for (const deputy of batch) {
          try {
            const { error: singleError } = await supabaseClient
              .from("deputies")
              .upsert([deputy], { 
                onConflict: 'deputy_id,legislature',
                ignoreDuplicates: false 
              });
            
            if (singleError) {
              console.error(`Error for ${deputy.deputy_id}: ${singleError.message}`);
              errors.push(`Error for ${deputy.deputy_id}: ${singleError.message}`);
            } else {
              successCount++;
            }
          } catch (individualError) {
            console.error(`Exception for ${deputy.deputy_id}: ${individualError.message}`);
            errors.push(`Exception for ${deputy.deputy_id}: ${individualError.message}`);
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
    const errorMessage = `Database sync error: ${error.message}`;
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
    console.error(`Exception updating sync status: ${error.message}`);
  }
};

serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  
  try {
    // Parse the request body
    const { legislature = "17", force = false } = await extractJSON(req);
    
    console.log(`Starting deputies sync for legislature: ${legislature} force: ${force}`);
    
    // Create Supabase client using env vars
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Missing environment variables (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 500,
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
    
    // Fetch and sync deputies
    const { deputies, errors: fetchErrors } = await fetchAllData(legislature);
    const { success, errors: syncErrors, count } = await syncDeputiesToDatabase(
      supabaseClient,
      deputies,
      force
    );
    
    // Prepare response
    const response = {
      success,
      message: success ? `Synced ${count} deputies successfully` : "Sync failed",
      deputies_count: count,
      fetch_errors: fetchErrors,
      sync_errors: syncErrors,
    };
    
    // Return the response
    return new Response(JSON.stringify(response), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      status: success ? 200 : 500,
    });
  } catch (error) {
    // Handle any uncaught exceptions
    console.error(`Unhandled exception: ${error.message}`);
    return new Response(
      JSON.stringify({
        success: false,
        message: `Unhandled exception: ${error.message}`,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 500,
      }
    );
  }
});
