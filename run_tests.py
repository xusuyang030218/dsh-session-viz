import unittest

loader = unittest.TestLoader()
suite = loader.discover("tests", pattern="test_*.py")
runner = unittest.TextTestRunner(verbosity=2)
result = runner.run(suite)
raise SystemExit(0 if result.wasSuccessful() else 1)
