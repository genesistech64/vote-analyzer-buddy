
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { getGroupePolitiqueCouleur } from '@/utils/types';

interface PoliticalGroupBadgeProps {
  groupe?: string;
  onClick?: () => void;
  className?: string;
}

const PoliticalGroupBadge: React.FC<PoliticalGroupBadgeProps> = ({ 
  groupe, 
  onClick, 
  className = "" 
}) => {
  if (!groupe) return null;
  
  const couleur = getGroupePolitiqueCouleur(groupe);
  
  return (
    <Badge 
      variant="outline" 
      className={`${className} cursor-pointer hover:bg-opacity-90 transition-colors`} 
      onClick={onClick}
      style={{ 
        backgroundColor: couleur,
        color: isLightColor(couleur) ? '#000' : '#fff',
        borderColor: 'transparent'
      }}
    >
      {groupe}
    </Badge>
  );
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
