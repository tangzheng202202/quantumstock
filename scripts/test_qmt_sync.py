"""Offline checks for the QMT client contract (no broker or HTTP service)."""

import json
import sys
import types
import unittest
from unittest.mock import patch

from scripts import qmt_sync


class QmtSyncTests(unittest.TestCase):
    def test_custom_qmt_path_is_passed_to_trader(self):
        observed = []

        class FakeTrader:
            def __init__(self, path, session_id):
                observed.append((path, session_id))

            def start(self):
                pass

            def connect(self):
                return True

            def query_stock_positions(self, account):
                return []

            def stop(self):
                observed.append('stopped')

        xtquant = types.ModuleType('xtquant')
        xtquant.xttrader = types.SimpleNamespace(XtQuantTrader=FakeTrader, StockAccount=object)
        xtquant.xtdata = types.SimpleNamespace()
        with patch.dict(sys.modules, {'xtquant': xtquant}):
            self.assertEqual(qmt_sync.get_qmt_positions('/custom/qmt'), ([], 0, ''))

        self.assertEqual(observed, [('/custom/qmt', 123456), 'stopped'])

    def test_empty_positions_and_token_are_sent_without_network(self):
        observed = []

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                return False

            def read(self):
                return b'{"success":true,"received":0}'

        def fake_urlopen(request, timeout):
            observed.append((request.full_url, json.loads(request.data), timeout))
            return FakeResponse()

        token = 't' * 40
        with patch.object(qmt_sync.urllib.request, 'urlopen', side_effect=fake_urlopen):
            self.assertTrue(qmt_sync.push_to_app([], 0, 'demo', 3001, token))

        self.assertEqual(observed, [(
            'http://127.0.0.1:3001/api/portfolio/sync',
            {'positions': [], 'cash': 0, 'account': 'demo', 'token': token},
            10,
        )])


if __name__ == '__main__':
    unittest.main()
