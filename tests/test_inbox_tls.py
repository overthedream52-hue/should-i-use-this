"""Regression: Python.org macOS installs may have no default CA bundle."""
import os
from pathlib import Path
import ssl
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from inbox import discovery

class TLSContextTests(unittest.TestCase):
    def empty_context(self):
        return ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)

    @unittest.skipUnless(Path('/etc/ssl/cert.pem').is_file(), 'System CA bundle unavailable')
    def test_empty_macos_defaults_load_system_roots_without_disabling_verification(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(sys, 'platform', 'darwin'), patch.object(ssl, 'create_default_context', side_effect=self.empty_context):
            context = discovery.https_context()
        self.assertGreater(context.cert_store_stats()['x509_ca'], 0)
        self.assertTrue(context.check_hostname)
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)

    def test_explicit_ca_configuration_is_not_broadened(self):
        for key in ('SSL_CERT_FILE', 'SSL_CERT_DIR'):
            with self.subTest(key=key), patch.dict(os.environ, {key:'/missing/custom-ca'}, clear=True), patch.object(sys, 'platform', 'darwin'), patch.object(ssl, 'create_default_context', side_effect=self.empty_context):
                context = discovery.https_context()
                self.assertEqual(context.cert_store_stats()['x509_ca'], 0)
                self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)

    def test_non_macos_does_not_add_system_roots(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(sys, 'platform', 'linux'), patch.object(ssl, 'create_default_context', side_effect=self.empty_context):
            self.assertEqual(discovery.https_context().cert_store_stats()['x509_ca'], 0)

    def test_missing_system_bundle_fails_closed(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(sys, 'platform', 'darwin'), patch.object(ssl, 'create_default_context', side_effect=self.empty_context), patch.object(Path, 'is_file', return_value=False):
            context = discovery.https_context()
            self.assertEqual(context.cert_store_stats()['x509_ca'], 0)
            self.assertTrue(context.check_hostname)
            self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
