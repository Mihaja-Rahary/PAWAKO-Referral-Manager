import { Firestore } from '@google-cloud/firestore';
import fs from 'fs';
import path from 'path';
import { DatabaseSchema } from './types';

export interface FirestoreStatus {
  isConfigured: boolean;
  isConnected: boolean;
  projectId: string | null;
  clientEmail: string | null;
  storageMode: 'firestore' | 'local';
  error: string | null;
  collections?: {
    users: number;
    referrers: number;
    candidates: number;
    servers: number;
    auditLogs: number;
  };
}

function getFirebaseConfig(): { projectId?: string; firestoreDatabaseId?: string } {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (e) {
    // ignore
  }
  return {};
}

class FirestoreService {
  private firestoreInstance: Firestore | null = null;
  private initialized = false;
  private lastError: string | null = null;

  public getStatus(): FirestoreStatus {
    const appletConfig = getFirebaseConfig();
    const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || appletConfig.projectId || null;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim() || null;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim() || null;
    const storageMode = (process.env.STORAGE_MODE === 'firestore' && projectId) ? 'firestore' : 'local';

    const isConfigured = Boolean(projectId && ((clientEmail && privateKey) || process.env.GOOGLE_APPLICATION_CREDENTIALS || appletConfig.projectId));

    return {
      isConfigured,
      isConnected: Boolean(this.firestoreInstance && !this.lastError),
      projectId,
      clientEmail: null,
      storageMode,
      error: this.lastError,
    };
  }

  public getFirestore(): Firestore | null {
    if (this.initialized) return this.firestoreInstance;
    this.initialized = true;

    const appletConfig = getFirebaseConfig();
    const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || appletConfig.projectId;
    const databaseId = process.env.FIREBASE_DATABASE_ID?.trim() || appletConfig.firestoreDatabaseId;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
    let privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();

    if (!projectId) {
      this.lastError = 'Variable FIREBASE_PROJECT_ID ou firebase-applet-config.json non trouvée.';
      return null;
    }

    try {
      if (clientEmail && privateKey) {
        // Fix potential escaped newlines in PEM
        if (privateKey.includes('\\n')) {
          privateKey = privateKey.replace(/\\n/g, '\n');
        }

        this.firestoreInstance = new Firestore({
          projectId,
          databaseId: databaseId || '(default)',
          credentials: {
            client_email: clientEmail,
            private_key: privateKey,
          },
        });
      } else {
        // Fallback to ADC / Environment default / Google Cloud run environment
        this.firestoreInstance = new Firestore({
          projectId,
          databaseId: databaseId || '(default)',
        });
      }

      this.lastError = null;
      console.log(`[Firestore] Initialisé avec succès sur le projet : ${projectId}`);
      return this.firestoreInstance;
    } catch (err: any) {
      this.lastError = err.message || 'Erreur lors de l initialisation de Firestore';
      console.error('[Firestore] Échec initialisation:', err);
      this.firestoreInstance = null;
      return null;
    }
  }

  /**
   * Crée une sauvegarde locale intégrale de sécurité avant toute opération de migration
   */
  public createLocalBackup(data: DatabaseSchema): string {
    const backupDir = path.resolve(process.cwd(), 'data', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup_pawako_${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2), 'utf-8');
    return backupPath;
  }

  /**
   * Migre l'intégralité des données locales vers Cloud Firestore
   */
  public async migrateToFirestore(data: DatabaseSchema, actorName: string = 'Administrateur'): Promise<{
    success: boolean;
    backupPath: string;
    details: Record<string, number>;
    message: string;
  }> {
    // 1. Sauvegarde locale préalable obligatoire
    const backupPath = this.createLocalBackup(data);

    // 2. Connexion Firestore
    const db = this.getFirestore();
    if (!db) {
      throw new Error(`Firestore non disponible : ${this.lastError || 'Configuration manquante'}`);
    }

    const results: Record<string, number> = {
      users: 0,
      referrers: 0,
      candidates: 0,
      statusHistory: 0,
      servers: 0,
      roleMappings: 0,
      auditLogs: 0,
    };

    // 3. Batch migration par collection (max 500 ops par batch)
    // Users
    if (data.users.length > 0) {
      let batch = db.batch();
      let count = 0;
      for (const u of data.users) {
        batch.set(db.collection('pawako_users').doc(u.id), u);
        count++;
        if (count >= 400) {
          await batch.commit();
          batch = db.batch();
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
      results.users = data.users.length;
    }

    // Referrers
    if (data.referrers.length > 0) {
      let batch = db.batch();
      let count = 0;
      for (const r of data.referrers) {
        batch.set(db.collection('pawako_referrers').doc(r.id), r);
        count++;
        if (count >= 400) {
          await batch.commit();
          batch = db.batch();
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
      results.referrers = data.referrers.length;
    }

    // Candidates
    if (data.candidates.length > 0) {
      let batch = db.batch();
      let count = 0;
      for (const c of data.candidates) {
        batch.set(db.collection('pawako_candidates').doc(c.id), c);
        count++;
        if (count >= 400) {
          await batch.commit();
          batch = db.batch();
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
      results.candidates = data.candidates.length;
    }

    // Status History
    if (data.status_history.length > 0) {
      let batch = db.batch();
      let count = 0;
      for (const sh of data.status_history) {
        batch.set(db.collection('pawako_status_history').doc(sh.id), sh);
        count++;
        if (count >= 400) {
          await batch.commit();
          batch = db.batch();
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
      results.statusHistory = data.status_history.length;
    }

    // Discord Servers
    if (data.discord_servers.length > 0) {
      const batch = db.batch();
      for (const s of data.discord_servers) {
        batch.set(db.collection('pawako_discord_servers').doc(s.id), s);
      }
      await batch.commit();
      results.servers = data.discord_servers.length;
    }

    // Discord Role Mappings
    if (data.discord_role_mappings.length > 0) {
      const batch = db.batch();
      for (const m of data.discord_role_mappings) {
        batch.set(db.collection('pawako_discord_role_mappings').doc(`${m.serverId}_${m.roleType}`), m);
      }
      await batch.commit();
      results.roleMappings = data.discord_role_mappings.length;
    }

    // System Metadata
    await db.collection('pawako_metadata').doc('system').set({
      initialAdminClaimed: Boolean(data.meta?.initialAdminClaimed),
      initialAdminClaimedAt: data.meta?.initialAdminClaimedAt || null,
      initialAdminDiscordUserId: data.meta?.initialAdminDiscordUserId || null,
      lastMigrationAt: new Date().toISOString(),
      migratedBy: actorName,
    });

    // Audit Log for migration
    const migrationLog = {
      action: 'FIRESTORE_MIGRATION_COMPLETED',
      actorUserId: 'SYSTEM_ADMIN',
      actorName,
      targetType: 'SYSTEM',
      targetId: 'FIRESTORE',
      details: {
        backupPath,
        counts: results,
        timestamp: new Date().toISOString(),
      },
      id: `audit-migration-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    await db.collection('pawako_audit_logs').doc(migrationLog.id).set(migrationLog);
    results.auditLogs = (data.audit_logs?.length || 0) + 1;

    return {
      success: true,
      backupPath,
      details: results,
      message: `Migration vers Cloud Firestore réussie. Sauvegarde de sécurité créée sous ${path.basename(backupPath)}.`,
    };
  }
}

export const firestoreService = new FirestoreService();
