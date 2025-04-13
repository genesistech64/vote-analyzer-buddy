// Import necessary libraries
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

// Constants and configuration
const DEPUTIES_URL = 'https://data.assemblee-nationale.fr/api/v2/deputes';
const BATCH_SIZE = 50;
const DEFAULT_LEGISLATURE = '17';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// Types
interface DeputyFromAPI {
  uid: string;
  deputeId?: string;
  id?: string;
  nom?: string;
  prenom?: string;
  nomDeFamille?: string;
  groupePolitique?: {
    organisme?: {
      nom?: string;
      uid?: string;
    }
  }
  profession?: string;
  legislature?: string;
}

interface DeputyForDB {
  deputy_id: string;
  first_name: string;
  last_name: string;
  legislature: string;
  political_group?: string | null;
  political_group_id?: string | null;
  profession?: string | null;
}

// Utility functions
function parseDeputyId(deputy: any): string {
  if (typeof deputy.uid === 'string') {
    return deputy.uid.startsWith('PA') ? deputy.uid : `PA${deputy.uid}`;
  }
  if (typeof deputy.deputeId === 'string') {
    return deputy.deputeId.startsWith('PA') ? deputy.deputeId : `PA${deputy.deputeId}`;
  }
  if (typeof deputy.id === 'string') {
    return deputy.id.startsWith('PA') ? deputy.id : `PA${deputy.id}`;
  }
  throw new Error('Cannot extract deputy ID');
}

// Main function to handle the request
serve(async (req: Request) => {
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }
    
    // Parse request body with proper error handling
    let legislature = DEFAULT_LEGISLATURE;
    let force = false;
    
    try {
      if (req.body) {
        const data = await req.json();
        legislature = data.legislature || DEFAULT_LEGISLATURE;
        force = data.force || false;
      }
    } catch (parseError) {
      console.error('Error parsing request body:', parseError);
      // Continue with default values if parsing fails
    }
    
    console.log(`Syncing deputies for legislature ${legislature}, force=${force}`);
    
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Missing Supabase credentials' 
        }),
        { 
          status: 200, // Return 200 to avoid client-side error handling
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Check if sync is needed
    if (!force) {
      // Get last sync time for deputies
      const { data: lastSync } = await supabase
        .from('data_sync')
        .select('last_sync')
        .eq('id', 'deputies')
        .maybeSingle();
      
      if (lastSync && lastSync.last_sync) {
        const lastSyncTime = new Date(lastSync.last_sync).getTime();
        const currentTime = new Date().getTime();
        const oneDay = 24 * 60 * 60 * 1000; // milliseconds in a day
        
        if (currentTime - lastSyncTime < oneDay) {
          console.log('Deputies data synced recently, skipping sync');
          
          // Return success but with a message that sync was skipped
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: 'Deputies data synced recently, sync skipped',
              deputies_count: 0 
            }),
            { 
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
      }
    }
    
    // Fetch deputies from API
    const allDeputies: DeputyForDB[] = [];
    const fetchErrors: string[] = [];
    
    try {
      const url = `${DEPUTIES_URL}?legislature=${legislature}&format=json&limit=1000`;
      console.log(`Fetching deputies from ${url}`);
      
      // Use timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        const response = await fetch(url, { 
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'AssembleeInfo/1.0'
          } 
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          let errorText;
          try {
            errorText = await response.text();
          } catch (e) {
            errorText = `Failed to get error text: ${e.message}`;
          }
          throw new Error(`API responded with status ${response.status}: ${errorText}`);
        }
        
        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          throw new Error(`Failed to parse API response as JSON: ${parseError.message}`);
        }
        
        if (!data || !Array.isArray(data)) {
          throw new Error('Invalid API response format, expected array');
        }
        
        console.log(`Fetched ${data.length} deputies from API`);
        
        // Process deputies
        for (const deputy of data) {
          try {
            const deputyId = parseDeputyId(deputy);
            
            // Extract political group
            let politicalGroup = null;
            let politicalGroupId = null;
            
            if (deputy.groupePolitique?.organisme) {
              politicalGroup = deputy.groupePolitique.organisme.nom || null;
              politicalGroupId = deputy.groupePolitique.organisme.uid || null;
            }
            
            // Extract names
            const firstName = deputy.prenom || '';
            const lastName = deputy.nomDeFamille || deputy.nom || '';
            
            // Skip deputies without IDs or names
            if (!deputyId || (!firstName && !lastName)) {
              fetchErrors.push(`Invalid deputy data, missing ID or name: ${JSON.stringify(deputy)}`);
              continue;
            }
            
            // Create deputy record for DB
            const deputyForDB: DeputyForDB = {
              deputy_id: deputyId,
              first_name: firstName,
              last_name: lastName,
              legislature: legislature,
              political_group: politicalGroup,
              political_group_id: politicalGroupId,
              profession: deputy.profession || null
            };
            
            allDeputies.push(deputyForDB);
          } catch (error) {
            console.error('Error processing deputy:', error);
            fetchErrors.push(`Error processing deputy: ${error.message}`);
          }
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error) {
      console.error('Error fetching deputies:', error);
      fetchErrors.push(`Error fetching deputies: ${error.message}`);
      
      // Try alternative API endpoint or mock data for development/testing
      try {
        console.log("Using fallback method to get deputies data");
        // Here we could implement a fallback strategy
        // For now, we'll continue with any deputies we might have
      } catch (fallbackError) {
        console.error('Fallback method failed:', fallbackError);
        fetchErrors.push(`Fallback method failed: ${fallbackError.message}`);
      }
    }
    
    // Proceed even if we had errors (we might have partial data)
    console.log(`Collected ${allDeputies.length} deputies from API (with ${fetchErrors.length} errors)`);
    
    // If we couldn't fetch any deputies, return with partial failure but still a 200 response
    if (allDeputies.length === 0) {
      console.log('No deputies collected, returning with errors');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Failed to fetch deputies from API', 
          fetch_errors: fetchErrors,
          deputies_count: 0
        }),
        { 
          status: 200, // Always return 200 to prevent client-side error handling
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Deduplicate deputies by ID (keep the newest)
    const uniqueDeputyMap = new Map<string, DeputyForDB>();
    
    for (const deputy of allDeputies) {
      const key = `${deputy.deputy_id}_${deputy.legislature}`;
      uniqueDeputyMap.set(key, deputy);
    }
    
    const uniqueDeputies = Array.from(uniqueDeputyMap.values());
    console.log(`After deduplication: ${uniqueDeputies.length} deputies`);
    
    // Construct final deputy records
    const deputiesForDb = uniqueDeputies
      .filter(d => d.deputy_id && (d.first_name || d.last_name)); // Must have an ID and at least part of a name
    
    console.log(`Final deputies for DB: ${deputiesForDb.length}`);
    
    // Insert deputies into database in batches
    const syncErrors: string[] = [];
    let totalInserted = 0;
    
    for (let i = 0; i < deputiesForDb.length; i += BATCH_SIZE) {
      const batch = deputiesForDb.slice(i, i + BATCH_SIZE);
      
      try {
        const { error } = await supabase
          .from('deputies')
          .upsert(batch, { 
            onConflict: 'deputy_id,legislature'
          });
        
        if (error) {
          console.error(`Error inserting deputies batch ${i}:`, error);
          syncErrors.push(`Error batch ${i}: ${error.message}`);
        } else {
          totalInserted += batch.length;
          console.log(`Inserted batch ${i}, ${batch.length} deputies`);
        }
      } catch (error) {
        console.error(`Error inserting deputies batch ${i}:`, error);
        syncErrors.push(`Error batch ${i}: ${error.message}`);
      }
    }
    
    // Update sync timestamp
    try {
      await supabase
        .from('data_sync')
        .upsert(
          { id: 'deputies', status: 'complete', last_sync: new Date().toISOString() },
          { onConflict: 'id' }
        );
    } catch (error) {
      console.error('Error updating sync timestamp:', error);
      syncErrors.push(`Error updating sync timestamp: ${error.message}`);
    }
    
    // Return results - always with status 200 to prevent client-side error handling
    const success = totalInserted > 0;
    
    return new Response(
      JSON.stringify({
        success,
        message: success ? 'Deputies synced successfully' : 'Sync completed with errors',
        deputies_count: totalInserted,
        fetch_errors: fetchErrors,
        sync_errors: syncErrors
      }),
      { 
        status: 200, // Always return 200 to prevent client-side error handling
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Unhandled error in sync-deputies function:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: `Unhandled error: ${error.message}`, 
        details: error.stack
      }),
      { 
        status: 200, // Always return 200 to prevent client-side error handling
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        }
      }
    );
  }
});
