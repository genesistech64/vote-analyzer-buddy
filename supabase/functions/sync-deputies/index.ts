
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
  console.log(`Fetching deputies data for legislature ${legislature}`);
  
  const errors: string[] = [];
  let deputies: DeputyData[] = [];
  let foundValidData = false;
  
  // Try NosDéputes.fr first - most reliable source
  for (const url of primaryUrls) {
    if (foundValidData) break;
    
    try {
      console.log(`Attempting to fetch from: ${url}`);
      
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
      
      const data = await response.json();
      
      if (!data) {
        console.log(`No data returned from ${url}`);
        continue;
      }
      
      console.log(`Successfully fetched data from ${url}, analyzing structure...`);
      
      // Handle nosdeputes.fr format
      if (data.deputes && Array.isArray(data.deputes)) {
        deputies = data.deputes.map((deputy: any) => {
          const slugId = deputy.slug || '';
          const deputyId = deputy.id_an ? 
            (deputy.id_an.startsWith('PA') ? deputy.id_an : `PA${deputy.id_an}`) : 
            `ND${slugId}`;
          
          return {
            deputy_id: deputyId,
            first_name: deputy.prenom || '',
            last_name: deputy.nom_de_famille || deputy.nom || '',
            legislature,
            political_group: deputy.groupe_sigle || null,
            political_group_id: deputy.groupe_sigle || null,
            profession: deputy.profession || null
          };
        }).filter(Boolean);
        
        console.log(`Successfully processed ${deputies.length} deputies from nosdeputes.fr`);
        foundValidData = true;
        break;
      }
      
      // Handle assemblee-nationale.fr format
      if (data.deputes && typeof data.deputes === 'object') {
        const deputesArray = Array.isArray(data.deputes) ? 
          data.deputes : 
          Object.values(data.deputes);
        
        deputies = deputesArray.map((deputy: any) => {
          const rawId = deputy.uid || deputy.matricule || deputy.id || '';
          const deputyId = rawId.startsWith('PA') ? rawId : `PA${rawId}`;
          
          return {
            deputy_id: deputyId,
            first_name: deputy.prenom || '',
            last_name: deputy.nom || '',
            legislature,
            political_group: deputy.groupe?.libelle || deputy.groupe || null,
            political_group_id: deputy.groupe?.code || null,
            profession: deputy.profession || null
          };
        }).filter(Boolean);
        
        console.log(`Successfully processed ${deputies.length} deputies from assemblee-nationale.fr`);
        foundValidData = true;
        break;
      }
    } catch (error) {
      const errorMessage = `Error fetching from ${url}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMessage);
      errors.push(errorMessage);
    }
  }
  
  // If primary sources failed, try fallback URLs
  if (!foundValidData) {
    for (const url of alternativeUrls) {
      if (foundValidData) break;
      
      try {
        console.log(`Attempting to fetch from fallback: ${url}`);
        
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'AN-Vote-Analyzer/1.0'
          }
        });
        
        if (!response.ok) {
          console.log(`HTTP error for ${url}: ${response.status}`);
          continue;
        }
        
        // Try to parse as JSON
        let data;
        try {
          data = await response.json();
        } catch (error) {
          console.log(`Response is not JSON from ${url}`);
          
          // Try to parse as HTML
          const html = await response.text();
          
          // Basic extraction of deputies from HTML, if the URL was a web page
          if (html.includes('<table') && html.includes('depute')) {
            console.log(`Found HTML with potential deputy data, trying to extract...`);
            
            // Very basic extraction - in a real scenario, you would use a proper HTML parser
            const matches = html.match(/PA\d+/g);
            if (matches && matches.length > 0) {
              console.log(`Found ${matches.length} potential deputy IDs in HTML`);
              
              // Create minimal deputy objects from the IDs
              deputies = [...new Set(matches)].map(id => ({
                deputy_id: id,
                first_name: 'Député',
                last_name: id.replace('PA', ''),
                legislature,
                political_group: null,
                political_group_id: null,
                profession: null
              }));
              
              foundValidData = true;
              break;
            }
          }
          
          continue;
        }
        
        if (!data) {
          console.log(`No data returned from ${url}`);
          continue;
        }
        
        // Try various data structures
        if (data.deputes && Array.isArray(data.deputes)) {
          deputies = data.deputes.map((deputy: any) => ({
            deputy_id: deputy.id_an?.startsWith('PA') ? deputy.id_an : `PA${deputy.id_an || deputy.id || ''}`,
            first_name: deputy.prenom || '',
            last_name: deputy.nom || deputy.nom_de_famille || '',
            legislature,
            political_group: deputy.groupe_politique || null,
            political_group_id: deputy.groupe_politique_id || null,
            profession: deputy.profession || null
          })).filter(Boolean);
          
          console.log(`Successfully processed ${deputies.length} deputies from alternative source`);
          foundValidData = true;
          break;
        }
        
        // More formats could be handled here
        
      } catch (error) {
        const errorMessage = `Error fetching from ${url}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMessage);
        errors.push(errorMessage);
      }
    }
  }
  
  // Last resort: try to scrape deputies directly from the Assemblée
  if (!foundValidData) {
    try {
      console.log("Attempting direct HTML scraping from Assemblée Nationale website...");
      
      const response = await fetch("https://www2.assemblee-nationale.fr/deputes/liste/alphabetique", {
        headers: {
          'User-Agent': 'AN-Vote-Analyzer/1.0'
        }
      });
      
      if (response.ok) {
        const html = await response.text();
        
        // Extract deputy IDs from the HTML
        const regex = /deputes\/fiche\/OMC_PA(\d+)/g;
        let match;
        const ids = new Set<string>();
        
        while ((match = regex.exec(html)) !== null) {
          if (match[1]) {
            ids.add(`PA${match[1]}`);
          }
        }
        
        if (ids.size > 0) {
          console.log(`Found ${ids.size} deputies by scraping the website`);
          
          // Create basic deputy objects
          deputies = Array.from(ids).map(id => ({
            deputy_id: id,
            first_name: 'Député', // Placeholder
            last_name: id.replace('PA', ''), // Use ID as placeholder
            legislature,
            political_group: null,
            political_group_id: null,
            profession: null
          }));
          
          foundValidData = true;
        }
      }
    } catch (error) {
      console.error("Error scraping website:", error);
    }
  }
  
  // Final check
  if (deputies.length === 0) {
    errors.push("Could not find valid deputies data in any of the attempted sources");
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
    
    // Process deputies in smaller batches for better stability
    const batchSize = 5;
    
    for (let i = 0; i < deputies.length; i += batchSize) {
      const batch = deputies.slice(i, i + batchSize);
      const batchNum = Math.floor(i/batchSize) + 1;
      const totalBatches = Math.ceil(deputies.length/batchSize);
      
      try {
        console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} deputies)`);
        
        // CRITICAL: Explicitly create objects without full_name field
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
