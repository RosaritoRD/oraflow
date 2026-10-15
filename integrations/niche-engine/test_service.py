import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import service


class AuthAdapterTest(unittest.TestCase):
    def test_nested_oraflow_oauth_is_normalized_for_upstream_engine(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            credentials = root / "credentials.json"
            tokens = root / "tokens.json"
            data = root / "data"
            credentials.write_text(json.dumps({
                "youtube": {
                    "client_id": "client-id",
                    "client_secret": "client-secret",
                    "redirect_uris": ["http://localhost/callback"],
                }
            }))
            tokens.write_text(json.dumps({
                "youtube": {
                    "access_token": "access-token",
                    "refresh_token": "refresh-token",
                    "scope": "youtube.readonly",
                    "expiry_date": 123,
                }
            }))
            with patch.object(service, "DATA_DIR", data), patch.dict(os.environ, {
                "YOUTUBE_API_KEY": "",
                "ORAFLOW_CREDENTIALS": str(credentials),
                "ORAFLOW_TOKENS": str(tokens),
            }, clear=False):
                status = service.prepare_auth()
                normalized = json.loads((data / "auth" / "token.json").read_text())

            self.assertEqual(status["mode"], "oauth")
            self.assertFalse(status["verified"])
            self.assertEqual(normalized["access_token"], "access-token")
            self.assertNotIn("youtube", normalized)


if __name__ == "__main__":
    unittest.main()
