"""
Données initiales — insérées au démarrage si les tables sont vides.
"""
import json

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.features import PLAN_DEFAULT_FEATURES
from app.models.content import FaqItem, Partner, PricingPlan, SiteConfig, Testimonial
from app.models.procedure import Procedure


async def seed_content(db: AsyncSession) -> None:
    await _seed_testimonials(db)
    await _seed_pricing(db)
    await _seed_faq(db)
    await _seed_partners(db)
    await _seed_config(db)
    await _seed_procedures(db)
    await db.commit()


async def _seed_testimonials(db: AsyncSession) -> None:
    count = (await db.execute(select(func.count()).select_from(Testimonial))).scalar() or 0
    if count > 0:
        return

    items = [
        Testimonial(
            name="Maître Diallo", role="Avocat - Conakry", rating=5, order=1,
            text="justiCIA a révolutionné ma façon de travailler. L'accès rapide aux documents juridiques guinéens et l'assistant IA me font gagner des heures chaque jour. Un outil indispensable pour tout avocat moderne.",
        ),
        Testimonial(
            name="Aminata Sylla", role="Utilisatrice - Particulier", rating=5, order=2,
            text="En tant que particulier, j'ai pu obtenir des réponses claires à mes questions juridiques sans avoir à consulter un avocat. La plateforme est intuitive et les réponses sont très pertinentes.",
        ),
        Testimonial(
            name="Maître Camara", role="Cabinet Juridique - Kindia", rating=5, order=3,
            text="La base de données de jurisprudence est exhaustive et la recherche est intuitive. Un outil indispensable pour tout cabinet d'avocats moderne. Nous l'utilisons quotidiennement.",
        ),
    ]
    db.add_all(items)


async def _seed_pricing(db: AsyncSession) -> None:
    count = (await db.execute(select(func.count()).select_from(PricingPlan))).scalar() or 0
    if count > 0:
        # Migration : ajouter plan_id/daily_limit/feature_flags aux lignes existantes
        result = await db.execute(select(PricingPlan))
        for plan in result.scalars().all():
            if not plan.plan_id:
                slug = _name_to_slug(plan.name)
                plan.plan_id     = slug
                plan.daily_limit = _default_daily_limit(slug)
            # Peupler feature_flags si vide
            try:
                flags = json.loads(plan.feature_flags or "[]")
            except Exception:
                flags = []
            if not flags and plan.plan_id:
                plan.feature_flags = json.dumps(
                    PLAN_DEFAULT_FEATURES.get(plan.plan_id, []),
                    ensure_ascii=False,
                )
        return

    items = [
        PricingPlan(
            plan_id="gratuit", name="Gratuit", price="0", currency="FG", period="mois",
            description="Parfait pour commencer",
            daily_limit=5,
            feature_flags=json.dumps(PLAN_DEFAULT_FEATURES["gratuit"], ensure_ascii=False),
            features=json.dumps([
                "5 questions par jour",
                "Accès aux agents de base",
                "Historique 30 jours",
            ], ensure_ascii=False),
            is_popular=False, cta_text="Commencer gratuitement", cta_type="link", order=1,
        ),
        PricingPlan(
            plan_id="basic", name="Basic", price="5000", currency="FG", period="mois",
            description="Pour les particuliers",
            daily_limit=10,
            feature_flags=json.dumps(PLAN_DEFAULT_FEATURES["basic"], ensure_ascii=False),
            features=json.dumps([
                "10 questions par jour",
                "Accès aux agents de base",
                "Historique 30 jours",
            ], ensure_ascii=False),
            is_popular=False, cta_text="Choisir Basic", cta_type="link", order=2,
        ),
        PricingPlan(
            plan_id="pro", name="Pro", price="15000", currency="FG", period="mois",
            description="Pour les professionnels du droit",
            daily_limit=-1,
            feature_flags=json.dumps(PLAN_DEFAULT_FEATURES["pro"], ensure_ascii=False),
            features=json.dumps([
                "Questions illimitées",
                "Accès à tous les agents",
                "Agents personnalisés",
                "Historique illimité",
                "Support prioritaire",
            ], ensure_ascii=False),
            is_popular=True, cta_text="Choisir Pro", cta_type="link", order=3,
        ),
        PricingPlan(
            plan_id="enterprise", name="Entreprise", price="50000", currency="FG", period="mois",
            description="Pour les cabinets et institutions",
            daily_limit=-1,
            feature_flags=json.dumps(PLAN_DEFAULT_FEATURES["enterprise"], ensure_ascii=False),
            features=json.dumps([
                "Multi-utilisateurs",
                "Questions illimitées",
                "Agents personnalisés avancés",
                "API dédiée",
                "Support 24/7",
                "Formation incluse",
            ], ensure_ascii=False),
            is_popular=False, cta_text="Nous contacter", cta_type="contact", order=4,
        ),
    ]
    db.add_all(items)


def _name_to_slug(name: str) -> str:
    mapping = {
        "basique": "gratuit", "gratuit": "gratuit", "free": "gratuit",
        "basic": "basic",
        "professionnel": "pro", "pro": "pro",
        "entreprise": "enterprise", "enterprise": "enterprise",
    }
    return mapping.get(name.strip().lower(), name.strip().lower().replace(" ", "_"))


def _default_daily_limit(slug: str) -> int:
    return {"gratuit": 5, "basic": 10}.get(slug, -1)


async def _seed_faq(db: AsyncSession) -> None:
    count = (await db.execute(select(func.count()).select_from(FaqItem))).scalar() or 0
    if count > 0:
        return

    items = [
        # ── Catégorie : pricing ──
        FaqItem(category="pricing", order=1,
            question="Puis-je changer de plan à tout moment ?",
            answer="Oui, vous pouvez passer à un plan supérieur ou inférieur à tout moment. Les changements prennent effet immédiatement.",
        ),
        FaqItem(category="pricing", order=2,
            question="Y a-t-il des frais cachés ?",
            answer="Non, nos tarifs sont transparents. Le prix affiché est le prix final, sans frais cachés ni surprises.",
        ),
        FaqItem(category="pricing", order=3,
            question="Offrez-vous un essai gratuit ?",
            answer="Le plan Basique est gratuit à vie. Les plans payants incluent une période d'essai de 14 jours sans engagement.",
        ),
        # ── Catégorie : support ──
        FaqItem(category="support", order=1,
            question="Comment créer un compte ?",
            answer="Cliquez sur 'Connexion' dans le menu, puis sur 'Créer un compte'. Remplissez le formulaire avec vos informations et validez votre email.",
        ),
        FaqItem(category="support", order=2,
            question="Comment fonctionne l'assistant IA ?",
            answer="Notre assistant IA utilise l'intelligence artificielle pour répondre à vos questions juridiques. Posez simplement votre question et recevez une réponse détaillée basée sur le droit guinéen.",
        ),
        FaqItem(category="support", order=3,
            question="Puis-je annuler mon abonnement ?",
            answer="Oui, vous pouvez annuler votre abonnement à tout moment depuis votre tableau de bord, dans la section 'Abonnement'. Aucun frais d'annulation ne vous sera facturé.",
        ),
        FaqItem(category="support", order=4,
            question="Mes données sont-elles sécurisées ?",
            answer="Absolument. Nous utilisons un chiffrement de niveau bancaire pour protéger toutes vos données. Consultez notre page 'Confidentialité' pour plus d'informations.",
        ),
        FaqItem(category="support", order=5,
            question="Quels types de documents juridiques sont disponibles ?",
            answer="Nous proposons une base de données complète incluant les codes juridiques guinéens, les lois, décrets, arrêtés et jurisprudence mise à jour régulièrement.",
        ),
        FaqItem(category="support", order=6,
            question="Comment contacter le support technique ?",
            answer="Vous pouvez nous contacter par email à mosagix.contact@gmail.com, par téléphone au +224 627 24 30 90, ou utiliser le formulaire de contact disponible sur cette page.",
        ),
    ]
    db.add_all(items)


async def _seed_partners(db: AsyncSession) -> None:
    count = (await db.execute(select(func.count()).select_from(Partner))).scalar() or 0
    if count > 0:
        return

    items = [
        Partner(name="Barreau de Conakry",         order=1),
        Partner(name="Ministère de la Justice",     order=2),
        Partner(name="Université de Conakry",       order=3),
        Partner(name="Association des Avocats",     order=4),
    ]
    db.add_all(items)


async def _seed_config(db: AsyncSession) -> None:
    defaults = {
        "stats": {
            "label": "Statistiques du site",
            "value": {
                "documents": "1000+",
                "users":     "500+",
                "lawyers":   "50+",
                "support":   "24/7",
            },
        },
        "contact": {
            "label": "Informations de contact",
            "value": {
                "emails":  ["mosagix.contact@gmail.com"],
                "phones":  ["+224 627 24 30 90"],
                "hours":   "Lun-Ven, 9h-18h",
                "address": "Conakry, République de Guinée",
            },
        },
        "hero": {
            "label": "Texte de la page d'accueil (hero)",
            "value": {
                "title":    "L'IA Juridique au Service de la Guinée",
                "subtitle": "Accédez à l'intelligence juridique de pointe. Posez vos questions et obtenez des réponses précises basées sur le droit guinéen.",
                "badges":   ["IA Juridique", "Base Complète", "Rapide & Efficace", "Support 24/7"],
            },
        },
        "cta": {
            "label": "Section appel à l'action",
            "value": {
                "title":    "Prêt à commencer ?",
                "subtitle": "Rejoignez des centaines de professionnels du droit et de particuliers qui font confiance à justiCIA.",
                "trust":    ["Sans engagement", "Essai gratuit", "Support 24/7"],
            },
        },
        "site": {
            "label": "Informations générales du site",
            "value": {
                "name":       "justiCIA",
                "copyright":  "© 2025 justiCIA. Tous droits réservés.",
                "description": "Plateforme juridique intelligente pour la République de Guinée.",
            },
        },
    }

    for key, data in defaults.items():
        existing = await db.execute(select(SiteConfig).where(SiteConfig.key == key))
        if existing.scalar_one_or_none() is None:
            db.add(SiteConfig(
                key=key,
                label=data["label"],
                value=json.dumps(data["value"], ensure_ascii=False),
            ))


async def _seed_procedures(db: AsyncSession) -> None:
    count = (await db.execute(select(func.count()).select_from(Procedure))).scalar() or 0
    if count > 0:
        return

    items = [
        Procedure(
            slug="divorce", titre="Demander le divorce", categorie="Famille", icon="💔",
            description="Procédure de dissolution du lien conjugal devant le tribunal de première instance.",
            duree_totale="3 à 12 mois", cout_estime="500 000 – 2 000 000 FG",
            difficulte="Complexe", urgence=False,
            base_legale="Code civil guinéen, Art. 303-380",
            docs_requis=["Acte de mariage","Actes de naissance des enfants","Pièces d'identité des deux époux","Justificatif de domicile","Inventaire des biens communs"],
            etapes=[
                {"num":1,"titre":"Consultation d'un avocat","description":"Consultez un avocat inscrit au Barreau de Guinée pour évaluer votre situation et définir la cause du divorce.","duree":"1-2 semaines","lieu":"Cabinet d'avocat"},
                {"num":2,"titre":"Constitution du dossier","description":"Rassemblez tous les documents nécessaires selon la cause du divorce invoquée.","duree":"1-2 semaines"},
                {"num":3,"titre":"Dépôt de la requête","description":"Votre avocat dépose la requête en divorce au greffe du Tribunal de Première Instance compétent.","duree":"1 jour","lieu":"Tribunal de Première Instance","cout":"Frais de greffe"},
                {"num":4,"titre":"Tentative de conciliation obligatoire","description":"Le juge convoque les deux époux pour une tentative de conciliation. En cas d'échec, l'instance est ouverte.","duree":"1-3 mois","lieu":"Tribunal"},
                {"num":5,"titre":"Instruction et plaidoiries","description":"Échanges de conclusions entre avocats, auditions, expertises si nécessaire.","duree":"3-8 mois","lieu":"Tribunal"},
                {"num":6,"titre":"Jugement de divorce","description":"Le tribunal prononce le divorce et statue sur ses effets : garde, pension alimentaire, liquidation du régime matrimonial.","duree":"1 audience","lieu":"Tribunal"},
                {"num":7,"titre":"Transcription à l'état civil","description":"Le jugement doit être transcrit en marge de l'acte de mariage au centre d'état civil.","duree":"2-4 semaines","lieu":"Centre d'État Civil","cout":"Frais de transcription"},
            ],
            conseil="Même en cas de désaccord, tentez d'abord une médiation familiale avant la procédure judiciaire.",
            questions_ia=["Quelles sont les conditions légales pour divorcer en Guinée ?","Comment est calculée la pension alimentaire après un divorce ?","Que se passe-t-il si l'un des époux refuse de comparaître ?"],
            ordre=1,
        ),
        Procedure(
            slug="terrain", titre="Acquérir un terrain légalement", categorie="Foncier", icon="🏡",
            description="Procédure d'achat sécurisé d'un terrain avec immatriculation foncière officielle.",
            duree_totale="2 à 6 mois", cout_estime="Variable + frais officiels",
            difficulte="Moyen", urgence=False,
            base_legale="Code foncier et domanial, Art. 1-120",
            docs_requis=["Pièce d'identité","Titre foncier ou titre coutumier du vendeur","Plan de bornage signé par un géomètre","Quittance de paiement","Attestation de non-litige (mairie ou préfecture)"],
            etapes=[
                {"num":1,"titre":"Vérification du titre du vendeur","description":"Avant tout paiement, vérifiez que le vendeur dispose d'un titre de propriété valide (TF) auprès de la Conservation Foncière.","duree":"1-2 semaines","lieu":"Conservation Foncière"},
                {"num":2,"titre":"Bornage du terrain","description":"Faites délimiter le terrain par un géomètre agréé.","duree":"1-3 semaines","cout":"200 000 – 500 000 FG","lieu":"Sur place + bureau du géomètre"},
                {"num":3,"titre":"Rédaction de l'acte de vente","description":"Faites rédiger l'acte de vente par un notaire ou un avocat.","duree":"1-2 semaines","lieu":"Notaire ou avocat","cout":"Honoraires notariaux"},
                {"num":4,"titre":"Enregistrement de l'acte","description":"L'acte doit être enregistré à la Direction des Impôts dans les 3 mois.","duree":"1-4 semaines","lieu":"Direction des Impôts","cout":"Droits d'enregistrement (2-5%)"},
                {"num":5,"titre":"Mutation du titre foncier","description":"Déposez le dossier complet à la Conservation Foncière pour le transfert de propriété.","duree":"1-3 mois","lieu":"Conservation Foncière","cout":"Frais de mutation"},
                {"num":6,"titre":"Obtention du titre foncier","description":"Récupérez le titre foncier (TF) à votre nom. Conservez-le précieusement.","lieu":"Conservation Foncière"},
            ],
            conseil="Ne payez jamais la totalité avant l'enregistrement de l'acte. Méfiez-vous des prix anormalement bas.",
            questions_ia=["Quelle est la différence entre un titre foncier et un titre coutumier en Guinée ?","Comment vérifier qu'un terrain n'est pas litigieux à Conakry ?","Quels sont les droits d'enregistrement d'une vente immobilière en Guinée ?"],
            ordre=2,
        ),
        Procedure(
            slug="societe", titre="Créer une SARL en Guinée", categorie="Commerce", icon="🏢",
            description="Création d'une Société à Responsabilité Limitée, forme juridique la plus courante pour les PME guinéennes.",
            duree_totale="2 à 4 semaines", cout_estime="1 500 000 – 3 000 000 FG",
            difficulte="Moyen", urgence=False,
            base_legale="Code des activités économiques, Acte uniforme OHADA sur les sociétés",
            docs_requis=["Pièces d'identité des associés","Casier judiciaire des associés (moins de 3 mois)","Justificatif du siège social","Statuts rédigés par notaire","Attestation de dépôt du capital en banque"],
            etapes=[
                {"num":1,"titre":"Rédaction des statuts","description":"Faites rédiger les statuts par un notaire ou avocat. Capital minimum : 1 000 000 FG.","duree":"3-5 jours","lieu":"Notaire ou avocat","cout":"300 000 – 600 000 FG"},
                {"num":2,"titre":"Dépôt du capital social","description":"Déposez le capital sur un compte bloqué en banque. Obtenez l'attestation de dépôt.","duree":"1-2 jours","lieu":"Banque commerciale"},
                {"num":3,"titre":"Immatriculation au RCCM","description":"Déposez le dossier au Registre du Commerce et du Crédit Mobilier du Tribunal de Commerce.","duree":"3-7 jours","lieu":"Tribunal de Commerce – RCCM","cout":"Frais d'immatriculation"},
                {"num":4,"titre":"Publication au Journal Officiel","description":"Publiez un avis de constitution dans le Journal Officiel ou un journal d'annonces légales.","duree":"1-2 semaines","cout":"100 000 – 200 000 FG"},
                {"num":5,"titre":"Obtention du NIF","description":"Immatriculez la société à la Direction des Impôts pour obtenir le Numéro d'Identification Fiscale.","duree":"1-3 jours","lieu":"Direction Nationale des Impôts"},
                {"num":6,"titre":"Déclaration à l'INSS","description":"Enregistrez la société à l'Institut National de Sécurité Sociale si vous avez des salariés.","duree":"1-3 jours","lieu":"INSS","optionnel":True},
            ],
            conseil="Choisissez des associés de confiance et définissez clairement leurs rôles dès les statuts.",
            questions_ia=["Quel est le capital social minimum pour créer une SARL en Guinée ?","Quelles sont les obligations fiscales d'une SARL guinéenne la première année ?","Comment répartir équitablement les parts sociales entre associés ?"],
            ordre=3,
        ),
        Procedure(
            slug="plainte-penale", titre="Porter plainte pour une infraction", categorie="Pénal", icon="⚖️",
            description="Procédure pour signaler une infraction pénale aux autorités compétentes et déclencher des poursuites.",
            duree_totale="1 jour à plusieurs mois", cout_estime="Gratuit (avocat optionnel)",
            difficulte="Facile", urgence=True,
            base_legale="Code de procédure pénale 2016, Art. 15-50",
            docs_requis=["Pièce d'identité","Tout document prouvant l'infraction (photos, vidéos, témoins)","Certificat médical si coups et blessures","Relevés bancaires si escroquerie ou vol"],
            etapes=[
                {"num":1,"titre":"Dépôt de plainte","description":"Rendez-vous au commissariat ou à la brigade de gendarmerie du lieu de l'infraction. Exigez une copie du PV.","duree":"1-3 heures","lieu":"Commissariat ou Gendarmerie","cout":"Gratuit"},
                {"num":2,"titre":"Transmission au Parquet","description":"La police transmet le PV au Procureur qui décide des suites à donner.","duree":"2-4 semaines"},
                {"num":3,"titre":"Suivi des poursuites","description":"Le Parquet peut convoquer les parties et ordonner des investigations complémentaires.","duree":"Variable"},
                {"num":4,"titre":"Constitution de partie civile","description":"Pour obtenir des dommages-intérêts, constituez-vous partie civile avec l'aide d'un avocat.","duree":"1-2 semaines","lieu":"Greffe du tribunal","cout":"Consignation + honoraires","optionnel":True},
                {"num":5,"titre":"Audience de jugement","description":"L'affaire est renvoyée devant le tribunal compétent où la victime peut demander réparation.","lieu":"Tribunal compétent"},
            ],
            conseil="Ne tardez pas : les délais de prescription courent dès la commission des faits. Obtenez un certificat médical dans les 48h si violence physique.",
            questions_ia=["Quel est le délai de prescription pour porter plainte pour escroquerie en Guinée ?","Puis-je porter plainte sans avocat en Guinée ?","Quelle est la différence entre une plainte simple et une plainte avec constitution de partie civile ?"],
            ordre=4,
        ),
        Procedure(
            slug="licenciement", titre="Contester un licenciement abusif", categorie="Travail", icon="💼",
            description="Procédure pour saisir les juridictions du travail en cas de rupture injustifiée du contrat de travail.",
            duree_totale="3 à 18 mois", cout_estime="200 000 – 800 000 FG (avocat)",
            difficulte="Moyen", urgence=True,
            base_legale="Code du travail 2014, Art. 172.1-172.80",
            docs_requis=["Contrat de travail","Lettre de licenciement","Bulletins de salaire (6 derniers mois)","Pièce d'identité","Preuves d'ancienneté et de bonne foi"],
            etapes=[
                {"num":1,"titre":"Analyse de la légalité","description":"Vérifiez avec un avocat ou syndicat si le licenciement respecte la procédure légale.","duree":"1 semaine"},
                {"num":2,"titre":"Tentative de règlement amiable","description":"Adressez une lettre recommandée à l'employeur pour demander réintégration ou indemnité.","duree":"2-4 semaines"},
                {"num":3,"titre":"Saisine de l'Inspection du Travail","description":"Saisissez l'Inspection du Travail compétente pour une tentative de conciliation.","duree":"1-2 mois","lieu":"Direction Régionale du Travail","cout":"Gratuit"},
                {"num":4,"titre":"Saisine du Tribunal du Travail","description":"En cas d'échec, déposez une requête au Tribunal du Travail avec tous les éléments du dossier.","duree":"1-2 semaines","lieu":"Tribunal du Travail"},
                {"num":5,"titre":"Audience et jugement","description":"Le tribunal entend les parties et rend un jugement. En cas d'abus, il peut ordonner réintégration ou indemnité.","duree":"3-12 mois","lieu":"Tribunal du Travail"},
            ],
            conseil="Agissez vite ! Le délai de prescription pour contester un licenciement est de 2 ans.",
            questions_ia=["Qu'est-ce qu'un licenciement abusif selon le Code du travail guinéen ?","Comment est calculée l'indemnité de licenciement en Guinée ?","Puis-je être licencié pendant ma période d'essai sans indemnité ?"],
            ordre=5,
        ),
        Procedure(
            slug="garde-enfant", titre="Obtenir la garde d'un enfant", categorie="Famille", icon="👶",
            description="Procédure judiciaire pour fixer ou modifier les modalités de garde après séparation des parents.",
            duree_totale="2 à 8 mois", cout_estime="300 000 – 1 000 000 FG",
            difficulte="Moyen", urgence=False,
            base_legale="Code de l'enfant guinéen, Code civil Art. 350-400",
            docs_requis=["Acte de naissance de l'enfant","Pièces d'identité des parents","Justificatifs de ressources","Jugement de divorce (si déjà prononcé)","Rapport d'enquête sociale (si demandé)"],
            etapes=[
                {"num":1,"titre":"Tentative d'accord amiable","description":"Essayez de vous entendre avec l'autre parent. Un accord homologué par le juge est plus rapide.","duree":"2-6 semaines"},
                {"num":2,"titre":"Saisine du tribunal","description":"En l'absence d'accord, votre avocat saisit le juge par voie de requête ou d'assignation.","duree":"1-2 semaines","lieu":"Tribunal de Première Instance"},
                {"num":3,"titre":"Mesures provisoires","description":"Le juge peut fixer des mesures temporaires pour protéger l'enfant dans l'attente du jugement.","duree":"1-2 mois","lieu":"Tribunal"},
                {"num":4,"titre":"Enquête sociale","description":"Le juge peut ordonner une enquête sociale pour évaluer l'intérêt supérieur de l'enfant.","duree":"1-3 mois","optionnel":True},
                {"num":5,"titre":"Audience et jugement","description":"Le tribunal rend sa décision uniquement en fonction de l'intérêt de l'enfant.","duree":"2-6 mois","lieu":"Tribunal"},
            ],
            conseil="Le juge statue toujours en fonction de l'intérêt supérieur de l'enfant. Montrez votre implication dans son éducation.",
            questions_ia=["Quels critères le juge guinéen utilise-t-il pour accorder la garde d'un enfant ?","Peut-on modifier un jugement de garde si la situation change ?","La garde partagée est-elle reconnue par le droit guinéen ?"],
            ordre=6,
        ),
        Procedure(
            slug="association", titre="Créer une association en Guinée", categorie="Commerce", icon="🤝",
            description="Procédure de création et de déclaration officielle d'une association à but non lucratif.",
            duree_totale="2 à 6 semaines", cout_estime="50 000 – 200 000 FG",
            difficulte="Facile", urgence=False,
            base_legale="Loi L/2005/013/AN relative aux associations, Art. 1-30",
            docs_requis=["Statuts signés par les fondateurs","Procès-verbal de l'assemblée constitutive","Liste des membres fondateurs (noms, adresses, CNI)","Règlement intérieur (optionnel)","Casier judiciaire du président"],
            etapes=[
                {"num":1,"titre":"Rédaction des statuts","description":"Rédigez les statuts : dénomination, objet, siège, organes dirigeants. Minimum 7 membres fondateurs.","duree":"1-2 semaines"},
                {"num":2,"titre":"Assemblée générale constitutive","description":"Tenez l'AG, adoptez les statuts, élisez le bureau. Dressez un PV signé par tous les fondateurs.","duree":"1 jour"},
                {"num":3,"titre":"Dépôt du dossier à la Préfecture","description":"Déposez le dossier au Service des Associations de la Préfecture ou du Gouvernorat.","duree":"1 jour","lieu":"Préfecture / Gouvernorat","cout":"Frais de timbre"},
                {"num":4,"titre":"Obtention du récépissé","description":"Dans les 30 jours, l'autorité délivre le récépissé officiel. L'association acquiert la personnalité juridique.","duree":"2-4 semaines","lieu":"Préfecture"},
                {"num":5,"titre":"Publication au Journal Officiel","description":"Publiez un avis de création au Journal Officiel pour une reconnaissance complète.","duree":"1-2 semaines","cout":"30 000 – 50 000 FG","optionnel":True},
            ],
            conseil="L'objet social doit être clairement défini et conforme à la loi. Évitez les objets politiques ou contraires à l'ordre public.",
            questions_ia=["Combien de membres fondateurs faut-il minimum pour créer une association en Guinée ?","Quelle est la différence entre une association et une ONG en Guinée ?","Une association peut-elle mener des activités commerciales accessoires en Guinée ?"],
            ordre=7,
        ),
        Procedure(
            slug="fiscal", titre="Contester un redressement fiscal", categorie="Fiscal", icon="📊",
            description="Procédure pour contester une décision de l'administration fiscale guinéenne.",
            duree_totale="3 à 24 mois", cout_estime="500 000 – 3 000 000 FG",
            difficulte="Complexe", urgence=True,
            base_legale="Code général des impôts guinéen, Art. 625-680",
            docs_requis=["Notification de redressement reçue","Comptabilité complète des exercices concernés","Déclarations fiscales déposées","Justificatifs des charges déduites","Correspondances avec l'administration fiscale"],
            etapes=[
                {"num":1,"titre":"Analyse de la notification","description":"Analysez la notification avec un expert-comptable ou avocat fiscaliste. Délai de réponse : 30 jours.","duree":"1 semaine"},
                {"num":2,"titre":"Réponse à la notification","description":"Adressez une réponse motivée point par point avec toutes les preuves et justificatifs.","duree":"2-4 semaines","lieu":"Direction Nationale des Impôts","cout":"Frais d'avocat"},
                {"num":3,"titre":"Réunion de conciliation","description":"Demandez une réunion de conciliation avec le vérificateur et son supérieur hiérarchique.","duree":"1-2 mois","lieu":"Direction des Impôts"},
                {"num":4,"titre":"Réclamation contentieuse","description":"Si désaccord persiste, déposez une réclamation contentieuse auprès du Directeur National des Impôts.","duree":"3-6 mois"},
                {"num":5,"titre":"Recours devant le Tribunal Administratif","description":"En cas de rejet, saisissez le Tribunal Administratif dans les 2 mois suivant la décision de rejet.","duree":"6-18 mois","lieu":"Tribunal Administratif","cout":"Frais judiciaires + avocat"},
            ],
            conseil="Répondez toujours dans les délais légaux à toute notification fiscale. Un silence vaut acceptation tacite.",
            questions_ia=["Quel est le délai pour contester un redressement fiscal en Guinée ?","Quels sont les droits du contribuable lors d'un contrôle fiscal en Guinée ?","Peut-on négocier avec l'administration fiscale guinéenne pour réduire un redressement ?"],
            ordre=8,
        ),
        Procedure(
            slug="nationalite", titre="Demander la nationalité guinéenne", categorie="Administratif", icon="🇬🇳",
            description="Procédure de naturalisation pour l'acquisition de la nationalité guinéenne par des étrangers.",
            duree_totale="1 à 3 ans", cout_estime="500 000 – 1 500 000 FG",
            difficulte="Complexe", urgence=False,
            base_legale="Code de la nationalité guinéenne, Loi L/1959/ANR/017",
            docs_requis=["Acte de naissance apostillé","Passeport en cours de validité","Preuves de résidence légale continue (5 ans minimum)","Casier judiciaire du pays d'origine (apostillé)","Preuve d'intégration (emploi, famille, propriété)","Certificat médical de non-contagion"],
            etapes=[
                {"num":1,"titre":"Vérification des conditions d'éligibilité","description":"Vérifiez : 5 ans de résidence légale continue, bonne conduite, connaissance du français.","duree":"1 semaine"},
                {"num":2,"titre":"Constitution du dossier","description":"Rassemblez tous les documents requis, faites-les traduire et apostiller si nécessaire.","duree":"2-4 semaines","cout":"Frais de traduction et apostille"},
                {"num":3,"titre":"Dépôt au Ministère de la Justice","description":"Déposez le dossier complet à la Direction des Affaires Civiles du Ministère de la Justice.","duree":"1 jour","lieu":"Ministère de la Justice – Conakry","cout":"Frais de dossier"},
                {"num":4,"titre":"Enquête de moralité","description":"Les services de sécurité (DNSP) effectuent une enquête de moralité et de vos antécédents.","duree":"3-6 mois"},
                {"num":5,"titre":"Avis du Conseil d'État","description":"Le dossier est soumis au Conseil d'État pour avis consultatif.","duree":"3-12 mois","lieu":"Conseil d'État"},
                {"num":6,"titre":"Décret de naturalisation","description":"Si favorable, un décret est signé par le Président de la République et publié au Journal Officiel.","lieu":"Présidence de la République"},
                {"num":7,"titre":"Obtention des documents guinéens","description":"Sur présentation du décret, demandez votre CNI et passeport guinéens.","duree":"2-4 semaines","lieu":"Direction Nationale de la Police"},
            ],
            conseil="La naturalisation est un acte discrétionnaire de l'État. Mettez en avant votre intégration profonde dans la société guinéenne.",
            questions_ia=["Quelles sont les conditions légales pour demander la nationalité guinéenne par naturalisation ?","Peut-on avoir la double nationalité en Guinée ?","Combien de temps faut-il résider légalement en Guinée avant de demander la naturalisation ?"],
            ordre=9,
        ),
        Procedure(
            slug="permis-construire", titre="Obtenir un permis de construire", categorie="Foncier", icon="🏗️",
            description="Procédure d'obtention du permis de construire pour les constructions neuves ou extensions.",
            duree_totale="1 à 4 mois", cout_estime="200 000 – 800 000 FG",
            difficulte="Moyen", urgence=False,
            base_legale="Code de l'urbanisme guinéen, Décret D/2014/139",
            docs_requis=["Titre de propriété ou bail légalisé","Plan de situation du terrain","Plans architecturaux signés par un architecte agréé","Notice descriptive des travaux","Devis estimatif des travaux"],
            etapes=[
                {"num":1,"titre":"Recrutement d'un architecte agréé","description":"Faites établir les plans par un architecte inscrit à l'Ordre des Architectes de Guinée.","duree":"2-4 semaines","cout":"Honoraires architecte (3-5% du coût des travaux)"},
                {"num":2,"titre":"Constitution du dossier technique","description":"Rassemblez le dossier : plans en 4 exemplaires, note de calcul, plan d'implantation, notice d'hygiène.","duree":"1 semaine"},
                {"num":3,"titre":"Dépôt à la Mairie ou Préfecture","description":"Déposez le dossier au service urbanisme. Un récépissé de dépôt vous est remis immédiatement.","duree":"1 jour","lieu":"Mairie / Préfecture","cout":"Taxe de permis (calculée sur la surface)"},
                {"num":4,"titre":"Instruction du dossier","description":"Les services techniques vérifient la conformité avec les règles d'urbanisme et normes en vigueur.","duree":"1-3 mois","lieu":"Service Urbanisme"},
                {"num":5,"titre":"Obtention du permis","description":"Récupérez le permis de construire et affichez-le obligatoirement sur le chantier. Validité : 2 ans.","lieu":"Mairie / Préfecture"},
            ],
            conseil="Commencer des travaux sans permis expose à des amendes, l'arrêt du chantier et même la démolition.",
            questions_ia=["Quels travaux nécessitent obligatoirement un permis de construire en Guinée ?","Que risque-t-on si l'on construit sans permis en Guinée ?","Comment obtenir le certificat de conformité après la construction ?"],
            ordre=10,
        ),
    ]
    db.add_all(items)
