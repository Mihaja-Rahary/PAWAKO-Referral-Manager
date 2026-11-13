import React, { useState } from 'react';
import { Shield, UserCheck, ArrowRight } from 'lucide-react';
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
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <PawakoLogo size="sm" />
            <span className="font-extrabold text-slate-900 dark:text-[#f4f1fa] text-base tracking-tight whitespace-nowrap">
              PAWAKO
            </span>
          </div>

          <ThemeToggle compact />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center py-10 px-6">
        <div className="max-w-4xl w-full space-y-8">
          {/* Official PAWAKO Banner — Intact Original Aspect Ratio */}
          <section className="rounded-2xl overflow-hidden bg-black border border-slate-200 dark:border-[#291c45] shadow-lg dark:shadow-[0_12px_40px_rgba(124,58,237,0.12)]">
            {!bannerError ? (
              <img
                src="/assets/aistudio/image_20261113_014958_13c36f49.jpg"
                alt="PAWAKO Referral Manager"
                referrerPolicy="no-referrer"
                onError={() => setBannerError(true)}
                className="w-full h-auto block object-contain bg-black"
              />
            ) : (
              <div className="py-12 px-6 flex flex-col items-center justify-center gap-3 bg-[#06040a]">
                <PawakoLogo size="xl" />
                <span className="text-xl font-extrabold tracking-tight text-white">PAWAKO</span>
              </div>
            )}
          </section>

          {/* Two Dedicated Access Portals */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Espace Parrain */}
            <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-7 flex flex-col justify-between space-y-6 transition-colors hover:border-violet-400/60 dark:hover:border-violet-500/50">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30 flex items-center justify-center text-violet-700 dark:text-violet-300">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-[#f4f1fa]">
                    Espace Parrain
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-[#9d93b8] mt-1 leading-relaxed">
                    Accédez à votre lien de parrainage et suivez l'avancement de vos filleuls.
                  </p>
                </div>
              </div>

              <button
                onClick={onNavigateToParrainLogin}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                <span>Connexion Parrain</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Espace Administration */}
            <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-7 flex flex-col justify-between space-y-6 transition-colors hover:border-violet-400/60 dark:hover:border-violet-500/50">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#191129] border border-slate-200 dark:border-[#2f224a] flex items-center justify-center text-slate-800 dark:text-violet-300">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-[#f4f1fa]">
                    Espace Administration
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-[#9d93b8] mt-1 leading-relaxed">
                    Accès réservé à la Direction et aux Responsables Formation.
                  </p>
                </div>
              </div>

              <button
                onClick={onNavigateToAdminLogin}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-[#1c1330] dark:hover:bg-[#271b42] dark:border dark:border-violet-500/40 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                <span>Connexion Administration</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </section>
        </div>
      </main>

      {/* Clean Minimal Footer */}
      <footer className="border-t border-slate-200 dark:border-[#1c132e] bg-white dark:bg-[#08050f] px-6 py-4">
        <div className="max-w-4xl mx-auto text-center text-[11px] text-slate-500 dark:text-[#7c7296]">
          PAWAKO Referral Manager
        </div>
      </footer>
    </div>
  );
};
