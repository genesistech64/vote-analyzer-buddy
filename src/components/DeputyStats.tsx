
import React from 'react';
import { DeputeFullInfo } from '@/utils/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  User, 
  MapPin, 
  Calendar, 
  Briefcase, 
  Award, 
  Twitter, 
  Facebook, 
  Globe, 
  BarChart3, 
  FileText, 
  CheckCircle, 
  MessagesSquare 
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DeputyStatsProps {
  deputyInfo: DeputeFullInfo;
}

const DeputyStats: React.FC<DeputyStatsProps> = ({ deputyInfo }) => {
  // Vérifier si on a des données supplémentaires de data.gouv.fr
  const hasExtraData = !!(
    deputyInfo.circo || 
    deputyInfo.departement || 
    deputyInfo.csp || 
    deputyInfo.mandatsCount || 
    deputyInfo.twitter || 
    deputyInfo.facebook || 
    deputyInfo.website || 
    deputyInfo.presenceRate || 
    deputyInfo.participationRate || 
    deputyInfo.amendmentsProposed || 
    deputyInfo.amendmentsAccepted || 
    deputyInfo.questionsCount
  );

  if (!hasExtraData) {
    return null; // Ne pas afficher le composant s'il n'y a pas de données supplémentaires
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Statistiques et informations complémentaires</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Informations personnelles et géographiques */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-md flex items-center">
              <User className="w-4 h-4 mr-2" />
              Informations personnelles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {deputyInfo.age && (
              <div className="flex items-center">
                <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                <span className="text-sm">{deputyInfo.age} ans</span>
              </div>
            )}
            
            {deputyInfo.csp && (
              <div className="flex items-center">
                <Briefcase className="w-4 h-4 mr-2 text-gray-500" />
                <span className="text-sm">{deputyInfo.csp}</span>
              </div>
            )}
            
            {deputyInfo.circo && deputyInfo.departement && (
              <div className="flex items-center">
                <MapPin className="w-4 h-4 mr-2 text-gray-500" />
                <span className="text-sm">
                  {deputyInfo.circo ? `Circonscription ${deputyInfo.circo}` : ''} 
                  {deputyInfo.departement ? ` - ${deputyInfo.departement}` : ''}
                </span>
              </div>
            )}
            
            {deputyInfo.mandatsCount && (
              <div className="flex items-center">
                <Award className="w-4 h-4 mr-2 text-gray-500" />
                <span className="text-sm">{deputyInfo.mandatsCount} mandat(s)</span>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Réseaux sociaux et site web */}
        {(deputyInfo.twitter || deputyInfo.facebook || deputyInfo.website) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-md flex items-center">
                <Globe className="w-4 h-4 mr-2" />
                Présence en ligne
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {deputyInfo.twitter && (
                <div className="flex items-center">
                  <Twitter className="w-4 h-4 mr-2 text-blue-400" />
                  <a 
                    href={`https://twitter.com/${deputyInfo.twitter.replace('@', '')}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {deputyInfo.twitter}
                  </a>
                </div>
              )}
              
              {deputyInfo.facebook && (
                <div className="flex items-center">
                  <Facebook className="w-4 h-4 mr-2 text-blue-600" />
                  <a 
                    href={deputyInfo.facebook.startsWith('http') ? deputyInfo.facebook : `https://facebook.com/${deputyInfo.facebook}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Facebook
                  </a>
                </div>
              )}
              
              {deputyInfo.website && (
                <div className="flex items-center">
                  <Globe className="w-4 h-4 mr-2 text-gray-600" />
                  <a 
                    href={deputyInfo.website.startsWith('http') ? deputyInfo.website : `https://${deputyInfo.website}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Site web
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        
        {/* Statistiques d'activité */}
        {(deputyInfo.presenceRate || deputyInfo.participationRate || 
          deputyInfo.amendmentsProposed || deputyInfo.amendmentsAccepted || 
          deputyInfo.questionsCount) && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-md flex items-center">
                <BarChart3 className="w-4 h-4 mr-2" />
                Activité parlementaire
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {deputyInfo.presenceRate && (
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-500 flex items-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="flex items-center">
                              Présence en commission
                              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-xs">?</span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Taux de présence aux réunions des commissions</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </span>
                    <span className="text-lg font-semibold mt-1">
                      {deputyInfo.presenceRate}
                    </span>
                  </div>
                )}
                
                {deputyInfo.participationRate && (
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-500 flex items-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="flex items-center">
                              Participation aux votes
                              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-xs">?</span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Taux de participation aux votes solennels</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </span>
                    <span className="text-lg font-semibold mt-1">
                      {deputyInfo.participationRate}
                    </span>
                  </div>
                )}
                
                {deputyInfo.amendmentsProposed && (
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-500 flex items-center">
                      <FileText className="w-3 h-3 mr-1" />
                      Amendements proposés
                    </span>
                    <span className="text-lg font-semibold mt-1">
                      {deputyInfo.amendmentsProposed}
                    </span>
                  </div>
                )}
                
                {deputyInfo.amendmentsAccepted && (
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-500 flex items-center">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Amendements adoptés
                    </span>
                    <span className="text-lg font-semibold mt-1">
                      {deputyInfo.amendmentsAccepted}
                    </span>
                  </div>
                )}
                
                {deputyInfo.questionsCount && (
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-500 flex items-center">
                      <MessagesSquare className="w-3 h-3 mr-1" />
                      Questions posées
                    </span>
                    <span className="text-lg font-semibold mt-1">
                      {deputyInfo.questionsCount}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default DeputyStats;
