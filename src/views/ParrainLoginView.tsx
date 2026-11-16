import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, AlertCircle, Flame } from 'lucide-react';
import { api } from '../api';
import { PawakoLogo } from '../components/PawakoLogo';
import { ThemeToggle } from '../components/ThemeToggle';

interface Props {
  onBackToPortal: () => void;
  onNavigateToAdminLogin: () => void;
  isOAuthConfigured: boolean;
  externalError?: string | null;
}

export const ParrainLoginView: React.FC<Props> = ({
  onBackToPortal,
  onNavigateToAdminLogin,
  externalError,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState(false);

  const displayError = externalError || errorMessage;

  const handleDiscordParrainLogin = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const info = await api.getOAuthUrl('parrain');

      if (!info.isConfigured || !info.url) {
        setErrorMessage(
          'Les clés DISCORD_CLIENT_ID et DISCORD_CLIENT_SECRET ne sont pas encore renseignées côté serveur.'
        );
        return;
      }

      const authWindow = window.open(
        info.url,
        'pawako_parrain_oauth',
        'width=600,height=750,menubar=no,toolbar=no,status=no'
      );

      if (!authWindow) {
        window.location.href = info.url;
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erreur lors du lancement de la connexion Discord');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#f8fafc] dark:bg-[#09090d] text-slate-900 dark:text-slate-100 flex flex-col justify-between overflow-x-hidden transition-colors">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 -left-24 w-[440px] h-[440px] rounded-full bg-[#FA4616]/14 dark:bg-[#FA4616]/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-rose-500/10 dark:bg-rose-500/14 blur-3xl" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 border-b border-slate-200/80 dark:border-white/10 bg-white/85 dark:bg-[#0c0c12]/85 backdrop-blur-md px-4 sm:px-6 h-16 flex items-center">
        <div className="max-w-4xl w-full mx-auto flex items-center justify-between gap-4">
          <button
            onClick={onBackToPortal}
            className="min-h-[44px] flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Retour</span>
          </button>

          <ThemeToggle compact />
        </div>
      </header>

      {/* Center Auth Card with Official Banner */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-lg w-full bg-white dark:bg-[#12121a] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-2xl dark:shadow-[0_20px_50px_rgba(250,70,22,0.18)]">
          <div className="h-1 bg-gradient-to-r from-[#FA4616] via-rose-500 to-amber-400" />
          {/* Official PAWAKO Banner */}
          <div className="bg-black border-b border-slate-200 dark:border-white/10">
            {!bannerError ? (
              <img
                src="/assets/aistudio/image_20261113_014958_13c36f49.jpg"
                alt="PAWAKO Referral Manager"
                referrerPolicy="no-referrer"
                onError={() => setBannerError(true)}
                className="w-full h-auto block object-contain bg-black"
              />
            ) : (
              <div className="py-8 flex justify-center bg-[#09090d]">
                <PawakoLogo size="lg" />
              </div>
            )}
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-50 dark:bg-[#FA4616]/15 border border-orange-200 dark:border-[#FA4616]/30 text-[11px] font-bold uppercase tracking-[0.12em] text-[#d9380d] dark:text-orange-300">
                <Flame className="w-3.5 h-3.5 text-[#FA4616]" />
                <span>Programme Ambassadeur</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                Espace Parrain
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Connectez-vous ou créez votre compte parrain automatiquement via Discord pour obtenir votre lien d&apos;invitation et suivre vos filleuls.
              </p>
            </div>

            {displayError && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/35 rounded-xl flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{displayError}</div>
              </div>
            )}

            <button
              onClick={handleDiscordParrainLogin}
              disabled={isLoading}
              className="w-full min-h-[46px] flex items-center justify-center gap-2.5 py-3.5 px-4 bg-gradient-to-r from-[#FA4616] to-rose-500 hover:from-[#e43d11] hover:to-rose-400 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-[#FA4616]/25 transition-all hover:-translate-y-0.5 disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              <span>{isLoading ? 'Connexion en cours...' : 'Se connecter avec Discord'}</span>
            </button>

            <div className="pt-4 border-t border-slate-100 dark:border-white/10 text-center">
              <button
                onClick={onNavigateToAdminLogin}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-semibold cursor-pointer"
              >
                <span>Accéder à l&apos;Administration</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 p-4 text-center text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-[#0c0c12]/80">
        PAWAKO Referral Manager
      </footer>
    </div>
  );
};
