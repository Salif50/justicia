import hashlib
import hmac
import unittest
from unittest.mock import patch

from pydantic import ValidationError

from app.schemas.subscription import MosagixCheckoutRequest
from app.services import mosagix_pay


class MosagixPayTests(unittest.TestCase):
    def test_valid_webhook_signature(self):
        raw = b'{"eventType":"payment.success","paymentId":"pay_123"}'
        secret = "whsec_test"
        digest = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        with patch.object(mosagix_pay.settings, "MOSAGIX_API_URL", "https://pay.mosagix.com"), patch.object(
            mosagix_pay.settings, "MOSAGIX_WEBHOOK_SECRET", secret
        ):
            self.assertTrue(mosagix_pay.verify_webhook(raw, f"v1:{digest}"))

    def test_rejects_modified_webhook(self):
        raw = b'{"eventType":"payment.success","paymentId":"pay_123"}'
        secret = "whsec_test"
        digest = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        with patch.object(mosagix_pay.settings, "MOSAGIX_API_URL", "https://pay.mosagix.com"), patch.object(
            mosagix_pay.settings, "MOSAGIX_WEBHOOK_SECRET", secret
        ):
            self.assertFalse(mosagix_pay.verify_webhook(raw + b" ", f"v1:{digest}"))
            self.assertFalse(mosagix_pay.verify_webhook(raw, "v1:not-hex"))
            self.assertFalse(mosagix_pay.verify_webhook(raw, None))

    def test_accepts_international_payer_number(self):
        request = MosagixCheckoutRequest(plan_id="pro", payer_number="00224623707722")
        self.assertEqual(request.payer_number, "00224623707722")

    def test_rejects_local_payer_number(self):
        with self.assertRaises(ValidationError):
            MosagixCheckoutRequest(plan_id="pro", payer_number="623707722")


if __name__ == "__main__":
    unittest.main()
