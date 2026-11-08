# Integritetspolicy för PLOT TWIST

**Senast uppdaterad: 8 november 2026**

Den här integritetspolicyn beskriver hur PLOT TWIST (”appen”) behandlar
personuppgifter. Appens behandling av personuppgifter omfattas av
dataskyddsförordningen (EU) 2016/679, GDPR.

## Vilka uppgifter behandlas och varför?

Vilka uppgifter som behandlas beror på vilka funktioner du använder.

| Uppgifter | Ändamål |
|---|---|
| E-postadress, lösenord och Appwrite-konto-/sessionsuppgifter | Skapa konto, logga in, hålla dig inloggad och skydda kontot. Lösenordet anges till Appwrites autentiseringstjänst; appen sparar inte lösenordet i sina profiltabeller. |
| Användarnamn, internt användar-ID och val för profilbild/avatar | Skapa och visa din profil, hitta kontakter och visa vem som deltar i chattar. Profilbildsval kan bestå av avatarstil, frötext och utseendealternativ. |
| Kontaktförfrågningar, kontaktrelationer, gruppnamn och medlemskap i konversationer | Hantera kontakter, privata chattar och grupper. |
| Chattmeddelanden, meddelandetyp, avsändar-/konversations-ID och tidsstämplar | Skicka, visa och synkronisera meddelanden mellan konversationsmedlemmar. Läskvitton, läspositioner och uppgifter om vem som öppnat en Twist kan också behandlas. |
| Bilder, videor och tillhörande Twist-text och visningsinställningar | Skapa och skicka Twists. Mediefiler och tillhörande inställningar laddas upp till Appwrite när du skickar dem. |
| Pushprenumerationens endpoint och tekniska nycklar | Registrera enheten för pushnotiser och leverera notiser om meddelanden, kontaktförfrågningar och inkommande röstsamtal. |
| Röstsamtalssignaler, exempelvis samtals-ID, anslutningsdata och ICE-/SDP-information | Upprätta, hantera och avsluta röstsamtal. Ljudet överförs under samtalet via WebRTC och spelas inte in av appen. |
| Tekniska uppgifter, exempelvis IP-adress, tidpunkt, webbläsar-/enhetsinformation, begärd adress och fel-/statuskoder | Leverera appen, hantera anslutningar och felsöka drift- och säkerhetsproblem. Sådana uppgifter kan förekomma i tekniska loggar hos Vercel, Appwrite och andra berörda tjänsteleverantörer. |

Användarnamn och profiluppgifter är avsedda att visas för andra användare.
Appens Appwrite-konfiguration tillåter att profilrader läses utan inloggning;
behandla därför användarnamn och avataruppgifter som offentligt synliga.
Meddelanden och mediefiler är avsedda för medlemmarna i respektive
konversation, enligt konfigurationen av åtkomstbehörigheter.

Appen erbjuder inte end-to-end-kryptering av meddelanden eller mediefiler.
Skicka därför inte uppgifter som kräver sådan kryptering.

## Kamera, mikrofon och ansiktsfilter

Om du ger webbläsaren tillgång till kameran används kamerabilden i första hand
lokalt på din enhet för förhandsvisning och bildeffekter. Ansiktsdetektering
används för att placera effekter; appen är inte avsedd att identifiera dig
genom ansiktet. En bild eller video överförs till Appwrite när du väljer att
skapa och skicka en Twist. Kamerainspelningen använder inte ljud.

Mikrofonen används bara om du startar ett röstsamtal och ger webbläsaren
mikrofontillstånd. Ljudet skickas till den andra samtalsdeltagaren via WebRTC;
appen spelar inte in eller sparar samtalsljudet. Appen använder en STUN-tjänst
för att försöka upprätta samtal. Beroende på nätverksanslutning och eventuell
TURN-konfiguration kan anslutningsmetadata, såsom IP-adresser, behandlas av
andra nätverksleverantörer.

## Rättslig grund

Vi behandlar personuppgifter med följande rättsliga grunder enligt GDPR:

- **Avtal (artikel 6.1 b):** för att skapa och administrera kontot och
  tillhandahålla de funktioner du använder, till exempel chattar, kontakter
  och Twists.
- **Samtycke (artikel 6.1 a):** för pushnotiser när du godkänner
  notisbehörighet. Du kan återkalla behörigheten i webbläsarens inställningar
  och stänga av notiser i appen.
- **Berättigat intresse (artikel 6.1 f):** för nödvändig drift, felsökning,
  skydd mot missbruk och säkerhet, med hänsyn till dina rättigheter och
  intressen.
- **Rättslig förpliktelse (artikel 6.1 c):** om och i den utsträckning vi
  måste bevara eller lämna ut uppgifter enligt lag.

Kamera- och mikrofontillstånd hanteras även av webbläsaren och operativsystemet.
Du kan neka eller återkalla dessa tillstånd där.

## Tjänsteleverantörer och mottagare

För att driva appen används följande tjänster:

- **Appwrite** används för konton och autentisering, databaser, filförvaring,
  realtidsuppdateringar och funktioner för pushnotiser och samtalssignaler.
  Kontouppgifter, profiluppgifter, konversationsdata, skickat innehåll och
  pushprenumerationer behandlas där. Funktionernas driftloggar kan innehålla
  interna användar-ID:n och tekniska felmeddelanden.
- **Vercel** används för att leverera webbappen. Som del av driften kan Vercel
  behandla tekniska server- och åtkomstloggar, exempelvis IP-adress,
  tidpunkt, begärd resurs, webbläsarinformation och resultatet av en begäran.
- **DiceBear** används för att skapa avatarbilder. När en avatar hämtas skickas
  avatarens frötext och valda utseendealternativ i en begäran till DiceBear.
- **jsDelivr och Google** kan leverera bibliotek och modeller som behövs för
  vissa ansiktsfilter. En sådan begäran kan avslöja tekniska anslutningsuppgifter,
  exempelvis IP-adress, för respektive leverantör.
- **Webbläsarens pushleverantör** levererar pushnotiser till din enhet.
  Pushleverantören beror på webbläsaren och enheten. Notisen kan innehålla
  avsändarens användarnamn och information om att ett meddelande eller samtal
  väntar.
- **STUN-/eventuell TURN-leverantör** kan behandla tekniska nätverksuppgifter
  för att upprätta röstsamtal.

Leverantörerna behandlar uppgifter för att tillhandahålla sina tjänster och
enligt sina respektive villkor och integritetspolicyer. Uppgifter kan komma
att behandlas utanför EU/EES, beroende på leverantörernas infrastruktur och
konfiguration. När det krävs ska överföringen stödjas av en giltig
överföringsmekanism enligt GDPR, exempelvis EU-kommissionens standardavtals-
klausuler. Kontakta oss om du vill veta mer om relevanta skyddsåtgärder.

Vi säljer inte dina personuppgifter. Vi använder inte personuppgifter för
reklamprofilering.

## Cookies och analys

Appen använder inte Google Analytics eller andra tredjepartsverktyg för
besöksanalys, och appkoden använder inte spårningscookies eller
annonseringscookies.

Nödvändig teknisk lagring kan användas för autentiseringssessionen och för
appens grundläggande funktioner. Webbläsaren kan också lagra appens statiska
filer för att stödja den installerbara webbappen. Om du aktiverar pushnotiser
lagrar webbläsaren pushprenumerationen. Dessa funktioner är inte avsedda för
annonsering eller spårning.

## Lagringstid

Kontouppgifter, profiluppgifter, kontakter, konversationer och meddelanden
lagras i Appwrite så länge de behövs för att tillhandahålla tjänsten och
administrera ditt konto. Twist-filer och annat innehåll kan finnas kvar så
så länge som de tillhörande uppgifterna finns kvar. Samtalssignaler används för
att upprätta samtal och rensas normalt när de inte längre behövs för samtalet.
Pushprenumerationer sparas medan de är registrerade och tas bort när de
avregistreras eller inte längre fungerar.

Tekniska loggar sparas enligt respektive leverantörs inställningar och
lagringsperioder. Längden kan variera beroende på typ av logg, driftbehov och
säkerhetskrav. Vi raderar eller avidentifierar uppgifter när de inte längre
behövs, om vi inte måste spara dem längre enligt lag eller för att hantera
rättsliga anspråk.

## Dina rättigheter

Du har, med de begränsningar som följer av GDPR, rätt att:

- begära tillgång till dina personuppgifter och få en kopia av dem,
- begära rättelse av felaktiga eller ofullständiga uppgifter,
- begära radering av dina uppgifter,
- begära begränsning av behandlingen,
- invända mot behandling som grundas på berättigat intresse,
- få ut uppgifter som du själv har lämnat i ett strukturerat, allmänt använt
  och maskinläsbart format när rätten till dataportabilitet gäller,
- när som helst återkalla ett samtycke, utan att det påverkar behandling som
  skett innan samtycket återkallades, och
- lämna klagomål till Integritetsskyddsmyndigheten (IMY),
  [imy.se](https://www.imy.se/).

För att utöva dina rättigheter, kontakta **[DITT_NAMN/FÖRETAG]** på
[DIN_EPOST@DOMÄN.SE]. Vi kan behöva verifiera din identitet innan vi hanterar
begäran. Radering kan vara begränsad när uppgifter måste sparas enligt lag
eller behövs för att fastställa, göra gällande eller försvara rättsliga
anspråk. En fullständig kontoradering kan behöva hanteras manuellt via
kontaktadressen ovan.

## Säkerhet

Vi använder åtkomstbehörigheter och de säkerhetsfunktioner som finns hos
tjänsteleverantörerna för att skydda personuppgifter. Ingen överföring eller
lagring på internet kan garanteras vara helt säker. Dela inte ditt lösenord
och kontakta oss om du misstänker obehörig åtkomst till ditt konto.

## Barn

Appen är inte särskilt utformad för barn. Om du är vårdnadshavare och tror att
ett barn har lämnat personuppgifter till appen utan erforderligt samtycke,
kontakta oss så att vi kan utreda saken.

## Ändringar av policyn

Vi kan uppdatera policyn när appens funktioner eller personuppgiftsbehandling
ändras. Den senaste versionen publiceras i den här filen tillsammans med
datumet för senaste uppdatering.