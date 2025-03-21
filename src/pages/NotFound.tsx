
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { BarChart3 } from 'lucide-react';
import MainNavigation from '@/components/MainNavigation';

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="header-gradient shadow-md w-full">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center">
            <BarChart3 className="h-8 w-8 text-white mr-3" />
            <h1 className="text-xl font-semibold text-white">AN Vote Analyser</h1>
          </div>
        </div>
      </header>
    
      <MainNavigation />
      
      <div className="flex-grow flex items-center justify-center">
        <div className="content-container text-center py-12">
          <h1 className="text-6xl font-bold text-[#003366] mb-4">404</h1>
          <p className="text-xl text-gray-600 mb-6">Page non trouvée</p>
          <p className="text-gray-500 mb-8">La page que vous recherchez n'existe pas ou a été déplacée.</p>
          <Button 
            onClick={() => window.location.href = '/'}
            className="uppercase"
          >
            Retour à l'accueil
          </Button>
        </div>
      </div>
      
      <footer className="bg-[#003366] text-white py-6 w-full">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-center">
            Données issues de l'open data de l'Assemblée nationale française
          </p>
        </div>
      </footer>
    </div>
  );
};

export default NotFound;
