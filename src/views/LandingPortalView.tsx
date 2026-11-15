import React, { useState } from 'react';
import { Shield, UserCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import { PawakoLogo } from '../components/PawakoLogo';
import { ThemeToggle } from '../components/ThemeToggle';

interface Props {
  onNavigateToAdminLogin: () => void;
  onNavigateToParrainLogin: () => void;
}

export const LandingPortalView: React.FC<Props> = ({
  onNavigateToAdminLogin,
  onNavigateToParrainLogin,
}) => {
  const [bannerError, setBannerError] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#06040a] text-slate-900 dark:text-[#f4f1fa] flex flex-col justify-between transition-colors">
      {/* Minimal Top Bar */}
      <header className="border-b border-slate-200 dark:border-[#201636] bg-white/95 dark:bg-[#08050f]/95 sticky top-0 z-20 transition-colors">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <PawakoLogo size="sm" />
            <span className="font-serif font-bold text-slate-950 dark:text-[#f8f6fc] text-lg tracking-tight whitespace-nowrap">
              PAWAKO
            </span>
          </div>

          <ThemeToggle compact />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center py-10 sm:py-14 px-5 sm:px-6">
        <div className="max-w-5xl w-full space-y-10">
          {/* Editorial Opening Hero (Split Desktop Layout) */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            <div className="lg:col-span-6 space-y-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">
                Programme de Parrainage PAWAKO
              </div>

              <h1 className="font-serif text-3xl sm:text-4xl lg:text-[2.85rem] font-bold text-slate-950 dark:text-[#f8f6fc] tracking-tight leading-[1.1] [text-wrap:balance]">
                Recrutez les meilleurs talents. Suivez chaque réussite.
              </h1>

              <p className="text-sm sm:text-base text-slate-600 dark:text-[#b7aed0] leading-relaxed max-w-xl">
                Un portail unique connecté à Discord pour piloter vos filleuls de l&apos;invitation jusqu&apos;à la mise en production, sur les pôles VA Chatteur et VA Instagram.
              </p>

              <ul className="space-y-2.5 pt-1 text-xs sm:text-sm text-slate-700 dark:text-[#d8d0eb]">
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
                  <span>Attribution automatique des candidats via votre lien Discord officiel</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
                  <span>Parcours dédiés par spécialité avec suivi étape par étape</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
                  <span>Guides pratiques, barèmes et objectifs visibles en temps réel</span>
                </li>
              </ul>
            </div>

            <div className="lg:col-span-6">
              <div className="rounded-2xl overflow-hidden bg-black border border-slate-200 dark:border-[#291c45] shadow-xl dark:shadow-[0_18px_50px_rgba(124,58,237,0.14)]">
                {!bannerError ? (
                  <img
                    src="/assets/aistudio/image_20261113_014958_13c36f49.jpg"
                    alt="PAWAKO Referral Manager"
                    referrerPolicy="no-referrer"
                    onError={() => setBannerError(true)}
                    className="w-full h-auto block object-contain bg-black"
                  />
                ) : (
                  <div className="py-16 px-6 flex flex-col items-center justify-center gap-3 bg-[#08050f]">
                    <PawakoLogo size="xl" />
                    <span className="font-serif text-2xl font-bold tracking-tight text-white">PAWAKO</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Two High-Contrast Dedicated Access Portals */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            {/* Espace Parrain */}
            <div className="group bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-7 sm:p-8 flex flex-col justify-between space-y-7 transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-500/60 dark:hover:border-violet-400/50 hover:shadow-lg dark:hover:shadow-[0_12px_32px_rgba(124,58,237,0.12)]">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 rounded-xl bg-violet-50 dark:bg-[#191129] border border-violet-200 dark:border-violet-500/35 flex items-center justify-center text-violet-700 dark:text-violet-300">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                    Accès Parrain
                  </span>
                </div>

                <div>
                  <h2 className="font-serif text-2xl font-bold tracking-tight text-slate-950 dark:text-[#f8f6fc]">
                    Espace Parrain
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-[#9d93b8] mt-1.5 leading-relaxed">
                    Récupérez votre lien officiel, consultez le journal du programme et suivez l&apos;avancement de vos filleuls vers la production.
                  </p>
                </div>
              </div>

              <button
                onClick={onNavigateToParrainLogin}
                className="w-full min-h-[46px] flex items-center justify-center gap-2 py-3 px-4 bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer"
              >
                <span>Entrer dans l&apos;Espace Parrain</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            {/* Espace Administration */}
            <div className="group bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-7 sm:p-8 flex flex-col justify-between space-y-7 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-400 dark:hover:border-violet-500/45 hover:shadow-lg dark:hover:shadow-[0_12px_32px_rgba(124,58,237,0.1)]">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-[#171026] border border-slate-200 dark:border-[#2f224a] flex items-center justify-center text-slate-800 dark:text-violet-300">
                    <Shield className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#9d93b8]">
                    Direction &amp; Formation
                  </span>
                </div>

                <div>
                  <h2 className="font-serif text-2xl font-bold tracking-tight text-slate-950 dark:text-[#f8f6fc]">
                    Administration
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-[#9d93b8] mt-1.5 leading-relaxed">
                    Pilotez les candidatures, gérez les parrains, éditez les guides d&apos;onboarding et supervisez les 4 serveurs Discord.
                  </p>
                </div>
              </div>

              <button
                onClick={onNavigateToAdminLogin}
                className="w-full min-h-[46px] flex items-center justify-center gap-2 py-3 px-4 bg-slate-950 hover:bg-slate-800 dark:bg-[#1b122e] dark:hover:bg-[#251840] dark:border dark:border-violet-500/40 text-white font-semibold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer"
              >
                <span>Connexion Administration</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </section>
        </div>
      </main>

      {/* Clean Minimal Footer */}
      <footer className="border-t border-slate-200 dark:border-[#1c132e] bg-white dark:bg-[#08050f] px-6 py-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-[#7c7296]">
          <span>PAWAKO Referral Manager</span>
          <span>Suivi Recrutement &amp; Parrainage Discord</span>
        </div>
      </footer>
    </div>
  );
};
