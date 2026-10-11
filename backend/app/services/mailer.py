"""
Envoi d'e-mails transactionnels (SMTP).

Sécurité : rien ne part tant que settings.EMAILS_ENABLED est False — le message
est alors seulement journalisé. L'envoi ne doit jamais faire échouer la requête
qui le déclenche : toutes les erreurs sont capturées et journalisées.
"""
import asyncio
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from html import escape

from app.config import settings

logger = logging.getLogger("justicia.mailer")


def _html(title: str, paragraphs: list[str], cta: tuple[str, str] | None) -> str:
    body = "".join(f'<p style="margin:0 0 14px;line-height:1.6">{escape(p)}</p>' for p in paragraphs)
    button = ""
    if cta:
        label, url = cta
        button = (f'<p style="margin:22px 0 0"><a href="{escape(url)}" style="display:inline-block;'
                  f'padding:11px 18px;background:#141210;color:#fff;text-decoration:none;'
                  f'border-radius:6px;font-weight:600">{escape(label)}</a></p>')
    return f"""<!doctype html><html lang="fr"><body style="margin:0;background:#F5F2EA;font-family:Arial,sans-serif;color:#141210">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #DDD6C8;border-radius:8px">
<tr><td style="padding:22px 28px;border-bottom:1px solid #DDD6C8;font-family:Georgia,serif;font-size:20px">Justic<span style="color:#A3470A">IA</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 18px;font-family:Georgia,serif;font-weight:400;font-size:24px">{escape(title)}</h1>
{body}{button}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #DDD6C8;font-size:12px;color:#5E574D">Message automatique de JusticIA — merci de ne pas y répondre directement.</td></tr>
</table></td></tr></table></body></html>"""


def _send_sync(msg: EmailMessage) -> None:
    # Port 465 : TLS implicite (Hostinger, OVH…) ; sinon STARTTLS (587, Gmail…)
    if settings.SMTP_PORT == 465:
        smtp_cm = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
    else:
        smtp_cm = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
    with smtp_cm as smtp:
        if settings.SMTP_PORT != 465:
            smtp.starttls()
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(msg)


async def send_email(to: str, subject: str, title: str, paragraphs: list[str],
                     cta: tuple[str, str] | None = None,
                     attachments: list[tuple[str, bytes, str]] | None = None) -> bool:
    """Envoie un e-mail (texte + HTML). Retourne True si effectivement envoyé."""
    if not settings.EMAILS_ENABLED or not settings.SMTP_USER:
        logger.info("email_skipped (EMAILS_ENABLED=false) to=%s subject=%r", to, subject)
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((settings.EMAILS_FROM_NAME, settings.EMAILS_FROM or settings.SMTP_USER))
    msg["To"] = to
    text = "\n\n".join(paragraphs) + (f"\n\n{cta[0]} : {cta[1]}" if cta else "")
    msg.set_content(f"{title}\n\n{text}\n\n— JusticIA")
    msg.add_alternative(_html(title, paragraphs, cta), subtype="html")
    for filename, content, mime in attachments or []:
        maintype, _, subtype = mime.partition("/")
        msg.add_attachment(content, maintype=maintype, subtype=subtype, filename=filename)

    try:
        await asyncio.to_thread(_send_sync, msg)
        logger.info("email_sent to=%s subject=%r", to, subject)
        return True
    except Exception as exc:  # noqa: BLE001 — l'e-mail ne doit jamais casser la requête
        logger.warning("email_failed to=%s subject=%r error=%s", to, subject, exc)
        return False
