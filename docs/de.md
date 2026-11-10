# Hydro-Québec-Spitzen

Diese Integration bringt die **Winterspitzen-Ereignisse** von Hydro-Québec in
Gladys: die Stunden, einige Stunden oder einen Tag im Voraus angekündigt, in
denen Kunden mit einem Spitzen-Angebot gebeten werden, weniger Strom zu
verbrauchen. Gladys kann dann das Haus vorheizen, während der Spitze Last
abwerfen und danach alles zurückstellen — von selbst.

> Inoffizielle Integration, nicht mit Hydro-Québec verbunden. Sie liest die
> öffentlichen Daten, die Hydro-Québec veröffentlicht (offene Daten, Lizenz
> CC BY-NC 4.0).

## Bevor du beginnst

**Gladys 5.3 oder neuer** ist erforderlich. Du brauchst **kein
Hydro-Québec-Konto**, keine Kundennummer und keinen Schlüssel: Die
Spitzenereignisse sind öffentlich.

Du musst nur wissen, **bei welchem Angebot du angemeldet bist**. Es steht auf
deiner Rechnung und in deinem Kundenbereich:

| Angebot                                   | Code           | Für             |
| ----------------------------------------- | -------------- | --------------- |
| Tarif D mit Winter-Gutschrift-Option      | `CPC-D`        | Privatkunden    |
| Tarif Flex D                              | `TPC-DPC`      | Privatkunden    |
| Winter-Gutschrift-Option, Geschäftskunden | `CPC-G`        | Geschäftskunden |
| Tarif Flex G, Geschäftskunden             | `TPC-GPC`      | Geschäftskunden |
| Lastmanagement, Geschäftskunden           | `GDP-Affaires` | Geschäftskunden |
| OEA, Geschäftskunden                      | `OEA`          | Geschäftskunden |

Hydro-Québec veröffentlicht Spitzen **im Winter** (in der Regel Dezember bis
März). Außerhalb dieser Zeit zeigen die Geräte einfach an, dass keine Spitze
angekündigt ist.

## Konfiguration

| Feld                         | Was eintragen                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Verfolgte Angebote**       | Kreuze dein Angebot an. Pro angekreuztem Angebot wird ein Gerät erstellt.                                                             |
| **Weitere Angebote**         | Angebote, die in der Liste fehlen, mit ihrem Code, durch Kommas getrennt (z. B. `ENG_100H_2F_7J`).                                    |
| **Vorlauf des Vorheizens**   | Wie viele Minuten vor einer Spitze sich das Vorheizfenster öffnet. Hydro-Québec empfiehlt etwa zwei Stunden (120). 0 schaltet es aus. |
| **Aktualisierungsintervall** | Wie oft die Daten von Hydro-Québec neu gelesen werden, in Sekunden (900 = 15 Minuten, mindestens 300).                                |

Öffne dann **Entdecken** in der Integration und erstelle das Gerät deines
Angebots.

Die Schaltfläche **Angebote auflisten** nennt alle Angebotscodes, die
Hydro-Québec in dieser Saison veröffentlicht, bereit zum Kopieren in _Weitere
Angebote_. **Verbindung testen** liest die Daten sofort und zeigt für jedes
verfolgte Angebot, wie viele Spitzen angekündigt sind und welche als Nächstes
kommt.

## Das Gerät eines Angebots

Jedes Angebot wird zu einem Gerät namens `Hydro-Québec <Code>` mit diesen
schreibgeschützten Funktionen:

| Funktion                        | Werte                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Spitze läuft                    | 1 während einer Spitze, sonst 0                                                                            |
| Vorheizfenster                  | 1 während des Vorlaufs vor einer Spitze, sonst 0                                                           |
| Spitze heute Morgen             | 1, wenn heute eine Morgenspitze (AM) angekündigt ist                                                       |
| Spitze heute Abend              | 1, wenn heute eine Abendspitze (PM) angekündigt ist                                                        |
| Spitze morgen früh              | dasselbe, morgen                                                                                           |
| Spitze morgen Abend             | dasselbe, morgen                                                                                           |
| Minuten bis zur nächsten Spitze | Minuten bis zum Beginn der nächsten Spitze; **0** während einer Spitze, **-1**, wenn keine angekündigt ist |
| Nächste Spitze                  | die laufende oder nächste Spitze, z. B. `2026-12-15 06:00–09:00`, `—`, wenn keine                          |

Alle Zeiten sind **Ortszeit Québec**, unabhängig von der Zeitzone deines
Gladys-Servers. Eine Spitze läuft von ihrem Beginn bis zu ihrem Ende: Um
09:00 Uhr ist die Spitze von 06:00 bis 09:00 Uhr vorbei.

Die Anzeigen wechseln **auf die Minute genau**: Die Integration bewertet sie
jede Minute anhand der bereits vorhandenen Daten neu und liest die Daten von
Hydro-Québec im Aktualisierungsintervall neu.

## Szenen und Dashboard (Gladys 5.1+)

### Szenen-Auslöser

| Auslöser                           | Wann                                                             |
| ---------------------------------- | ---------------------------------------------------------------- |
| **Eine Spitze wird angekündigt**   | Hydro-Québec hat eine neue Spitze für das Angebot veröffentlicht |
| **Das Vorheizfenster öffnet sich** | der Vorlauf vor einer Spitze beginnt                             |
| **Eine Spitze beginnt**            | zu Beginn der Spitze                                             |
| **Eine Spitze endet**              | am Ende der Spitze                                               |

Jeder Auslöser kann auf **ein Angebot** (sein Gerät) und auf die **Morgen-
(AM)** oder **Abendspitzen (PM)** beschränkt werden. In den folgenden Aktionen
liefert das Ereignis: `offer` (den Code), `start` und `end` (Ortszeit Québec,
`JJJJ-MM-TT HH:MM`), `duration_minutes` — und beim Vorheizen
`lead_minutes`. Zum Beispiel eine Benachrichtigung:
`Spitze von {{triggerEvent.data.start}} bis {{triggerEvent.data.end}}`.

Jeder Auslöser feuert **einmal pro Spitze**, auch nach einem Neustart der
Integration. Zwei Regeln:

- Spitzen, die bereits veröffentlicht waren, als du die Integration
  installiert (oder ein neues Angebot angekreuzt) hast, werden nicht
  „angekündigt" — nur die danach veröffentlichten;
- war die Integration beim Beginn einer Spitze gestoppt, gibt sie nicht mehr
  als 10 Minuten zu spät vor, die Spitze habe „gerade begonnen". Das Ende einer
  Spitze, deren Beginn gemeldet wurde, wird immer gemeldet, auch verspätet: Die
  Szene, die die Heizung zurückstellt, läuft immer.

### Szenen-Aktion

**Hydro-Québec-Spitzen jetzt lesen** liest die Daten sofort und gibt den
folgenden Aktionen: `peak_in_progress`, `preheat_in_progress`,
`next_peak_start` und `minutes_until_next_peak` (für das gewählte Angebot oder
das erste verfolgte). Praktisch in einer Szene, die durch etwas anderes
gestartet wird — „wenn ich nach Hause komme und keine Spitze läuft, Heizung
hoch".

### Beispielszenen

- **Vorheizen**: Auslöser _Das Vorheizfenster öffnet sich_ → Thermostate um
  1 bis 2 °C erhöhen, Warmwasserspeicher aufheizen.
- **Während der Spitze**: Auslöser _Eine Spitze beginnt_ → Thermostate senken,
  Warmwasserspeicher ausschalten, Ladestation pausieren.
- **Nach der Spitze**: Auslöser _Eine Spitze endet_ → Sollwerte zurücksetzen,
  Warmwasserspeicher und Ladestation wieder einschalten.
- **Den Haushalt warnen**: Auslöser _Eine Spitze wird angekündigt_ →
  Nachricht senden „Spitze morgen {{triggerEvent.data.start}}: Trockner
  vermeiden".

### Das Widget „Hydro-Québec-Spitzen"

Füge es einem Dashboard hinzu: ein Countdown bis zur nächsten Spitze (oder bis
zum Ende der laufenden), die nächsten angekündigten Spitzen — ihre Anzahl ist
eine Einstellung des Widgets —, der Zustand jedes verfolgten Angebots, eine
Schaltfläche **Aktualisieren** und ein Link zu den offenen Daten.

## Gut zu wissen

- Die Daten stammen aus den offenen Daten von Hydro-Québec und werden etwa
  alle 15 Minuten mit einer bedingten Anfrage gelesen: Hat sich nichts
  geändert, wird nichts heruntergeladen.
- Hydro-Québec veröffentlicht eine Spitze manchmal nur wenige Stunden vorher.
  Wird eine Spitze innerhalb ihres Vorheizfensters veröffentlicht, feuert der
  Vorheiz-Auslöser sofort.
- Die Integration führt ein kleines Gedächtnis in ihrem Volume `/data` (die
  bereits angekündigten Spitzen). Löschen bedeutet nur, dass der nächste Start
  die bereits veröffentlichten Spitzen nicht ankündigt.
- Sie kennt weder deinen Verbrauch noch deine Gutschriften: Diese bleiben in
  deinem Hydro-Québec-Kundenbereich.

## Fehlerbehebung

- **Der Konfigurationsbildschirm verlangt, ein Angebot zu wählen**: Kreuze
  mindestens ein Angebot an oder trage eines in _Weitere Angebote_ ein.
- **„Hydro-Québec in dieser Saison unbekannt"** unter _Verbindung testen_: Der
  eingetragene Code ist nicht im Feed — prüfe ihn mit _Angebote auflisten_.
- **Den ganzen Winter keine Spitze**: Prüfe das Angebot; außerhalb des Winters
  ist keine Spitze normal.
- **„Offene Daten von Hydro-Québec nicht erreichbar"**: Dein Gladys erreicht
  `donnees.solutions.hydroquebec.com` nicht (DNS, Firewall). Die Integration
  behält die zuletzt gelesenen Daten und versucht es in jedem Intervall erneut.
