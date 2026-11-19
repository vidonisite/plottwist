# PLOT TWIST – gemensamt MindAR-filtersystem

## Vad som ingår
- En gemensam MindAR Studio-runtime i `public/mindar/engine/`.
- Ett separat scenpaket per filter i `public/mindar/filters/<assetId>/_x1`.
- Filterregister i `src/filters/mindar/registry.js`.
- En gemensam start/stopp-motor i `src/filters/mindar/engine.js`.
- Uppdaterad `src/Camera.jsx` som visar alla registerade MindAR-filter.
- Lokal MediaPipe- och Draco-kod så att motorn inte behöver hämta dessa från CDN.

## Installera i projektet
1. Packa upp den här ZIP-filen i projektets rot (`/workspaces/plottwist`) och välj att slå ihop mapparna.
2. Kör `npm install` om dependencies inte redan är installerade.
3. Kör `npm run mindar:assets` för att kopiera MediaPipe- och Draco-filer från `node_modules` till `public/mindar/engine/`.
4. Kontrollera att `public/mindar/engine/mediapipe/face_mesh/` och `public/mindar/engine/draco/` innehåller filer.
5. Kör `npm run build`.

ZIP-filen innehåller en uppdaterad `package.json` med ett extra script, men inga nya dependencies. Om du redan har ändrat scripts i din egen package.json, behåll dina egna ändringar och lägg bara till:

```json
"mindar:assets": "node scripts/copy-mindar-assets.mjs"
```

## Lägga till ett nytt 3D-filter
1. Skapa/exportera ett nytt ansiktsfilter i MindAR Studio med samma exportversion som den nuvarande.
2. Skapa `public/mindar/filters/<assetId>/`.
3. Kopiera exportens `_x1` till den mappen. Exempel: `public/mindar/filters/crown/_x1`.
4. Lägg till ett objekt i `src/filters/mindar/registry.js`:

```js
{
  id: 'mindar-crown',
  assetId: 'crown',
  label: 'Crown',
  symbol: '👑',
  isNew: true,
}
```

5. Starta om Vite. Filtret visas automatiskt i kamerans filterlista.

Alla filter använder samma `engine/index.html`, samma JavaScript-bundle och samma vendor-fil. Endast `_x1`-scenen byts. Använd samma MindAR Studio-exportversion; om en ny export har en annan runtime-version måste den kompatibiliteten kontrolleras innan bara `_x1` återanvänds.

## Sekretess och kameraflöde
- MindAR måste läsa live-videobildrutorna lokalt i webbläsaren för att kunna spåra ansiktet. Det går inte att spåra ansiktet utan att bildrutorna är tillgängliga för spårningsmotorn i minnet.
- PLOT TWIST lämnar bara över en klonad videoström. Inget ljudspår delas.
- MindAR-iframe får inte använda webbläsarens ursprungliga `getUserMedia`. Den metoden ersätts med en funktion som endast returnerar den uttryckligen delade videokopian. Saknas bryggan ska starten misslyckas (fail closed).
- Iframe-policy anger `camera 'none'` och `microphone 'none'`.
- Content Security Policy i MindAR-sidan begränsar nätverksanslutningar (`connect-src`) till samma origin, `blob:` och `data:`. Den blockerar externa fetch/XHR/WebSocket/EventSource/beacon-anslutningar och externa scripts/bilder.
- MediaPipe FaceMesh och Draco-decoder kopieras lokalt från redan installerade npm-paket; de behöver inte hämtas från jsDelivr eller gstatic.
- MindAR kan alltså bearbeta ansiktsbilden lokalt, men den här integrationen ger den ingen avsiktlig väg att ladda upp kamerabildrutor. PLOT TWISTs vanliga Appwrite-uppladdning sker först i det separata Twist-skickaflödet när användaren själv skickar media.

Det här är en teknisk skyddskonfiguration och statisk kodgranskning, inte en formell säkerhetscertifiering. Kontrollera gärna webbläsarens Network-flik vid test: MindAR-sidan ska inte göra anrop till andra origins än PLOT TWISTs egen origin. Om en extern anslutning blockeras av CSP är det avsiktligt; lägg inte till en extern domän i CSP utan att först granska varför den behövs.
