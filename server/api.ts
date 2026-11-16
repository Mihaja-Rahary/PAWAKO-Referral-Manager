import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from './db';
import { discordService } from './discordService';
import { firestoreService } from './firestore';
import { User, UserRole, Candidate, CandidateStatus, AdminStatus, OperationalStatus, RecruitmentStage, VAType, DiscordServerType, DiscordRoleMapping } from './types';
import {
  validateWebhookTimestampAndEventId,
  verifySignedSessionToken,
  generateSecureOAuthState,
  constantTimeEqual,
} from './cryptoUtils';
import { discoverDiscordBotEnvironment, normalizeDiscordBotToken } from './discordBot';

export const apiRouter = Router();

function getValidatedSessionSecret(): string | null {
  const secret = (process.env.SESSION_SECRET || '').trim();
  if (!secret || secret.length < 32) {
    return null;
  }
  return secret;
}

// Middleware pour extraire l'utilisateur authentifié depuis le cookie de session HMAC-SHA256 signé
export async function getAuthenticatedUser(req: Request): Promise<User | null> {
  const secret = getValidatedSessionSecret();
  if (!secret) {
    return null;
  }

  const token = req.cookies?.pawako_session;
  if (!token || typeof token !== 'string') {
    return null;
  }

  const verification = await verifySignedSessionToken(token.trim(), secret);
  if (!verification.valid || !verification.payload) {
    return null;
  }

  const user = db.getUserById(verification.payload.userId);
  if (!user || user.status !== 'ACTIVE') {
    return null;
  }
  return user;
}

// Gardes d'authentification RBAC
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Session non authentifiée. Veuillez vous connecter via Discord.' });
    }
    (req as any).user = user;
    next();
  } catch (err) {
    next(err);
  }
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Session non authentifiée. Veuillez vous connecter via Discord.' });
    }
    if (user.role !== 'ADMINISTRATEUR') {
      return res.status(403).json({ error: 'Accès réservé exclusivement aux Administrateurs PAWAKO.' });
    }
    (req as any).user = user;
    next();
  } catch (err) {
    next(err);
  }
}

async function requireResponsableOrAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Session non authentifiée. Veuillez vous connecter via Discord.' });
    }
    if (user.role !== 'ADMINISTRATEUR' && user.role !== 'RESPONSABLE') {
      return res.status(403).json({ error: 'Accès réservé aux Responsables et Administrateurs PAWAKO.' });
    }
    (req as any).user = user;
    next();
  } catch (err) {
    next(err);
  }
}

async function requireParrainOrAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Session non authentifiée. Veuillez vous connecter via Discord.' });
    }
    if (user.role !== 'ADMINISTRATEUR' && user.role !== 'PARRAIN') {
      return res.status(403).json({ error: 'Accès réservé exclusivement aux Parrains et Administrateurs PAWAKO.' });
    }
    (req as any).user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// Fonction positive d'exclusion stricte pour les données visibles par les parrains
export function toParrainCandidateView(candidate: Candidate) {
  return {
    id: candidate.id,
    discordUserId: candidate.discordUserId,
    username: candidate.username,
    displayName: candidate.displayName,
    avatar: candidate.avatar || null,
    vaType: candidate.vaType,
    adminStatus: candidate.adminStatus,
    operationalStatus: candidate.operationalStatus,
    status: candidate.status,
    recruitmentStage: candidate.recruitmentStage || null,
    currentServer: candidate.currentServer,
    arrivalDate: candidate.arrivalDate,
    refusalReason: null, // Confidentialité stricte : les motifs de refus internes ne sont jamais exposés aux parrains
    productionDate: candidate.productionDate || null,
    createdAt: candidate.createdAt,
    hasAnomaly: !!candidate.hasAnomaly,
    anomalyReason: candidate.hasAnomaly ? 'Anomalie administrative en cours de traitement' : null,
  };
}

// ----------------------------------------------------
// 1. AUTHENTICATION & SESSIONS (STRICT REAL DISCORD OAUTH2 ONLY)
// ----------------------------------------------------

apiRouter.get('/auth/url', async (req: Request, res: Response) => {
  const secret = getValidatedSessionSecret();
  if (!secret) {
    return res.status(500).json({
      error: 'Configuration serveur incomplète : SESSION_SECRET manquant ou inférieur à 32 caractères.',
    });
  }

  const originUrl = `${req.protocol}://${req.get('host')}`;
  const redirectUri = (process.env.DISCORD_REDIRECT_URI || '').trim() || `${originUrl}/auth/callback`;
  const portal = req.query.portal === 'parrain' ? 'parrain' : 'admin';

  // Génération d'un jeton d'état cryptographique anti-CSRF signé HMAC
  const { state, nonce } = await generateSecureOAuthState(portal, secret);
  res.cookie('oauth_state', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 10 * 60 * 1000, // 10 minutes de validité
  });

  // Mémorise la porte d'entrée choisie (admin ou parrain)
  res.cookie('oauth_portal', portal, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 10 * 60 * 1000,
  });

  const result = discordService.getOAuthUrl(redirectUri, state);

  res.json({
    url: result.url,
    portal,
    isConfigured: result.isConfigured,
    redirectUri,
    appUrl: originUrl,
  });
});

apiRouter.get('/auth/me', async (req: Request, res: Response) => {
  const hasValidSecret = Boolean(getValidatedSessionSecret());
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.json({
      authenticated: false,
      user: null,
      referrer: null,
      isOAuthConfigured: discordService.isOAuthConfigured() && hasValidSecret,
      isBotConfigured: discordService.isBotConfigured(),
      hasAnyUsers: db.getUsers().length > 0,
      isInitialAdminClaimed: db.isInitialAdminClaimed(),
    });
  }

  const referrer = db.getReferrerByDiscordUserId(user.id);

  res.json({
    authenticated: true,
    user,
    referrer: referrer || null,
    isOAuthConfigured: discordService.isOAuthConfigured() && hasValidSecret,
    isBotConfigured: discordService.isBotConfigured(),
    hasAnyUsers: true,
    isInitialAdminClaimed: db.isInitialAdminClaimed(),
  });
});

apiRouter.post('/auth/logout', (req: Request, res: Response) => {
  res.clearCookie('pawako_session', {
    secure: true,
    sameSite: 'none',
    httpOnly: true,
  });
  res.json({ success: true, message: 'Déconnexion effectuée' });
});

// ----------------------------------------------------
// 2. CANDIDATES (Recrutement et suivi des agents)
// ----------------------------------------------------

apiRouter.get('/candidates', requireAuth, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const isParrainOnly = currentUser.role === 'PARRAIN';

  const {
    search,
    vaType,
    adminStatus,
    operationalStatus,
    status,
    recruitmentStage,
    server,
    attributionStatus,
    hasAnomaly,
    page = '1',
    limit = '15',
  } = req.query as Record<string, string>;

  let referrerFilter: string | undefined = undefined;
  let parrainLockedVaType: VAType | null = null;
  if (isParrainOnly) {
    const referrerProfile = db.getReferrerByDiscordUserId(currentUser.id);
    if (!referrerProfile || !referrerProfile.isActive) {
      return res.json({ candidates: [], total: 0, page: 1, totalPages: 0 });
    }
    parrainLockedVaType =
      referrerProfile.vaType === 'CHATTEUR' || referrerProfile.vaType === 'INSTAGRAM'
        ? referrerProfile.vaType
        : null;
    if (
      !parrainLockedVaType ||
      (vaType && vaType !== 'ALL' && vaType !== parrainLockedVaType)
    ) {
      return res.json({ candidates: [], total: 0, page: 1, totalPages: 0 });
    }
    referrerFilter = referrerProfile.id;
  }

  const allFiltered = db.getCandidates({
    search,
    vaType: isParrainOnly ? (parrainLockedVaType as VAType) : (vaType as VAType | 'ALL'),
    adminStatus: adminStatus as AdminStatus | 'ALL',
    operationalStatus: operationalStatus as OperationalStatus | 'ALL',
    status: status as CandidateStatus | 'ALL',
    recruitmentStage: recruitmentStage as RecruitmentStage | 'ALL',
    server: server as DiscordServerType | 'AUCUN' | 'ALL',
    attributionStatus: attributionStatus as any,
    hasAnomaly: hasAnomaly === 'true' ? true : hasAnomaly === 'false' ? false : undefined,
    referrerId: referrerFilter,
  });

  // Liste positive stricte pour les parrains (aucun champ interne confidentiel exposé)
  const safeList = allFiltered.map(c => {
    if (isParrainOnly) {
      return toParrainCandidateView(c);
    }
    return c;
  });

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));
  const total = safeList.length;
  const totalPages = Math.ceil(total / pageSize);
  const paginated = safeList.slice((pageNum - 1) * pageSize, pageNum * pageSize);

  res.json({
    candidates: paginated,
    total,
    page: pageNum,
    totalPages,
    pageSize,
  });
});

apiRouter.get('/candidates/:id', requireAuth, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const isParrainOnly = currentUser.role === 'PARRAIN';
  const candidate = db.getCandidateById(req.params.id);

  if (!candidate) {
    return res.status(404).json({ error: 'Candidat introuvable' });
  }

  if (isParrainOnly) {
    const referrerProfile = db.getReferrerByDiscordUserId(currentUser.id);
    if (!referrerProfile || candidate.referrerId !== referrerProfile.id) {
      return res.status(403).json({ error: 'Accès non autorisé : vous ne pouvez consulter que vos propres filleuls.' });
    }
    if (!referrerProfile.vaType || candidate.vaType !== referrerProfile.vaType) {
      return res.status(403).json({ error: 'Accès refusé. Ce candidat est hors de votre spécialité parrain.' });
    }
  }

  const statusHistory = db.getStatusHistory(candidate.id, isParrainOnly);
  const attributionHistory = isParrainOnly ? [] : db.getReferralAttributionsHistory(candidate.id);

  const safeCandidate = isParrainOnly
    ? toParrainCandidateView(candidate)
    : candidate;

  res.json({
    candidate: safeCandidate,
    statusHistory,
    attributionHistory,
  });
});

apiRouter.post('/candidates', requireResponsableOrAdmin, (req: Request, res: Response) => {
  const { discordUserId, username, displayName, vaType, inviteCodeUsed } = req.body;

  if (!discordUserId || !username) {
    return res.status(400).json({ error: 'Discord User ID et Username sont obligatoires.' });
  }

  const result = db.createOrUpdateCandidateOnDiscordJoin({
    discordUserId: discordUserId.trim(),
    username: username.trim(),
    displayName: (displayName || username).trim(),
    avatar: null,
    inviteCodeUsed: inviteCodeUsed?.trim() || null,
    vaType: vaType || 'CHATTEUR',
    originServer: 'RECRUTEMENT',
  });

  res.status(201).json({
    success: true,
    candidate: result.candidate,
    isNew: result.isNew,
    edgeCase: result.edgeCase,
  });
});

// Modification manuelle du statut administratif ou opérationnel
apiRouter.patch('/candidates/:id/status', requireResponsableOrAdmin, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const { newAdminStatus, newOperationalStatus, newStatus, newRecruitmentStage, refusalReason, notes } = req.body;

  if (!newAdminStatus && !newOperationalStatus && !newStatus && newRecruitmentStage === undefined) {
    return res.status(400).json({ error: 'Un nouveau statut administratif, opérationnel, synthétique ou phase recrutement est requis.' });
  }

  const isRefusal = newAdminStatus === 'REFUSE' || newStatus === 'REFUSE';
  if (isRefusal && (!refusalReason || !refusalReason.trim()) && (!notes || !notes.trim())) {
    return res.status(400).json({ error: 'Un motif de refus détaillé est obligatoire pour rejeter une candidature.' });
  }

  if (!isRefusal && (!notes || !notes.trim())) {
    return res.status(400).json({ error: 'Un motif explicite est obligatoire lors de toute correction manuelle.' });
  }

  const result = db.updateCandidateStatus({
    candidateId: req.params.id,
    newAdminStatus,
    newOperationalStatus,
    newStatus,
    newRecruitmentStage,
    authorUserId: currentUser.id,
    authorName: currentUser.displayName,
    authorSource: currentUser.role === 'ADMINISTRATEUR' ? 'MANUAL_ADMIN' : 'MANUAL_RESPONSABLE',
    refusalReason,
    notes,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json({
    success: true,
    candidate: result.candidate,
  });
});

// Correction d'activité (VA Chatting <-> VA Instagram) avec motif obligatoire
apiRouter.patch('/candidates/:id/va-type', requireResponsableOrAdmin, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const { newVaType, reason } = req.body;

  if (!newVaType || (newVaType !== 'CHATTEUR' && newVaType !== 'INSTAGRAM')) {
    return res.status(400).json({ error: 'Activité invalide (CHATTEUR ou INSTAGRAM attendu).' });
  }

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Un motif explicite est obligatoire pour corriger l activité d un candidat.' });
  }

  const result = db.updateCandidateVAType({
    candidateId: req.params.id,
    newVaType,
    reason: reason.trim(),
    authorUserId: currentUser.id,
    authorName: currentUser.displayName,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json({
    success: true,
    candidate: result.candidate,
  });
});

// Résolution manuelle d'une anomalie
apiRouter.post('/candidates/:id/clear-anomaly', requireResponsableOrAdmin, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const { resolutionNotes } = req.body;

  if (!resolutionNotes || !resolutionNotes.trim()) {
    return res.status(400).json({ error: 'Une note explicative de la résolution est obligatoire.' });
  }

  const candidate = db.getCandidateById(req.params.id);
  if (!candidate) {
    return res.status(404).json({ error: 'Candidat introuvable' });
  }

  const oldAnomaly = candidate.anomalyReason;
  candidate.hasAnomaly = false;
  candidate.anomalyReason = null;
  candidate.updatedAt = new Date().toISOString();
  db.saveDatabase();

  db.logAudit({
    action: 'ANOMALY_CLEARED',
    actorUserId: currentUser.id,
    actorName: currentUser.displayName,
    targetType: 'CANDIDATE',
    targetId: candidate.id,
    details: {
      oldAnomaly,
      resolutionNotes,
    },
  });

  res.json({ success: true, candidate });
});

// Réassignation manuelle de parrain
apiRouter.patch('/candidates/:id/referrer', requireAdmin, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const { newReferrerId, reason } = req.body;

  if (!newReferrerId || !reason) {
    return res.status(400).json({ error: 'Le nouveau parrain et le motif d attribution sont obligatoires.' });
  }

  const result = db.reassignCandidateReferrer({
    candidateId: req.params.id,
    newReferrerId,
    authorUserId: currentUser.id,
    authorName: currentUser.displayName,
    reason,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json({
    success: true,
    candidate: result.candidate,
  });
});

// ----------------------------------------------------
// 3. REFERRERS & PARRAINS
// ----------------------------------------------------

apiRouter.get('/referrers', requireAuth, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  if (currentUser.role === 'PARRAIN') {
    const myRef = db.getReferrerByDiscordUserId(currentUser.id);
    return res.json({
      referrers: myRef ? [{ ...myRef, notes: undefined }] : [],
    });
  }
  const overview = db.getOverviewStatistics();
  res.json({
    referrers: overview.topParrains,
  });
});

apiRouter.get('/referrers/:id', requireResponsableOrAdmin, (req: Request, res: Response) => {
  const overview = db.getOverviewStatistics();
  const ref = overview.topParrains.find(r => r.id === req.params.id) || db.getReferrerById(req.params.id);
  if (!ref) {
    return res.status(404).json({ error: 'Parrain introuvable' });
  }
  const filleuls = db.getCandidates({ referrerId: ref.id });
  res.json({
    referrer: ref,
    filleuls,
    dependencies: {
      referrerId: ref.id,
      linkedCandidatesCount: filleuls.length,
      attributionHistoryCount: 0,
      canPhysicallyDelete: filleuls.length === 0,
      blockingReason: filleuls.length > 0 ? `${filleuls.length} filleul(s) lié(s)` : null,
    },
    history: db.getAuditLogs(50).filter(l => l.targetId === ref.id),
  });
});

apiRouter.post('/referrers', requireAdmin, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const { discordUserId, inviteCode, notes, vaType } = req.body;

  if (!discordUserId) {
    return res.status(400).json({ error: 'Le Discord User ID est obligatoire.' });
  }

  const referrer = db.createReferrer({
    discordUserId,
    inviteCode,
    notes,
    vaType,
    actorUserId: currentUser.id,
    actorName: currentUser.displayName,
  });

  res.status(201).json({
    success: true,
    referrer,
  });
});

apiRouter.patch('/referrers/:id', requireAdmin, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  try {
    const updated = db.updateReferrer(req.params.id, req.body || {}, {
      id: currentUser.id,
      displayName: currentUser.displayName,
    });
    if (!updated) {
      return res.status(404).json({ error: 'Parrain introuvable.' });
    }
    res.json({ success: true, referrer: updated });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Impossible de mettre à jour le parrain.' });
  }
});

// ----------------------------------------------------
// 4. PARRAIN PERSONAL PORTAL & GUIDES
// ----------------------------------------------------

apiRouter.get('/parrain/dashboard', requireParrainOrAdmin, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const referrer = db.getReferrerByDiscordUserId(currentUser.id);

  if (!referrer) {
    return res.status(404).json({
      error: 'Profil de parrain introuvable pour ce compte Discord. Contactez un administrateur pour configurer votre lien d invitation.',
    });
  }

  const lockedVaType: VAType | null =
    referrer.vaType === 'CHATTEUR' || referrer.vaType === 'INSTAGRAM' ? referrer.vaType : null;

  const myCandidates = lockedVaType
    ? db.getCandidates({ referrerId: referrer.id, vaType: lockedVaType })
    : [];
  const total = myCandidates.length;

  const enAttente = myCandidates.filter(c => c.adminStatus === 'EN_ATTENTE').length;
  const acceptes = myCandidates.filter(c => c.adminStatus === 'ACCEPTE').length;
  const refuses = myCandidates.filter(c => c.adminStatus === 'REFUSE').length;
  const enFormation = myCandidates.filter(c => c.operationalStatus === 'FORMATION').length;
  const enSimulation = myCandidates.filter(c => c.operationalStatus === 'SIMULATION').length;
  const valides = myCandidates.filter(c => c.operationalStatus === 'VALIDE').length;
  const enProduction = myCandidates.filter(c => c.operationalStatus === 'PRODUCTION').length;
  const abandonnes = myCandidates.filter(c => c.adminStatus === 'ABANDONNE').length;

  const conversionRate = total > 0 ? Math.round((enProduction / total) * 100) : 0;
  const acceptanceRate = total > 0 ? Math.round(((total - refuses) / total) * 100) : 0;

  // Liste positive stricte pour le tableau de bord du parrain
  const safeCandidates = myCandidates.map(c => toParrainCandidateView(c));
  const safeReferrer = {
    ...referrer,
    notes: undefined,
    outOfSpecialtyCount: undefined,
    totalLinkedCount: undefined,
  };

  res.json({
    referrer: safeReferrer,
    metrics: {
      totalFilleuls: total,
      enAttente,
      acceptes,
      refuses,
      enFormation,
      enSimulation,
      valides,
      enProduction,
      abandonnes,
      conversionRate,
      acceptanceRate,
    },
    candidates: safeCandidates,
  });
});

apiRouter.post('/parrain/specialty', requireParrainOrAdmin, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const vaType = req.body?.vaType;
  if (vaType !== 'CHATTEUR' && vaType !== 'INSTAGRAM') {
    return res.status(400).json({ error: 'Spécialité invalide. Choisissez CHATTEUR ou INSTAGRAM.' });
  }

  try {
    const updated = db.setParrainOwnSpecialty(currentUser.id, vaType);
    res.json({
      success: true,
      referrer: { ...updated, notes: undefined },
    });
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 400;
    res.status(status).json({ error: err?.message || 'Impossible d enregistrer votre spécialité.' });
  }
});

apiRouter.get('/parrain/guide', requireAuth, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const queryVaType = req.query.vaType;
  let targetVaType: VAType | null =
    queryVaType === 'CHATTEUR' || queryVaType === 'INSTAGRAM' ? (queryVaType as VAType) : null;

  if (currentUser.role === 'PARRAIN') {
    const myRef = db.getReferrerByDiscordUserId(currentUser.id);
    if (!myRef || !myRef.isActive) {
      return res.status(403).json({ error: 'Votre profil parrain est inactif, suspendu ou archivé.' });
    }
    if (myRef.vaType === 'CHATTEUR' || myRef.vaType === 'INSTAGRAM') {
      targetVaType = myRef.vaType;
    } else if (!targetVaType) {
      return res.json({ guide: null, guides: [], requiresSpecialtyChoice: true });
    }
  } else if (!targetVaType) {
    const myRef = db.getReferrerByDiscordUserId(currentUser.id);
    targetVaType =
      myRef?.vaType === 'CHATTEUR' || myRef?.vaType === 'INSTAGRAM' ? myRef.vaType : 'CHATTEUR';
  }

  const guides = db.getParrainGuidesForSpecialty(targetVaType);
  const primaryGuide = guides.find(g => g.id === targetVaType) || guides[0] || null;
  res.json({ guide: primaryGuide, guides });
});

apiRouter.get('/admin/parrain-guides', requireResponsableOrAdmin, (_req: Request, res: Response) => {
  const guideList = db.listParrainGuides();
  const guides = {
    CHATTEUR: guideList.find(g => g.id === 'CHATTEUR'),
    INSTAGRAM: guideList.find(g => g.id === 'INSTAGRAM'),
  };
  res.json({ guides, guideList });
});

apiRouter.post('/admin/parrain-guides', requireAdmin, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const body = req.body || {};
  const rawVaType = typeof body.vaType === 'string' ? body.vaType.toUpperCase() : '';
  if (rawVaType !== 'CHATTEUR' && rawVaType !== 'INSTAGRAM') {
    return res.status(400).json({ error: 'Spécialité invalide (CHATTEUR ou INSTAGRAM attendu).' });
  }

  try {
    const guide = db.createParrainGuide(
      {
        vaType: rawVaType as VAType,
        title: typeof body.title === 'string' ? body.title : '',
        subtitle: typeof body.subtitle === 'string' ? body.subtitle : '',
        category: typeof body.category === 'string' ? body.category : undefined,
        tags: Array.isArray(body.tags) ? body.tags : undefined,
        order: typeof body.order === 'number' ? body.order : undefined,
        heroImageUrl: typeof body.heroImageUrl === 'string' ? body.heroImageUrl : null,
        blocks: Array.isArray(body.blocks) ? body.blocks : [],
      },
      { id: currentUser.id, displayName: currentUser.displayName }
    );
    res.status(201).json({ success: true, guide });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Impossible de créer le guide parrain.' });
  }
});

apiRouter.put('/admin/parrain-guides/:guideId', requireAdmin, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const rawParam = req.params.guideId || '';
  const body = req.body || {};
  const rawVaType =
    typeof body.vaType === 'string' && (body.vaType.toUpperCase() === 'CHATTEUR' || body.vaType.toUpperCase() === 'INSTAGRAM')
      ? (body.vaType.toUpperCase() as VAType)
      : undefined;

  try {
    const guide = db.saveParrainGuide(
      rawParam,
      {
        vaType: rawVaType,
        title: typeof body.title === 'string' ? body.title : '',
        subtitle: typeof body.subtitle === 'string' ? body.subtitle : '',
        category: typeof body.category === 'string' ? body.category : undefined,
        tags: Array.isArray(body.tags) ? body.tags : undefined,
        order: typeof body.order === 'number' ? body.order : undefined,
        heroImageUrl: typeof body.heroImageUrl === 'string' ? body.heroImageUrl : null,
        blocks: Array.isArray(body.blocks) ? body.blocks : [],
      },
      { id: currentUser.id, displayName: currentUser.displayName }
    );
    res.json({ success: true, guide });
  } catch (err: any) {
    const status = err?.status === 404 ? 404 : 400;
    res.status(status).json({ error: err?.message || 'Impossible d’enregistrer le guide parrain.' });
  }
});

apiRouter.delete('/admin/parrain-guides/:guideId', requireAdmin, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const rawParam = req.params.guideId || '';
  const permanent = req.query.permanent === 'true' || req.query.permanent === '1';

  try {
    const result = db.deleteParrainGuide(
      rawParam,
      {
        id: currentUser.id,
        displayName: currentUser.displayName,
      },
      { permanent }
    );
    const guideList = db.listParrainGuides();
    const guides = {
      CHATTEUR: guideList.find(g => g.id === 'CHATTEUR'),
      INSTAGRAM: guideList.find(g => g.id === 'INSTAGRAM'),
    };
    res.json({ success: true, ...result, guides, guideList });
  } catch (err: any) {
    const status = err?.status === 404 ? 404 : 400;
    res.status(status).json({ error: err?.message || 'Impossible de supprimer le guide parrain.' });
  }
});

apiRouter.post('/admin/parrain-guides/:guideId/restore-default', requireAdmin, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const rawParam = (req.params.guideId || '').trim().toUpperCase();
  if (rawParam !== 'CHATTEUR' && rawParam !== 'INSTAGRAM') {
    return res.status(400).json({ error: 'Spécialité invalide (CHATTEUR ou INSTAGRAM attendu).' });
  }

  try {
    const guide = db.restoreDefaultParrainGuide(rawParam as VAType, {
      id: currentUser.id,
      displayName: currentUser.displayName,
    });
    const guideList = db.listParrainGuides();
    const guides = {
      CHATTEUR: guideList.find(g => g.id === 'CHATTEUR'),
      INSTAGRAM: guideList.find(g => g.id === 'INSTAGRAM'),
    };
    res.json({ success: true, guide, guides, guideList });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Impossible de restaurer le guide officiel.' });
  }
});

// ----------------------------------------------------
// 5. STATISTICS & OVERVIEW (Strictement calculées depuis les dossiers réels)
// ----------------------------------------------------

apiRouter.get('/stats/overview', requireResponsableOrAdmin, (req: Request, res: Response) => {
  const stats = db.getOverviewStatistics();
  res.json(stats);
});

// ----------------------------------------------------
// 6. DISCORD SERVERS, ROLE MAPPINGS & BOT WEBHOOK
// ----------------------------------------------------

apiRouter.get('/discord/servers', requireResponsableOrAdmin, (req: Request, res: Response) => {
  const servers = db.getDiscordServers();
  res.json({ servers });
});

apiRouter.get('/discord/bot/discover', requireResponsableOrAdmin, async (req: Request, res: Response) => {
  const savedServers = db.getDiscordServers();
  const originUrl = `${req.protocol}://${req.get('host')}`;
  const redirectUri = (process.env.DISCORD_REDIRECT_URI || '').trim() || `${originUrl}/auth/callback`;
  const full = await discoverDiscordBotEnvironment({
    botToken: normalizeDiscordBotToken(process.env.DISCORD_BOT_TOKEN),
    clientId: process.env.DISCORD_CLIENT_ID?.trim(),
    redirectUri,
    savedServers,
    includeMembers: false,
  });
  const { guildMembersByGuildId: _ignored, ...publicDiscovery } = full;
  res.json(publicDiscovery);
});

apiRouter.get('/discord/role-mappings', requireAuth, (req: Request, res: Response) => {
  const mappings = db.getRoleMappings();
  res.json({ mappings });
});

apiRouter.put('/discord/role-mappings', requireAdmin, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const { mappings } = req.body;

  if (!Array.isArray(mappings)) {
    return res.status(400).json({ error: 'Format de mappings invalide (tableau attendu).' });
  }

  const updated = db.bulkUpdateRoleMappings(mappings, currentUser.id, currentUser.displayName);
  res.json({ success: true, mappings: updated });
});

// Synchronisation initiale des membres réels et de leurs rôles
apiRouter.post('/discord/sync-members', requireResponsableOrAdmin, async (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const { serverId, members } = req.body;

  if (!serverId || !Array.isArray(members)) {
    return res.status(400).json({ error: 'serverId et liste de membres (members) requis.' });
  }

  try {
    const result = await discordService.syncServerMembers({
      serverId,
      members,
      actorUserId: currentUser.id,
      actorName: currentUser.displayName,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de la synchronisation des membres' });
  }
});

// Véritable Webhook sécurisé pour la passerelle Bot JARVIS
apiRouter.post('/discord/webhook', async (req: Request, res: Response) => {
  const receivedSecret = typeof req.headers['x-jarvis-secret'] === 'string' ? req.headers['x-jarvis-secret'].trim() : '';
  const expectedSecret = (process.env.JARVIS_WEBHOOK_SECRET || '').trim();

  if (!expectedSecret || !receivedSecret || !constantTimeEqual(receivedSecret, expectedSecret)) {
    return res.status(401).json({ error: 'Clé secrète de webhook JARVIS invalide ou non configurée' });
  }

  const timestampHeader = (req.headers['x-jarvis-timestamp'] as string) || '';
  const { eventId, eventType, guildId, user, roles, addedRoleIds, removedRoleIds, inviteCode, vaType, timestamp } = req.body;

  // Validation cryptographique et temporelle anti-rejeu (fenêtre de 5 min)
  const validation = validateWebhookTimestampAndEventId(timestampHeader, eventId);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.reason || validation.error || 'Requête de webhook invalide' });
  }

  if (!eventType || !guildId || !user?.id) {
    return res.status(400).json({ error: 'Payload d événement Discord incomplet (eventType, guildId, user.id requis).' });
  }

  if (db.isEventProcessed(eventId)) {
    return res.status(200).json({ success: true, duplicate: true, message: 'Événement déjà traité' });
  }

  try {
    const result = await discordService.processDiscordGatewayEvent({
      eventId,
      eventType,
      guildId,
      user,
      roles,
      addedRoleIds,
      removedRoleIds,
      inviteCode,
      vaType,
      timestamp,
    });

    db.recordEvent({
      id: eventId,
      eventType: eventType as any,
      serverId: (guildId as any) || 'RECRUTEMENT',
      guildId,
      discordUserId: user.id,
      payload: req.body,
      processed: true,
      processedAt: new Date().toISOString(),
      result: 'PROCESSED',
    });

    res.json(result);
  } catch (err: any) {
    console.error('Error processing Discord webhook:', err);
    res.status(500).json({ error: err.message || 'Erreur lors du traitement de l événement Discord' });
  }
});

// ----------------------------------------------------
// 7. USER MANAGEMENT & AUDIT LOGS
// ----------------------------------------------------

apiRouter.get('/users', requireAdmin, (req: Request, res: Response) => {
  res.json({ users: db.getUsers() });
});

apiRouter.patch('/users/:id/role', requireAdmin, (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const { newRole } = req.body;

  if (!newRole || !['ADMINISTRATEUR', 'RESPONSABLE', 'PARRAIN'].includes(newRole)) {
    return res.status(400).json({ error: 'Rôle invalide' });
  }

  try {
    const updated = db.updateUserRole(req.params.id, newRole as UserRole, currentUser.id, currentUser.displayName);
    if (!updated) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    res.json({ success: true, user: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Impossible de modifier le rôle utilisateur.' });
  }
});

apiRouter.get('/audit-logs', requireAdmin, (req: Request, res: Response) => {
  const limit = Math.min(200, parseInt(req.query.limit as string, 10) || 50);
  res.json({ auditLogs: db.getAuditLogs(limit) });
});

// ----------------------------------------------------
// 8. FIRESTORE MIGRATION & BACKUPS (Plan Gratuit Spark)
// ----------------------------------------------------

apiRouter.get('/admin/firestore/status', requireAdmin, (_req: Request, res: Response) => {
  res.json(firestoreService.getStatus());
});

apiRouter.post('/admin/firestore/backup', requireAdmin, (_req: Request, res: Response) => {
  try {
    const backupPath = firestoreService.createLocalBackup(db.getAllData());
    res.json({
      success: true,
      backupPath,
      message: 'Sauvegarde locale complète créée avec succès avant toute migration.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Échec de la création de la sauvegarde' });
  }
});

apiRouter.post('/admin/firestore/migrate', requireAdmin, async (req: Request, res: Response) => {
  const currentUser: User = (req as any).user;
  const { confirm } = req.body;

  if (!confirm) {
    return res.status(400).json({
      error: 'Confirmation requise. Veuillez confirmer explicitement le transfert des données vers Cloud Firestore.',
    });
  }

  try {
    const result = await firestoreService.migrateToFirestore(db.getAllData(), currentUser.displayName);
    res.json(result);
  } catch (err: any) {
    console.error('Firestore Migration Error:', err);
    res.status(500).json({ error: err.message || 'Erreur lors de la migration vers Firestore' });
  }
});

// Fallback JSON 404 pour toute route API inconnue (évite de renvoyer index.html)
apiRouter.use((req: Request, res: Response) => {
  res.status(404).json({
    error: `Route API introuvable (${req.method} ${req.originalUrl}).`,
    code: 'ROUTE_NOT_FOUND',
  });
});
