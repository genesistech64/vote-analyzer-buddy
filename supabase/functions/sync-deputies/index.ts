
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
    const deputies: Deputy[] = []

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
          } else {
            // If main endpoint returns no data, try the active deputies endpoint
            const activeData = await fetchWithRetry(`https://api-dataan.onrender.com/api/v1/legislature/${legislature}/deputes/actifs?page=${page}&limit=${batch_size}`)
            if (activeData && activeData.length > 0) {
              deputies.push(...activeData)
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

    // If we still don't have any deputies, try alternative source
    if (deputies.length === 0) {
      console.log('No deputies found, trying alternative source...')
      try {
        const response = await fetch(`https://www.nosdeputes.fr/${legislature}/csv`)
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
        
        const csvData = await response.text()
        console.log('Successfully fetched CSV data, processing...')

        // Basic CSV processing (you might want to use a CSV parser library)
        const rows = csvData.split('\n')
        const headers = rows[0].split(';')
        
        for (let i = 1; i < rows.length; i++) {
          const values = rows[i].split(';')
          if (values.length === headers.length) {
            const deputy: Deputy = {
              deputy_id: values[0],
              first_name: values[1],
              last_name: values[2],
              legislature: legislature,
              political_group: values[3],
              political_group_id: values[4],
              profession: values[5]
            }
            deputies.push(deputy)
          }
        }
      } catch (error) {
        console.error('Error fetching/processing alternative source:', error)
        fetchErrors.push(`Error with alternative source: ${error.message}`)
      }
    }

    console.log(`Total deputies fetched: ${deputies.length}`)

    if (deputies.length === 0) {
      console.error('No deputies fetched from any source, cannot proceed with sync')
      await updateSyncStatus('error', 'No deputies fetched from any source')
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No deputies fetched from any source',
          fetch_errors: fetchErrors
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Insert deputies into Supabase
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    console.log('Starting Supabase upsert...')
    
    const { error: upsertError } = await supabase
      .from('deputies')
      .upsert(
        deputies.map(deputy => ({
          ...deputy,
          full_name: `${deputy.first_name} ${deputy.last_name}`.trim()
        })),
        { onConflict: 'deputy_id,legislature' }
      )

    if (upsertError) {
      console.error('Error upserting deputies:', upsertError)
      await updateSyncStatus('error', `Error upserting deputies: ${upsertError.message}`)
      return new Response(
        JSON.stringify({
          success: false,
          message: `Error upserting deputies: ${upsertError.message}`,
          fetch_errors: fetchErrors
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    console.log('Successfully synced deputies to Supabase')
    await updateSyncStatus('success')

    return new Response(
      JSON.stringify({
        success: true,
        deputies_count: deputies.length,
        fetch_errors: fetchErrors
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
