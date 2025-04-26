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

// New API endpoints that are known to work
const API_BASE_URL = "https://api-dataan.onrender.com/api/v1";

// Define interfaces for API responses
interface DeputyFromAPI {
  uid: string;
  nom: string;
  prenom: string;
  slug: string;
  groupe_politique: {
    id: string;
    libelle: string;
  };
  profession?: string;
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

// Improved fetchWithRetry function
const fetchWithRetry = async (
  url: string,
  options = {},
  retries = 3,
  backoff = 300
): Promise<Response> => {
  let lastError: Error | null = null;
  
  for (let i = 0; i < retries; i++) {
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
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      console.log(`Successfully fetched ${url}`);
      return response;
    } catch (err) {
      console.log(`Fetch attempt ${i+1} failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
      lastError = err instanceof Error ? err : new Error(String(err));
      
      if (i < retries - 1) {
        const waitTime = backoff * Math.pow(2, i);
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise(r => setTimeout(r, waitTime));
      }
    }
  }
  
  throw new Error(`All fetch attempts failed for ${url}. Last error: ${lastError?.message || 'Unknown error'}`);
};

// Updated fetchAllData function to use the new API
const fetchAllData = async (legislature: string): Promise<{
  deputies: DeputyData[];
  errors: string[];
}> => {
  console.log(`Fetching data for legislature ${legislature}`);
  
  const errors: string[] = [];
  const deputies: DeputyData[] = [];
  
  try {
    // Get all political groups first
    const groupsUrl = `${API_BASE_URL}/legislature/${legislature}/organes/groupes`;
    console.log(`Fetching political groups from ${groupsUrl}`);
    
    const groupsResponse = await fetchWithRetry(groupsUrl);
    const groups = await groupsResponse.json();
    
    console.log(`Successfully fetched ${groups.length} political groups`);
    
    // For each group, get its members
    for (const group of groups) {
      try {
        const groupId = group.uid;
        const membersUrl = `${API_BASE_URL}/organes/${groupId}/membres`;
        console.log(`Fetching members for group ${group.libelle} (${groupId})`);
        
        const membersResponse = await fetchWithRetry(membersUrl);
        const members = await membersResponse.json();
        
        console.log(`Found ${members.length} members in group ${group.libelle}`);
        
        // Process each member
        for (const member of members) {
          try {
            const deputyId = member.uid;
            const deputyDetailUrl = `${API_BASE_URL}/acteur/${deputyId}`;
            
            console.log(`Fetching details for deputy ${deputyId}`);
            const deputyResponse = await fetchWithRetry(deputyDetailUrl);
            const deputyDetail: DeputyFromAPI = await deputyResponse.json();
            
            deputies.push({
              deputy_id: deputyDetail.uid,
              first_name: deputyDetail.prenom,
              last_name: deputyDetail.nom,
              legislature,
              political_group: group.libelle,
              political_group_id: groupId,
              profession: deputyDetail.profession || null
            });
            
            console.log(`Successfully processed deputy ${deputyDetail.prenom} ${deputyDetail.nom}`);
          } catch (deputyError) {
            const errorMessage = `Error processing deputy ${member.uid}: ${deputyError instanceof Error ? deputyError.message : String(deputyError)}`;
            console.error(errorMessage);
            errors.push(errorMessage);
          }
        }
      } catch (groupError) {
        const errorMessage = `Error processing group ${group.uid}: ${groupError instanceof Error ? groupError.message : String(groupError)}`;
        console.error(errorMessage);
        errors.push(errorMessage);
      }
    }
    
    // Also fetch independent deputies (not in any group)
    try {
      const independentsUrl = `${API_BASE_URL}/legislature/${legislature}/deputes/tous`;
      console.log(`Fetching all deputies including independents from ${independentsUrl}`);
      
      const independentsResponse = await fetchWithRetry(independentsUrl);
      const allDeputies = await independentsResponse.json();
      
      // Add any deputies that aren't already in our list
      for (const deputy of allDeputies) {
        if (!deputies.some(d => d.deputy_id === deputy.uid)) {
          deputies.push({
            deputy_id: deputy.uid,
            first_name: deputy.prenom,
            last_name: deputy.nom,
            legislature,
            political_group: null,
            political_group_id: null,
            profession: deputy.profession || null
          });
          console.log(`Added independent deputy ${deputy.prenom} ${deputy.nom}`);
        }
      }
    } catch (independentsError) {
      const errorMessage = `Error fetching independent deputies: ${independentsError instanceof Error ? independentsError.message : String(independentsError)}`;
      console.error(errorMessage);
      errors.push(errorMessage);
    }
    
    console.log(`Successfully processed ${deputies.length} deputies total`);
    
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
    
    // Keep existing Supabase client implementation
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
