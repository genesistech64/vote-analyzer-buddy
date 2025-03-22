
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { getGroupePolitiqueCouleur } from '@/utils/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PoliticalGroupBadgeProps {
  groupe?: string;
  groupeUid?: string;
  onClick?: () => void;
  className?: string;
  showTooltip?: boolean;
}

const PoliticalGroupBadge: React.FC<PoliticalGroupBadgeProps> = ({ 
  groupe, 
  groupeUid,
  onClick, 
  className = "",
  showTooltip = false
}) => {
  const navigate = useNavigate();
  
  if (!groupe) return null;
  
  const couleur = getGroupePolitiqueCouleur(groupe);
  
  const handleClick = () => {
    if (onClick) {
      // Si un handler onClick est fourni, l'utiliser
      onClick();
    } else if (groupeUid) {
      // Sinon, si un ID de groupe est fourni, naviguer vers la page du groupe
      const encodedNom = encodeURIComponent(groupe);
      navigate(`/organe/${groupeUid}/${encodedNom}/GP`);
    }
  };
  
  const badge = (
    <Badge 
      variant="outline" 
      className={`${className} cursor-pointer hover:bg-opacity-90 transition-colors`} 
      onClick={handleClick}
      style={{ 
        backgroundColor: couleur,
        color: isLightColor(couleur) ? '#000' : '#fff',
        borderColor: 'transparent'
      }}
    >
      {groupe}
    </Badge>
  );
  
  if (showTooltip && groupeUid) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {badge}
          </TooltipTrigger>
          <TooltipContent>
            <p>Voir tous les membres du groupe</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return badge;
};

// Fonction pour déterminer si une couleur est claire (pour choisir la couleur du texte)
function isLightColor(hexColor: string): boolean {
  // Convertir la couleur hexadécimale en RGB
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  
  // Calculer la luminosité (formule standard YIQ)
  const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  
  // Si la luminosité est supérieure à 0.5, c'est une couleur claire
  return luminance > 0.5;
}

export default PoliticalGroupBadge;
