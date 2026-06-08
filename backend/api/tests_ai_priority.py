
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from .models import EmergencyReport
from .services.ai_priority import keyword_fallback_analysis

User = get_user_model()


class AiPriorityTests(APITestCase):
	@classmethod
	def setUpTestData(cls):
		for role in ("CITIZEN", "DRRM", "BFP", "POLICE", "ADMIN"):
			Group.objects.get_or_create(name=role)

		cls.citizen = User.objects.create_user(
			username="citizen_ai",
			password="citizen1234",
		)
		cls.citizen.groups.add(Group.objects.get(name="CITIZEN"))

		cls.bfp = User.objects.create_user(
			username="bfp_ai",
			password="bfp1234",
			is_staff=True,
		)
		cls.bfp.groups.add(Group.objects.get(name="BFP"))

	@override_settings(
		AI_PRIORITY_ENABLED=False,
		OPENROUTER_API_KEY="",
		OPENROUTER_MODEL="",
	)
	def test_fire_accident_injured_becomes_priority_on_create(self):
		self.client.force_authenticate(user=self.citizen)
		res = self.client.post(
			"/api/reports/",
			{
				"emergency_description": "fire accident injured people need help",
				"latitude": "10.7999000",
				"longitude": "122.9740000",
				"contact_number": "09171234567",
			},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_201_CREATED)
		report = EmergencyReport.objects.get(pk=res.data["id"])
		self.assertTrue(report.is_priority)
		self.assertIn(report.priority_level, ("HIGH", "CRITICAL"))

	@override_settings(
		AI_PRIORITY_ENABLED=False,
		OPENROUTER_API_KEY="",
		OPENROUTER_MODEL="",
	)
	def test_minor_unclear_text_is_low_priority(self):
		self.client.force_authenticate(user=self.citizen)
		res = self.client.post(
			"/api/reports/",
			{
				"emergency_description": "hello test unclear minor noise outside",
				"latitude": "10.7999000",
				"longitude": "122.9740000",
				"contact_number": "09171234567",
			},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_201_CREATED)
		report = EmergencyReport.objects.get(pk=res.data["id"])
		self.assertFalse(report.is_priority)
		self.assertEqual(report.priority_level, "LOW")

	@override_settings(
		AI_PRIORITY_ENABLED=True,
		OPENROUTER_API_KEY="test-key",
		OPENROUTER_MODEL="test-model",
	)
	@patch("api.views.apply_ai_priority_to_report")
	def test_ai_failure_does_not_block_report_creation(self, mock_apply):
		mock_apply.side_effect = RuntimeError("AI service unavailable")
		self.client.force_authenticate(user=self.citizen)
		res = self.client.post(
			"/api/reports/",
			{
				"emergency_description": "possible emergency situation",
				"latitude": "10.7999000",
				"longitude": "122.9740000",
				"contact_number": "09171234567",
			},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_201_CREATED)
		self.assertTrue(EmergencyReport.objects.filter(pk=res.data["id"]).exists())

	@override_settings(
		AI_PRIORITY_ENABLED=True,
		OPENROUTER_API_KEY="",
		OPENROUTER_MODEL="",
	)
	def test_missing_api_key_does_not_crash_report_creation(self):
		self.client.force_authenticate(user=self.citizen)
		res = self.client.post(
			"/api/reports/",
			{
				"emergency_description": "sunog sa kapitbahay",
				"latitude": "10.7999000",
				"longitude": "122.9740000",
				"contact_number": "09171234567",
			},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_201_CREATED)
		report = EmergencyReport.objects.get(pk=res.data["id"])
		self.assertTrue(report.is_priority)
		self.assertIn(report.ai_analysis_status, ("fallback", "failed"))

	def test_priority_filter_returns_ai_priority_reports(self):
		EmergencyReport.objects.create(
			reporter=self.citizen,
			emergency_description="Priority report",
			latitude="10.7999000",
			longitude="122.9740000",
			contact_number="09170000001",
			is_priority=True,
			priority_level=EmergencyReport.LEVEL_HIGH,
			critical_level=EmergencyReport.LEVEL_HIGH,
		)
		EmergencyReport.objects.create(
			reporter=self.citizen,
			emergency_description="Normal report",
			latitude="10.7999000",
			longitude="122.9740000",
			contact_number="09170000002",
			is_priority=False,
		)
		self.client.force_authenticate(user=self.bfp)
		res = self.client.get("/api/reports/")
		self.assertEqual(res.status_code, status.HTTP_200_OK)
		results = res.data if isinstance(res.data, list) else res.data.get("results", [])
		priority_reports = [item for item in results if item.get("is_priority")]
		self.assertEqual(len(priority_reports), 1)

	def test_keyword_fallback_critical_level(self):
		result = keyword_fallback_analysis("unconscious person trapped after collapse")
		self.assertTrue(result["is_priority"])
		self.assertEqual(result["critical_level"], EmergencyReport.LEVEL_CRITICAL)

	def test_frontend_does_not_contain_openrouter_key(self):
		repo_root = Path(__file__).resolve().parents[2]
		scan_roots = [
			repo_root / "frontend" / "src",
			repo_root / "mobile" / "app",
			repo_root / "mobile" / "src",
		]
		for root in scan_roots:
			if not root.exists():
				continue
			for path in root.rglob("*"):
				if "node_modules" in path.parts:
					continue
				if path.suffix not in {".js", ".jsx", ".ts", ".tsx"}:
					continue
				content = path.read_text(encoding="utf-8")
				self.assertNotIn("OPENROUTER_API_KEY", content)
