
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import CitizenProfile, EmergencyReport
from .services.abuse_detection import analyze_account_abuse, analyze_report_spam
from .services.abuse_rules import gather_report_spam_rule_evidence

User = get_user_model()


class AbuseDetectionTests(APITestCase):
	@classmethod
	def setUpTestData(cls):
		for role in ("CITIZEN", "DRRM", "BFP", "POLICE", "ADMIN"):
			Group.objects.get_or_create(name=role)

		cls.citizen = User.objects.create_user(
			username="citizen_abuse",
			password="citizen1234",
		)
		cls.citizen.groups.add(Group.objects.get(name="CITIZEN"))
		cls.profile = CitizenProfile.objects.create(
			user=cls.citizen,
			full_name="Test Citizen",
			contact_number="09171234567",
		)

		cls.admin = User.objects.create_user(
			username="admin_abuse",
			password="admin1234",
			is_staff=True,
		)
		cls.admin.groups.add(Group.objects.get(name="ADMIN"))

	@override_settings(MANUAL_ABUSE_REVIEW_ENABLED=True)
	def test_normal_report_submission_still_works(self):
		self.client.force_authenticate(user=self.citizen)
		res = self.client.post(
			"/api/reports/",
			{
				"emergency_description": "Car accident with injuries on main road",
				"latitude": "10.7999000",
				"longitude": "122.9740000",
				"contact_number": "09171234567",
			},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_201_CREATED)
		self.assertTrue(EmergencyReport.objects.filter(pk=res.data["id"]).exists())

	@override_settings(MANUAL_ABUSE_REVIEW_ENABLED=True)
	@patch("api.views.process_report_abuse")
	def test_abuse_failure_does_not_block_report_submission(self, mock_abuse):
		mock_abuse.side_effect = RuntimeError("abuse check unavailable")
		self.client.force_authenticate(user=self.citizen)
		res = self.client.post(
			"/api/reports/",
			{
				"emergency_description": "Need help at the park",
				"latitude": "10.7999000",
				"longitude": "122.9740000",
				"contact_number": "09171234567",
			},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_201_CREATED)

	@override_settings(MANUAL_ABUSE_REVIEW_ENABLED=True)
	def test_repeated_report_is_flagged(self):
		EmergencyReport.objects.create(
			reporter=self.citizen,
			emergency_description="same spam text repeated now",
			latitude="10.7999000",
			longitude="122.9740000",
			contact_number="09171234567",
			created_at=timezone.now() - timedelta(minutes=2),
		)
		EmergencyReport.objects.create(
			reporter=self.citizen,
			emergency_description="same spam text repeated now",
			latitude="10.7999000",
			longitude="122.9740000",
			contact_number="09171234567",
			created_at=timezone.now() - timedelta(minutes=1),
		)
		report = EmergencyReport.objects.create(
			reporter=self.citizen,
			emergency_description="same spam text repeated now",
			latitude="10.7999000",
			longitude="122.9740000",
			contact_number="09171234567",
		)
		evidence = gather_report_spam_rule_evidence(report)
		self.assertIn("too_many_reports_same_user", evidence["rule_hits"])

	@override_settings(MANUAL_ABUSE_REVIEW_ENABLED=True)
	def test_duplicate_account_pattern_is_flagged(self):
		other = User.objects.create_user(username="dup_user", password="pass12345")
		other.groups.add(Group.objects.get(name="CITIZEN"))
		CitizenProfile.objects.create(
			user=other,
			full_name="Test Citizen",
			contact_number="09171234567",
		)
		result = analyze_account_abuse(self.profile)
		self.assertGreaterEqual(result["risk_score"], 18)
		self.assertTrue(result["is_possible_duplicate"] or result["rule_evidence"]["rule_hits"])

	@override_settings(
		MANUAL_ABUSE_REVIEW_ENABLED=True,
		ABUSE_AUTO_SUSPEND_THRESHOLD=90,
		ABUSE_REVIEW_THRESHOLD=70,
	)
	def test_high_risk_account_not_auto_permanently_banned(self):
		self.profile.is_suspended = True
		self.profile.suspension_reason = "Temporary review"
		self.profile.suspension_until = timezone.now() + timedelta(hours=1)
		self.profile.save()
		self.assertTrue(self.profile.user.is_active)
		self.assertFalse(self.profile.is_verified)

	@override_settings(MANUAL_ABUSE_REVIEW_ENABLED=True)
	def test_temporary_suspend_only_with_strong_rule_evidence(self):
		for _ in range(4):
			EmergencyReport.objects.create(
				reporter=self.citizen,
				emergency_description="spam spam spam",
				latitude="10.7999000",
				longitude="122.9740000",
				contact_number="09171234567",
				created_at=timezone.now() - timedelta(minutes=1),
			)
		report = EmergencyReport.objects.create(
			reporter=self.citizen,
			emergency_description="spam spam spam",
			latitude="10.7999000",
			longitude="122.9740000",
			contact_number="09171234567",
		)
		result = analyze_report_spam(report)
		self.assertLess(result.get("risk_score", 0), 90)

	@override_settings(MANUAL_ABUSE_REVIEW_ENABLED=True)
	def test_admin_can_unsuspend_user(self):
		self.profile.is_suspended = True
		self.profile.suspension_reason = "Test suspension"
		self.profile.save()
		self.client.force_authenticate(user=self.admin)
		res = self.client.post(f"/api/admin/citizens/{self.profile.pk}/unsuspend/")
		self.assertEqual(res.status_code, status.HTTP_200_OK)
		self.profile.refresh_from_db()
		self.assertFalse(self.profile.is_suspended)

	@override_settings(MANUAL_ABUSE_REVIEW_ENABLED=True)
	def test_suspended_user_cannot_submit_report(self):
		self.profile.is_suspended = True
		self.profile.suspension_reason = "Temporary restriction"
		self.profile.suspension_until = timezone.now() + timedelta(hours=2)
		self.profile.save()
		self.client.force_authenticate(user=self.citizen)
		res = self.client.post(
			"/api/reports/",
			{
				"emergency_description": "Real emergency need help",
				"latitude": "10.7999000",
				"longitude": "122.9740000",
				"contact_number": "09171234567",
			},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

	@override_settings(MANUAL_ABUSE_REVIEW_ENABLED=True)
	def test_malicious_nonsense_report_does_not_break_api(self):
		self.client.force_authenticate(user=self.citizen)
		res = self.client.post(
			"/api/reports/",
			{
				"emergency_description": "<script>alert(1)</script> " + ("x" * 4000),
				"latitude": "10.7999000",
				"longitude": "122.9740000",
				"contact_number": "09171234567",
			},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_201_CREATED)

	@override_settings(MANUAL_ABUSE_REVIEW_ENABLED=True)
	def test_permanent_ban_is_not_automatic(self):
		self.profile.is_suspended = True
		self.profile.risk_score = 100
		self.profile.risk_level = "EXTREME"
		self.profile.save()
		self.profile.user.refresh_from_db()
		self.assertTrue(self.profile.user.is_active)

	@override_settings(MANUAL_ABUSE_REVIEW_ENABLED=True)
	def test_citizen_response_hides_staff_abuse_fields(self):
		report = EmergencyReport.objects.create(
			reporter=self.citizen,
			emergency_description="test",
			latitude="10.7999000",
			longitude="122.9740000",
			contact_number="09171234567",
			is_flagged=True,
			needs_verification=True,
			flag_reason="Internal reason",
			risk_score=88,
		)
		self.client.force_authenticate(user=self.citizen)
		res = self.client.get(f"/api/reports/{report.pk}/")
		self.assertEqual(res.status_code, status.HTTP_200_OK)
		self.assertNotIn("flag_reason", res.data)
		self.assertNotIn("risk_score", res.data)
		self.assertIn("citizen_notice", res.data)

	@override_settings(MANUAL_ABUSE_REVIEW_ENABLED=False)
	def test_abuse_review_disabled_skips_processing(self):
		self.client.force_authenticate(user=self.citizen)
		res = self.client.post(
			"/api/reports/",
			{
				"emergency_description": "General report unclear description",
				"latitude": "10.7999000",
				"longitude": "122.9740000",
				"contact_number": "09171234567",
			},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_201_CREATED)
		report = EmergencyReport.objects.get(pk=res.data["id"])
		self.assertFalse(report.is_flagged)
