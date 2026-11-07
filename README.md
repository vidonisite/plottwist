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

#### Röstsamtal

Röstsamtal använder den befintliga `call_signals`-tabellen med ID
`6aef5ebd003a301c8bae` i databasen `6adf8b78003b4b9d6b30`. Klientens
`VITE_APPWRITE_DATABASE_ID` ska därför vara `6adf8b78003b4b9d6b30`.
Tabellen använder bara fälten `conversationId`, `senderId`, `recipientId`,
`type` och `payload`; ge `payload` tillräcklig stränglängd för en SDP-offer,
minst 16 KB. Inga nya tabeller eller funktioner behövs.

Aktivera row-level security och tillåt inloggade användare att skapa rader.
Klienten sätter läs- och raderingsbehörighet för samtalets två deltagare på
varje signalrad. Skapa ett index på `recipientId` så att inkommande och gamla
signaler kan hämtas effektivt.

För inkommande samtals-push återanvänds `functions/push-notifications`.
Lägg till funktionsvariabeln `APPWRITE_CALL_SIGNALS_TABLE_ID` med värdet
`6aef5ebd003a301c8bae` och lägg till denna databas-trigger på samma befintliga
funktion:
`databases.6adf8b78003b4b9d6b30.tables.6aef5ebd003a301c8bae.rows.*`.
Funktionen skickar notis endast för `offer`; övriga signaler skickar inga
notiser. Notisklick öppnar den aktuella privata konversationen.

STUN används som standard. Om TURN behövs kan klientbygget konfigureras med
`VITE_WEBRTC_TURN_URL`, `VITE_WEBRTC_TURN_USERNAME` och
`VITE_WEBRTC_TURN_CREDENTIAL`. Vite-variabler är synliga för klienter; använd
kortlivade TURN-legitimationer, inte permanenta serverhemligheter.

Profilbildsval sparas på den befintliga användarraden. Lägg till tre valfria
String-kolumner i `USERS_TABLE_ID`: `avatarStyle` (max 20 tecken),
`avatarOptions` (max 2048 tecken) och `avatarSeed` (max 128 tecken). Klienten
visar DiceBear-stilen `initials` deterministiskt för rader som saknar dessa
värden, så befintliga konton behöver inte migreras. Anpassade avatarer använder
DiceBear API v10.

Twist-text och videohastighet sparas som JSON-sidecar-filer i den befintliga
`TWISTS_BUCKET_ID`-bucketen. Ingen ny tabell eller kolumn behövs. Om bucketens
filändelse-allowlist är aktiverad behöver den tillåta `.json` utöver bild- och
videoformaten; filbehörigheterna sätts per fil av appen.

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
