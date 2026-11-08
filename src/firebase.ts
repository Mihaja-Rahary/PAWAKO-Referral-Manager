import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialisation officielle du SDK client Firebase
const app = initializeApp(firebaseConfig);

// CRITICAL: Utilise l'ID de base de données Firestore spécifique provisionné
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Test de connexion au démarrage selon les directives du skill Firebase
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Client en mode hors-ligne.');
    }
  }
}

testConnection();
