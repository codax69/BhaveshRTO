import json
from unittest.mock import MagicMock, patch
from django.test import TestCase, override_settings
from reminders.services import (
    OpenWAProvider,
    MetaCloudAPIProvider,
    StubWhatsAppProvider,
    get_whatsapp_provider,
)


class OpenWAProviderTestCase(TestCase):
    def setUp(self):
        self.provider = OpenWAProvider(
            server_url="http://localhost:2785",
            session_id="test-session",
            api_key="secret-api-key",
        )
        self.provider._cached_session_uuid = "test-session"

    def test_clean_phone_formatting(self):
        """Test phone number cleaning and formatting for OpenWA."""
        self.assertEqual(self.provider._clean_phone("9876543210"), "919876543210@c.us")
        self.assertEqual(self.provider._clean_phone("+91 98765-43210"), "919876543210@c.us")
        self.assertEqual(self.provider._clean_phone("919876543210@c.us"), "919876543210@c.us")

    @patch("requests.post")
    def test_send_message_success(self, mock_post):
        """Test sending a text message via OpenWA REST API."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "success", "id": "msg-123"}
        mock_post.return_value = mock_response

        res = self.provider.send_message("9876543210", "Hello World")

        self.assertEqual(res, {"status": "success", "id": "msg-123"})
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        self.assertEqual(args[0], "http://localhost:2785/api/sessions/test-session/messages/send-text")
        self.assertEqual(kwargs["json"], {"chatId": "919876543210@c.us", "text": "Hello World"})
        self.assertEqual(kwargs["headers"]["X-API-Key"], "secret-api-key")

    @patch("requests.get")
    @patch("requests.post")
    def test_send_document_pdf_success(self, mock_post, mock_get):
        """Test sending a PDF document via OpenWA REST API."""
        mock_get.return_value.json.return_value = [
            {"id": "test-session", "name": "test-session", "status": "ready", "engineLoaded": True}
        ]
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "success", "id": "doc-456"}
        mock_post.return_value = mock_response

        dummy_pdf_bytes = b"%PDF-1.4 dummy content"
        media_id = self.provider.upload_media(dummy_pdf_bytes, "receipt.pdf", "application/pdf")
        import base64
        expected_b64 = base64.b64encode(dummy_pdf_bytes).decode("utf-8")
        self.assertEqual(media_id, expected_b64)

        res = self.provider.send_document(
            to_number="9876543210",
            media_id=media_id,
            caption="Your receipt",
            filename="receipt.pdf",
        )

        self.assertEqual(res, {"status": "success", "id": "doc-456"})
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        self.assertEqual(args[0], "http://localhost:2785/api/sessions/test-session/messages/send-document")
        self.assertEqual(kwargs["json"]["chatId"], "919876543210@c.us")
        self.assertEqual(kwargs["json"]["filename"], "receipt.pdf")
        self.assertEqual(kwargs["json"]["caption"], "Your receipt")
        self.assertEqual(kwargs["json"]["mimetype"], "application/pdf")
        self.assertEqual(kwargs["json"]["base64"], expected_b64)

    @patch("requests.get")
    @patch("requests.post")
    def test_send_document_uses_unique_ready_session_if_configured_id_is_stale(self, mock_post, mock_get):
        mock_get.return_value.json.return_value = [
            {"id": "connected-session-id", "name": "drto", "status": "ready", "engineLoaded": True}
        ]
        mock_post.return_value.status_code = 200
        mock_post.return_value.ok = True
        mock_post.return_value.json.return_value = {"status": "success", "id": "doc-789"}

        self.provider.session_id = "stale-session-id"
        self.provider.send_document("9876543210", "base64data", "Caption", "receipt.pdf")

        self.assertEqual(
            mock_post.call_args.args[0],
            "http://localhost:2785/api/sessions/connected-session-id/messages/send-document",
        )

    @patch("requests.get")
    @patch("requests.post")
    def test_send_document_http_error(self, mock_post, mock_get):
        """Test send_document raises RuntimeError when OpenWA returns an HTTP error."""
        import requests
        mock_get.return_value.json.return_value = [
            {"id": "test-session", "name": "test-session", "status": "ready", "engineLoaded": True}
        ]
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.ok = False
        mock_response.json.return_value = {"message": "Evaluation failed: Error: Session closed."}
        mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError("Internal server error", response=mock_response)
        mock_post.return_value = mock_response

        with self.assertRaises(RuntimeError) as cm:
            self.provider.send_document("9876543210", "base64data", "Caption", "receipt.pdf")

        self.assertIn("WhatsApp is not connected", str(cm.exception))
        self.assertIn("scan the QR code", str(cm.exception))



class GetWhatsAppProviderTestCase(TestCase):
    @override_settings(WHATSAPP_PROVIDER="openwa", OPENWA_SERVER_URL="http://localhost:2785")
    def test_explicit_openwa_provider(self):
        provider = get_whatsapp_provider()
        self.assertIsInstance(provider, OpenWAProvider)

    @override_settings(WHATSAPP_PROVIDER="meta", WHATSAPP_API_TOKEN="token", WHATSAPP_PHONE_NUMBER_ID="123")
    def test_explicit_meta_provider(self):
        provider = get_whatsapp_provider()
        self.assertIsInstance(provider, MetaCloudAPIProvider)

    @override_settings(WHATSAPP_PROVIDER="stub")
    def test_explicit_stub_provider(self):
        provider = get_whatsapp_provider()
        self.assertIsInstance(provider, StubWhatsAppProvider)
