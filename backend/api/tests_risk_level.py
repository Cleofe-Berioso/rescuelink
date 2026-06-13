from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from .models import EmergencyReport, ReportRiskLog
from .services.triage_rules import classify_initial_risk

User = get_user_model()


class RiskLevelTests(APITestCase):
	@classmethod
	def setUpTestData(cls):
		for role in ("CITIZEN", "DRRM", "BFP", "POLICE", "ADMIN"):
			Group.objects.get_or_create(name=role)

		cls.citizen = User.objects.create_user(username="citizen_risk", password="citizen1234")
		cls.citizen.groups.add(Group.objects.get(name="CITIZEN"))

		cls.drrm = User.objects.create_user(username="drrm_risk", password="drrm1234", is_staff=True)
		cls.drrm.groups.add(Group.objects.get(name="DRRM"))

		cls.bfp = User.objects.create_user(username="bfp_risk", password="bfp1234", is_staff=True)
		cls.bfp.groups.add(Group.objects.get(name="BFP"))

		cls.police = User.objects.create_user(username="police_risk", password="police1234", is_staff=True)
		cls.police.groups.add(Group.objects.get(name="POLICE"))

		cls.admin = User.objects.create_user(username="admin_risk", password="admin1234", is_staff=True)
		cls.admin.groups.add(Group.objects.get(name="ADMIN"))

	@staticmethod
	def _create_report(**kwargs):
		defaults = {
			"reporter": kwargs.pop("reporter"),
			"emergency_description": kwargs.pop("emergency_description", "test report"),
			"latitude": "10.7999000",
			"longitude": "122.9740000",
			"contact_number": "09171234567",
		}
		defaults.update(kwargs)
		return EmergencyReport.objects.create(**defaults)

	def _post_risk_level(self, user, report_id, risk_level, reason=""):
		self.client.force_authenticate(user=user)
		return self.client.post(
			f"/api/reports/{report_id}/set_risk_level/",
			{"risk_level": risk_level, "reason": reason},
			format="json",
		)

	def test_initial_rule_based_triage_critical(self):
		result = classify_initial_risk(
			EmergencyReport(
				emergency_description="unconscious person drowning",
				latitude="10.7999000",
				longitude="122.9740000",
				contact_number="09170000001",
				reporter=self.citizen,
			)
		)
		self.assertEqual(result["risk_level"], "CRITICAL")
		self.assertEqual(result["risk_source"], "RULE_BASED")

	def test_initial_rule_based_triage_medium(self):
		result = classify_initial_risk(
			EmergencyReport(
				emergency_description="minor injury needs assistance",
				latitude="10.7999000",
				longitude="122.9740000",
				contact_number="09170000001",
				reporter=self.citizen,
			)
		)
		self.assertIn(result["risk_level"], ("MEDIUM", "HIGH"))

	@override_settings(AI_PRIORITY_ENABLED=False)
	def test_report_creation_assigns_rule_based_risk(self):
		self.client.force_authenticate(user=self.citizen)
		res = self.client.post(
			"/api/reports/",
			{
				"emergency_description": "fire explosion trapped unconscious",
				"latitude": "10.7999000",
				"longitude": "122.9740000",
				"contact_number": "09171234567",
			},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_201_CREATED)
		report = EmergencyReport.objects.get(pk=res.data["id"])
		self.assertEqual(report.risk_source, "RULE_BASED")
		self.assertEqual(report.risk_level, "CRITICAL")
		self.assertTrue(report.risk_reason)

	def test_citizen_cannot_change_risk_level(self):
		report = self._create_report(reporter=self.citizen, emergency_description="test")
		res = self._post_risk_level(self.citizen, report.id, "HIGH", reason="citizen attempt")
		self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

	def test_drrm_can_change_risk_level(self):
		report = self._create_report(reporter=self.citizen, emergency_description="test")
		res = self._post_risk_level(self.drrm, report.id, "MEDIUM", reason="reviewed on scene")
		self.assertEqual(res.status_code, status.HTTP_200_OK)
		report.refresh_from_db()
		self.assertEqual(report.risk_level, "MEDIUM")
		self.assertEqual(report.risk_source, "MANUAL_RESPONDER")

	def test_bfp_can_change_risk_level(self):
		report = self._create_report(reporter=self.citizen, emergency_description="test")
		res = self._post_risk_level(self.bfp, report.id, "LOW", reason="false alarm")
		self.assertEqual(res.status_code, status.HTTP_200_OK)

	def test_police_can_change_risk_level(self):
		report = self._create_report(reporter=self.citizen, emergency_description="test")
		res = self._post_risk_level(self.police, report.id, "LOW", reason="resolved")
		self.assertEqual(res.status_code, status.HTTP_200_OK)

	def test_admin_can_change_risk_level(self):
		report = self._create_report(reporter=self.citizen, emergency_description="test")
		res = self._post_risk_level(self.admin, report.id, "HIGH", reason="verified threat")
		self.assertEqual(res.status_code, status.HTTP_200_OK)

	def test_high_critical_requires_reason(self):
		report = self._create_report(reporter=self.citizen, emergency_description="test")
		res = self._post_risk_level(self.drrm, report.id, "CRITICAL", reason="")
		self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

	def test_manual_change_creates_report_risk_log(self):
		report = self._create_report(reporter=self.citizen, emergency_description="test", risk_level="LOW")
		res = self._post_risk_level(self.drrm, report.id, "HIGH", reason="escalated after review")
		self.assertEqual(res.status_code, status.HTTP_200_OK)
		log = ReportRiskLog.objects.filter(report=report).first()
		self.assertIsNotNone(log)
		self.assertEqual(log.old_risk_level, "LOW")
		self.assertEqual(log.new_risk_level, "HIGH")
		self.assertEqual(log.changed_by, self.drrm)
		self.assertEqual(log.changed_by_role, "DRRM")

	def test_manual_change_does_not_change_report_status(self):
		report = self._create_report(
			reporter=self.citizen,
			emergency_description="test",
			status=EmergencyReport.STATUS_PENDING,
		)
		res = self._post_risk_level(self.drrm, report.id, "CRITICAL", reason="confirmed emergency")
		self.assertEqual(res.status_code, status.HTTP_200_OK)
		report.refresh_from_db()
		self.assertEqual(report.status, EmergencyReport.STATUS_PENDING)
		self.assertTrue(res.data.get("status_unchanged"))

	def test_serializer_exposes_risk_fields_for_staff(self):
		report = self._create_report(
			reporter=self.citizen,
			emergency_description="test",
			risk_level="HIGH",
			risk_source="MANUAL_RESPONDER",
			risk_reason="Verified by DRRM.",
		)
		self.client.force_authenticate(user=self.drrm)
		res = self.client.get(f"/api/reports/{report.id}/")
		self.assertEqual(res.status_code, status.HTTP_200_OK)
		self.assertEqual(res.data["risk_level"], "HIGH")
		self.assertEqual(res.data["risk_source"], "MANUAL_RESPONDER")
		self.assertEqual(res.data["risk_reason"], "Verified by DRRM.")
		self.assertIn("risk_logs", res.data)
