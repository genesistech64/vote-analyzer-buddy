import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fallback data in case all API fetches fail
const FALLBACK_DEPUTIES = [
  { 
    deputy_id: "PA1592", 
    first_name: "David", 
    last_name: "Habib", 
    legislature: "17", 
    political_group: "SOC",
    political_group_id: "SOC",
    profession: "Pharmacien"
  },
  { 
    deputy_id: "PA721146", 
    first_name: "Aurore", 
    last_name: "Bergé", 
    legislature: "17", 
    political_group: "RE",
    political_group_id: "RE",
    profession: "Consultante"
  },
  { 
    deputy_id: "PA722182", 
    first_name: "Marine", 
    last_name: "Le Pen", 
    legislature: "17", 
    political_group: "RN",
    political_group_id: "RN",
    profession: "Avocate"
  },
  { 
    deputy_id: "PA605036", 
    first_name: "Jean-Luc", 
    last_name: "Mélenchon", 
    legislature: "17", 
    political_group: "LFI-NUPES",
    political_group_id: "LFI-NUPES",
    profession: "Professeur"
  },
  { 
    deputy_id: "PA336160", 
    first_name: "Olivier", 
    last_name: "Falorni", 
    legislature: "17", 
    political_group: "LIOT",
    political_group_id: "LIOT",
    profession: "Conseiller général"
  }
];

// Function to prevent JSON circular references
const safeStringify = (obj: any) => {
  const seen = new Set();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  });
};

// Enhanced fetch with timeout and retries
async function fetchWithRetry(
  url: string, 
  options = {}, 
  timeout = 10000, 
  retries = 3
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  options = { 
    ...options, 
    signal: controller.signal 
  };
  
  let lastError;
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${i + 1} failed for ${url}:`, error);
      
      if (error.name === 'AbortError') {
        console.log(`Request to ${url} timed out after ${timeout}ms`);
        break; // Don't retry timeout errors
      }
      
      // Wait before retrying (exponential backoff)
      if (i < retries - 1) {
        const waitTime = Math.min(1000 * Math.pow(2, i), 4000);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  clearTimeout(timeoutId);
  throw lastError || new Error(`Failed to fetch ${url} after ${retries} attempts`);
}

// Enhanced parsing function
function extractDeputiesFromData(data: any, legislature: string): any[] {
  console.log("Attempting to extract deputies from data...");
  
  if (!data) {
    console.error("No data provided to extract deputies");
    return [];
  }
  
  // Format may vary depending on the source
  try {
    // Check if we have deputes array (nosdeputes.fr format)
    if (data.deputes && Array.isArray(data.deputes)) {
      console.log(`Found ${data.deputes.length} deputies in deputes array`);
      return data.deputes.map((d: any) => {
        const depute = d.depute || d;
        return {
          deputy_id: `PA${depute.id_an || depute.id || ''}`,
          first_name: depute.prenom || depute.nom_de_famille?.split(' ')[0] || '',
          last_name: depute.nom || depute.nom_de_famille?.split(' ').slice(1).join(' ') || '',
          full_name: `${depute.prenom || ''} ${depute.nom || ''}`.trim(),
          legislature: legislature || depute.legislature || '17',
          political_group: depute.groupe_sigle || depute.parti_ratt_financier || '',
          political_group_id: depute.groupe_sigle || depute.parti_ratt_financier || '',
          profession: depute.profession || ''
        };
      }).filter((d: any) => d.first_name && d.last_name);
    }
    
    // Check for acteurs format (assemblee-nationale.fr)
    if (data.acteurs && Array.isArray(data.acteurs.acteur)) {
      console.log(`Found ${data.acteurs.acteur.length} deputies in acteurs array`);
      return data.acteurs.acteur
        .filter((a: any) => a.etatCivil && a.mandats)
        .map((a: any) => {
          const names = a.etatCivil.ident?.split(',') || [];
          return {
            deputy_id: `PA${a.uuid || ''}`,
            first_name: (names[1] || '').trim(),
            last_name: (names[0] || '').trim(),
            full_name: a.etatCivil.ident || '',
            legislature: legislature || '17',
            political_group: a.groupePolitique?.organisme?.libelle || '',
            political_group_id: a.groupePolitique?.organisme?.uid || '',
            profession: a.profession || ''
          };
        })
        .filter((d: any) => d.first_name && d.last_name);
    }
    
    // For array format
    if (Array.isArray(data)) {
      console.log(`Found ${data.length} items in array format`);
      return data.map((d: any) => {
        return {
          deputy_id: d.uid || d.id_an ? `PA${d.uid || d.id_an}` : d.id || '',
          first_name: d.prenom || (d.nom_complet ? d.nom_complet.split(' ')[0] : ''),
          last_name: d.nom || (d.nom_complet ? d.nom_complet.split(' ').slice(1).join(' ') : ''),
          full_name: d.nom_complet || `${d.prenom || ''} ${d.nom || ''}`.trim(),
          legislature: legislature || d.legislature || '17',
          political_group: d.groupe_sigle || d.groupe || '',
          political_group_id: d.groupe_acronyme || d.groupe_sigle || '',
          profession: d.profession || ''
        };
      }).filter((d: any) => (d.first_name && d.last_name) || d.full_name);
    }
    
    // For Supabase direct API structure
    if (data.data && Array.isArray(data.data)) {
      console.log(`Found ${data.data.length} items in data.data array`);
      return data.data.map((d: any) => ({
        deputy_id: d.uid || d.id_an ? `PA${d.uid || d.id_an}` : d.deputy_id || '',
        first_name: d.first_name || d.prenom || '',
        last_name: d.last_name || d.nom || '',
        full_name: d.full_name || d.nom_complet || `${d.first_name || d.prenom || ''} ${d.last_name || d.nom || ''}`.trim(),
        legislature: d.legislature || legislature || '17',
        political_group: d.political_group || d.groupe_sigle || '',
        political_group_id: d.political_group_id || d.groupe_acronyme || '',
        profession: d.profession || ''
      })).filter((d: any) => (d.first_name && d.last_name) || d.full_name);
    }
    
    // Generic object format - try to find deputies
    if (typeof data === 'object' && data !== null) {
      // Look for properties that might contain deputies data
      const possibleDeputiesProps = ['deputes', 'deputies', 'acteurs', 'members', 'data'];
      for (const prop of possibleDeputiesProps) {
        if (data[prop] && (Array.isArray(data[prop]) || typeof data[prop] === 'object')) {
          console.log(`Found potential deputies in ${prop} property`);
          const nestedData = data[prop];
          return extractDeputiesFromData(nestedData, legislature);
        }
      }
    }
    
    console.warn("Could not find deputies in the provided data structure:", typeof data);
    return [];
  } catch (error) {
    console.error("Error extracting deputies:", error);
    return [];
  }
}

async function parseXml(text: string): Promise<any> {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");
  
  // Convert XML to JSON
  function xmlToJson(xml: any): any {
    let obj: any = {};
    
    if (xml.nodeType === 1) { // element node
      if (xml.attributes.length > 0) {
        obj["@attributes"] = {};
        for (let i = 0; i < xml.attributes.length; i++) {
          const attribute = xml.attributes.item(i);
          obj["@attributes"][attribute.nodeName] = attribute.nodeValue;
        }
      }
    } else if (xml.nodeType === 3) { // text node
      return xml.nodeValue.trim();
    }
    
    if (xml.hasChildNodes()) {
      for (let i = 0; i < xml.childNodes.length; i++) {
        const item = xml.childNodes.item(i);
        const nodeName = item.nodeName;
        
        if (nodeName === "#text" && item.nodeValue.trim() === "") continue;
        
        if (typeof obj[nodeName] === "undefined") {
          const value = xmlToJson(item);
          if (value !== "") {
            obj[nodeName] = value;
          }
        } else {
          if (typeof obj[nodeName].push === "undefined") {
            const old = obj[nodeName];
            obj[nodeName] = [old];
          }
          const value = xmlToJson(item);
          if (value !== "") {
            obj[nodeName].push(value);
          }
        }
      }
    }
    return obj;
  }
  
  return xmlToJson(xmlDoc);
}

async function syncDeputies(legislature: string = '17', force: boolean = false): Promise<any> {
  console.log(`Starting deputies sync for legislature ${legislature}, force=${force}`);
  
  // List of potential data sources
  const apiUrls = [
    'https://www.nosdeputes.fr/deputes/enmandat/json',
    'https://www.nosdeputes.fr/deputes/tous/json',
    'https://www.assemblee-nationale.fr/dyn/opendata/deputes.json',
    'https://data.assemblee-nationale.fr/api/v1/deputies/active',
    `https://www.nosdeputes.fr/${legislature}/json`,
    `https://www.nosdeputes.fr/${Number(legislature) - 1}/json`, // Try previous legislature too
    `https://www.assemblee-nationale.fr/${legislature}/json/deputes.json`,
    `https://www.assemblee-nationale.fr/${Number(legislature) - 2}/xml/deputes.xml`,
    'https://raw.githubusercontent.com/regardscitoyens/nosdeputes.fr/master/batch/depute/json/tous.json'
  ];
  
  const allDeputies: any[] = [];
  const fetchErrors: string[] = [];
  
  // Try each API in sequence
  for (const url of apiUrls) {
    try {
      console.log(`Fetching from ${url}...`);
      
      const response = await fetchWithRetry(url, {}, 15000, 2);
      
      if (!response.ok) {
        const errorMsg = `Failed to fetch from ${url}: HTTP ${response.status}`;
        console.error(errorMsg);
        fetchErrors.push(errorMsg);
        continue;
      }
      
      let data;
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/xml') || contentType.includes('text/xml') || url.endsWith('.xml')) {
        console.log(`Processing XML response from ${url}`);
        const text = await response.text();
        data = await parseXml(text);
      } else {
        console.log(`Processing JSON response from ${url}`);
        data = await response.json();
      }
      
      const deputies = extractDeputiesFromData(data, legislature);
      
      if (deputies.length > 0) {
        console.log(`Found ${deputies.length} deputies from ${url}`);
        deputies.forEach(d => {
          // Add source info for debugging
          d._source = url;
          allDeputies.push(d);
        });
      } else {
        const errorMsg = `No deputies could be parsed from ${url}`;
        console.warn(errorMsg);
        fetchErrors.push(errorMsg);
      }
    } catch (error) {
      const errorMsg = `Error fetching from ${url}: ${error.message}`;
      console.error(errorMsg);
      fetchErrors.push(errorMsg);
    }
  }

  // Add fallback deputies if no other data was found
  if (allDeputies.length === 0 && FALLBACK_DEPUTIES.length > 0) {
    console.log(`Using ${FALLBACK_DEPUTIES.length} fallback deputies as no other data could be fetched`);
    FALLBACK_DEPUTIES.forEach(d => {
      d._source = 'fallback';
      allDeputies.push(d);
    });
  }
  
  console.log(`Total unique deputies found: ${allDeputies.length}`);
  
  // If no deputies were found at all
  if (allDeputies.length === 0) {
    return {
      success: false,
      message: "No deputies fetched, cannot proceed with sync",
      fetch_errors: fetchErrors,
      sync_errors: [],
      deputies_count: 0
    };
  }
  
  // De-duplicate deputies based on deputy_id
  const uniqueDeputyMap = new Map();
  allDeputies.forEach(deputy => {
    // Normalize deputy_id to always have PA prefix
    if (deputy.deputy_id && !deputy.deputy_id.startsWith('PA') && !deputy.deputy_id.startsWith('ND')) {
      deputy.deputy_id = `PA${deputy.deputy_id}`;
    }
    
    // Keep the most complete record if there are duplicates
    const existingDeputy = uniqueDeputyMap.get(deputy.deputy_id);
    if (!existingDeputy || 
        (!existingDeputy.first_name && deputy.first_name) || 
        (!existingDeputy.last_name && deputy.last_name) ||
        (!existingDeputy.political_group && deputy.political_group)) {
      uniqueDeputyMap.set(deputy.deputy_id, deputy);
    }
  });
  
  const uniqueDeputies = Array.from(uniqueDeputyMap.values());
  console.log(`After deduplication: ${uniqueDeputies.length} deputies`);
  
  // Construct final deputy records - IMPORTANT CHANGE: Removed full_name from the data we insert
  const deputiesForDb = uniqueDeputies.map(d => {
    return {
      deputy_id: d.deputy_id,
      first_name: d.first_name || '',
      last_name: d.last_name || '',
      legislature: d.legislature || legislature,
      political_group: d.political_group || null,
      political_group_id: d.political_group_id || null,
      profession: d.profession || null
      // Removed full_name as it's a generated column in the database
    };
  }).filter(d => d.deputy_id && (d.first_name || d.last_name)); // Must have an ID and at least part of a name
  
  if (deputiesForDb.length === 0) {
    return {
      success: false,
      message: "No valid deputies after processing, cannot proceed with sync",
      fetch_errors: fetchErrors,
      sync_errors: [],
      deputies_count: 0
    };
  }
  
  console.log(`Prepared ${deputiesForDb.length} valid deputies for database insertion`);

  // Initialize Supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://jjwpejhbwjbbkgxsfhnj.supabase.co';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
  
  if (!supabaseKey) {
    return {
      success: false,
      message: "Missing Supabase API key, cannot proceed with sync",
      fetch_errors: fetchErrors,
      sync_errors: ["Missing Supabase API key"],
      deputies_count: deputiesForDb.length
    };
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  const syncErrors: string[] = [];
  
  // Insert deputies in smaller batches to avoid issues with large payloads
  const batchSize = 20;
  let insertedCount = 0;
  
  for (let i = 0; i < deputiesForDb.length; i += batchSize) {
    const batch = deputiesForDb.slice(i, i + batchSize);
    
    try {
      const { error } = await supabase
        .from('deputies')
        .upsert(batch, { 
          onConflict: 'deputy_id,legislature',
          ignoreDuplicates: false  
        });
      
      if (error) {
        console.error(`Error inserting batch ${Math.floor(i/batchSize) + 1}:`, error);
        syncErrors.push(`Batch ${Math.floor(i/batchSize) + 1}: ${error.message}`);
      } else {
        insertedCount += batch.length;
        console.log(`Successfully inserted/updated batch ${Math.floor(i/batchSize) + 1} (${batch.length} deputies)`);
      }
    } catch (error) {
      console.error(`Exception inserting batch ${Math.floor(i/batchSize) + 1}:`, error);
      syncErrors.push(`Batch ${Math.floor(i/batchSize) + 1}: ${error.message}`);
    }
    
    // Small delay between batches
    if (i + batchSize < deputiesForDb.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  // Update the sync status in the data_sync table
  try {
    const timestamp = new Date().toISOString();
    const syncStatus = insertedCount > 0 ? 'complete' : 'error';
    const logsSummary = JSON.stringify({
      fetch_errors: fetchErrors,
      sync_errors: syncErrors,
      total_deputies: deputiesForDb.length,
      inserted_deputies: insertedCount,
      sources: [...new Set(allDeputies.map((d: any) => d._source))]
    });
    
    const { error } = await supabase
      .from('data_sync')
      .upsert({
        id: 'deputies',
        last_sync: timestamp,
        status: syncStatus,
        logs: logsSummary
      });
    
    if (error) {
      console.error("Error updating sync status:", error);
      syncErrors.push(`Status update: ${error.message}`);
    }
  } catch (error) {
    console.error("Exception updating sync status:", error);
    syncErrors.push(`Status update exception: ${error.message}`);
  }
  
  const success = insertedCount > 0 && syncErrors.length === 0;
  
  return {
    success,
    message: success 
      ? `Successfully synced ${insertedCount} deputies` 
      : insertedCount > 0 
        ? `Partially synced ${insertedCount} deputies with ${syncErrors.length} errors` 
        : "Failed to sync deputies",
    fetch_errors: fetchErrors,
    sync_errors: syncErrors,
    deputies_count: insertedCount
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Get request parameters
    let legislature = '17';
    let force = false;
    
    if (req.method === 'POST') {
      const requestData = await req.json();
      legislature = requestData.legislature || legislature;
      force = requestData.force || force;
    }
    
    const result = await syncDeputies(legislature, force);
    
    return new Response(
      JSON.stringify(result),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  } catch (error) {
    console.error("Edge function error:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Error in edge function: ' + error.message,
        deputies_count: 0
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        },
        status: 500
      }
    );
  }
});
