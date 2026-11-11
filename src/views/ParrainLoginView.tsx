import React, { useState } from 'react';
import { UserCheck, Lock, ArrowLeft, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../api';

interface Props {
  onBackToPortal: () => void;
  onNavigateToAdminLogin: () => void;
  isOAuthConfigured: boolean;
  externalError?: string | null;
}

export const ParrainLoginView: React.FC<Props> = ({
  onBackToPortal,
  onNavigateToAdminLogin,
  isOAuthConfigured,
  externalError,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayError = externalError || errorMessage;

  const handleDiscordParrainLogin = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const info = await api.getOAuthUrl('parrain');

      if (!info.isConfigured || !info.url) {
        setErrorMessage(
          'Les clés DISCORD_CLIENT_ID et DISCORD_CLIENT_SECRET ne sont pas encore renseignées dans le fichier .env.'
        );
        return;
      }

      const authWindow = window.open(
        info.url,
        'pawako_parrain_oauth',
        'width=600,height=750,menubar=no,toolbar=no,status=no'
      );

      if (!authWindow) {
        setErrorMessage('Veuillez autoriser les fenêtres pop-up pour vous connecter avec Discord.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erreur lors du lancement de la connexion Discord');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col justify-between font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-xs p-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={onBackToPortal}
            className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Retour au portail PAWAKO</span>
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Porte d'entrée : Espace Parrain</span>
          </div>
        </div>
      </header>

      {/* Center Auth Card */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 space-y-6 shadow-md relative overflow-hidden">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
              <UserCheck className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 pt-2">
              Espace Parrain PAWAKO
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
              Portail officiel réservé aux parrains et recruteurs agréés PAWAKO
            </p>
          </div>

          {/* Condition & Security Notice */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs text-slate-600">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              Conditions d'accès au portail
            </div>
            <ul className="space-y-1.5 text-[11px] text-slate-600">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>Accès réservé aux parrains préalablement enregistrés</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>Visibilité strictement limitée à vos propres filleuls</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>Lien d'invitation Discord unique et statistiques personnelles</span>
              </li>
            </ul>
          </div>

          {/* Error Message */}
          {displayError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{displayError}</div>
            </div>
          )}

          {/* Action Button */}
          <div className="space-y-3 pt-1">
            <button
              onClick={handleDiscordParrainLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              <span>{isLoading ? 'Initialisation...' : 'Connexion Parrain avec Discord'}</span>
            </button>
            <div className="text-[11px] text-center text-slate-400">
              URL sécurisée : <code className="text-slate-600 font-mono">/parrain/login</code>
            </div>
          </div>

          {/* Switch to Admin Portal */}
          <div className="pt-4 border-t border-slate-100 text-center">
            <button
              onClick={onNavigateToAdminLogin}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors font-medium"
            >
              <span>Vous faites partie de la Direction ? Accéder à l'Administration</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-[11px] text-slate-400 border-t border-slate-200 bg-white">
        PAWAKO Referral Manager — Portail Parrain
      </footer>
    </div>
  );
};
