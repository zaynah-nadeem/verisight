"""
Sends the password-reset code.

If SMTP_USER and SMTP_PASSWORD are set in backend/.env the code is e-mailed (Gmail with an
"app password"). If they are empty, nothing is sent and the code is printed in the backend
window instead, which is handy while testing on your own computer.
"""
import logging
import smtplib
import ssl
from email.message import EmailMessage

from ..config import settings

log = logging.getLogger("uvicorn")


def email_is_configured() -> bool:
    return bool(settings.smtp_user.strip() and settings.smtp_password.strip())


def send_reset_code(to_email: str, code: str) -> None:
    """Never raises: a failure is written to the backend window, and the app shows the same
    message either way (so nobody can learn which e-mails have an account)."""
    minutes = settings.reset_code_minutes

    if not email_is_configured():
        log.warning("[DEV MODE] Password reset code for %s is: %s  (valid %d minutes)", to_email, code, minutes)
        return

    msg = EmailMessage()
    msg["Subject"] = f"Your {settings.app_name} password reset code"
    msg["From"] = f"{settings.app_name} <{settings.smtp_user.strip()}>"
    msg["To"] = to_email
    msg.set_content(
        f"Your {settings.app_name} password reset code is:\n\n"
        f"    {code}\n\n"
        f"It works for {minutes} minutes. If you did not ask to reset your password, "
        f"you can ignore this e-mail; your password has not been changed.\n"
    )
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
            server.starttls(context=ssl.create_default_context())
            # Google shows app passwords in groups of four letters; the spaces are not part of it
            server.login(settings.smtp_user.strip(), settings.smtp_password.replace(" ", ""))
            server.send_message(msg)
        log.info("Password reset e-mail sent to %s", to_email)
    except Exception as e:  # wrong app password, no internet, Gmail blocked it ...
        log.error("Could not send the reset e-mail to %s: %s: %s", to_email, type(e).__name__, e)