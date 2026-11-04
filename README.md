# PLOT TWIST

En React + Vite-prototyp för PLOT TWIST.

## Starta lokalt i Codespaces

```bash
npm install
npm run dev
```

Öppna porten som Codespaces visar. Välj gärna att göra porten synlig endast för dig medan du utvecklar.

## Bygg för publicering

```bash
npm run build
```

Den färdiga webbappen hamnar i `dist/`.

## Pushnotiser

Pushnotiser för nya chattmeddelanden kräver HTTPS (eller localhost), tillåtelse
från webbläsaren och att appen har öppnats minst en gång på enheten. På Windows
behöver notiser även vara tillåtna för webbläsaren i Windows-inställningarna.

### Appwrite

1. Skapa en tabell, till exempel `push_subscriptions`, i appens databas med
   strängkolumnerna `userId` (högst 64 tecken), `endpoint` (högst 2048 tecken)
   och `subscription` (högst 4096 tecken). Lägg till ett index på `userId`.
   Ge inga klientroller läs- eller skrivrättigheter till tabellen.
2. Skapa en Appwrite-funktion från `functions/push-notifications` med Node.js
   och ge inloggade användare rätt att köra funktionen. Konfigurera en
   databas-händelsetrigger för nya rader i meddelandetabellen:
   `databases.<databaseId>.tables.<messagesTableId>.rows.*`.
3. Skapa en API-nyckel med behörighet att läsa medlemmar och läsa, skapa,
   uppdatera och ta bort rader i prenumerationstabellen. Lägg till följande
   funktionsvariabler:
   `APPWRITE_API_KEY`, `APPWRITE_DATABASE_ID`, `APPWRITE_MESSAGES_TABLE_ID`,
   `APPWRITE_CONVERSATION_MEMBERS_TABLE_ID`,
   `APPWRITE_PUSH_SUBSCRIPTIONS_TABLE_ID`, `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY` och `VAPID_SUBJECT` (t.ex. `mailto:du@example.com`).
   `APPWRITE_FUNCTION_API_ENDPOINT` och `APPWRITE_FUNCTION_PROJECT_ID` sätts
   av Appwrite.
4. Generera VAPID-nycklar med `npx web-push generate-vapid-keys` i
   `functions/push-notifications` och använd samma publika nyckel i appens
   byggmiljö som `VITE_VAPID_PUBLIC_KEY`. Sätt även
   `VITE_APPWRITE_PUSH_FUNCTION_ID` till funktions-ID:t innan appen byggs.
5. Distribuera funktionen och bygg/publicera appen på HTTPS. Användaren kan
   sedan slå på notiser under **Inställningar**. En ny meddelanderad skickar en
   notis till alla prenumererade medlemmar utom avsändaren.
