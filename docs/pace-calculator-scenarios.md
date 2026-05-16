# Calculateur d'allures - logique et hypotheses

Ce document explique comment une cible de course est transformee en allures d'entrainement. L'objectif est de donner une lecture sport, pas une lecture informatique.

## 1. Point de depart : la cible course

On part d'un chrono objectif sur une epreuve precise.

Exemple : `100 m crawl en 1'00`.

Cette cible est consideree comme une reference en conditions course : depart plonge, bassin cible, combinaison activee par defaut.

## 2. Les passages ne sont pas proportionnels

Le calculateur ne fait pas une regle de trois.

Un passage au 25 m dans un 100 m ne vaut pas simplement 25 % du chrono final, car le debut de course beneficie du depart, de la coulee et de la vitesse initiale. A l'inverse, plus on avance, plus la repartition integre la fatigue et la stabilisation de l'allure.

Le calculateur utilise donc une courbe propre a chaque famille d'epreuve : 50, 100, 200, 400, 800/1500.

Exemple simplifie sur une cible `100 m en 1'00` :

| Distance | Passage MAX estime |
|---:|---:|
| 15 m | 6.8 s |
| 25 m | 12.8 s |
| 50 m | 28.2 s |
| 75 m | 44.1 s |
| 100 m | 60.0 s |

<svg viewBox="0 0 640 280" width="100%" role="img" aria-label="Courbe de passage non proportionnelle sur 100m">
  <rect x="0" y="0" width="640" height="280" fill="#ffffff"/>
  <text x="40" y="24" font-size="16" font-weight="700" fill="#111827">Passages MAX depuis une cible 100 m en 1'00</text>
  <text x="40" y="44" font-size="12" fill="#6b7280">La courbe reelle n'est pas une simple droite proportionnelle.</text>
  <line x1="55" y1="220" x2="560" y2="220" stroke="#d1d5db"/>
  <line x1="55" y1="40" x2="55" y2="220" stroke="#d1d5db"/>
  <text x="48" y="225" font-size="10" text-anchor="end" fill="#6b7280">0s</text>
  <text x="48" y="130" font-size="10" text-anchor="end" fill="#6b7280">30s</text>
  <text x="48" y="45" font-size="10" text-anchor="end" fill="#6b7280">60s</text>
  <text x="130" y="238" font-size="10" text-anchor="middle" fill="#6b7280">15m</text>
  <text x="180" y="238" font-size="10" text-anchor="middle" fill="#6b7280">25</text>
  <text x="305" y="238" font-size="10" text-anchor="middle" fill="#6b7280">50</text>
  <text x="430" y="238" font-size="10" text-anchor="middle" fill="#6b7280">75</text>
  <text x="555" y="238" font-size="10" text-anchor="middle" fill="#6b7280">100</text>
  <line x1="55" y1="220" x2="555" y2="40" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="6 6"/>
  <polyline points="130,199 180,181 305,135 430,88 555,40" fill="none" stroke="#2563eb" stroke-width="4"/>
  <circle cx="130" cy="199" r="4" fill="#2563eb"/>
  <circle cx="180" cy="181" r="4" fill="#2563eb"/>
  <circle cx="305" cy="135" r="4" fill="#2563eb"/>
  <circle cx="430" cy="88" r="4" fill="#2563eb"/>
  <circle cx="555" cy="40" r="4" fill="#2563eb"/>
  <text x="405" y="132" font-size="12" fill="#2563eb">courbe utilisee</text>
  <text x="385" y="166" font-size="12" fill="#64748b">proportionnel simple</text>
</svg>

## 3. Du passage MAX aux zones d'allure

Une fois le temps MAX estime pour une distance, le calculateur le decline en zones d'intensite.

Principe simple :

| Zone | Lecture sport |
|---|---|
| V0 | recuperation / tres facile |
| V1 | facile controle |
| V2 | soutien modere |
| V3 | allure forte |
| V4 | tres forte, selon epreuve |
| MAX | reference maximale sur la distance |

La logique est la suivante : plus la zone est basse, plus le temps demande est lent que le temps MAX. Les coefficients changent selon la famille d'epreuve, car un V3 de 50 m et un V3 de 800 m ne portent pas la meme contrainte.

Exemple indicatif sur un passage MAX de `28.2 s` au 50 m dans un 100 m :

| Zone | Temps affiche approx. |
|---|---:|
| V0 | 39.2 s |
| V1 | 35.3 s |
| V2 | 32.0 s |
| V3 | 29.7 s |
| V4 | 28.8 s |
| MAX | 28.2 s |

## 4. Ajustement par nage

Le crawl sert de reference.

Pour le dos, la brasse et le papillon, le calculateur applique un ajustement selon la nage, la distance de l'epreuve et la distance du passage. L'objectif est d'eviter de traiter toutes les nages comme si elles avaient la meme repartition d'effort.

La correction est plus visible sur les passages intermediaires que sur la ligne finale : a la distance cible, le chrono objectif reste toujours conserve.

## 5. Cas particulier du 4 nages

Le 4 nages est calcule par segments.

Le temps cible est d'abord reparti entre les quatre nages selon une ponderation sportive :

| 200 4N | Part approx. |
|---|---:|
| Papillon | 21.8 % |
| Dos | 25.0 % |
| Brasse | 29.0 % |
| Crawl | 24.2 % |

| 400 4N | Part approx. |
|---|---:|
| Papillon | 22.9 % |
| Dos | 25.5 % |
| Brasse | 28.0 % |
| Crawl | 23.6 % |

Ensuite, chaque segment est traite comme une petite epreuve de sa nage, puis les temps cumules sont affiches.

## 6. Modulation bassin 25 m / 50 m — modele credit-virage

La courbe de passages est definie en grand bassin (50 m).

Un bassin de 25 m ajoute un virage tous les 50 m de course par rapport a un bassin de 50 m : aux 25, 75, 125 m… Le calculateur ne convertit plus la cible au prorata sur toute la course : il applique un modele credit-virage.

1. La course est identique en 25 m et en 50 m jusqu'au premier mur supplementaire (25 m) : meme depart, meme nage. Les passages avant ce mur ne changent pas d'un bassin a l'autre.
2. Apres chaque mur supplementaire, un credit de virage est retire du temps. Le gain total d'un bassin de 25 m — la majoration FFN de l'epreuve — est partage a parts egales entre ces virages, et chaque part se construit progressivement sur environ 13 m (coulee + reprise) avant de plafonner.
3. A l'arrivee, le temps final vaut le temps grand bassin moins la majoration : la cible 25 m est conservee.

Lecture sportive : le gain d'un bassin de 25 m ne se repartit pas uniformement sur la course. Il vient en bloc de la poussee au mur et de la coulee, donc apres chaque virage. Le segment qui suit un mur est plus rapide que le segment de nage pure equivalent — l'inverse de ce que donnait l'ancienne conversion au prorata.

Le modele couvre toutes les epreuves disposant d'une majoration FFN. Le 4 nages, avec sa matrice segmentee propre, reste hors de ce modele.

## 7. Modulation depart plot

`Depart plot` decoche signifie : depart dans l'eau, sans plongeon.

L'hypothese n'est pas lineaire : la perte se fait presque entierement sur les premiers metres, puis plafonne. C'est coherent sportivement : le plongeon apporte surtout vitesse initiale, entree dans l'eau et coulee.

Valeurs de plafond utilisees :

| Epreuve | Perte max approx. |
|---|---:|
| 50 m | +1.00 s |
| 100 m | +1.10 s |
| 200 m | +1.15 s |
| 400 m et plus | +1.15 s |

<svg viewBox="0 0 640 260" width="100%" role="img" aria-label="Penalite depart dans l'eau selon la distance">
  <rect x="0" y="0" width="640" height="260" fill="#ffffff"/>
  <text x="40" y="24" font-size="16" font-weight="700" fill="#111827">Perte ajoutee sans depart plot</text>
  <text x="40" y="44" font-size="12" fill="#6b7280">La perte monte vite puis plafonne.</text>
  <line x1="55" y1="190" x2="560" y2="190" stroke="#d1d5db"/>
  <line x1="55" y1="20" x2="55" y2="190" stroke="#d1d5db"/>
  <text x="48" y="195" font-size="10" text-anchor="end" fill="#6b7280">0</text>
  <text x="48" y="124" font-size="10" text-anchor="end" fill="#6b7280">0.5s</text>
  <text x="48" y="53" font-size="10" text-anchor="end" fill="#6b7280">1.0s</text>
  <text x="55" y="208" font-size="10" text-anchor="middle" fill="#6b7280">0m</text>
  <text x="180" y="208" font-size="10" text-anchor="middle" fill="#6b7280">50</text>
  <text x="305" y="208" font-size="10" text-anchor="middle" fill="#6b7280">100</text>
  <text x="555" y="208" font-size="10" text-anchor="middle" fill="#6b7280">200</text>
  <polyline points="92,80 118,60 180,50" fill="none" stroke="#2563eb" stroke-width="3"/>
  <polyline points="92,88 118,60 180,38 243,36 305,34" fill="none" stroke="#059669" stroke-width="3"/>
  <polyline points="92,82 118,54 180,31 243,29 305,27 430,27 555,27" fill="none" stroke="#dc2626" stroke-width="3"/>
  <circle cx="180" cy="50" r="3" fill="#2563eb"/>
  <circle cx="305" cy="34" r="3" fill="#059669"/>
  <circle cx="555" cy="27" r="3" fill="#dc2626"/>
  <text x="575" y="54" font-size="12" fill="#2563eb">50 m</text>
  <text x="575" y="74" font-size="12" fill="#059669">100 m</text>
  <text x="575" y="94" font-size="12" fill="#dc2626">200 m</text>
</svg>

## 8. Modulation combinaison moderne

`Combinaison` decoche signifie : maillot classique, pas de combinaison de course moderne.

Ici la perte est proportionnelle au temps nage, donc plus visible quand la distance et l'intensite augmentent. Le modele tient compte de la nage, de la zone, de la distance et du sexe.

Facteur sexe utilise :

| Sexe | Effet combinaison |
|---|---:|
| Homme | base |
| Femme | +10 % sur l'effet |
| Non renseigne | +5 % sur l'effet |

Exemple ci-dessous : 100 m crawl, zone MAX. La courbe montre le pourcentage ajoute si la combinaison est retiree.

<svg viewBox="0 0 640 260" width="100%" role="img" aria-label="Penalite sans combinaison moderne sur 100m crawl">
  <rect x="0" y="0" width="640" height="260" fill="#ffffff"/>
  <text x="40" y="24" font-size="16" font-weight="700" fill="#111827">Perte relative sans combinaison</text>
  <text x="40" y="44" font-size="12" fill="#6b7280">Exemple : 100 m crawl MAX.</text>
  <line x1="55" y1="190" x2="560" y2="190" stroke="#d1d5db"/>
  <line x1="55" y1="20" x2="55" y2="190" stroke="#d1d5db"/>
  <text x="48" y="195" font-size="10" text-anchor="end" fill="#6b7280">0%</text>
  <text x="48" y="124" font-size="10" text-anchor="end" fill="#6b7280">0.5%</text>
  <text x="48" y="53" font-size="10" text-anchor="end" fill="#6b7280">1.0%</text>
  <text x="55" y="208" font-size="10" text-anchor="middle" fill="#6b7280">0m</text>
  <text x="180" y="208" font-size="10" text-anchor="middle" fill="#6b7280">25</text>
  <text x="305" y="208" font-size="10" text-anchor="middle" fill="#6b7280">50</text>
  <text x="430" y="208" font-size="10" text-anchor="middle" fill="#6b7280">75</text>
  <text x="555" y="208" font-size="10" text-anchor="middle" fill="#6b7280">100</text>
  <polyline points="130,85 180,79 305,67 430,59 555,55" fill="none" stroke="#2563eb" stroke-width="3"/>
  <polyline points="130,74 180,68 305,58 430,50 555,43" fill="none" stroke="#db2777" stroke-width="3"/>
  <text x="575" y="62" font-size="12" fill="#2563eb">homme</text>
  <text x="575" y="82" font-size="12" fill="#db2777">femme</text>
</svg>

## 9. Effet combine des modulations

Exemple : cible `100 m crawl en 1'00`, zone MAX, nageuse.

| Distance | Reference course | Sans plot | Sans combinaison | Sans les deux |
|---:|---:|---:|---:|---:|
| 15 m | 6.84 | +0.72 | +0.06 | +0.78 |
| 25 m | 12.84 | +0.92 | +0.11 | +1.03 |
| 50 m | 28.20 | +1.07 | +0.26 | +1.34 |
| 75 m | 44.10 | +1.09 | +0.44 | +1.54 |
| 100 m | 60.00 | +1.10 | +0.62 | +1.73 |

Lecture sportive : retirer le plot penalise surtout le debut. Retirer la combinaison penalise peu au depart, puis davantage au fur et a mesure que le temps nage s'allonge. Les deux effets se cumulent sans etre simplement identiques : la combinaison s'applique aussi sur le temps deja ralenti par l'absence de plot.

<svg viewBox="0 0 640 280" width="100%" role="img" aria-label="Effets combines sur 100m crawl en une minute">
  <rect x="0" y="0" width="640" height="280" fill="#ffffff"/>
  <text x="40" y="24" font-size="16" font-weight="700" fill="#111827">Ecart ajoute par rapport aux conditions course</text>
  <text x="40" y="44" font-size="12" fill="#6b7280">Exemple : 100 m crawl en 1'00, nageuse, zone MAX.</text>
  <line x1="55" y1="210" x2="560" y2="210" stroke="#d1d5db"/>
  <line x1="55" y1="40" x2="55" y2="210" stroke="#d1d5db"/>
  <text x="48" y="215" font-size="10" text-anchor="end" fill="#6b7280">0s</text>
  <text x="48" y="130" font-size="10" text-anchor="end" fill="#6b7280">1s</text>
  <text x="48" y="45" font-size="10" text-anchor="end" fill="#6b7280">2s</text>
  <text x="130" y="228" font-size="10" text-anchor="middle" fill="#6b7280">15m</text>
  <text x="180" y="228" font-size="10" text-anchor="middle" fill="#6b7280">25</text>
  <text x="305" y="228" font-size="10" text-anchor="middle" fill="#6b7280">50</text>
  <text x="430" y="228" font-size="10" text-anchor="middle" fill="#6b7280">75</text>
  <text x="555" y="228" font-size="10" text-anchor="middle" fill="#6b7280">100</text>
  <polyline points="130,149 180,132 305,119 430,117 555,116" fill="none" stroke="#059669" stroke-width="3"/>
  <polyline points="130,205 180,201 305,188 430,173 555,157" fill="none" stroke="#db2777" stroke-width="3"/>
  <polyline points="130,144 180,122 305,96 430,79 555,63" fill="none" stroke="#111827" stroke-width="3"/>
  <text x="575" y="72" font-size="12" fill="#111827">sans les deux</text>
  <text x="575" y="118" font-size="12" fill="#059669">sans plot</text>
  <text x="575" y="158" font-size="12" fill="#db2777">sans combinaison</text>
</svg>

## Synthese coach

- La cible reste le point d'ancrage.
- Les passages ne sont pas proportionnels : ils suivent une courbe de course.
- Les zones sont derivees du passage MAX avec des coefficients propres a la famille d'epreuve.
- La nage ajuste la repartition, mais conserve toujours le chrono cible final.
- Les modulations 25/50, depart et combinaison arrivent apres ce calcul de base.
- Les corrections sont volontairement prudentes : elles donnent une estimation utilisable, pas une verite individuelle absolue.
