
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

// Configuration pour CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Fonction pour obtenir les différents endpoints de l'API de l'Assemblée Nationale
function getAPIEndpoints(legislature: string) {
  return {
    // Endpoint pour obtenir la liste des députés par législature
    deputiesListUrl: `https://api-dataan.onrender.com/deputes_liste?legislature=${legislature}`,
    // Endpoint pour obtenir les détails d'un député
    deputyDetailsUrl: (deputyId: string) => `https://api-dataan.onrender.com/depute?depute_id=${deputyId}&legislature=${legislature}`
  }
}

serve(async (req) => {
  console.log("Démarrage de la synchronisation des députés...")
  
  // Gestion des requêtes OPTIONS pour CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  
  try {
    // Création du client Supabase depuis les variables d'environnement
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Variables d\'environnement SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquantes')
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Récupération des paramètres de la requête
    const url = new URL(req.url)
    const legislature = url.searchParams.get('legislature') || '17'
    const force = url.searchParams.get('force') === 'true'
    
    console.log(`Synchronisation pour la législature ${legislature}, force=${force}`)
    
    // Vérification de la dernière synchronisation
    const { data: syncData } = await supabase
      .from('data_sync')
      .select('*')
      .eq('id', 'deputies_sync')
      .single()
    
    // Si pas de synchronisation forcée et dernière mise à jour < 24h, on s'arrête
    if (!force && syncData) {
      const lastSync = new Date(syncData.last_sync)
      const now = new Date()
      const hoursSinceLastSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60)
      
      if (hoursSinceLastSync < 24) {
        console.log(`Dernière synchronisation il y a ${hoursSinceLastSync.toFixed(2)} heures. Synchronisation ignorée.`)
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Dernière synchronisation il y a ${hoursSinceLastSync.toFixed(2)} heures. Utilisez force=true pour forcer la synchronisation.` 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }
    
    // Mise à jour du statut de synchronisation
    await supabase
      .from('data_sync')
      .upsert({
        id: 'deputies_sync',
        status: 'in_progress',
        last_sync: new Date().toISOString(),
        logs: 'Démarrage de la synchronisation'
      })
    
    const endpoints = getAPIEndpoints(legislature)
    
    // Récupération de la liste des députés
    console.log(`Récupération de la liste des députés pour la législature ${legislature}...`)
    const deputiesResponse = await fetch(endpoints.deputiesListUrl)
    
    if (!deputiesResponse.ok) {
      throw new Error(`Erreur lors de la récupération de la liste des députés: ${deputiesResponse.status}`)
    }
    
    const deputiesList = await deputiesResponse.json()
    
    console.log(`${deputiesList.length} députés trouvés. Synchronisation des données...`)
    
    // Traitement par lots de 10 députés (pour éviter de surcharger l'API)
    const batchSize = 10
    const totalBatches = Math.ceil(deputiesList.length / batchSize)
    
    let updatedCount = 0
    let errorCount = 0
    let logs = []
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * batchSize
      const batchEnd = Math.min(batchStart + batchSize, deputiesList.length)
      const batch = deputiesList.slice(batchStart, batchEnd)
      
      console.log(`Traitement du lot ${batchIndex + 1}/${totalBatches} (${batchStart}-${batchEnd})`)
      
      const batchPromises = batch.map(async (deputy: any) => {
        try {
          const deputyId = deputy.id || ''
          
          if (!deputyId || !deputyId.startsWith('PA')) {
            throw new Error(`ID de député invalide: ${deputyId}`)
          }
          
          // Récupération des détails du député
          const detailsResponse = await fetch(endpoints.deputyDetailsUrl(deputyId))
          
          if (!detailsResponse.ok) {
            throw new Error(`Erreur ${detailsResponse.status} pour le député ${deputyId}`)
          }
          
          const details = await detailsResponse.json()
          
          // Extraction des données pertinentes
          let firstName = '', lastName = '', profession = '', politicalGroup = '', politicalGroupId = ''
          
          if (details.etatCivil && details.etatCivil.ident) {
            firstName = details.etatCivil.ident.prenom || details.prenom || ''
            lastName = details.etatCivil.ident.nom || details.nom || ''
          } else {
            firstName = details.prenom || ''
            lastName = details.nom || ''
          }
          
          profession = details.profession || ''
          
          // Recherche du groupe politique
          if (details.mandats && details.mandats.mandat) {
            const mandats = Array.isArray(details.mandats.mandat) 
              ? details.mandats.mandat 
              : [details.mandats.mandat]
            
            // On cherche le mandat de type groupe politique (GP)
            const gpMandat = mandats.find((m: any) => {
              const typeOrgane = m.typeOrgane ? 
                (typeof m.typeOrgane === 'string' ? m.typeOrgane : m.typeOrgane['#text']) : ''
              return typeOrgane === 'GP'
            })
            
            if (gpMandat) {
              politicalGroup = gpMandat.nomOrgane ? 
                (typeof gpMandat.nomOrgane === 'string' ? gpMandat.nomOrgane : gpMandat.nomOrgane['#text']) : ''
              
              politicalGroupId = gpMandat.organeRef ? 
                (typeof gpMandat.organeRef === 'string' ? gpMandat.organeRef : gpMandat.organeRef['#text']) : ''
            }
          } else if (details.groupe_politique) {
            politicalGroup = details.groupe_politique
            politicalGroupId = details.groupe_politique_uid || ''
          }
          
          // Insertion/mise à jour dans la base de données
          const { error } = await supabase
            .from('deputies')
            .upsert({
              deputy_id: deputyId,
              first_name: firstName,
              last_name: lastName,
              legislature,
              political_group: politicalGroup,
              political_group_id: politicalGroupId,
              profession
            })
          
          if (error) {
            throw new Error(`Erreur base de données pour ${deputyId}: ${error.message}`)
          }
          
          updatedCount++
          return { success: true, deputy_id: deputyId }
        } catch (err) {
          errorCount++
          logs.push(`Erreur pour ${deputy.id || 'député inconnu'}: ${err.message}`)
          console.error(`Erreur pour ${deputy.id || 'député inconnu'}:`, err)
          return { success: false, deputy_id: deputy.id, error: err.message }
        }
      })
      
      await Promise.all(batchPromises)
      
      // Petite pause entre les lots pour ne pas surcharger l'API
      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    // Mise à jour du statut de synchronisation final
    const finalStatus = errorCount === 0 ? 'success' : 'partial_success'
    await supabase
      .from('data_sync')
      .upsert({
        id: 'deputies_sync',
        status: finalStatus,
        last_sync: new Date().toISOString(),
        logs: JSON.stringify({
          updated: updatedCount,
          errors: errorCount,
          logs: logs.slice(0, 50) // Limiter le nombre de logs stockés
        })
      })
    
    console.log(`Synchronisation terminée. ${updatedCount} députés mis à jour, ${errorCount} erreurs.`)
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        updated: updatedCount, 
        errors: errorCount,
        legislature
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Erreur lors de la synchronisation:', error)
    
    // Mise à jour du statut de synchronisation en cas d'erreur globale
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey)
        await supabase
          .from('data_sync')
          .upsert({
            id: 'deputies_sync',
            status: 'error',
            last_sync: new Date().toISOString(),
            logs: `Erreur: ${error.message}`
          })
      }
    } catch (dbError) {
      console.error('Erreur lors de la mise à jour du statut:', dbError)
    }
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
