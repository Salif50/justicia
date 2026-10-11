"""Factures : numérotation, PDF et envoi par e-mail après un paiement.

- Numéro légal séquentiel « JST-AAAA-000001 » (séquence PostgreSQL : jamais de doublon).
- PDF généré à la volée (fpdf2), jamais stocké : il est reconstruit à l'identique
  depuis la base à chaque téléchargement.
- Envoi par e-mail une seule fois par facture (colonne emailed_at réservée de façon
  atomique avant l'envoi, libérée si l'envoi échoue).
"""
import logging
import uuid
from datetime import datetime, timezone

from fpdf import FPDF
from sqlalchemy import select, text, update

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.subscription import Invoice, MosagixPayment
from app.models.user import User
from app.services import mailer

logger = logging.getLogger("justicia.invoice")

INK = (20, 18, 16)
MUTED = (94, 87, 77)
ACCENT = (163, 71, 10)
LINE = (221, 214, 200)

# Polices PDF de base = Latin-1 : on remplace les rares caractères hors jeu
_LATIN1 = str.maketrans({"—": "-", "–": "-", "’": "'", "‘": "'", "“": '"', "”": '"', "…": "...", " ": " "})


def _t(value: object) -> str:
    return str(value or "").translate(_LATIN1).encode("latin-1", "replace").decode("latin-1")


def _gnf(amount: object) -> str:
    n = int(round(float(amount or 0)))
    return f"{n:,}".replace(",", " ") + " GNF"


async def assign_number(db, invoice: Invoice) -> str:
    """Attribue un numéro séquentiel si la facture n'en a pas encore."""
    if not invoice.number:
        seq = (await db.execute(text("SELECT nextval('invoice_number_seq')"))).scalar_one()
        year = (invoice.created_at or datetime.now(timezone.utc)).year
        invoice.number = f"JST-{year}-{seq:06d}"
    return invoice.number


def build_pdf(invoice: Invoice, user: User, payment: MosagixPayment | None) -> bytes:
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()
    pdf.set_margins(20, 20, 20)
    width = pdf.w - 40

    # En-tête : marque + mention FACTURE
    pdf.set_xy(20, 20)
    pdf.set_font("Times", "", 24)
    pdf.set_text_color(*INK)
    pdf.cell(pdf.get_string_width("Justic"), 10, "Justic")
    pdf.set_font("Times", "I", 24)
    pdf.set_text_color(*ACCENT)
    pdf.cell(20, 10, "IA")
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*INK)
    pdf.set_xy(20, 20)
    pdf.cell(width, 10, "FACTURE", align="R")

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*MUTED)
    pdf.set_xy(20, 31)
    issued = (invoice.created_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    pdf.cell(width, 5, _t(f"N° {invoice.number or '-'}"), align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(width, 5, _t(f"Date : {issued:%d/%m/%Y}"), align="R", new_x="LMARGIN", new_y="NEXT")

    # Vendeur / client
    pdf.ln(8)
    top = pdf.get_y()
    col = width / 2 - 5

    def block(x: float, title: str, lines: list[str]) -> None:
        pdf.set_xy(x, top)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*ACCENT)
        pdf.cell(col, 5, _t(title.upper()), new_x="LEFT", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*INK)
        for line in lines:
            if line:
                pdf.set_x(x)
                pdf.multi_cell(col, 5, _t(line), new_x="LEFT", new_y="NEXT")

    block(20, "Émis par", [
        settings.INVOICE_SELLER_NAME,
        settings.INVOICE_SELLER_ADDRESS,
        f"NIF / RCCM : {settings.INVOICE_SELLER_TAX_ID}" if settings.INVOICE_SELLER_TAX_ID else "",
        settings.INVOICE_SELLER_EMAIL,
    ])
    block(20 + col + 10, "Facturé à", [user.name, user.email])

    # Tableau
    pdf.set_y(max(pdf.get_y(), top + 30) + 8)
    pdf.set_draw_color(*LINE)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*MUTED)
    desc_w, amount_w = width - 45, 45
    pdf.cell(desc_w, 8, _t("DÉSIGNATION"), border="B")
    pdf.cell(amount_w, 8, "MONTANT", border="B", align="R", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*INK)
    period_end = invoice.subscription.renewal_date if invoice.subscription else None
    desc = f"Abonnement JusticIA - plan {invoice.plan_name}"
    if period_end:
        desc += f"\nPériode : du {issued:%d/%m/%Y} au {period_end:%d/%m/%Y}"
    y0 = pdf.get_y() + 2
    pdf.set_xy(20, y0)
    pdf.multi_cell(desc_w, 6, _t(desc))
    y1 = pdf.get_y()
    pdf.set_xy(20 + desc_w, y0)
    pdf.cell(amount_w, 6, _gnf(invoice.amount), align="R")
    pdf.set_y(y1 + 2)
    pdf.line(20, pdf.get_y(), 20 + width, pdf.get_y())

    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(desc_w, 8, "Total payé", align="R")
    pdf.cell(amount_w, 8, _gnf(invoice.amount), align="R", new_x="LMARGIN", new_y="NEXT")

    # Paiement
    pdf.ln(6)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*MUTED)
    status = "Payée" if invoice.status == "paid" else "En attente"
    details = [f"Statut : {status}"]
    if payment:
        details.append(f"Moyen de paiement : Mosagix Pay{' - ' + payment.payment_method if payment.payment_method else ''}")
        if payment.merchant_reference:
            details.append(f"Référence : {payment.merchant_reference}")
        if payment.transaction_id:
            details.append(f"Transaction : {payment.transaction_id}")
    for line in details:
        pdf.cell(width, 5, _t(line), new_x="LMARGIN", new_y="NEXT")

    pdf.set_y(-30)
    pdf.set_font("Helvetica", "", 8)
    pdf.multi_cell(width, 4, _t(
        "Facture générée automatiquement par JusticIA. JusticIA est un outil d'information juridique "
        "et ne remplace pas l'avis d'un avocat."), align="C")
    return bytes(pdf.output())


async def load_invoice(db, invoice_id: uuid.UUID) -> tuple[Invoice, User, MosagixPayment | None] | None:
    invoice = await db.get(Invoice, invoice_id)
    if not invoice:
        return None
    await db.refresh(invoice, ["subscription"])
    user = await db.get(User, invoice.user_id)
    payment = (await db.execute(
        select(MosagixPayment).where(MosagixPayment.invoice_id == invoice.id)
    )).scalars().first()
    return invoice, user, payment


async def send_invoice_email(invoice_id: uuid.UUID) -> None:
    """Envoie la facture une seule fois (appelé en tâche de fond après le paiement)."""
    async with AsyncSessionLocal() as db:
        # Réservation atomique : un seul envoi même si webhook et retour navigateur arrivent ensemble
        claimed = (await db.execute(
            update(Invoice)
            .where(Invoice.id == invoice_id, Invoice.emailed_at.is_(None))
            .values(emailed_at=datetime.now(timezone.utc))
            .returning(Invoice.id)
        )).scalar_one_or_none()
        await db.commit()
        if not claimed:
            return

        loaded = await load_invoice(db, invoice_id)
        if not loaded or not loaded[1]:
            return
        invoice, user, payment = loaded
        if not invoice.number:
            await assign_number(db, invoice)
            await db.commit()

        try:
            pdf = build_pdf(invoice, user, payment)
        except Exception:  # noqa: BLE001
            logger.exception("invoice_pdf_failed invoice=%s", invoice.id)
            pdf = None

        frontend = settings.FRONTEND_URL.rstrip("/")
        sent = await mailer.send_email(
            to=user.email,
            subject=f"Votre facture JusticIA {invoice.number}",
            title="Merci pour votre abonnement",
            paragraphs=[
                f"Bonjour {user.name},",
                f"Votre paiement de {_gnf(invoice.amount)} pour le plan {invoice.plan_name} a bien été reçu "
                "et votre abonnement est actif.",
                f"Vous trouverez votre facture n° {invoice.number} en pièce jointe. Elle reste "
                "disponible à tout moment dans votre espace, rubrique Abonnement.",
            ],
            cta=("Accéder à mon espace", f"{frontend}/dashboard/subscription"),
            attachments=[(f"facture-{invoice.number}.pdf", pdf, "application/pdf")] if pdf else None,
        )
        if not sent:
            # Libère la réservation : un nouvel essai reste possible
            invoice.emailed_at = None
            await db.commit()
