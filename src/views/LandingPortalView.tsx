import React from 'react';
import { Shield, UserCheck, Server, ArrowRight, Lock, CheckCircle2, Radio } from 'lucide-react';

interface Props {
  onNavigateToAdminLogin: () => void;
  onNavigateToParrainLogin: () => void;
}

export const LandingPortalView: React.FC<Props> = ({
  onNavigateToAdminLogin,
  onNavigateToParrainLogin,
}) => {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col justify-between font-sans">
      {/* Top Navbar */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-xs sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-xs tracking-wider shadow-xs">
              PW
            </span>
            <div>
              <span className="font-bold text-slate-900 text-base tracking-tight">PAWAKO</span>
              <span className="text-[11px] text-slate-500 ml-2 font-medium">Referral & Recruitment</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-100/80 px-3 py-1.5 rounded-lg border border-slate-200">
            <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
            <span className="font-medium">Passerelle Discord Active (4 Serveurs)</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center p-6 py-12">
        <div className="max-w-4xl w-full space-y-10">
          {/* Hero Header */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-full">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>Authentification Sécurisée & Rôles Dédiés</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Portail Officiel PAWAKO
            </h1>
            <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto leading-relaxed">
              Sélectionnez votre espace de travail pour vous connecter avec votre compte Discord authentifié.
            </p>
          </div>

          {/* 2 Distinct Access Doors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1: Espace Administration & Direction */}
            <div className="bg-slate-900 text-white border border-slate-800 rounded-2xl p-7 flex flex-col justify-between space-y-6 shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
              <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />

              <div className="space-y-4 relative z-1">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-sky-400">
                    <Shield className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-full">
                    Accès Direction
                  </span>
                </div>

                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white">
                    Espace Administration
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Réservé à la Direction et aux Responsables Formation.
                  </p>
                </div>

                <ul className="space-y-2 text-xs text-slate-300 pt-2 border-t border-slate-800">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Pilotage central des 4 serveurs Discord</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Parcours séparés VA Chatting & VA Instagram</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Journal d'audit et attributions de parrainage</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-2 pt-2 relative z-1">
                <button
                  onClick={onNavigateToAdminLogin}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md active:scale-[0.99]"
                >
                  <span>Accéder à l'Administration</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <div className="text-[10px] text-center text-slate-500 font-mono">
                  URL : /admin/login
                </div>
              </div>
            </div>

            {/* Card 2: Espace Parrain */}
            <div className="bg-white text-slate-900 border border-slate-200 rounded-2xl p-7 flex flex-col justify-between space-y-6 shadow-sm relative overflow-hidden group hover:border-slate-300 hover:shadow-md transition-all">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                    <UserCheck className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
                    Parrains Agréés
                  </span>
                </div>

                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">
                    Espace Parrain
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Portail officiel dédié aux parrains autorisés PAWAKO.
                  </p>
                </div>

                <ul className="space-y-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Lien d'invitation Discord unique et personnalisé</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Suivi transparent de vos filleuls et de leur avancement</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Statistiques personnelles et taux de conversion</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  onClick={onNavigateToParrainLogin}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-[0.99]"
                >
                  <span>Accéder à l'Espace Parrain</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <div className="text-[10px] text-center text-slate-400 font-mono">
                  URL : /parrain/login
                </div>
              </div>
            </div>
          </div>

          {/* Privacy & Security Footnote */}
          <div className="p-4 bg-slate-100/60 border border-slate-200/80 rounded-xl text-center text-xs text-slate-500 space-y-1">
            <p className="font-semibold text-slate-700">
              Sécurité des données et confidentialité garantie
            </p>
            <p className="text-[11px] leading-relaxed max-w-2xl mx-auto">
              Aucune donnée sensible n'est exposée sans authentification. Les accès parrain sont strictement isolés de leurs pairs. Toutes les opérations de validation sont vérifiées côté serveur.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white p-4 text-center text-[11px] text-slate-400">
        PAWAKO Referral & Recruitment Manager — Système sécurisé connecté à Discord
      </footer>
    </div>
  );
};
