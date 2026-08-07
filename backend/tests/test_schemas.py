import unittest

from pydantic import ValidationError

from backend.app.schemas.catalog import ProfileRequest


class ProfileRequestTests(unittest.TestCase):
    def test_rejects_zero_length_profile(self):
        with self.assertRaises(ValidationError):
            ProfileRequest(
                start_longitude=121.0,
                start_latitude=24.0,
                end_longitude=121.0,
                end_latitude=24.0,
                width_km=50,
            )

    def test_accepts_valid_profile(self):
        profile = ProfileRequest(
            start_longitude=120.5,
            start_latitude=23.0,
            end_longitude=122.0,
            end_latitude=24.5,
            width_km=75,
        )
        self.assertEqual(profile.width_km, 75)


if __name__ == "__main__":
    unittest.main()
