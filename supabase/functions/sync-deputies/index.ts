import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced logging function
const logDetailed = (message: string, details?: any) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    message,
    details: details || {}
  }));
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

// Focus on NosDeputes.fr and AN open data API primarily
const primaryUrls = [
  "https://www.nosdeputes.fr/deputes/enmandat/json",
  "https://www.nosdeputes.fr/deputes/tous/json",
  "https://www.assemblee-nationale.fr/dyn/opendata/list-deputes",
  "https://www.assemblee-nationale.fr/dyn/opendata/deputes.json",
];

// Legacy URLs for fallback
const alternativeUrls = [
  "https://data.assemblee-nationale.fr/api/v2/deputies?legislature=17",
  "https://data.assemblee-nationale.fr/api/v2/deputies/list?legislature=17",
  "https://data.assemblee-nationale.fr/api/v2/legislature/17/deputies",
  "https://data.assemblee-nationale.fr/export/deputes.csv",
  "https://data.assemblee-nationale.fr/api/v2/deputes-legislatures-mandats",
  "https://data.assemblee-nationale.fr/api/v2/deputes-actifs",
  "https://www2.assemblee-nationale.fr/deputes/liste/alphabetique",
  "https://www2.assemblee-nationale.fr/deputes/fiche/liste_alphabetique/json",
  "https://www2.assemblee-nationale.fr/static/data/deputes_json.json"
];

// Define interfaces for API responses
interface DeputyData {
  deputy_id: string;
  first_name: string;
  last_name: string;
  legislature: string;
  political_group: string | null;
  political_group_id: string | null;
  profession: string | null;
}

// Main function to fetch deputies data from multiple sources
const fetchDeputiesData = async (legislature: string): Promise<{
  deputies: DeputyData[];
  errors: string[];
}> => {
  logDetailed(`Starting deputies data fetch for legislature ${legislature}`);
  
  const errors: string[] = [];
  let deputies: DeputyData[] = [];
  
  // Enhanced source URLs with more specific endpoints
  const sourceUrls = [
    "https://www.assemblee-nationale.fr/dyn/opendata/deputes.json",
    "https://data.assemblee-nationale.fr/api/v2/deputies/list?legislature=17",
    "https://data.assemblee-nationale.fr/api/v2/deputies?legislature=17",
    "https://www.nosdeputes.fr/deputes/enmandat/json",
  ];

  for (const url of sourceUrls) {
    try {
      logDetailed(`Attempting to fetch from URL: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AN-Vote-Analyzer/1.1'
        }
      });

      if (!response.ok) {
        logDetailed(`HTTP Error for ${url}`, { 
          status: response.status, 
          statusText: response.statusText 
        });
        errors.push(`Failed to fetch from ${url}: HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      
      // More flexible data parsing
      const parsedDeputies = sourceUrls.includes("https://www.nosdeputes.fr/deputes/enmandat/json") 
        ? parseNosDeputesData(data)
        : parseAssembleeNationaleData(data);

      if (parsedDeputies.length > 0) {
        logDetailed(`Successfully parsed ${parsedDeputies.length} deputies from ${url}`);
        deputies = parsedDeputies;
        break;
      }
    } catch (error) {
      logDetailed(`Error fetching from ${url}`, { 
        errorMessage: error instanceof Error ? error.message : String(error) 
      });
      errors.push(`Error fetching from ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Helper function to parse NosDéputés.fr data
  function parseNosDeputesData(data: any): DeputyData[] {
    try {
      if (data.deputes && Array.isArray(data.deputes)) {
        return data.deputes.map((deputy: any) => ({
          deputy_id: deputy.id_an ? `PA${deputy.id_an}` : `ND${deputy.slug || ''}`,
          first_name: deputy.prenom || '',
          last_name: deputy.nom_de_famille || deputy.nom || '',
          legislature,
          political_group: deputy.groupe_sigle || null,
          political_group_id: deputy.groupe_sigle || null,
          profession: deputy.profession || null
        })).filter(Boolean);
      }
      return [];
    } catch (error) {
      logDetailed('Error parsing NosDéputés data', { error: String(error) });
      return [];
    }
  }

  // Helper function to parse Assemblée Nationale data
  function parseAssembleeNationaleData(data: any): DeputyData[] {
    try {
      let deputiesArray: any[] = [];
      
      // Handle different possible data structures
      if (data.deputes && Array.isArray(data.deputes)) {
        deputiesArray = data.deputes;
      } else if (data.deputes && typeof data.deputes === 'object') {
        deputiesArray = Object.values(data.deputes);
      }

      return deputiesArray.map((deputy: any) => ({
        deputy_id: deputy.uid?.startsWith('PA') ? deputy.uid : `PA${deputy.uid || deputy.id || ''}`,
        first_name: deputy.prenom || '',
        last_name: deputy.nom || '',
        legislature,
        political_group: deputy.groupe?.libelle || deputy.groupe || null,
        political_group_id: deputy.groupe?.code || null,
        profession: deputy.profession || null
      })).filter(Boolean);
    } catch (error) {
      logDetailed('Error parsing Assemblée Nationale data', { error: String(error) });
      return [];
    }
  }

  logDetailed('Deputies data fetch complete', { 
    deputiesCount: deputies.length, 
    errorCount: errors.length 
  });

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
    
    // Process deputies in smaller batches for better stability
    const batchSize = 5;
    
    for (let i = 0; i < deputies.length; i += batchSize) {
      const batch = deputies.slice(i, i + batchSize);
      const batchNum = Math.floor(i/batchSize) + 1;
      const totalBatches = Math.ceil(deputies.length/batchSize);
      
      try {
        console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} deputies)`);
        
        // CRITICAL: Do NOT include full_name since it's a generated column
        const cleanBatch = batch.map(({ deputy_id, first_name, last_name, legislature, political_group, political_group_id, profession }) => ({
          deputy_id,
          first_name,
          last_name,
          legislature,
          political_group,
          political_group_id,
          profession
        }));
        
        // Use upsert with explicit on-conflict handling
        const { error } = await supabaseClient
          .from("deputies")
          .upsert(cleanBatch, { 
            onConflict: 'deputy_id,legislature',
            ignoreDuplicates: false
          });
        
        if (error) {
          console.error(`Error batch inserting deputies: ${error.message}`);
          errors.push(`Error batch inserting deputies: ${error.message}`);
          
          // Try one by one
          for (const deputy of batch) {
            try {
              const { deputy_id, first_name, last_name, legislature, political_group, political_group_id, profession } = deputy;
              
              const { error: singleError } = await supabaseClient
                .from("deputies")
                .upsert([{
                  deputy_id,
                  first_name,
                  last_name,
                  legislature,
                  political_group,
                  political_group_id,
                  profession
                }], { 
                  onConflict: 'deputy_id,legislature'
                });
              
              if (singleError) {
                console.error(`Error for ${deputy.deputy_id}: ${singleError.message}`);
                errors.push(`Error for ${deputy.deputy_id}: ${singleError.message}`);
              } else {
                successCount++;
              }
            } catch (e) {
              errors.push(`Exception for ${deputy.deputy_id}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        } else {
          successCount += batch.length;
          console.log(`Successfully inserted batch ${batchNum}/${totalBatches}`);
        }
      } catch (batchError) {
        console.error(`Batch exception: ${batchError instanceof Error ? batchError.message : String(batchError)}`);
        errors.push(`Batch exception: ${batchError instanceof Error ? batchError.message : String(batchError)}`);
        
        // Try one by one if batch failed
        for (const deputy of batch) {
          try {
            const { deputy_id, first_name, last_name, legislature, political_group, political_group_id, profession } = deputy;
            
            const { error: singleError } = await supabaseClient
              .from("deputies")
              .upsert([{
                deputy_id,
                first_name,
                last_name,
                legislature,
                political_group,
                political_group_id,
                profession
              }], { 
                onConflict: 'deputy_id,legislature'
              });
            
            if (singleError) {
              errors.push(`Error for ${deputy.deputy_id}: ${singleError.message}`);
            } else {
              successCount++;
            }
          } catch (e) {
            errors.push(`Exception for ${deputy.deputy_id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
    }
    
    return {
      success: successCount > 0,
      errors,
      count: successCount,
    };
  } catch (error) {
    const errorMessage = `Database sync error: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMessage);
    errors.push(errorMessage);
    
    return {
      success: false,
      errors,
      count: successCount,
    };
  }
};

// Main function to handle requests
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
          message: "Missing environment variables",
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
    
    // Create a simple Supabase client for database operations
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
      }
    };
    
    try {
      // Fetch and sync deputies
      console.log("Fetching deputies data...");
      const { deputies, errors: fetchErrors } = await fetchDeputiesData(legislature);
      
      console.log(`Fetched ${deputies.length} deputies with ${fetchErrors.length} errors`);
      
      if (deputies.length === 0) {
        console.error("No deputies fetched, cannot proceed with sync");
        
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
      
      console.log(`Sync completed with status: ${success ? 'success' : 'failure'}, count: ${count}`);
      
      // Return the response
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
