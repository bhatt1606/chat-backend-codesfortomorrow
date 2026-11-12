# Chat Backend (Node.js + TypeScript + PostgreSQL + Firestore)

1:1 chat backend. **Users, chats and members** live in PostgreSQL; **messages, read receipts and last-seen** live in Firebase Firestore.

## Stack
Node.js, TypeScript (strict), Express, `pg`, `zod`, `firebase-admin`.

## Setup
```bash
npm install
cp .env.example .env          # fill in values
docker compose up -d          # PostgreSQL
npm run dev                   # tables are created automatically on start
```

### Firebase
Either
1. Firebase console → Project settings → Service accounts → *Generate new private key*, save as `serviceAccountKey.json` in the repo root, and set `FIREBASE_SERVICE_ACCOUNT_PATH`; or
2. Run the Firestore emulator (`firebase emulators:start --only firestore`) and set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`.

> `GET /chat/:id/messages` orders by `createdAt`; a single-field index is automatic in Firestore, so no composite index is needed.

## Data model
**PostgreSQL**: `users`, `chats` (`type`, unique `direct_key` = sorted `userA:userB` so a pair can only ever have one 1:1 chat, even under concurrent requests), `chat_members`.

**Firestore**
```
chats/{chatId}/messages/{messageId}                      { senderId, text, createdAt (server timestamp), editedAt?, deleted }
chats/{chatId}/messages/{messageId}/readReceipts/{userId}{ userId, readAt }
chats/{chatId}/members/{userId}                          { lastSeenMessageId, updatedAt }
```

## API
| # | Method & path | Body / query | Result |
|---|---|---|---|
| – | `POST /users` (helper) | `{ name }` | user |
| 1 | `POST /chat/create` | `{ userAId, userBId }` | `{ chatId }` (201 new, 200 existing) |
| 2 | `POST /chat/:chatId/message/send` | `{ senderId, text }` | message |
| 3 | `GET /chat/:chatId/messages?limit=50` | | `{ messages }` oldest → newest (latest N) |
| 4 | `POST /chat/:chatId/message/:messageId/read` | `{ userId }` | `{ readAt, alreadyRead }` |
| 5 | `POST /chat/:chatId/lastseen` | `{ userId, messageId }` | `{ lastSeenMessageId }` |
| 6 | `GET /user/:userId/chats` | | `{ chats: [{ chatId, type, memberIds }] }` |
| Bonus | `PATCH /chat/:chatId/message/:messageId` | `{ userId, text }` | edited message |
| Bonus | `DELETE /chat/:chatId/message/:messageId` | `{ userId }` | 204 (soft delete) |

Rules: only chat members can send / read / update last-seen; you can't mark your own message read; only the sender can edit/delete; read receipts are idempotent (first `readAt` kept).

## Postman
Import `postman/chat-backend.postman_collection.json`, then run requests 1 to 3 once (they save `userAId`, `userBId` and `chatId` automatically) and use the rest in any order.

## Quick try
```bash
A=$(curl -s -XPOST localhost:3000/users -H 'content-type: application/json' -d '{"name":"Alice"}' | jq -r .id)
B=$(curl -s -XPOST localhost:3000/users -H 'content-type: application/json' -d '{"name":"Bob"}'   | jq -r .id)
C=$(curl -s -XPOST localhost:3000/chat/create -H 'content-type: application/json' -d "{\"userAId\":\"$A\",\"userBId\":\"$B\"}" | jq -r .chatId)
M=$(curl -s -XPOST localhost:3000/chat/$C/message/send -H 'content-type: application/json' -d "{\"senderId\":\"$A\",\"text\":\"hi\"}" | jq -r .id)
curl -s -XPOST localhost:3000/chat/$C/message/$M/read -H 'content-type: application/json' -d "{\"userId\":\"$B\"}"
curl -s "localhost:3000/chat/$C/messages?limit=50"
```
