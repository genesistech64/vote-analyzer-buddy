
import { BarChart3, ExternalLink } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Separator } from '@/components/ui/separator';
import MainNavigation from '@/components/MainNavigation';

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <header className="header-gradient shadow-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <BarChart3 className="h-8 w-8 text-white mr-3" />
              <h1 className="text-xl font-semibold text-white">AN Vote Analyser</h1>
            </div>
            <div className="text-sm text-white/90">Assemblée Nationale - 17e législature</div>
          </div>
        </div>
      </header>

      <MainNavigation />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-8 space-y-8">
        <div className="content-container">
          <h1 className="text-3xl font-bold text-[#003366] text-center mb-8">
            Les statistiques de l'Assemblée Nationale expliquées
          </h1>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#00a1cf] mb-4">En quelques mots</h2>
            <p className="mb-4">
              <span className="font-semibold">AN Vote Analyser</span> est un réseau ouvert qui permet d'analyser les données parlementaires des député·es français·es, notamment leur participation aux votes et leurs déports de conflit d'intérêts.
            </p>
            <p>
              L'objectif est d'améliorer la transparence parlementaire et de faciliter la compréhension des activités législatives par le grand public.
            </p>
          </section>

          <Separator className="my-6" />

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#00a1cf] mb-4">Accès aux données</h2>
            <p className="mb-4">
              Toutes les données de l'Assemblée nationale sont <a href="https://data.assemblee-nationale.fr/" target="_blank" rel="noopener noreferrer" className="text-[#00a1cf] hover:underline">disponibles sur le portail d'open data</a>.
            </p>
            <p className="mb-4">
              Les données mises en forme par Datan sont intégralement open source, accessibles à tous gratuitement, et sous licence ouverte. Vous pouvez les consulter gratuitement ou les réutiliser pour vos recherches.
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Détails sur les députés actuels (informations et identifiants)</li>
              <li>Données sur les commissions parlementaires</li>
              <li>Statistiques sur les votes à l'Assemblée nationale depuis 2017</li>
            </ul>
          </section>

          <Separator className="my-6" />

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#00a1cf] mb-4">Le système des votes</h2>
            <p className="mb-4">
              Le site vous permet d'analyser tous les votes enregistrés à l'Assemblée nationale. Vous pouvez explorer ces votes en fonction des positions de vote de chaque député, par scrutin ou par période.
            </p>
            <p className="mb-4">
              Généralement, les députés ont plusieurs manières de voter au gouvernement. Ils peuvent premièrement voter directement dans l'hémicycle, physiquement ou électroniquement. Ils peuvent également voter par délégation.
            </p>
            <p>
              Pour chaque vote, nous distinguons 4 types de positions possibles:
            </p>
            <ul className="list-disc pl-6 space-y-2 my-4">
              <li><span className="font-semibold">Pour:</span> Le député a voté en faveur du texte</li>
              <li><span className="font-semibold">Contre:</span> Le député s'est opposé au texte</li>
              <li><span className="font-semibold">Abstention:</span> Le député était présent mais n'a pas pris position</li>
              <li><span className="font-semibold">Non-votant:</span> Le député n'a pas participé au vote</li>
            </ul>
          </section>

          <Separator className="my-6" />

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#00a1cf] mb-4">Le taux de participation</h2>
            <p>
              Le taux de participation d'un député représente le pourcentage de scrutins auxquels il a pris part (que ce soit par un vote "pour", "contre" ou une abstention) par rapport au nombre total de scrutins organisés pendant la période considérée.
            </p>
            <div className="bg-gray-50 p-4 rounded-md border border-gray-200 my-4">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Attention:</span> Il est important de noter que tous les députés n'ont pas la même durée d'exercice de leur mandat. Certains peuvent avoir été élus lors d'élections législatives partielles ou avoir démissionné en cours de mandat. Le taux de participation ne prend en compte que les scrutins qui ont eu lieu pendant que le député était en fonction.
              </p>
            </div>
          </section>

          <Separator className="my-6" />

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-[#00a1cf] mb-4">Les déports (conflits d'intérêts)</h2>
            <p className="mb-4">
              Les députés peuvent se "déporter" volontairement d'un vote lorsqu'ils estiment être en situation de conflit d'intérêts. Cela signifie qu'ils s'abstiennent de participer à un vote particulier en raison d'intérêts personnels qui pourraient influencer leur jugement.
            </p>
            <p>
              Cette pratique, encouragée par le code de déontologie de l'Assemblée nationale, vise à renforcer la transparence et l'intégrité du processus législatif.
            </p>
          </section>

          <div className="flex justify-center mt-8">
            <Button
              onClick={() => window.location.href = '/'}
              className="uppercase"
            >
              Retour à l'accueil
            </Button>
          </div>
        </div>
      </main>

      <footer className="bg-[#003366] text-white py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-center">
            Données issues de l'open data de l'Assemblée nationale française <br />
            <span className="text-[#00a1cf]">Mise à jour toutes les 48 heures via API</span> <br />
            <a 
              href="https://data.assemblee-nationale.fr" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[#00a1cf] hover:underline flex items-center justify-center mt-2"
            >
              data.assemblee-nationale.fr
              <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default About;
