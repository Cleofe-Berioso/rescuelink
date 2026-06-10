
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from .models import EmergencyReport
from .services.ai_priority import (
	analyze_report_priority,
	apply_ai_priority_to_report,
	keyword_fallback_analysis,
	validate_ai_result,
)

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

	@override_settings(AI_PRIORITY_ENABLED=False, OPENAI_API_KEY="")
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

	@override_settings(AI_PRIORITY_ENABLED=False, OPENAI_API_KEY="")
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

	@override_settings(AI_PRIORITY_ENABLED=True, OPENAI_API_KEY="test-key")
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

	@override_settings(AI_PRIORITY_ENABLED=True, OPENAI_API_KEY="")
	def test_missing_openai_key_uses_rule_based_fallback(self):
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
		self.assertEqual(report.ai_source, "RULE_BASED_FALLBACK")
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

	def test_keyword_fallback_unconscious_drowning_is_critical(self):
		result = keyword_fallback_analysis("unconscious person drowning")
		self.assertEqual(result["priority"], "CRITICAL")
		self.assertEqual(result["criticality"], "LIFE_THREATENING")
		self.assertEqual(result["source"], "RULE_BASED_FALLBACK")
		self.assertTrue(result["is_priority"])

	def test_keyword_fallback_minor_injury_is_medium_or_high(self):
		result = keyword_fallback_analysis("minor injury needs assistance")
		self.assertIn(result["priority"], ("MEDIUM", "HIGH"))
		self.assertEqual(result["source"], "RULE_BASED_FALLBACK")

	def test_keyword_fallback_critical_level_legacy(self):
		result = keyword_fallback_analysis("unconscious person trapped after collapse")
		self.assertTrue(result["is_priority"])
		self.assertEqual(result["critical_level"], EmergencyReport.LEVEL_CRITICAL)

	def test_validate_ai_result_rejects_invalid_payload(self):
		valid, error = validate_ai_result({"priority": "INVALID"})
		self.assertFalse(valid)
		self.assertTrue(error)

	@override_settings(
		AI_PRIORITY_ENABLED=True,
		OPENAI_API_KEY="test-openai-key",
		OPENAI_MODEL="gpt-4.1-mini",
	)
	@patch("api.services.ai_priority.call_openai_api")
	def test_openai_priority_classification_success(self, mock_call_openai):
		mock_call_openai.return_value = {
			"priority": "HIGH",
			"criticality": "URGENT",
			"incident_category": "ACCIDENT",
			"confidence": 0.85,
			"reason": "Road accident with injuries detected.",
			"recommended_units": ["DRRM", "POLICE"],
		}

		report = EmergencyReport.objects.create(
			reporter=self.citizen,
			emergency_description="Car crash on main road, driver is bleeding",
			latitude="10.7999000",
			longitude="122.9740000",
			contact_number="09171234567",
		)
		apply_ai_priority_to_report(report)
		report.refresh_from_db()

		self.assertEqual(report.ai_priority, "HIGH")
		self.assertEqual(report.ai_criticality, "URGENT")
		self.assertEqual(report.ai_incident_category, "ACCIDENT")
		self.assertEqual(report.ai_confidence, 85)
		self.assertEqual(report.ai_reason, "Road accident with injuries detected.")
		self.assertEqual(report.ai_source, "OPENAI")
		self.assertIn("DRRM", report.suggested_units)
		self.assertIn("POLICE", report.suggested_units)
		self.assertTrue(report.is_priority)
		self.assertEqual(report.priority_level, "HIGH")
		self.assertEqual(report.critical_level, "HIGH")
		self.assertEqual(report.ai_priority_reason, "Road accident with injuries detected.")

	@override_settings(AI_PRIORITY_ENABLED=True, OPENAI_API_KEY="test-openai-key")
	@patch("api.services.ai_priority.call_openai_api")
	def test_openai_failure_uses_rule_based_fallback(self, mock_call_openai):
		mock_call_openai.return_value = None

		report = EmergencyReport.objects.create(
			reporter=self.citizen,
			emergency_description="unconscious citizen trapped under rubbles after earthquake",
			latitude="10.7999000",
			longitude="122.9740000",
			contact_number="09171234567",
		)
		apply_ai_priority_to_report(report)
		report.refresh_from_db()

		self.assertEqual(report.ai_priority, "CRITICAL")
		self.assertEqual(report.ai_criticality, "LIFE_THREATENING")
		self.assertEqual(report.ai_source, "RULE_BASED_FALLBACK")
		self.assertEqual(report.ai_analysis_status, EmergencyReport.AI_STATUS_FALLBACK)
		self.assertTrue(report.is_priority)

	@override_settings(AI_PRIORITY_ENABLED=True, OPENAI_API_KEY="test-openai-key")
	@patch("api.services.ai_priority.call_openai_api")
	def test_invalid_openai_response_uses_fallback(self, mock_call_openai):
		mock_call_openai.return_value = {
			"priority": "HIGH",
			"criticality": "URGENT",
			"incident_category": "ACCIDENT",
			"confidence": 0.9,
			"reason": "",
			"recommended_units": ["DRRM"],
		}

		report = EmergencyReport.objects.create(
			reporter=self.citizen,
			emergency_description="vehicle crash with injuries",
			latitude="10.7999000",
			longitude="122.9740000",
			contact_number="09171234567",
		)
		result = analyze_report_priority(report)
		self.assertEqual(result["source"], "RULE_BASED_FALLBACK")

	@override_settings(
		AI_PRIORITY_ENABLED=True,
		OPENAI_API_KEY="test-openai-key",
		AI_CONFIDENCE_MINIMUM=0.80,
	)
	@patch("api.services.ai_priority.call_openai_api")
	def test_low_confidence_openai_uses_fallback(self, mock_call_openai):
		mock_call_openai.return_value = {
			"priority": "HIGH",
			"criticality": "URGENT",
			"incident_category": "ACCIDENT",
			"confidence": 0.55,
			"reason": "Possible accident.",
			"recommended_units": ["DRRM"],
		}

		report = EmergencyReport.objects.create(
			reporter=self.citizen,
			emergency_description="possible accident on highway",
			latitude="10.7999000",
			longitude="122.9740000",
			contact_number="09171234567",
		)
		result = analyze_report_priority(report)
		self.assertEqual(result["source"], "RULE_BASED_FALLBACK")

	def test_serializer_exposes_ai_fields_for_staff(self):
		report = EmergencyReport.objects.create(
			reporter=self.citizen,
			emergency_description="fire in building",
			latitude="10.7999000",
			longitude="122.9740000",
			contact_number="09171234567",
			ai_priority="HIGH",
			ai_criticality="URGENT",
			ai_incident_category="FIRE",
			ai_confidence=82,
			ai_reason="Smoke and fire reported.",
			ai_source="OPENAI",
		)
		self.client.force_authenticate(user=self.bfp)
		res = self.client.get(f"/api/reports/{report.id}/")
		self.assertEqual(res.status_code, status.HTTP_200_OK)
		self.assertEqual(res.data["ai_priority"], "HIGH")
		self.assertEqual(res.data["ai_criticality"], "URGENT")
		self.assertEqual(res.data["ai_incident_category"], "FIRE")
		self.assertEqual(res.data["ai_confidence"], 82)
		self.assertEqual(res.data["ai_reason"], "Smoke and fire reported.")
		self.assertEqual(res.data["ai_source"], "OPENAI")

	def test_frontend_does_not_contain_openai_or_openrouter_key(self):
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
				self.assertNotIn("OPENAI_API_KEY", content)
