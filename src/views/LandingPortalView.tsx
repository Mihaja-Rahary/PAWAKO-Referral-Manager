import React, { useState } from 'react';
import {
  Shield,
  UserCheck,
  ArrowRight,
  CheckCircle2,
  Flame,
  MessageSquare,
  Instagram,
  TrendingUp,
  Zap,
} from 'lucide-react';
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
    <div className="relative min-h-screen bg-[#f8fafc] dark:bg-[#09090d] text-slate-900 dark:text-slate-100 flex flex-col justify-between overflow-x-hidden transition-colors">
      {/* Ambient Whop-inspired Multi-Color Aura */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-36 -left-24 w-[460px] h-[460px] rounded-full bg-[#FA4616]/12 dark:bg-[#FA4616]/18 blur-3xl" />
        <div className="absolute top-24 right-[-120px] w-[500px] h-[500px] rounded-full bg-indigo-500/10 dark:bg-indigo-600/18 blur-3xl" />
        <div className="absolute bottom-[-140px] left-1/3 w-[440px] h-[440px] rounded-full bg-cyan-500/8 dark:bg-cyan-500/12 blur-3xl" />
      </div>

      {/* Top Navigation Bar */}
      <header className="relative z-20 border-b border-slate-200/80 dark:border-white/10 bg-white/85 dark:bg-[#0c0c12]/85 backdrop-blur-md sticky top-0 transition-colors">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <PawakoLogo size="sm" />
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-950 dark:text-white text-lg tracking-tight whitespace-nowrap">
                PAWAKO
              </span>
              <span className="hidden sm:inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md bg-orange-50 text-[#d9380d] border border-orange-200 dark:bg-[#FA4616]/15 dark:text-orange-300 dark:border-[#FA4616]/30">
                Hub Ambassadeurs
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onNavigateToParrainLogin}
              className="hidden sm:inline-flex min-h-[38px] items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#FA4616] to-rose-500 hover:from-[#e43d11] hover:to-rose-400 transition-all shadow-xs shadow-[#FA4616]/25 whitespace-nowrap cursor-pointer"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Espace Parrain</span>
            </button>
            <ThemeToggle compact />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center py-10 sm:py-16 px-5 sm:px-6">
        <div className="max-w-6xl w-full space-y-12">
          {/* Whop-style Vibrant Hero */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-50 dark:bg-[#FA4616]/15 border border-orange-200 dark:border-[#FA4616]/35 text-[11px] font-bold uppercase tracking-[0.12em] text-[#d9380d] dark:text-orange-300">
                <Zap className="w-3.5 h-3.5 text-[#FA4616]" />
                <span>Réseau de Parrainage PAWAKO</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-950 dark:text-white tracking-tight leading-[1.06] [text-wrap:balance]">
                Transformez votre réseau en{' '}
                <span className="bg-gradient-to-r from-[#FA4616] via-rose-500 to-indigo-500 bg-clip-text text-transparent">
                  talents en production.
                </span>
              </h1>

              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Un hub communautaire pensé pour les parrains et les équipes : guides illustrés façon journal, lien Discord traçable en temps réel et suivi de progression sur les pôles{' '}
                <strong className="text-indigo-600 dark:text-indigo-300">VA Chatteur</strong> et{' '}
                <strong className="text-[#d9380d] dark:text-orange-300">VA Instagram</strong>.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3.5 rounded-xl bg-white dark:bg-[#13131b] border border-slate-200 dark:border-white/10 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">Pôle VA Chatting</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Formation, simulation &amp; suivi complet
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white dark:bg-[#13131b] border border-slate-200 dark:border-white/10 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-[#FA4616]/15 text-[#FA4616] dark:text-orange-300 flex items-center justify-center shrink-0">
                    <Instagram className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">Pôle VA Instagram</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Intégration rapide &amp; coaching terrain
                    </div>
                  </div>
                </div>
              </div>

              <ul className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Attribution automatique dès l&apos;arrivée sur Discord via votre code unique</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-sky-500 shrink-0" />
                  <span>Paliers de progression et ressources éditoriales organisées par thématiques</span>
                </li>
              </ul>
            </div>

            {/* Right Visual Showcase Card */}
            <div className="lg:col-span-6 space-y-4">
              <div className="relative rounded-2xl p-[1px] bg-gradient-to-br from-[#FA4616]/60 via-rose-500/40 to-indigo-500/60 shadow-2xl dark:shadow-[0_24px_60px_rgba(250,70,22,0.16)]">
                <div className="rounded-2xl overflow-hidden bg-black">
                  {!bannerError ? (
                    <img
                      src="/assets/aistudio/image_20261113_014958_13c36f49.jpg"
                      alt="PAWAKO Referral Manager"
                      referrerPolicy="no-referrer"
                      onError={() => setBannerError(true)}
                      className="w-full h-auto block object-contain bg-black"
                    />
                  ) : (
                    <div className="py-16 px-6 flex flex-col items-center justify-center gap-3 bg-[#0e0e14]">
                      <PawakoLogo size="xl" />
                      <span className="text-2xl font-extrabold tracking-tight text-white">PAWAKO</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Whop-style colorful mini capability strip */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-xl bg-white dark:bg-[#13131b] border border-slate-200 dark:border-white/10">
                  <div className="text-[11px] font-bold text-[#FA4616]">Lien Express</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Partage en 1 clic</div>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-[#13131b] border border-slate-200 dark:border-white/10">
                  <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">4 Serveurs</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Synchro Bot Discord</div>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-[#13131b] border border-slate-200 dark:border-white/10">
                  <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    <span>Paliers Live</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Suivi conversion</div>
                </div>
              </div>
            </div>
          </section>

          {/* Two High-Contrast Dedicated Access Portals */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            {/* Espace Parrain — Whop Orange/Coral Signature */}
            <div className="group relative bg-white dark:bg-[#12121a] border border-slate-200 dark:border-white/10 rounded-2xl p-7 sm:p-8 flex flex-col justify-between space-y-7 transition-all duration-200 hover:-translate-y-1 hover:border-[#FA4616]/70 dark:hover:border-[#FA4616]/60 hover:shadow-xl dark:hover:shadow-[0_16px_40px_rgba(250,70,22,0.16)] overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#FA4616] via-rose-500 to-amber-400" />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 rounded-xl bg-orange-50 dark:bg-[#FA4616]/15 border border-orange-200 dark:border-[#FA4616]/35 flex items-center justify-center text-[#FA4616] dark:text-orange-300">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-orange-50 text-[#d9380d] dark:bg-[#FA4616]/15 dark:text-orange-300 border border-orange-200 dark:border-[#FA4616]/30">
                    Accès Parrain
                  </span>
                </div>

                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                    Espace Parrain
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                    Explorez le fil d&apos;articles par thématiques, copiez votre lien Discord en 1 clic et suivez vos paliers de production en direct.
                  </p>
                </div>
              </div>

              <button
                onClick={onNavigateToParrainLogin}
                className="w-full min-h-[46px] flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-[#FA4616] to-rose-500 hover:from-[#e43d11] hover:to-rose-400 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-[#FA4616]/20 transition-all cursor-pointer"
              >
                <span>Entrer dans l&apos;Espace Parrain</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            {/* Espace Administration — Electric Indigo Signature */}
            <div className="group relative bg-white dark:bg-[#12121a] border border-slate-200 dark:border-white/10 rounded-2xl p-7 sm:p-8 flex flex-col justify-between space-y-7 transition-all duration-200 hover:-translate-y-1 hover:border-indigo-500/70 dark:hover:border-indigo-400/60 hover:shadow-xl dark:hover:shadow-[0_16px_40px_rgba(99,102,241,0.16)] overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400" />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/35 flex items-center justify-center text-indigo-600 dark:text-indigo-300">
                    <Shield className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                    Direction &amp; Formation
                  </span>
                </div>

                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                    Administration
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                    Pilotez les candidatures VA Chatting &amp; Instagram, gérez les parrains, éditez les guides et supervisez les 4 serveurs Discord.
                  </p>
                </div>
              </div>

              <button
                onClick={onNavigateToAdminLogin}
                className="w-full min-h-[46px] flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              >
                <span>Connexion Administration</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </section>
        </div>
      </main>

      {/* Clean Minimal Footer */}
      <footer className="relative z-10 border-t border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-[#0c0c12]/80 px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span>PAWAKO Referral Manager</span>
          <span>Suivi Recrutement &amp; Parrainage Discord</span>
        </div>
      </footer>
    </div>
  );
};
