import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { corsHeaders } from '../_shared/cors.ts'

interface Deputy {
  deputy_id: string
  first_name: string
  last_name: string
  legislature: string
  political_group?: string
  political_group_id?: string
  profession?: string
  full_name?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { legislature = '17', force = false, use_pagination = true, batch_size = 100 } = await req.json()
    console.log(`Starting deputies sync for legislature: ${legislature}, force: ${force}, use_pagination: ${use_pagination}, batch_size: ${batch_size}`)

    // Update sync status to in_progress
    await updateSyncStatus('in_progress')
    console.log('Fetching deputies data...')

    const fetchErrors: string[] = []
    let deputies: Deputy[] = []
    let sourcesSucceeded: string[] = []
    
    // Check for existing deputies before making any changes
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    const { count: existingCount, error: countError } = await supabase
      .from('deputies')
      .select('*', { count: 'exact', head: true })
      .eq('legislature', legislature)
    
    if (countError) {
      console.error('Error checking existing deputies count:', countError)
    } else {
      console.log(`Found ${existingCount || 0} existing deputies in database`)
    }
    
    // Get existing deputies for merging or as fallback
    let existingDeputies: Deputy[] = []
    const { data: existing, error: existingError } = await supabase
      .from('deputies')
      .select('*')
      .eq('legislature', legislature)
    
    if (existingError) {
      console.error('Error fetching existing deputies:', existingError)
    } else if (existing && existing.length > 0) {
      console.log(`Loaded ${existing.length} existing deputies as backup`)
      existingDeputies = existing as Deputy[]
    }

    // First try the main endpoint with pagination
    if (use_pagination) {
      console.log(`Fetching data for legislature ${legislature}, usePagination=${use_pagination}, batchSize=${batch_size}`)
      
      let page = 1
      let hasMore = true
      
      while (hasMore) {
        console.log(`Fetching deputies page ${page} (limit ${batch_size})`)
        
        try {
          // First try the main endpoint
          const mainData = await fetchWithRetry(`https://api-dataan.onrender.com/api/v1/legislature/${legislature}/deputes/tous?page=${page}&limit=${batch_size}`)
          if (mainData && mainData.length > 0) {
            deputies.push(...mainData)
            sourcesSucceeded.push('API principale')
          } else {
            // If main endpoint returns no data, try the active deputies endpoint
            const activeData = await fetchWithRetry(`https://api-dataan.onrender.com/api/v1/legislature/${legislature}/deputes/actifs?page=${page}&limit=${batch_size}`)
            if (activeData && activeData.length > 0) {
              deputies.push(...activeData)
              if (!sourcesSucceeded.includes('API secondaire')) {
                sourcesSucceeded.push('API secondaire')
              }
            } else {
              hasMore = false
            }
          }
        } catch (error) {
          console.error(`Error fetching page ${page}:`, error)
          fetchErrors.push(`Error fetching page ${page}: ${error.message}`)
          hasMore = false
        }

        page++
      }

      console.log(`Finished fetching data after ${page - 1} pages, got ${deputies.length} deputies`)
    }

    // Try Assemblée Nationale API
    try {
      console.log('Trying Assemblée Nationale API')
      const response = await fetch(`https://data.assemblee-nationale.fr/api/v1/deputies/legislature/${legislature}`)
      if (response.ok) {
        const data = await response.json()
        if (data && data.deputies && Array.isArray(data.deputies) && data.deputies.length > 0) {
          console.log(`Got ${data.deputies.length} deputies from Assemblée Nationale API`)
          sourcesSucceeded.push('API Assemblée Nationale')
          
          const anDeputies = data.deputies.map((deputy: any) => ({
            deputy_id: deputy.id || `PA${deputy.uid}`,
            first_name: deputy.firstName || deputy.first_name,
            last_name: deputy.lastName || deputy.last_name,
            full_name: `${deputy.firstName || deputy.first_name || ''} ${deputy.lastName || deputy.last_name || ''}`.trim(),
            political_group: deputy.politicalGroup || deputy.political_group,
            political_group_id: deputy.politicalGroupId || deputy.political_group_id,
            profession: deputy.profession,
            legislature
          }))
          
          if (deputies.length === 0) {
            deputies = anDeputies
          } else {
            // Merge with existing data
            const deputyIds = new Set(deputies.map(d => d.deputy_id))
            for (const deputy of anDeputies) {
              if (!deputyIds.has(deputy.deputy_id)) {
                deputies.push(deputy)
              }
            }
          }
        }
      } else {
        console.error(`Assemblée Nationale API returned status: ${response.status}`)
        fetchErrors.push(`Assemblée Nationale API: ${response.status}`)
      }
    } catch (error) {
      console.error('Error fetching from Assemblée Nationale API:', error)
      fetchErrors.push(`Assemblée Nationale API: ${error.message}`)
    }
    
    // Try nosdeputes.fr
    try {
      console.log('Trying nosdeputes.fr')
      const response = await fetch(`https://www.nosdeputes.fr/${legislature}/json`)
      if (response.ok) {
        const data = await response.json()
        if (data && data.deputes && Array.isArray(data.deputes) && data.deputes.length > 0) {
          console.log(`Got ${data.deputes.length} deputies from nosdeputes.fr`)
          sourcesSucceeded.push('nosdeputes.fr')
          
          const ndDeputies = data.deputes.map((item: any) => {
            const deputy = item.depute
            return {
              deputy_id: deputy.id || `PA${deputy.slug.replace(/[^0-9]/g, '')}`,
              first_name: deputy.prenom || deputy.first_name,
              last_name: deputy.nom || deputy.last_name,
              full_name: `${deputy.prenom || deputy.first_name || ''} ${deputy.nom || deputy.last_name || ''}`.trim(),
              political_group: deputy.groupe_sigle || deputy.political_group,
              political_group_id: deputy.groupe_uid || deputy.political_group_id,
              profession: deputy.profession,
              legislature
            }
          })
          
          if (deputies.length === 0) {
            deputies = ndDeputies
          } else {
            // Merge with existing data
            const deputyIds = new Set(deputies.map(d => d.deputy_id))
            for (const deputy of ndDeputies) {
              if (!deputyIds.has(deputy.deputy_id)) {
                deputies.push(deputy)
              }
            }
          }
        }
      } else {
        console.error(`nosdeputes.fr API returned status: ${response.status}`)
        fetchErrors.push(`nosdeputes.fr: ${response.status}`)
      }
    } catch (error) {
      console.error('Error fetching from nosdeputes.fr:', error)
      fetchErrors.push(`nosdeputes.fr: ${error.message}`)
    }

    // Try CSV data as another alternative
    if (deputies.length === 0) {
      console.log('No deputies found, trying CSV source...')
      try {
        const response = await fetch(`https://www.nosdeputes.fr/${legislature}/csv`)
        if (response.ok) {
          const csvData = await response.text()
          console.log('Successfully fetched CSV data, processing...')
          sourcesSucceeded.push('CSV (nosdeputes.fr)')

          // Basic CSV processing
          const rows = csvData.split('\n')
          const deputies: Deputy[] = []
          
          if (rows.length > 1) {
            const headers = rows[0].split(';')
            const idIndex = headers.findIndex(h => h.includes('id'))
            const prenomIndex = headers.findIndex(h => h.includes('prenom'))
            const nomIndex = headers.findIndex(h => h.includes('nom'))
            const groupeIndex = headers.findIndex(h => h.includes('groupe_sigle'))
            const professionIndex = headers.findIndex(h => h.includes('profession'))
            
            for (let i = 1; i < rows.length; i++) {
              const values = rows[i].split(';')
              if (values.length >= Math.max(idIndex, prenomIndex, nomIndex) + 1) {
                const firstName = prenomIndex >= 0 ? values[prenomIndex] : 'Prénom inconnu'
                const lastName = nomIndex >= 0 ? values[nomIndex] : 'Nom inconnu'
                
                const deputy: Deputy = {
                  deputy_id: (idIndex >= 0 && values[idIndex]) ? values[idIndex] : `PA${i}`,
                  first_name: firstName,
                  last_name: lastName,
                  full_name: `${firstName} ${lastName}`.trim(),
                  legislature: legislature,
                  political_group: groupeIndex >= 0 ? values[groupeIndex] : undefined,
                  profession: professionIndex >= 0 ? values[professionIndex] : undefined
                }
                deputies.push(deputy)
              }
            }
          }
          
          if (deputies.length > 0) {
            console.log(`Processed ${deputies.length} deputies from CSV data`)
          }
        } else {
          console.error(`CSV source returned status: ${response.status}`)
          fetchErrors.push(`CSV source: ${response.status}`)
        }
      } catch (error) {
        console.error('Error fetching/processing CSV source:', error)
        fetchErrors.push(`CSV source: ${error.message}`)
      }
    }
    
    // Generate static placeholder data as last resort
    if (deputies.length === 0) {
      console.log('Using static placeholder data as last resort')
      sourcesSucceeded.push('Données statiques')

      const staticPoliticalGroups = [
        { name: 'Rassemblement National', id: 'RN' },
        { name: 'La France Insoumise - Nouvelle Front Populaire', id: 'LFI-NFP' },
        { name: 'Socialistes et apparentés', id: 'SOC' },
        { name: 'Ensemble pour la République', id: 'EPR' },
        { name: 'Horizons & Indépendants', id: 'HOR' },
        { name: 'Droite Républicaine', id: 'DR' },
        { name: 'LIOT', id: 'LIOT' },
        { name: 'Écologie et Social', id: 'ECO' }
      ]
      
      // Generate 577 static deputies for the French National Assembly
      deputies = Array.from({ length: 577 }, (_, i) => {
        const groupIndex = i % staticPoliticalGroups.length
        const deputyNumber = i + 1
        return {
          deputy_id: `PA${1000 + deputyNumber}`,
          first_name: `Député`,
          last_name: `#${deputyNumber}`,
          full_name: `Député #${deputyNumber}`,
          legislature: legislature,
          political_group: staticPoliticalGroups[groupIndex].name,
          political_group_id: staticPoliticalGroups[groupIndex].id
        }
      })
      console.log(`Generated ${deputies.length} static placeholder deputies`)
    }

    // If we have existing deputies and new fetched deputies, merge them
    let finalDeputies = deputies
    
    if (existingDeputies.length > 0) {
      console.log('Merging existing and new deputies data')
      
      // Create a map of existing deputies by ID for quick lookup
      const existingDeputiesMap = new Map()
      existingDeputies.forEach(deputy => {
        existingDeputiesMap.set(deputy.deputy_id, deputy)
      })
      
      // Update finalDeputies by preferring existing data when available
      finalDeputies = deputies.map(deputy => {
        const existingDeputy = existingDeputiesMap.get(deputy.deputy_id)
        if (existingDeputy && !force) {
          // Merge strategy: keep existing data but fill gaps with new data
          return {
            ...existingDeputy,
            first_name: existingDeputy.first_name || deputy.first_name,
            last_name: existingDeputy.last_name || deputy.last_name,
            full_name: existingDeputy.full_name || deputy.full_name || `${deputy.first_name} ${deputy.last_name}`.trim(),
            political_group: existingDeputy.political_group || deputy.political_group,
            political_group_id: existingDeputy.political_group_id || deputy.political_group_id,
            profession: existingDeputy.profession || deputy.profession
          }
        }
        
        // Ensure full_name is set
        if (!deputy.full_name) {
          deputy.full_name = `${deputy.first_name} ${deputy.last_name}`.trim()
        }
        
        // For forced updates, use new data but preserve any missing fields from existing
        if (force && existingDeputy) {
          return {
            ...deputy,
            first_name: deputy.first_name || existingDeputy.first_name,
            last_name: deputy.last_name || existingDeputy.last_name,
            full_name: deputy.full_name || existingDeputy.full_name,
            political_group: deputy.political_group || existingDeputy.political_group,
            political_group_id: deputy.political_group_id || existingDeputy.political_group_id,
            profession: deputy.profession || existingDeputy.profession
          }
        }
        
        return deputy
      })
      
      // Add any existing deputies not in the new data
      const newDeputyIds = new Set(deputies.map(d => d.deputy_id))
      existingDeputies.forEach(deputy => {
        if (!newDeputyIds.has(deputy.deputy_id)) {
          finalDeputies.push(deputy)
        }
      })
    }

    console.log(`Total deputies to sync: ${finalDeputies.length}`)
    
    // Enhance deputies with full name if missing
    finalDeputies = finalDeputies.map(deputy => {
      if (!deputy.full_name) {
        deputy.full_name = `${deputy.first_name} ${deputy.last_name}`.trim()
      }
      return deputy
    })

    // Insert deputies into Supabase
    console.log('Starting Supabase upsert...')
    
    const { error: upsertError } = await supabase
      .from('deputies')
      .upsert(finalDeputies, { onConflict: 'deputy_id,legislature' })

    if (upsertError) {
      console.error('Error upserting deputies:', upsertError)
      await updateSyncStatus('error', `Error upserting deputies: ${upsertError.message}`)
      return new Response(
        JSON.stringify({
          success: false,
          message: `Error upserting deputies: ${upsertError.message}`,
          fetch_errors: fetchErrors,
          sources_succeeded: sourcesSucceeded
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    console.log('Successfully synced deputies to Supabase')
    await updateSyncStatus('success', JSON.stringify({
      count: finalDeputies.length,
      sources: sourcesSucceeded,
      timestamp: new Date().toISOString()
    }))

    return new Response(
      JSON.stringify({
        success: true,
        deputies_count: finalDeputies.length,
        fetch_errors: fetchErrors.length > 0 ? fetchErrors : undefined,
        sources_succeeded: sourcesSucceeded
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    await updateSyncStatus('error', `Unexpected error: ${error.message}`)
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

async function fetchWithRetry(url: string, retries = 3, delay = 300): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Attempting to fetch ${url}, attempt ${attempt}/${retries}`)
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.log(`Fetch attempt ${attempt} failed for ${url}: ${error.message}`)
      if (attempt < retries) {
        const waitTime = delay * Math.pow(2, attempt - 1)
        console.log(`Waiting ${waitTime}ms before retry...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      } else {
        throw new Error(`All fetch attempts failed. Last error: ${error.message}`)
      }
    }
  }
}

async function updateSyncStatus(status: string, logs?: string) {
  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    const { error } = await supabase
      .from('data_sync')
      .upsert({ 
        id: 'deputies_sync',
        status,
        logs
      })

    if (error) throw error
    console.log(`Successfully updated sync status to ${status}`)
  } catch (error) {
    console.error('Error updating sync status:', error)
  }
}
