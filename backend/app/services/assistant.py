"""Accueil conversationnel de JusticIA : tout ce qui n'est pas une question de droit.

Avant la recherche juridique (RAG), chaque message passe ici :

- question de droit (même précédée d'un « bonjour ») → RAG, comme avant ;
- salutation, remerciement, au revoir, question sur JusticIA ou ses offres →
  réponse professionnelle, rédigée à partir d'une fiche de faits (rien d'inventé) ;
- hors sujet (recette, sport…) → détecté seulement si le RAG ne trouve aucun
  texte, puis réorienté poliment vers le droit guinéen.

Les échanges non juridiques consécutifs sont comptés : au 3e, l'assistant invite
fermement à poser une question de droit et cesse d'appeler le modèle (réponse fixe).
Comme toute question, ces échanges sont décomptés du quota journalier.
"""
from __future__ import annotations

import json
import logging
import re
import unicodedata
from dataclasses import dataclass, field


from sqlalchemy import select

from app.config import settings
from app.models.content import PricingPlan
from app.services.llm_service import llm

log = logging.getLogger("justicia.assistant")


class Kind:
    LEGAL = "legal"            # question de droit → RAG
    GREETING = "greeting"      # bonjour, ça va…
    THANKS = "thanks"          # merci, d'accord…
    FAREWELL = "farewell"      # au revoir, bonne journée…
    ABOUT = "about"            # qui es-tu, que sais-tu faire, tarifs…
    OFFTOPIC = "offtopic"      # hors du droit guinéen
    CLARIFY = "clarify"        # intention juridique mais sujet impossible à cerner → questions de précision

    CONVERSATIONAL = {GREETING, THANKS, FAREWELL, ABOUT, OFFTOPIC}


# Au-delà de ce nombre d'échanges non juridiques consécutifs, recentrage ferme
STREAK_LIMIT = 3


# ── Normalisation ─────────────────────────────────────────────────────────────

def normalize(text: str) -> str:
    """minuscules, sans accents ni ponctuation, lettres répétées réduites (« bonjouuur »)."""
    t = unicodedata.normalize("NFKD", text.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.replace("'", " ").replace("’", " ")
    t = re.sub(r"[^a-z0-9\s?]", " ", t)
    t = re.sub(r"(.)\1{2,}", r"\1", t)
    return re.sub(r"\s+", " ", t).strip()


# Radicaux qui signalent une question de droit : présence → recherche juridique
_LEGAL_STEMS = (
    "loi", "lois", "legal", "legis", "juridi", "juriste", "droit", "article", "code ", "codes",
    "decret", "ordonnance", "constitution", "ohada", "jurisprud", "reglement",
    "contrat", "licenci", "demission", "employeur", "employe", "salari", "salaire", "travail",
    "patron", "conge", "preavis", "indemni", "chomage", "retraite", "pension", "cnss",
    "mariage", "marie", "divorc", "epoux", "epouse", "dot ", "polygam", "heritage", "heriti",
    "success", "testament", "garde des enfants", "garde d", "pension alimentaire", "adoption",
    "filiation", "etat civil", "acte de naissance", "nationalite",
    "terrain", "foncier", "propriet", "titre foncier", "bail", "loyer", "locataire", "bailleur",
    "expuls", "expropri", "permis de construire", "immobili", "parcelle",
    "tribunal", "juge", "justice", "proces", "avocat", "huissier", "notaire", "plainte",
    "porter plainte", "poursuite", "recours", "appel ", "cassation", "jugement", "audience",
    "penal", "crime", "delit", "infraction", "peine", "prison", "amende", "sanction",
    "garde a vue", "police", "gendarm", "arrest", "detention", "vol ", "escroquer", "fraude",
    "harcel", "violence", "viol", "agression", "diffamation", "corruption",
    "societe", "sarl", "entreprise", "commerc", "faillite", "creance", "dette", "creancier",
    "cheque", "impot", "fiscal", "taxe", "douane", "minier", "mines", "permis minier",
    "responsabilit", "dommage", "prejudice", "assurance", "accident",
    "administrati", "fonctionnaire", "election", "obligation", "mes droits", "est ce legal",
    "est il legal", "a t il le droit", "ai je le droit", "punissable", "risque t on", "que dit",
)

_GREETING_WORDS = {
    "bonjour", "bonsoir", "salut", "slt", "bjr", "bsr", "hello", "hi", "hey", "coucou", "cc",
    "salam", "salamalekoum", "salamalaykoum", "assalamou", "alaykoum", "aleikoum", "alaikoum",
    "yo", "re", "allo", "bienvenue", "bonne", "matinee", "journee", "soiree",
}
_GREETING_FILLERS = {
    "ca", "va", "vas", "comment", "allez", "vous", "tu", "toi", "bien", "et", "justicia", "jia",
    "cher", "chere", "madame", "monsieur", "mr", "mme", "a", "tous", "toutes", "le", "la", "?",
    "j", "espere", "que", "votre", "ta", "se", "passe", "quoi", "de", "neuf", "aussi", "moi",
    "oui", "tres", "super", "sava", "cv", "ok", "merci", "nous", "on", "y",
}
_THANKS = re.compile(
    r"^(ok|okay|oki|d accord|dac|daccord|ca marche|parfait|super|genial|top|tres bien|"
    r"c est (clair|note|bon|compris|parfait)|compris|entendu|merci|mercii|thanks|thank you|"
    r"a jaraama|jaraama|nuwaali)\b"
)
_FAREWELL = re.compile(
    r"\b(au revoir|aurevoir|bye|bye bye|a bientot|a plus|a\+|bonne (journee|soiree|nuit|fin de journee)|"
    r"a demain|a la prochaine|ciao|adieu)\b"
)
_ABOUT = re.compile(
    r"(qui es tu|qui etes vous|t es qui|tu es qui|vous etes qui|c est quoi justicia|qu est ce que justicia|"
    r"justicia c est quoi|presente toi|presentez vous|parle moi de (toi|vous|justicia)|"
    r"(detail|details|plus d info|informations?) (sur|de) (toi|vous|justicia|la plateforme|l application|ce site)|"
    r"(que|qu est ce que) (peux|pouvez|sais|savez) (tu|vous) faire|tu (peux|sais) faire quoi|"
    r"comment (ca|tu|vous) (marche|fonctionne|fonctionnez)|comment (utiliser|marche) (justicia|la plateforme|l application|le site)|"
    r"a quoi (tu sers|sert justicia|servez vous)|tu es une ia|es tu (une ia|un robot|humain)|tu es un robot|"
    r"quel(le)?s? (sont )?(tes|vos) (capacites|fonctions|competences|limites)|"
    r"(tarif|tarifs|prix|abonnement|abonnements|formule|formules|plan pro|offre|offres|gratuit|payant|"
    r"combien (ca coute|coute)|moyen de paiement|orange money|payer)|"
    r"(qui (t a|vous a) (cree|developpe|concu))|tes sources|vos sources|d ou viennent)"
)


def classify(text: str) -> str | None:
    """Classement par règles. None = indéterminé (le RAG tranche)."""
    t = normalize(text)
    if not t:
        return Kind.GREETING
    padded = f" {t} "
    words = t.replace("?", " ").split()

    # Une notion juridique l'emporte sur tout le reste (« bonjour, mon patron… »)
    if any(stem in padded for stem in _LEGAL_STEMS):
        # sauf les questions sur la plateforme elle-même (« vos sources ? », « combien coûte… »)
        if _ABOUT.search(t) and len(words) <= 12 and not re.search(r"\b(mes|mon|ma)\b", t):
            return Kind.ABOUT
        return Kind.LEGAL

    if _ABOUT.search(t) and len(words) <= 20:
        return Kind.ABOUT
    if _FAREWELL.search(t) and len(words) <= 10:
        return Kind.FAREWELL
    if len(words) <= 8 and words and words[0] in _GREETING_WORDS | {"salamalekum", "ola"}:
        rest = [w for w in words if w not in _GREETING_WORDS and w not in _GREETING_FILLERS]
        if len(rest) <= 1:
            return Kind.GREETING
    if len(words) <= 4 and set(words) <= (_GREETING_FILLERS | {"ca va", "sa", "ok"}) and "va" in words:
        return Kind.GREETING   # « ça va ? », « tu vas bien ? »
    if _THANKS.match(t) and len(words) <= 8:
        return Kind.THANKS
    return None


def conversational_streak(kinds: list[str | None]) -> int:
    """Nombre d'échanges non juridiques consécutifs en fin de conversation (réponses du bot)."""
    streak = 0
    for k in reversed(kinds):
        if k in Kind.CONVERSATIONAL:
            streak += 1
        else:
            break
    return streak


# ── Faits sur la plateforme (seule source autorisée pour ces réponses) ────────

STATIC_FACTS = """\
- Nom : JusticIA (monogramme « JiA »), assistant juridique dédié au droit positif de la République de Guinée.
- Conçu par Mosagix (mosagix.com). Site : https://justicia.mosagix.com
- Fonctionnement : pour chaque question de droit, JusticIA retrouve les articles applicables dans les
  textes officiels guinéens indexés, cite le texte exact avec sa référence, puis l'explique en français clair.
  S'il ne trouve pas de texte fiable, il le dit plutôt que d'inventer.
- Base documentaire : 33 textes officiels guinéens (codes, lois, décrets, Constitution), découpés article par article.
- Domaines couverts notamment : travail, famille et mariage, successions, foncier et immobilier, pénal et
  procédure pénale, procédure civile, commercial et sociétés, fiscalité, mines, droit constitutionnel.
- Assistants spécialisés : Jurisprudence (tous domaines), Droit matrimonial, Droit pénal, Droit commercial,
  Droit du travail, Droit immobilier.
- Autres outils de l'espace client : historique des consultations, dossiers (affaires et pièces), agenda des
  délais, génération et audit d'actes, résumé de documents, comparaison de textes, traduction et
  vulgarisation, encyclopédie juridique, démarches administratives.
- Limites : information juridique uniquement ; ne remplace pas un avocat inscrit au Barreau de Guinée ;
  pas de droit étranger ; pas de conseils sur des sujets non juridiques.
- Contact : mosagix.contact@gmail.com · +224 627 24 30 90
"""


async def platform_facts(db) -> str:
    """Fiche de faits, avec les offres actives lues en base (jamais de prix inventé)."""
    lines = [STATIC_FACTS.rstrip(), "- Offres actuelles :"]
    try:
        plans = (await db.execute(
            select(PricingPlan).where(PricingPlan.is_active.is_(True)).order_by(PricingPlan.id)
        )).scalars().all()
        for p in plans:
            if p.price == "0":
                price = "gratuit"
            elif p.price.replace(" ", "").isdigit():
                price = f"{int(p.price):,} {p.currency or 'GNF'}".replace(",", " ") + (f" par {p.period}" if p.period else "")
            else:
                price = p.price
            limit = "questions illimitées" if (p.daily_limit or -1) < 0 else f"{p.daily_limit} questions par jour"
            lines.append(f"  · {p.name} : {price} — {limit}")
    except Exception:  # noqa: BLE001
        lines.append("  · (détail disponible sur la page Tarifs)")
    lines.append("  Chaque message envoyé, y compris une salutation, compte dans le quota journalier.")
    return "\n".join(lines)


# ── Rédaction des réponses ────────────────────────────────────────────────────

SYSTEM_PROMPT = """Tu es JusticIA, assistant juridique professionnel spécialisé dans le droit de la République de Guinée.
Ici, tu ne réponds PAS à une question de droit : tu gères l'accueil de la conversation (salutation,
remerciement, au revoir, question sur toi ou la plateforme, ou demande hors de ton domaine).

Règles impératives :
- Français soigné, ton professionnel, chaleureux et concis : 2 à 5 phrases, 110 mots maximum.
- Vouvoie l'utilisateur.
- N'utilise QUE les faits de la fiche ci-dessous. N'invente aucun chiffre, prix, fonctionnalité, partenaire ou délai.
  Si une information manque, dis simplement qu'elle est disponible auprès du support (contact de la fiche).
- Ne donne aucun conseil juridique ni aucune réponse sur le fond du droit dans ce mode.
- Hors sujet (cuisine, sport, programmation, santé, droit étranger…) : décline poliment en une phrase,
  rappelle ta spécialité, puis propose un exemple concret de question juridique guinéenne.
- Sauf consigne contraire, termine en invitant à poser une question de droit guinéen, avec UN exemple
  de question réaliste (varie les domaines : travail, famille, foncier, pénal, commerce…).
- Ne commence par une salutation que s'il s'agit du tout premier message de la conversation.
- Pas de titre, pas de liste à puces sauf pour présenter tes capacités (3 à 5 puces maximum), pas d'emoji.

FICHE DE FAITS :
{facts}
"""

_SITUATION = {
    Kind.GREETING: "L'utilisateur vous salue.",
    Kind.THANKS: ("L'utilisateur vous remercie ou acquiesce. Répondez en 1 ou 2 phrases (« Je vous en prie… »), "
                  "proposez votre aide pour une autre question ; pas de présentation, pas d'exemple."),
    Kind.FAREWELL: ("L'utilisateur prend congé. Répondez en 1 ou 2 phrases courtoises ; "
                    "pas de présentation, pas d'exemple de question."),
    Kind.ABOUT: ("L'utilisateur pose une question sur JusticIA, son fonctionnement, ses capacités ou ses offres. "
                 "Répondez précisément à CETTE question avec les faits de la fiche."),
    Kind.OFFTOPIC: "L'utilisateur demande quelque chose qui sort du droit guinéen.",
}


def _first_name(full_name: str | None) -> str:
    return (full_name or "").strip().split(" ")[0][:30]


def fallback_reply(kind: str, streak: int, name: str | None = None) -> str:
    """Réponses fixes : sans modèle, ou recentrage après plusieurs échanges non juridiques."""
    hello = f"Bonjour {_first_name(name)}," if _first_name(name) else "Bonjour,"
    example = "« Quelle est la durée du préavis en cas de démission d'un salarié ? »"
    if streak >= STREAK_LIMIT - 1:
        if kind == Kind.OFFTOPIC:
            return (
                "Ce sujet sort de mon domaine : je suis exclusivement consacré au droit de la République de Guinée. "
                "Pour que je vous sois utile, posez-moi votre question juridique en décrivant votre situation "
                f"(travail, famille, terrain, entreprise, procédure…). Par exemple : {example}"
            )
        return (
            "Je reste à votre entière disposition, mais je suis conçu pour vous accompagner sur le droit "
            "guinéen. Pour que je vous sois réellement utile, posez-moi maintenant votre question juridique : "
            "décrivez votre situation (travail, famille, terrain, entreprise, procédure…) et je vous répondrai "
            f"en citant les textes applicables. Par exemple : {example}"
        )
    if kind == Kind.THANKS:
        return ("Avec plaisir. Si vous avez une autre question sur le droit guinéen, je suis à votre disposition.")
    if kind == Kind.FAREWELL:
        return ("Au revoir, et merci de votre confiance. Je reste disponible pour toute question sur le droit guinéen.")
    if kind == Kind.OFFTOPIC:
        return (
            "Je suis spécialisé dans le droit de la République de Guinée et ne peux donc pas vous aider sur ce sujet. "
            f"En revanche, je peux vous éclairer sur vos droits et obligations, par exemple : {example}"
        )
    if kind == Kind.ABOUT:
        return (
            "Je suis JusticIA, un assistant juridique dédié au droit guinéen. Pour chaque question, je retrouve "
            "les articles applicables parmi 33 textes officiels guinéens, je cite le texte exact puis je l'explique "
            "en termes clairs ; si aucun texte ne permet de répondre de façon fiable, je vous le dis. "
            f"Posez-moi votre question, par exemple : {example}"
        )
    if streak == 0:
        return (
            f"{hello} je suis JusticIA, votre assistant juridique spécialisé dans le droit guinéen. Je peux vous "
            "aider à comprendre vos droits et obligations en droit du travail, de la famille, foncier, pénal ou "
            f"commercial, en citant les textes de loi applicables. Quelle est votre question ? Par exemple : {example}"
        )
    return "Je vous écoute : quelle est votre question juridique ?"


async def reply(kind: str, message: str, streak: int, db, user_name: str | None = None,
                history: list[dict] | None = None) -> str:
    """Réponse d'accueil professionnelle. `streak` = échanges non juridiques déjà enchaînés."""
    refocus = streak >= STREAK_LIMIT - 1
    if kind == Kind.FAREWELL:
        refocus = False   # un au revoir n'appelle jamais de recentrage
    if refocus and kind != Kind.ABOUT:
        # 3e échange de politesse (ou plus) : recentrage ferme, sans appel au modèle
        return fallback_reply(kind, streak, user_name)

    facts = await platform_facts(db)
    if refocus:
        tone = ("Plusieurs échanges ont déjà eu lieu sans question de droit : répondez en une ou deux phrases "
                "à sa question sur la plateforme, puis invitez-le clairement à poser maintenant sa question juridique.")
    elif not history and kind in (Kind.GREETING, Kind.ABOUT):
        tone = ("C'est le tout premier message de la conversation : saluez, présentez-vous brièvement "
                "et dites ce que vous pouvez faire.")
    else:
        tone = ("La conversation est déjà engagée : ne saluez pas à nouveau, ne vous représentez pas, "
                "soyez bref.")
    recent = ""
    if history:
        last = [f"{'Utilisateur' if h['role'] == 'user' else 'JusticIA'} : {h['content'][:200]}" for h in history[-4:]]
        recent = "Derniers échanges :\n" + "\n".join(last) + "\n\n"
    name = _first_name(user_name)
    user = (
        f"{recent}{_SITUATION.get(kind, '')} {tone}\n"
        f"{f'Prénom de l utilisateur : {name}. ' if name else ''}"
        f"Message de l'utilisateur : « {message[:500]} »"
    )
    try:
        text = await llm.acall(SYSTEM_PROMPT.format(facts=facts), user, temperature=0.4, max_tokens=320)
        text = (text or "").strip()
        if len(text) < 20:
            raise ValueError("réponse vide")
        return text
    except Exception as exc:  # noqa: BLE001 — l'accueil ne doit jamais échouer
        log.warning("assistant_reply_fallback kind=%s error=%s", kind, type(exc).__name__)
        return fallback_reply(kind, streak, user_name)


# ══════════════════════════════════════════════════════════════════════════════
#  Analyse de la question (avant la recherche) et accompagnement (après)
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class Triage:
    kind: str                                   # legal | clarify | offtopic | about | greeting
    search_query: str = ""                      # reformulation juridique pour la recherche
    topic: str = ""                             # sujet en quelques mots (« viol sur mineur »)
    sensitive: bool = False                     # violence, abus, enfant en danger, détresse…
    clarify_questions: list[str] = field(default_factory=list)


TRIAGE_PROMPT = """Tu analyses le message d'un utilisateur adressé à JusticIA, assistant spécialisé dans le droit
de la République de Guinée, AVANT la recherche dans les textes de loi. Réponds UNIQUEMENT en JSON :
{"type": "...", "search_query": "...", "topic": "...", "sensitive": true|false, "clarify_questions": ["..."]}

type :
- "legal" : le sujet juridique est identifiable, même formulé en langage courant, avec des fautes ou de
  façon très générale (« les articles sur le viol », « mon patron ne me paie pas », « comment divorcer »).
- "clarify" : RARE. Seulement si l'utilisateur veut de l'aide juridique mais qu'il est IMPOSSIBLE de savoir
  sur quel sujet (« que dois-je faire pour ma famille ? », « j'ai un problème », « aide-moi ») et que
  l'historique ne l'éclaire pas. Aussi si un numéro d'article est cité SANS AUCUN nom de texte ni dans le
  message ni dans l'historique (« que dit l'article 12 ? ») : demande alors de quel code il s'agit.
  Dès qu'un sujet ou un texte est identifiable, c'est "legal" : « que dit l'article 268 du Code pénal ? »,
  « les articles 272 et 273 du code pénal », « l'article qui condamne les abus sexuels sur mineur » → legal.
  Ne demande jamais « de quel pays » : il s'agit toujours du droit guinéen.
- "about" : question sur JusticIA, ses fonctions ou ses tarifs.  "greeting" : pure politesse.
- "offtopic" : rien à voir avec le droit (cuisine, sport, code informatique, santé, devoirs…).

search_query (si legal) : 6 à 20 mots-clés pour un moteur de recherche dans les codes guinéens.
TRADUIS le langage courant dans le VOCABULAIRE DES TEXTES DE LOI et ajoute les notions juridiques voisines
qu'un code emploierait. N'y mets PAS « article », « loi », « Guinée », « code » ni de formule de politesse.
Exemples :
- « l'article qui condamne les abus sexuels sur mineur » → « viol attentat à la pudeur atteinte sexuelle enfant mineur âgé de moins de 16 ans peine réclusion »
- « mon patron m'a renvoyé sans raison » → « licenciement abusif motif légitime indemnité préavis employeur travailleur »
- « mon mari veut prendre une 2e femme sans mon accord » → « polygamie consentement épouse mariage option monogamie »
- « mon frère refuse de partager l'héritage » → « succession partage héritiers indivision part réservataire »
Tiens compte de l'historique pour les questions de suivi. Corrige les fautes de frappe.
N'invente JAMAIS de numéro d'article, de peine ou de montant.
topic : le sujet en 2 à 6 mots.
sensitive : true UNIQUEMENT si l'utilisateur décrit une situation VÉCUE (lui-même ou un proche victime de
violence, d'abus, enfant en danger, détresse) : « ma fille a été touchée par un voisin ». false pour une
simple demande d'information ou de texte sur une infraction : « que dit l'article sur le viol ? ».
clarify_questions (si clarify) : 2 ou 3 questions courtes, bienveillantes et CONCRÈTES pour cerner la
situation. Propose des pistes précises liées aux mots employés (pour « ma famille » : s'agit-il d'un mariage,
d'un divorce, de la garde des enfants, d'une pension alimentaire, d'un héritage ?). Jamais de question vague
du type « avez-vous besoin d'aide juridique ? ».
"""


async def triage(message: str, history: list[dict] | None = None) -> Triage | None:
    """Analyse rapide (modèle léger). None si indisponible : on garde alors les règles."""
    recent = ""
    if history:
        recent = "Historique récent :\n" + "\n".join(
            f"{'Utilisateur' if h['role'] == 'user' else 'JusticIA'} : {h['content'][:300]}" for h in history[-4:]
        ) + "\n\n"
    try:
        raw = await llm.acall(
            TRIAGE_PROMPT, f"{recent}Message : « {message[:1200]} »",
            json_mode=True, temperature=0, max_tokens=260, model=settings.ASSISTANT_FAST_MODEL,
        )
        data = json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        log.warning("triage_failed error=%s", type(exc).__name__)
        return None
    kind = {"legal": Kind.LEGAL, "clarify": Kind.CLARIFY, "offtopic": Kind.OFFTOPIC,
            "about": Kind.ABOUT, "greeting": Kind.GREETING}.get(str(data.get("type")), Kind.LEGAL)
    questions = [str(q).strip() for q in (data.get("clarify_questions") or []) if str(q).strip()][:3]
    if kind == Kind.CLARIFY and (not questions or _clearly_legal(message, history)):
        kind = Kind.LEGAL
    # « Que dit la loi guinéenne sur… » n'est jamais hors sujet, même si le thème est inattendu
    if kind == Kind.OFFTOPIC and _STRONG_LEGAL.search(normalize(message)):
        kind = Kind.LEGAL
    return Triage(
        kind=kind,
        search_query=str(data.get("search_query") or "")[:300],
        topic=str(data.get("topic") or "")[:80],
        sensitive=bool(data.get("sensitive")),
        clarify_questions=questions,
    )


_STRONG_LEGAL = re.compile(
    r"\b(lois?|legal|legale|legaux|illegal\w*|juridiques?|legislation|reglementation|droit guineen|"
    r"tribunal|juge|avocat|plainte|code (?:penal|civil|du travail|de travail|minier|foncier|electoral|de l enfant))\b"
)
_ARTICLE_REF = re.compile(r"\bart(?:icle)?s?\.?\s*(?:premier|\d)", re.I)
_TEXT_NAMES = re.compile(
    r"\b(code|constitution|charte|loi|decret|ordonnance|ohada)\b", re.I,
)


def _clearly_legal(message: str, history: list[dict] | None) -> bool:
    """Le sujet est identifiable sans ambiguïté : pas de questions de précision.

    - un article cité avec le nom d'un texte (dans le message ou l'historique récent) ;
    - ou une notion juridique reconnue par les règles (licenciement, viol, héritage…).
    """
    context = normalize(message + " " + " ".join(h["content"] for h in (history or [])[-4:]))
    if _ARTICLE_REF.search(normalize(message)):
        # Un numéro d'article : clair seulement si le texte visé est nommé quelque part
        return bool(_TEXT_NAMES.search(context))
    padded = f" {normalize(message)} "
    return any(stem in padded for stem in _LEGAL_STEMS)


def clarify_reply(t: Triage, user_name: str | None = None) -> str:
    """Questions de précision quand le sujet ne peut pas être identifié."""
    lines = "\n".join(f"- {q}" for q in t.clarify_questions)
    return (
        "Je veux vous orienter au mieux, mais j'ai besoin de mieux comprendre votre situation.\n\n"
        f"{lines}\n\n"
        "Avec ces précisions, je rechercherai les textes guinéens qui s'appliquent à votre cas "
        "(famille, mariage, succession, garde des enfants, travail, terrain…) et je vous les citerai."
    )


SUPPORT_PROMPT = """Tu es JusticIA, assistant juridique spécialisé dans le droit de la République de Guinée.
La recherche dans les textes officiels guinéens n'a pas permis de confirmer une réponse par un article précis.
Tu rédiges malgré tout une réponse UTILE et HUMAINE, comme le ferait un juriste bienveillant au premier contact.

Structure (en français, vouvoiement, 120 à 220 mots, sans titre principal) :
1. Une phrase qui montre que tu as compris la demande{empathy}.
2. Une phrase transparente : tu n'as pas pu rattacher la réponse à un article précis des textes que tu consultes,
   donc tu donnes une orientation générale.
3. « **Ce que vous pouvez faire :** » puis 3 à 5 puces concrètes et prudentes (démarches, preuves à conserver,
   interlocuteurs : commissariat ou gendarmerie, tribunal, avocat inscrit au Barreau de Guinée, notaire,
   services sociaux… selon le cas).
4. « **Pour une réponse fondée sur les textes :** » puis 1 ou 2 reformulations de la question que l'utilisateur
   peut me poser pour que je retrouve l'article exact.

Interdictions absolues :
- AUCUN numéro d'article, AUCUNE référence de loi ou de décret, AUCUNE peine, durée, montant ou délai chiffré :
  ces éléments ne peuvent venir que des textes, et ils ne sont pas confirmés ici.
- N'invente aucun organisme, numéro de téléphone ou adresse. Reste générique.
- Pas de droit étranger.
{sensitive_rule}"""

_SENSITIVE_RULE = (
    "- Sujet sensible (violence, abus, enfant en danger) : ton calme et protecteur ; rappelle qu'en cas de danger "
    "immédiat il faut contacter sans attendre la police ou la gendarmerie, et qu'un enfant victime doit être "
    "mis en sécurité et accompagné (médecin, proches de confiance, autorités)."
)
_FORBIDDEN_REF = re.compile(
    r"\b(?:art(?:icle)?s?\.?\s*\d|loi\s+n|l/\d{4}|d[ée]cret\s+n|\d+\s*(?:ans?|mois|jours?)\s+(?:de|d)\s+"
    r"(?:prison|emprisonnement|r[ée]clusion)|\d[\d\s.]*\s*(?:gnf|francs?\s+guin))",
    re.I,
)

SUPPORT_FOOTER = (
    "\n\n---\n*Orientation générale, non fondée sur un article précis. Pour une décision importante, "
    "consultez un avocat inscrit au Barreau de Guinée.*"
)


def _support_fallback(t: Triage | None) -> str:
    safety = ""
    if t and t.sensitive:
        safety = ("\n- En cas de danger immédiat, contactez sans attendre la police ou la gendarmerie ; "
                  "si un enfant est concerné, mettez-le en sécurité et faites-le accompagner (médecin, proches de confiance).")
    topic = f" sur « {t.topic} »" if t and t.topic else ""
    return (
        f"Je comprends votre demande{topic}. Je n'ai pas pu rattacher ma réponse à un article précis des textes "
        "guinéens que je consulte ; je préfère donc vous orienter sans vous donner de référence inexacte.\n\n"
        "**Ce que vous pouvez faire :**\n"
        "- Rassemblez les éléments utiles (dates, documents, témoins, échanges écrits).\n"
        "- Rapprochez-vous d'un avocat inscrit au Barreau de Guinée pour une analyse de votre situation."
        f"{safety}\n\n"
        "**Pour une réponse fondée sur les textes :** reformulez votre question en précisant la situation et le "
        "domaine (par exemple : « Quelle peine prévoit le Code pénal pour… ? »)."
    )


async def support_reply(message: str, t: Triage | None, history: list[dict] | None = None) -> str:
    """Accompagnement quand aucun article ne permet de confirmer une réponse."""
    system = SUPPORT_PROMPT.format(
        empathy=" et, si la situation est difficile, une marque d'empathie sobre" ,
        sensitive_rule=_SENSITIVE_RULE if (t and t.sensitive) else "",
    )
    context = ""
    if history:
        context = "Historique récent :\n" + "\n".join(
            f"{'Utilisateur' if h['role'] == 'user' else 'JusticIA'} : {h['content'][:250]}" for h in history[-4:]
        ) + "\n\n"
    user = f"{context}Question : « {message[:1200]} »" + (f"\nSujet identifié : {t.topic}" if t and t.topic else "")
    for attempt in range(2):
        try:
            text = (await llm.acall(system, user, temperature=0.3, max_tokens=520)).strip()
        except Exception as exc:  # noqa: BLE001
            log.warning("support_reply_failed error=%s", type(exc).__name__)
            break
        if len(text) > 60 and not _FORBIDDEN_REF.search(text):
            return text + SUPPORT_FOOTER
        user += "\n\nATTENTION : ta réponse précédente contenait une référence ou un chiffre interdit. Recommence sans aucun."
        log.info("support_reply_retry attempt=%s", attempt + 1)
    return _support_fallback(t) + SUPPORT_FOOTER


# ── Situations sensibles : quelques mots humains avant les textes ──────────────

PREFACE_PROMPT = """Tu es JusticIA, assistant juridique guinéen. L'utilisateur décrit une situation difficile
(violence, abus, enfant ou personne en danger). Une réponse juridique sourcée suivra ton texte.
Écris UNIQUEMENT un court paragraphe d'introduction (50 à 90 mots, vouvoiement, ton calme et humain) :
une marque d'empathie sobre, puis les premiers réflexes concrets (mise en sécurité, soins médicaux si besoin,
conserver les preuves, signaler les faits à la police ou à la gendarmerie, se faire accompagner).
Termine par une phrase qui introduit les textes, par exemple : « Voici ce que prévoit la loi guinéenne : ».
Interdits : numéro d'article, référence de loi, peine, durée, montant, numéro de téléphone, nom d'organisme précis."""


def _preface_fallback() -> str:
    return (
        "Je suis sincèrement désolé pour ce que vous traversez. En priorité, mettez la personne concernée en "
        "sécurité, faites-la examiner par un médecin si nécessaire, conservez tous les éléments utiles et "
        "signalez les faits à la police ou à la gendarmerie. Vous n'avez pas à affronter cela seul : un avocat "
        "peut vous accompagner. Voici ce que prévoit la loi guinéenne :"
    )


async def sensitive_preface(message: str) -> str:
    try:
        text = (await llm.acall(PREFACE_PROMPT, f"Message : « {message[:800]} »",
                                temperature=0.3, max_tokens=200, model=settings.ASSISTANT_FAST_MODEL)).strip()
        if 40 < len(text) < 900 and not _FORBIDDEN_REF.search(text) and not re.search(r"\d{6,}", text):
            return text
    except Exception as exc:  # noqa: BLE001
        log.warning("sensitive_preface_failed error=%s", type(exc).__name__)
    return _preface_fallback()
