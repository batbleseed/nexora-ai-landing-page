import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";
import type { ChatFolder, WorkspaceMessage, WorkspaceThread } from "../data/workspaceThreads";
import type { WorkspaceSettingsSnapshot } from "./offlineStore";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
void testConnection();

export async function signInWithGooglePopup(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.addScope("profile");
  provider.addScope("email");
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  if (!result.user.displayName || !result.user.photoURL) {
    await result.user.reload().catch(() => {});
  }
  return auth.currentUser ?? result.user;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "NX";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export async function upsertFirebaseUserProfile(user: User): Promise<void> {
  if (!user.emailVerified) return;
  const path = `users/${user.uid}/private/profile`;
  const ref = doc(db, "users", user.uid, "private", "profile");
  try {
    const snap = await getDoc(ref);
    const providerProfile = user.providerData?.[0];
    const displayName = (
      user.displayName ||
      providerProfile?.displayName ||
      user.email ||
      providerProfile?.email ||
      "Nexora User"
    ).slice(0, 120);
    const email = (
      user.email ||
      providerProfile?.email ||
      "user@nexora.local"
    ).slice(0, 320);

    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        displayName,
        email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(
        ref,
        {
          uid: snap.data().uid,
          displayName,
          email,
          createdAt: snap.data().createdAt,
          updatedAt: serverTimestamp(),
        },
        { merge: false }
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveFirebasePreferences(
  uid: string,
  settings: WorkspaceSettingsSnapshot
): Promise<void> {
  if (!auth.currentUser?.emailVerified) return;
  const path = `users/${uid}/settings/preferences`;
  const ref = doc(db, "users", uid, "settings", "preferences");
  try {
    await setDoc(ref, {
      ownerId: uid,
      isDark: Boolean(settings.isDark),
      sendOnEnter: Boolean(settings.sendOnEnter),
      autoScroll: Boolean(settings.autoScroll),
      language: String(settings.language || "English (US)").slice(0, 40),
      density: settings.density === "compact" ? "compact" : "comfortable",
      fontScale: settings.fontScale === "large" ? "large" : "default",
      completionChime: Boolean(settings.completionChime),
      spokenStatusUpdates: Boolean(settings.spokenStatusUpdates),
      voiceAutoSubmit: Boolean(settings.voiceAutoSubmit),
      soundProfile:
        settings.soundProfile === "click" || settings.soundProfile === "muted"
          ? settings.soundProfile
          : "chime",
      volume: Math.max(0, Math.min(100, Number(settings.volume ?? 70))),
      betaTraces: Boolean(settings.betaTraces),
      betaSelectionBar: Boolean(settings.betaSelectionBar),
      betaVoiceWave: Boolean(settings.betaVoiceWave),
      betaCommandSearch: Boolean(settings.betaCommandSearch),
      localModelEnabled: Boolean(settings.localModelEnabled),
      localModelReady: Boolean(settings.localModelReady),
      localBackend: settings.localBackend === "cpu" ? "cpu" : "webgpu",
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function loadFirebasePreferences(
  uid: string
): Promise<Partial<WorkspaceSettingsSnapshot> | null> {
  if (!auth.currentUser?.emailVerified) return null;
  const path = `users/${uid}/settings/preferences`;
  const ref = doc(db, "users", uid, "settings", "preferences");
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      isDark: Boolean(d.isDark),
      sendOnEnter: Boolean(d.sendOnEnter),
      autoScroll: Boolean(d.autoScroll),
      language: typeof d.language === "string" ? d.language : "English (US)",
      density: d.density === "compact" ? "compact" : "comfortable",
      fontScale: d.fontScale === "large" ? "large" : "default",
      completionChime: Boolean(d.completionChime),
      spokenStatusUpdates: Boolean(d.spokenStatusUpdates),
      voiceAutoSubmit: Boolean(d.voiceAutoSubmit),
      soundProfile:
        d.soundProfile === "click" || d.soundProfile === "muted"
          ? d.soundProfile
          : "chime",
      volume: typeof d.volume === "number" ? d.volume : 70,
      betaTraces: Boolean(d.betaTraces),
      betaSelectionBar: Boolean(d.betaSelectionBar),
      betaVoiceWave: Boolean(d.betaVoiceWave),
      betaCommandSearch: Boolean(d.betaCommandSearch),
      localModelEnabled: Boolean(d.localModelEnabled),
      localModelReady: Boolean(d.localModelReady),
      localBackend: d.localBackend === "cpu" ? "cpu" : "webgpu",
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128) || `id_${Date.now()}`;
}

export async function syncThreadToFirestore(
  uid: string,
  thread: WorkspaceThread
): Promise<void> {
  if (!auth.currentUser?.emailVerified) return;
  const threadId = sanitizeId(thread.id);
  const threadPath = `users/${uid}/threads/${threadId}`;
  const threadRef = doc(db, "users", uid, "threads", threadId);

  try {
    const existingThreadSnap = await getDoc(threadRef);
    const existingThreadCreatedAt = existingThreadSnap.exists()
      ? (existingThreadSnap.data().createdAt as Timestamp)
      : null;

    const batch = writeBatch(db);
    batch.set(threadRef, {
      id: threadId,
      ownerId: uid,
      title: (thread.title || "New chat").slice(0, 160),
      updatedAtLabel: (thread.updatedAt || "Just now").slice(0, 40),
      pinned: Boolean(thread.pinned),
      folderId: thread.folderId ? sanitizeId(thread.folderId) : null,
      createdAt: existingThreadCreatedAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const msgCollectionPath = `${threadPath}/messages`;
    const existingMessagesSnap = await getDocs(
      query(
        collection(db, "users", uid, "threads", threadId, "messages"),
        where("ownerId", "==", uid),
        where("threadId", "==", threadId)
      )
    );
    const existingCreatedAtById = new Map<string, Timestamp>();
    for (const mDoc of existingMessagesSnap.docs) {
      existingCreatedAtById.set(mDoc.id, mDoc.data().createdAt as Timestamp);
    }

    for (let idx = 0; idx < thread.messages.length; idx++) {
      const msg = thread.messages[idx];
      const msgId = sanitizeId(msg.id);
      const msgRef = doc(db, "users", uid, "threads", threadId, "messages", msgId);
      const createdAtValue = existingCreatedAtById.get(msgId) ?? serverTimestamp();

      const payload: Record<string, unknown> = {
        id: msgId,
        ownerId: uid,
        threadId,
        orderIndex: idx,
        role: msg.role === "user" ? "user" : "assistant",
        content: (msg.content || "").slice(0, 200000),
        timestamp: (msg.timestamp || "00:00").slice(0, 32),
        createdAt: createdAtValue,
        updatedAt: serverTimestamp(),
      };
      if (msg.model) payload.model = msg.model.slice(0, 80);
      if (msg.effort) payload.effort = msg.effort.slice(0, 40);
      if (
        msg.thinkingVariant === "Steps" ||
        msg.thinkingVariant === "Reasoning" ||
        msg.thinkingVariant === "Search" ||
        msg.thinkingVariant === "Coding"
      ) {
        payload.thinkingVariant = msg.thinkingVariant;
      }
      if (Array.isArray(msg.thinkingLines) && msg.thinkingLines.length > 0) {
        payload.thinkingLines = msg.thinkingLines
          .slice(0, 20)
          .map((line) => String(line).slice(0, 300));
      }
      if (typeof msg.reasoningText === "string" && msg.reasoningText.length > 0) {
        payload.reasoningText = msg.reasoningText.slice(0, 150000);
      }
      if (
        typeof msg.thinkingDurationMs === "number" &&
        Number.isFinite(msg.thinkingDurationMs) &&
        msg.thinkingDurationMs >= 0
      ) {
        payload.thinkingDurationMs = Math.min(
          86400000,
          Math.round(msg.thinkingDurationMs)
        );
      }

      batch.set(msgRef, payload);
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, threadPath);
  }
}

export async function loadFirebaseThreads(uid: string): Promise<WorkspaceThread[]> {
  if (!auth.currentUser?.emailVerified) return [];
  const threadsPath = `users/${uid}/threads`;
  try {
    const threadSnap = await getDocs(
      query(collection(db, "users", uid, "threads"), where("ownerId", "==", uid))
    );

    const loaded: Array<{ thread: WorkspaceThread; sortMs: number }> = [];

    for (const tDoc of threadSnap.docs) {
      const td = tDoc.data();
      const msgPath = `${threadsPath}/${tDoc.id}/messages`;
      let messages: WorkspaceMessage[] = [];
      try {
        const msgSnap = await getDocs(
          query(
            collection(db, "users", uid, "threads", tDoc.id, "messages"),
            where("ownerId", "==", uid),
            where("threadId", "==", tDoc.id),
            orderBy("orderIndex", "asc")
          )
        );
        messages = msgSnap.docs.map((mDoc) => {
          const md = mDoc.data();
          const reasoningText =
            typeof md.reasoningText === "string" && md.reasoningText.length > 0
              ? md.reasoningText
              : undefined;
          const thinkingVariant =
            md.thinkingVariant === "Steps" ||
            md.thinkingVariant === "Reasoning" ||
            md.thinkingVariant === "Search" ||
            md.thinkingVariant === "Coding"
              ? md.thinkingVariant
              : reasoningText
                ? "Reasoning"
                : undefined;
          const thinkingLines = Array.isArray(md.thinkingLines)
            ? md.thinkingLines.filter((line): line is string => typeof line === "string")
            : undefined;
          const thinkingDurationMs =
            typeof md.thinkingDurationMs === "number" &&
            Number.isFinite(md.thinkingDurationMs)
              ? md.thinkingDurationMs
              : undefined;

          return {
            id: String(md.id || mDoc.id),
            role: md.role === "user" ? "user" : "assistant",
            content: String(md.content || ""),
            model: typeof md.model === "string" ? md.model : undefined,
            effort: typeof md.effort === "string" ? md.effort : undefined,
            thinkingVariant,
            thinkingLines,
            reasoningText,
            thinkingDurationMs,
            timestamp: String(md.timestamp || ""),
            jobStatus: "completed",
          };
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, msgPath);
      }

      const updatedTs = td.updatedAt as Timestamp | undefined;
      const sortMs = updatedTs?.toMillis?.() ?? 0;

      loaded.push({
        sortMs,
        thread: {
          id: String(td.id || tDoc.id),
          title: String(td.title || "Untitled"),
          updatedAt: String(td.updatedAtLabel || "Synced"),
          pinned: Boolean(td.pinned),
          folderId: typeof td.folderId === "string" && td.folderId ? td.folderId : null,
          messages,
        },
      });
    }

    loaded.sort((a, b) => b.sortMs - a.sortMs);
    return loaded.map((item) => item.thread);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, threadsPath);
  }
}

export async function deleteFirebaseThread(uid: string, threadId: string): Promise<void> {
  if (!auth.currentUser?.emailVerified) return;
  const cleanThreadId = sanitizeId(threadId);
  const threadPath = `users/${uid}/threads/${cleanThreadId}`;
  try {
    const msgSnap = await getDocs(
      query(
        collection(db, "users", uid, "threads", cleanThreadId, "messages"),
        where("ownerId", "==", uid),
        where("threadId", "==", cleanThreadId)
      )
    );
    for (const mDoc of msgSnap.docs) {
      await deleteDoc(mDoc.ref);
    }
    await deleteDoc(doc(db, "users", uid, "threads", cleanThreadId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, threadPath);
  }
}

export async function syncFolderToFirestore(
  uid: string,
  folder: ChatFolder
): Promise<void> {
  if (!auth.currentUser?.emailVerified) return;
  const folderId = sanitizeId(folder.id);
  const folderPath = `users/${uid}/folders/${folderId}`;
  const folderRef = doc(db, "users", uid, "folders", folderId);
  try {
    const existingSnap = await getDoc(folderRef);
    const existingCreatedAt = existingSnap.exists()
      ? (existingSnap.data().createdAt as Timestamp)
      : null;
    await setDoc(folderRef, {
      id: folderId,
      ownerId: uid,
      name: (folder.name || "Untitled folder").slice(0, 80),
      createdAt: existingCreatedAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, folderPath);
  }
}

export async function loadFirebaseFolders(uid: string): Promise<ChatFolder[]> {
  if (!auth.currentUser?.emailVerified) return [];
  const foldersPath = `users/${uid}/folders`;
  try {
    const snap = await getDocs(
      query(collection(db, "users", uid, "folders"), where("ownerId", "==", uid))
    );
    const items: ChatFolder[] = snap.docs.map((fDoc) => {
      const fd = fDoc.data();
      const createdTs = fd.createdAt as Timestamp | undefined;
      return {
        id: String(fd.id || fDoc.id),
        name: String(fd.name || "Untitled folder"),
        createdAt: createdTs?.toMillis?.() ?? 0,
      };
    });
    items.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, foldersPath);
  }
}

export async function deleteFirebaseFolder(uid: string, folderId: string): Promise<void> {
  if (!auth.currentUser?.emailVerified) return;
  const cleanFolderId = sanitizeId(folderId);
  const folderPath = `users/${uid}/folders/${cleanFolderId}`;
  try {
    await deleteDoc(doc(db, "users", uid, "folders", cleanFolderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, folderPath);
  }
}

export async function deleteAllFirebaseThreads(uid: string): Promise<void> {
  if (!auth.currentUser?.emailVerified) return;
  const threadsPath = `users/${uid}/threads`;
  try {
    const threadSnap = await getDocs(
      query(collection(db, "users", uid, "threads"), where("ownerId", "==", uid))
    );
    for (const tDoc of threadSnap.docs) {
      const msgSnap = await getDocs(
        query(
          collection(db, "users", uid, "threads", tDoc.id, "messages"),
          where("ownerId", "==", uid),
          where("threadId", "==", tDoc.id)
        )
      );
      for (const mDoc of msgSnap.docs) {
        await deleteDoc(mDoc.ref);
      }
      await deleteDoc(tDoc.ref);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, threadsPath);
  }
}
