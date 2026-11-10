# Pointes Hydro-Québec

Cette intégration amène dans Gladys les **événements de pointe hivernale**
d'Hydro-Québec : les heures, annoncées quelques heures ou la veille, pendant
lesquelles les clients inscrits à une offre de pointe sont invités à réduire
leur consommation. Gladys peut alors préchauffer la maison, délester pendant la
pointe et tout remettre en place ensuite — toute seule.

> Intégration non officielle, sans lien avec Hydro-Québec. Elle lit les
> données publiques qu'Hydro-Québec publie (données ouvertes, licence
> CC BY-NC 4.0).

## Avant de commencer

**Gladys 5.3 ou plus récent** est requis. Il ne faut **aucun compte
Hydro-Québec**, aucun numéro de client ni aucune clé : les événements de pointe
sont publics.

Il suffit de savoir **à quelle offre vous êtes inscrit**. Elle figure sur
votre facture et dans votre Espace client :

| Offre                                        | Code           | Pour        |
| -------------------------------------------- | -------------- | ----------- |
| Tarif D avec option de crédits hivernaux     | `CPC-D`        | résidentiel |
| Tarif Flex D                                 | `TPC-DPC`      | résidentiel |
| Option de crédits hivernaux, affaires        | `CPC-G`        | affaires    |
| Tarif Flex G, affaires                       | `TPC-GPC`      | affaires    |
| Gestion de la demande de puissance, affaires | `GDP-Affaires` | affaires    |
| OEA, affaires                                | `OEA`          | affaires    |

Hydro-Québec publie des pointes **en hiver** (de décembre à mars, en règle
générale). Hors saison, les appareils indiquent simplement qu'aucune pointe
n'est annoncée.

## Configuration

| Champ                              | Quoi mettre                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Offres suivies**                 | Cochez votre offre. Un appareil est créé par offre cochée.                                                                                |
| **Autres offres**                  | Les offres absentes de la liste, par leur code, séparées par des virgules (ex. `ENG_100H_2F_7J`).                                         |
| **Avance du préchauffage**         | Combien de minutes avant une pointe s'ouvre la fenêtre de préchauffage. Hydro-Québec conseille environ deux heures (120). 0 la désactive. |
| **Intervalle de rafraîchissement** | Fréquence de relecture des données d'Hydro-Québec, en secondes (900 = 15 minutes, minimum 300).                                           |

Ouvrez ensuite **Découvrir** dans l'intégration et créez l'appareil de votre
offre.

Le bouton **Lister les offres** donne tous les codes d'offre qu'Hydro-Québec
publie cette saison, prêts à copier dans _Autres offres_. **Tester la
connexion** lit les données tout de suite et indique, pour chaque offre suivie,
combien de pointes sont annoncées et laquelle vient ensuite.

## L'appareil d'une offre

Chaque offre devient un appareil nommé `Hydro-Québec <code>`, avec ces
fonctionnalités en lecture seule :

| Fonctionnalité                    | Valeurs                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Pointe en cours                   | 1 pendant une pointe, 0 sinon                                                                                |
| Fenêtre de préchauffage           | 1 pendant l'avance qui précède une pointe, 0 sinon                                                           |
| Pointe ce matin                   | 1 quand une pointe du matin (AM) est annoncée aujourd'hui                                                    |
| Pointe ce soir                    | 1 quand une pointe du soir (PM) est annoncée aujourd'hui                                                     |
| Pointe demain matin               | la même chose, demain                                                                                        |
| Pointe demain soir                | la même chose, demain                                                                                        |
| Minutes avant la prochaine pointe | minutes avant le début de la prochaine pointe ; **0** pendant une pointe, **-1** quand aucune n'est annoncée |
| Prochaine pointe                  | la pointe en cours ou à venir, p. ex. `2026-12-15 06:00–09:00`, `—` si aucune                                |

Toutes les heures sont à **l'heure du Québec**, quel que soit le fuseau de
votre serveur Gladys. Une pointe va de son début à sa fin : à 9 h, la pointe
de 6 h à 9 h est terminée.

Les indicateurs changent **à la minute près** : l'intégration les réévalue
chaque minute à partir des données qu'elle a déjà, et relit les données
d'Hydro-Québec à l'intervalle de rafraîchissement.

## Scènes et tableau de bord (Gladys 5.1+)

### Déclencheurs de scène

| Déclencheur                            | Quand                                                  |
| -------------------------------------- | ------------------------------------------------------ |
| **Une pointe est annoncée**            | Hydro-Québec a publié une nouvelle pointe pour l'offre |
| **La fenêtre de préchauffage s'ouvre** | l'avance qui précède une pointe commence               |
| **Une pointe commence**                | au début de la pointe                                  |
| **Une pointe se termine**              | à la fin de la pointe                                  |

Chaque déclencheur peut être limité à **une offre** (son appareil) et aux
pointes du **matin (AM)** ou du **soir (PM)**. Dans les actions qui suivent,
l'événement donne : `offer` (le code), `start` et `end` (heure du Québec,
`AAAA-MM-JJ HH:MM`), `duration_minutes` — et pour le préchauffage,
`lead_minutes`. Par exemple, une notification :
`Pointe de {{triggerEvent.data.start}} à {{triggerEvent.data.end}}`.

Chaque déclencheur se déclenche **une seule fois par pointe**, même après un
redémarrage de l'intégration. Deux règles à connaître :

- les pointes déjà publiées au moment où vous installez l'intégration (ou
  cochez une nouvelle offre) ne sont pas « annoncées » — seules celles
  publiées ensuite le sont ;
- si l'intégration était arrêtée au début d'une pointe, elle ne prétend pas
  que la pointe « vient de commencer » avec plus de 10 minutes de retard. La
  fin d'une pointe dont le début a été signalé est toujours signalée, même en
  retard : la scène qui remet le chauffage tourne toujours.

### Action de scène

**Relire les pointes Hydro-Québec** lit les données tout de suite et donne aux
actions suivantes : `peak_in_progress`, `preheat_in_progress`,
`next_peak_start` et `minutes_until_next_peak` (pour l'offre choisie, ou la
première suivie). Pratique dans une scène lancée par autre chose — « quand je
rentre, s'il n'y a pas de pointe en cours, monte le chauffage ».

### Exemples de scènes

- **Préchauffage** : déclencheur _La fenêtre de préchauffage s'ouvre_ →
  monter les thermostats de 1 à 2 °C, chauffer le chauffe-eau.
- **Pendant la pointe** : déclencheur _Une pointe commence_ → baisser les
  thermostats, couper le chauffe-eau, mettre en pause la borne de recharge.
- **Après la pointe** : déclencheur _Une pointe se termine_ → remettre les
  consignes, rallumer le chauffe-eau et la borne.
- **Prévenir la maison** : déclencheur _Une pointe est annoncée_ → envoyer un
  message « Pointe demain {{triggerEvent.data.start}} : évitez la sécheuse ».

### Le widget « Pointes Hydro-Québec »

Ajoutez-le à un tableau de bord : un compte à rebours avant la prochaine
pointe (ou avant la fin de celle en cours), les prochaines pointes annoncées —
leur nombre est un réglage du widget —, l'état de chaque offre suivie, un
bouton **Actualiser** et un lien vers les données ouvertes.

## Bon à savoir

- Les données viennent des données ouvertes d'Hydro-Québec, relues environ
  toutes les 15 minutes avec une requête conditionnelle : quand rien n'a
  changé, rien n'est téléchargé.
- Hydro-Québec publie parfois une pointe quelques heures avant seulement.
  Quand une pointe est publiée pendant sa fenêtre de préchauffage, le
  déclencheur de préchauffage part aussitôt.
- L'intégration garde une petite mémoire dans son volume `/data` (les pointes
  déjà annoncées). La supprimer veut seulement dire que le prochain démarrage
  n'annonce pas les pointes déjà publiées.
- Elle ne connaît ni votre consommation ni vos crédits : ils restent dans
  votre Espace client Hydro-Québec.

## Dépannage

- **L'écran de configuration demande de choisir une offre** : cochez au moins
  une offre, ou saisissez-en une dans _Autres offres_.
- **« Inconnue d'Hydro-Québec cette saison »** sous _Tester la connexion_ : le
  code saisi n'est pas dans le flux — vérifiez-le avec _Lister les offres_.
- **Aucune pointe de tout l'hiver** : vérifiez l'offre ; hors hiver, aucune
  pointe est normal.
- **« Données ouvertes d'Hydro-Québec injoignables »** : votre Gladys n'arrive
  pas à joindre `donnees.solutions.hydroquebec.com` (DNS, pare-feu).
  L'intégration garde les dernières données lues et réessaie à chaque
  intervalle.
