
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

// Primary data sources - ordered by priority with more fallbacks
const dataSources = [
  "https://www.nosdeputes.fr/deputes/enmandat/json",
  "https://www.nosdeputes.fr/deputes/tous/json",
  "https://www.assemblee-nationale.fr/dyn/opendata/deputes.json",
  "https://data.assemblee-nationale.fr/api/v1/deputies/active",
  // Add more fallback sources
  "https://www.nosdeputes.fr/17/json",
  "https://www.nosdeputes.fr/16/json",
  "https://www.assemblee-nationale.fr/16/json/deputes.json",
  "https://www.assemblee-nationale.fr/14/xml/deputes.xml",
  // Hardcoded data URL from an archive if all else fails
  "https://raw.githubusercontent.com/regardscitoyens/nosdeputes.fr/master/batch/depute/json/tous.json"
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
  
  // Try each data source in order until we get valid data
  for (const url of dataSources) {
    try {
      logDetailed(`Attempting to fetch from URL: ${url}`);
      
      // Add timeout to avoid waiting forever
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout
      
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'AN-Vote-Analyzer/1.3 (deputy-sync-function)'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
  
        if (!response.ok) {
          logDetailed(`HTTP Error for ${url}`, { 
            status: response.status, 
            statusText: response.statusText 
          });
          errors.push(`Failed to fetch from ${url}: HTTP ${response.status}`);
          continue;
        }
  
        // Try to parse the response
        let data;
        let contentType = response.headers.get('content-type') || '';
        
        try {
          const text = await response.text();
          logDetailed(`Received data from ${url}`, { size: text.length });
          
          // Try to parse as JSON first
          if (contentType.includes('application/json') || contentType.includes('text/plain') || url.includes('json')) {
            try {
              data = JSON.parse(text);
              logDetailed(`Successfully parsed JSON data from ${url}`, { dataSize: text.length });
            } catch (parseError) {
              // If JSON parsing fails, check if it's XML
              if (contentType.includes('application/xml') || contentType.includes('text/xml') || url.includes('xml')) {
                logDetailed(`Attempting to parse as XML from ${url}`);
                // Simple XML parsing for deputés
                const deputyMatches = text.match(/<depute>([\s\S]*?)<\/depute>/g);
                if (deputyMatches && deputyMatches.length > 0) {
                  // Convert XML to a simple JSON structure
                  const xmlDeputies = deputyMatches.map(match => {
                    const idMatch = match.match(/<uid>(.*?)<\/uid>/);
                    const prenomMatch = match.match(/<prenom>(.*?)<\/prenom>/);
                    const nomMatch = match.match(/<nom>(.*?)<\/nom>/);
                    
                    return {
                      uid: idMatch ? idMatch[1] : '',
                      prenom: prenomMatch ? prenomMatch[1] : '',
                      nom: nomMatch ? nomMatch[1] : ''
                    };
                  });
                  
                  data = { deputes: xmlDeputies };
                  logDetailed(`Parsed ${xmlDeputies.length} deputies from XML`, { source: url });
                } else {
                  throw new Error("Failed to extract deputy data from XML");
                }
              } else {
                throw parseError;
              }
            }
          } else if (url.includes('github')) {
            // Special handling for GitHub raw files
            try {
              data = JSON.parse(text);
              logDetailed(`Successfully parsed GitHub data from ${url}`, { dataSize: text.length });
            } catch (ghError) {
              throw new Error(`GitHub data parsing error: ${String(ghError)}`);
            }
          } else {
            throw new Error(`Unsupported content type: ${contentType}`);
          }
        } catch (parseError) {
          logDetailed(`Error parsing data from ${url}`, { error: String(parseError) });
          errors.push(`Error parsing data from ${url}: ${String(parseError)}`);
          continue;
        }
        
        // Parse data based on the URL/format
        let parsedDeputies: DeputyData[] = [];
        
        if (url.includes('nosdeputes.fr') || url.includes('github')) {
          parsedDeputies = parseNosDeputesData(data, legislature);
        } else if (url.includes('assemblee-nationale.fr')) {
          parsedDeputies = parseAssembleeNationaleData(data, legislature);
        }
  
        if (parsedDeputies.length > 0) {
          logDetailed(`Successfully parsed ${parsedDeputies.length} deputies from ${url}`);
          deputies = parsedDeputies;
          break;
        } else {
          logDetailed(`No deputies could be parsed from ${url}`);
          errors.push(`No deputies could be parsed from ${url}`);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logDetailed(`Error fetching from ${url}`, { errorMessage });
      errors.push(`Error fetching from ${url}: ${errorMessage}`);
    }
  }
  
  // If we couldn't get data from any source, log a detailed error
  if (deputies.length === 0) {
    logDetailed('Failed to fetch deputies from all sources', { errors });
  }

  logDetailed('Deputies data fetch complete', { 
    deputiesCount: deputies.length, 
    errorCount: errors.length 
  });

  return { deputies, errors };
};

// Helper function to parse NosDéputés.fr data
function parseNosDeputesData(data: any, legislature: string): DeputyData[] {
  try {
    if (!data) {
      logDetailed('Empty data from NosDéputés', {});
      return [];
    }
    
    // Try different data structures that might be present
    let deputesArray = [];
    
    if (data.deputes && Array.isArray(data.deputes)) {
      deputesArray = data.deputes;
      logDetailed(`Found ${deputesArray.length} deputies in NosDéputés deputes array`);
    } else if (data.deputes && typeof data.deputes === 'object') {
      deputesArray = Object.values(data.deputes);
      logDetailed(`Found ${deputesArray.length} deputies in NosDéputés deputes object`);
    } else if (data.export && data.export.deputes && Array.isArray(data.export.deputes)) {
      deputesArray = data.export.deputes;
      logDetailed(`Found ${deputesArray.length} deputies in NosDéputés export.deputes array`);
    } else if (Array.isArray(data) && data.length > 0 && (data[0].depute || data[0].slug || data[0].id_an)) {
      deputesArray = data;
      logDetailed(`Found ${deputesArray.length} deputies in direct array`);
    } else {
      logDetailed('Unknown NosDéputés data format', { dataKeys: Object.keys(data) });
      return [];
    }
    
    if (deputesArray.length === 0) {
      logDetailed('No deputies found in NosDéputés data', {});
      return [];
    }
    
    logDetailed(`Processing ${deputesArray.length} deputies from NosDéputés`);
    
    return deputesArray
      .filter((deputy: any) => {
        if (!deputy) {
          return false;
        }
        
        // Handle both direct and nested formats
        const deputeData = deputy.depute || deputy;
        
        // Check for any valid identifier
        return deputeData.id_an || deputeData.slug || deputeData.uid || deputy.id_an || deputy.slug || deputy.uid;
      })
      .map((deputy: any) => {
        // Handle nested deputy data structure that sometimes occurs
        const deputeData = deputy.depute || deputy;
        
        // Extract ID, handling different data formats
        let deputyId = '';
        if (deputeData.id_an) {
          deputyId = `PA${deputeData.id_an}`;
        } else if (deputy.id_an) {
          deputyId = `PA${deputy.id_an}`;
        } else if (deputeData.uid && deputeData.uid.toString().startsWith('PA')) {
          deputyId = deputeData.uid;
        } else if (deputeData.uid) {
          deputyId = `PA${deputeData.uid}`;
        } else if (deputeData.slug || deputy.slug) {
          // Use slug as fallback, prefix with ND to identify source
          deputyId = `ND${deputeData.slug || deputy.slug}`;
        }
        
        // Extract names with fallbacks
        let firstName = '';
        if (deputeData.prenom) {
          firstName = deputeData.prenom;
        } else if (deputeData.nom_de_famille) {
          // Sometimes first name is embedded in full name
          const nameParts = deputeData.nom_de_famille.split(' ');
          if (nameParts.length > 1) {
            firstName = nameParts[0];
          }
        }
        
        let lastName = '';
        if (deputeData.nom_de_famille) {
          lastName = deputeData.nom_de_famille;
        } else if (deputeData.nom) {
          lastName = deputeData.nom;
        }
        
        // If we got a combined name but no separate first name
        if (!firstName && lastName.includes(' ')) {
          const nameParts = lastName.split(' ');
          firstName = nameParts[0];
          lastName = nameParts.slice(1).join(' ');
        }
        
        return {
          deputy_id: deputyId,
          first_name: firstName || '',
          last_name: lastName || '',
          legislature,
          political_group: deputeData.groupe_sigle || null,
          political_group_id: deputeData.groupe_sigle || null,
          profession: deputeData.profession || null
        };
      })
      .filter((d: any) => {
        // Ensure we have at least first and last name and ID
        const isValid = d.first_name && d.last_name && d.deputy_id;
        if (!isValid) {
          logDetailed('Filtered out incomplete deputy record', { deputy: d });
        }
        return isValid;
      });
  } catch (error) {
    logDetailed('Error parsing NosDéputés data', { error: String(error) });
    return [];
  }
}

// Helper function to parse Assemblée Nationale data
function parseAssembleeNationaleData(data: any, legislature: string): DeputyData[] {
  try {
    if (!data) {
      logDetailed('Empty data from Assemblée Nationale');
      return [];
    }
    
    let deputiesArray: any[] = [];
    
    // Handle different possible data structures
    if (data.deputes && Array.isArray(data.deputes)) {
      deputiesArray = data.deputes;
      logDetailed(`Found ${deputiesArray.length} deputies in AN data (array format)`);
    } else if (data.deputes && typeof data.deputes === 'object') {
      deputiesArray = Object.values(data.deputes);
      logDetailed(`Found ${deputiesArray.length} deputies in AN data (object format)`);
    } else if (data.acteurs && Array.isArray(data.acteurs.acteur)) {
      deputiesArray = data.acteurs.acteur;
      logDetailed(`Found ${deputiesArray.length} deputies in AN data (acteurs format)`);
    } else if (data.items && Array.isArray(data.items)) {
      // New API format from data.assemblee-nationale.fr
      deputiesArray = data.items;
      logDetailed(`Found ${deputiesArray.length} deputies in AN API data (items format)`);
    } else if (data.export && data.export.acteurs && Array.isArray(data.export.acteurs.acteur)) {
      deputiesArray = data.export.acteurs.acteur;
      logDetailed(`Found ${deputiesArray.length} deputies in AN data (export.acteurs format)`);
    } else if (Array.isArray(data) && data.length > 0) {
      // Directly try the array
      deputiesArray = data;
      logDetailed(`Found ${deputiesArray.length} items in direct array format`);
    } else {
      logDetailed('Unknown data format from Assemblée Nationale', { dataKeys: Object.keys(data) });
      return [];
    }

    return deputiesArray
      .filter((deputy: any) => {
        if (!deputy) return false;
        
        // Check for any valid identifier
        return deputy.uid || deputy.id || deputy.mandant?.uid || 
               (deputy.etatCivil?.ident?.prenom && deputy.etatCivil?.ident?.nom);
      })
      .map((deputy: any) => {
        // Extract ID with various fallbacks
        let deputyId = '';
        if (deputy.uid?.startsWith && deputy.uid?.startsWith('PA')) {
          deputyId = deputy.uid;
        } else if (deputy.uid) {
          deputyId = `PA${deputy.uid}`;
        } else if (deputy.id) {
          deputyId = `PA${deputy.id}`;
        } else if (deputy.mandant?.uid) {
          deputyId = `PA${deputy.mandant.uid}`;
        } else if (deputy.matricule) {
          deputyId = `PA${deputy.matricule}`;
        }
        
        // Extract names with various fallbacks
        let firstName = '';
        let lastName = '';
        
        if (deputy.etatCivil?.ident?.prenom) {
          firstName = deputy.etatCivil.ident.prenom;
        } else if (deputy.prenom) {
          firstName = deputy.prenom;
        } else if (deputy.mandant?.prenom) {
          firstName = deputy.mandant.prenom;
        } else if (deputy.ident?.prenom) {
          firstName = deputy.ident.prenom;
        }
        
        if (deputy.etatCivil?.ident?.nom) {
          lastName = deputy.etatCivil.ident.nom;
        } else if (deputy.nom) {
          lastName = deputy.nom;
        } else if (deputy.mandant?.nom) {
          lastName = deputy.mandant.nom;
        } else if (deputy.ident?.nom) {
          lastName = deputy.ident.nom;
        }
        
        // If we have a full name but not separate parts
        if (deputy.nom_complet && (!firstName || !lastName)) {
          const nameParts = deputy.nom_complet.split(' ');
          if (nameParts.length > 1) {
            if (!firstName) firstName = nameParts[0];
            if (!lastName) lastName = nameParts.slice(1).join(' ');
          }
        }
        
        // Extract group info with various fallbacks
        let groupName = null;
        let groupId = null;
        
        if (deputy.groupe?.libelle) {
          groupName = deputy.groupe.libelle;
          groupId = deputy.groupe.code;
        } else if (deputy.groupe) {
          groupName = deputy.groupe;
        } else if (deputy.groupePolitique?.organeName) {
          groupName = deputy.groupePolitique.organeName;
          groupId = deputy.groupePolitique.organeRef;
        }
        
        return {
          deputy_id: deputyId,
          first_name: firstName,
          last_name: lastName,
          legislature,
          political_group: groupName,
          political_group_id: groupId,
          profession: deputy.profession || deputy.profession_declaree || null
        };
      })
      .filter((d: any) => {
        // Ensure we have at least first and last name and ID
        const isValid = d.first_name && d.last_name && d.deputy_id;
        if (!isValid) {
          logDetailed('Filtered out incomplete deputy record from AN', { deputy: d });
        }
        return isValid;
      });
  } catch (error) {
    logDetailed('Error parsing Assemblée Nationale data', { error: String(error) });
    return [];
  }
}

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
      logDetailed(`Force option is true, deleting all deputies for legislature ${legislature}`);
      
      const { error: deleteError } = await supabaseClient
        .from("deputies")
        .delete()
        .eq("legislature", legislature);
      
      if (deleteError) {
        logDetailed(`Error deleting deputies: ${deleteError.message}`);
        errors.push(`Error deleting deputies: ${deleteError.message}`);
      } else {
        logDetailed(`Successfully deleted deputies for legislature ${legislature}`);
      }
    }
    
    // Process deputies in smaller batches for better stability
    const batchSize = 5;
    const totalBatches = Math.ceil(deputies.length / batchSize);
    
    logDetailed(`Starting deputy sync in ${totalBatches} batches (${batchSize} deputies per batch)`);
    
    for (let i = 0; i < deputies.length; i += batchSize) {
      const batch = deputies.slice(i, i + batchSize);
      const batchNum = Math.floor(i/batchSize) + 1;
      
      try {
        logDetailed(`Processing batch ${batchNum}/${totalBatches} (${batch.length} deputies)`);
        
        // Clean batch data before insertion
        const cleanBatch = batch.map(deputy => {
          // Ensure data is clean and ready for database
          let deputyId = deputy.deputy_id;
          if (!deputyId.startsWith('PA') && !deputyId.startsWith('ND')) {
            deputyId = `PA${deputyId}`;
          }
          
          // Ensure fields are not undefined
          return {
            deputy_id: deputyId,
            first_name: deputy.first_name || '',
            last_name: deputy.last_name || '',
            full_name: `${deputy.first_name} ${deputy.last_name}`.trim(),
            legislature: deputy.legislature,
            political_group: deputy.political_group || null,
            political_group_id: deputy.political_group_id || null,
            profession: deputy.profession || null
          };
        });
        
        // Use upsert with explicit on-conflict handling
        const { error } = await supabaseClient
          .from("deputies")
          .upsert(cleanBatch, { 
            onConflict: 'deputy_id,legislature',
            ignoreDuplicates: false
          });
        
        if (error) {
          logDetailed(`Error batch inserting deputies: ${error.message}`);
          errors.push(`Error batch inserting deputies: ${error.message}`);
          
          // Try one by one if batch failed
          logDetailed(`Batch failed, trying individual inserts`);
          for (const deputy of cleanBatch) {
            try {
              const { error: singleError } = await supabaseClient
                .from("deputies")
                .upsert([deputy], { 
                  onConflict: 'deputy_id,legislature'
                });
              
              if (singleError) {
                logDetailed(`Error for deputy ${deputy.deputy_id}: ${singleError.message}`);
                errors.push(`Error for ${deputy.deputy_id}: ${singleError.message}`);
              } else {
                successCount++;
                logDetailed(`Successfully inserted deputy ${deputy.deputy_id}`);
              }
            } catch (e) {
              const errorMessage = e instanceof Error ? e.message : String(e);
              logDetailed(`Exception for deputy ${deputy.deputy_id}: ${errorMessage}`);
              errors.push(`Exception for ${deputy.deputy_id}: ${errorMessage}`);
            }
          }
        } else {
          successCount += batch.length;
          logDetailed(`Successfully inserted batch ${batchNum}/${totalBatches}`);
        }
      } catch (batchError) {
        const errorMessage = batchError instanceof Error ? batchError.message : String(batchError);
        logDetailed(`Batch exception: ${errorMessage}`);
        errors.push(`Batch exception: ${errorMessage}`);
        
        // Try one by one if batch failed
        logDetailed(`Batch failed with exception, trying individual inserts`);
        for (const deputy of batch) {
          try {
            const { deputy_id, first_name, last_name, legislature, political_group, political_group_id, profession } = deputy;
            
            const { error: singleError } = await supabaseClient
              .from("deputies")
              .upsert([{
                deputy_id,
                first_name,
                last_name,
                full_name: `${first_name} ${last_name}`.trim(),
                legislature,
                political_group,
                political_group_id,
                profession
              }], { 
                onConflict: 'deputy_id,legislature'
              });
            
            if (singleError) {
              logDetailed(`Error for deputy ${deputy.deputy_id}: ${singleError.message}`);
              errors.push(`Error for ${deputy.deputy_id}: ${singleError.message}`);
            } else {
              successCount++;
              logDetailed(`Successfully inserted deputy ${deputy.deputy_id}`);
            }
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            logDetailed(`Exception for deputy ${deputy.deputy_id}: ${errorMessage}`);
            errors.push(`Exception for ${deputy.deputy_id}: ${errorMessage}`);
          }
        }
      }
    }
    
    logDetailed(`Sync complete. ${successCount} deputies synchronized with ${errors.length} errors`);
    
    return {
      success: successCount > 0,
      errors,
      count: successCount,
    };
  } catch (error) {
    const errorMessage = `Database sync error: ${error instanceof Error ? error.message : String(error)}`;
    logDetailed(errorMessage);
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
    
    logDetailed(`Starting deputies sync for legislature: ${legislature}, force: ${force}`);
    
    // Create Supabase client using env vars
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    if (!supabaseUrl || !supabaseKey) {
      logDetailed("Missing environment variables (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)");
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
      // Fetch and sync deputies with retries
      const maxRetries = 3;
      let deputies: DeputyData[] = [];
      let fetchErrors: string[] = [];
      let retryCount = 0;
      let success = false;
      
      while (retryCount < maxRetries && deputies.length === 0) {
        logDetailed(`Fetching deputies data... (attempt ${retryCount + 1}/${maxRetries})`);
        const result = await fetchDeputiesData(legislature);
        deputies = result.deputies;
        fetchErrors = result.errors;
        
        if (deputies.length > 0) {
          success = true;
          break;
        }
        
        retryCount++;
        
        if (retryCount < maxRetries) {
          const backoff = 1000 * Math.pow(2, retryCount);
          logDetailed(`Retry in ${backoff/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
      
      logDetailed(`Fetched ${deputies.length} deputies with ${fetchErrors.length} errors after ${retryCount + 1} attempts`);
      
      if (deputies.length === 0) {
        logDetailed("No deputies fetched, cannot proceed with sync");
        
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
      
      logDetailed("Syncing deputies to database...");
      const { success: syncSuccess, errors: syncErrors, count } = await syncDeputiesToDatabase(
        supabaseClient,
        deputies,
        force
      );
      
      // Prepare response
      const response = {
        success: syncSuccess && deputies.length > 0,
        message: syncSuccess ? `Synced ${count} deputies successfully` : "Sync failed",
        deputies_count: count,
        fetch_errors: fetchErrors,
        sync_errors: syncErrors,
      };
      
      logDetailed(`Sync completed with status: ${syncSuccess ? 'success' : 'failure'}, count: ${count}`);
      
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
      logDetailed(`Error in fetch/sync process: ${errorMessage}`);
      
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
    logDetailed(`Unhandled exception: ${errorMessage}`);
    
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
