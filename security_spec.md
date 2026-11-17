# Nexora Firestore Security Specification

## 1. Data Invariants
1. **Identity & Email Verification**: All user-scoped reads and writes require `request.auth != null`, matching `request.auth.uid == userId`, and `request.auth.token.email_verified == true`.
2. **PII Isolation**: User display name and email are isolated strictly at `/users/{userId}/private/profile` with owner-only read and write access (`get`/`create`/`update`, no cross-user listing).
3. **Immutable Ownership & Timestamps**: `uid` / `ownerId`, `id`, and `createdAt` (`request.time`) are immutable after creation; `updatedAt` must equal `request.time` on every write.
4. **Master Gate Hierarchy**: Messages at `/users/{userId}/threads/{threadId}/messages/{messageId}` must verify that the parent thread at `/users/{userId}/threads/{threadId}` exists and is owned by `request.auth.uid` (using `existsAfter`/`getAfter` on batched writes and `get()` on subsequent mutations).
5. **Bounded Payloads**: All document IDs match `^[a-zA-Z0-9_-]+$` (`<= 128` chars); strings have strict max sizes; only allowlisted fields via `data.keys().hasAll(...) && data.keys().hasOnly(...)` on create and `incoming().diff(existing()).affectedKeys().hasOnly(...)` on update.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Cross-user profile read**: Authenticated User A reads `/users/userB/private/profile`.
2. **Unverified email write**: Authenticated user with `email_verified: false` creates `/users/{uid}/threads/t1`.
3. **Owner spoofing**: Authenticated User A creates `/users/{uidA}/threads/t1` with `ownerId: "userB"`.
4. **Shadow field injection on create**: Creating `/users/{uid}/settings/preferences` with extra field `isAdmin: true`.
5. **Shadow field injection on update**: Updating `/users/{uid}/threads/t1` with un-allowlisted field `createdAt`.
6. **Fake timestamp backdating**: Creating `/users/{uid}/threads/t1` with `createdAt` set to a client-chosen past timestamp instead of `request.time`.
7. **ID poisoning**: Writing `/users/{uid}/threads/..%2Fadmin..` or a 200-character ID failing `isValidId()`.
8. **Content exhaustion**: Writing a message with `content.size() > 200000`.
9. **Wrong type injection**: Updating `sendOnEnter` in `/users/{uid}/settings/preferences` to `"true"` (string instead of bool).
10. **Orphan message creation**: Creating `/users/{uid}/threads/nonexistent/messages/m1` where parent thread does not exist.
11. **Message reparenting**: Updating `threadId` or `ownerId` inside an existing `/users/{uid}/threads/{threadId}/messages/{messageId}` document.
12. **Blanket collection list**: Unauthenticated or non-owner `list` query against `/users/userB/threads`.
