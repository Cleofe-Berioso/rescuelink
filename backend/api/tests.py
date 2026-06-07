from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import EmergencyReport, IncidentResponse, IncidentStatusHistory

User = get_user_model()


class MultiUnitRespondTests(APITestCase):
	def setUp(self):
		for role in ("CITIZEN", "DRRM", "BFP", "POLICE", "ADMIN"):
			Group.objects.get_or_create(name=role)

		self.citizen = User.objects.create_user(
			username="citizen",
			password="citizen1234",
			email="citizen@test.local",
		)
		self.citizen.groups.add(Group.objects.get(name="CITIZEN"))

		self.bfp = User.objects.create_user(
			username="bfp",
			password="bfp1234",
			email="bfp@test.local",
			is_staff=True,
		)
		self.bfp.groups.add(Group.objects.get(name="BFP"))

		self.police = User.objects.create_user(
			username="police",
			password="police1234",
			email="police@test.local",
			is_staff=True,
		)
		self.police.groups.add(Group.objects.get(name="POLICE"))

		self.drrm = User.objects.create_user(
			username="drrm",
			password="drrm1234",
			email="drrm@test.local",
			is_staff=True,
		)
		self.drrm.groups.add(Group.objects.get(name="DRRM"))

		self.report = EmergencyReport.objects.create(
			reporter=self.citizen,
			emergency_description="Car accident, vehicle burning, possible fight involved.",
			latitude="10.7999000",
			longitude="122.9740000",
			contact_number="09171234567",
			address_text="Silay City",
			status=EmergencyReport.STATUS_PENDING,
		)

	def _respond_url(self, report_id):
		return reverse("reports-respond", kwargs={"pk": report_id})

	def _status_url(self, report_id):
		return reverse("reports-update-status", kwargs={"pk": report_id})

	def test_bfp_accept_upgrades_pending_to_accepted(self):
		self.client.force_authenticate(user=self.bfp)
		res = self.client.post(
			self._respond_url(self.report.id),
			{"response_unit": "BFP", "response_notes": "BFP en route"},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_201_CREATED)
		self.report.refresh_from_db()
		self.assertEqual(self.report.status, EmergencyReport.STATUS_ACCEPTED)
		self.assertTrue(res.data["report_status_changed"])

	def test_police_accept_after_dispatched_does_not_downgrade(self):
		self.client.force_authenticate(user=self.bfp)
		self.client.post(
			self._respond_url(self.report.id),
			{"response_unit": "BFP"},
			format="json",
		)
		self.client.post(
			self._status_url(self.report.id),
			{"status": EmergencyReport.STATUS_DISPATCHED, "remarks": "BFP dispatched"},
			format="json",
		)
		self.report.refresh_from_db()
		self.assertEqual(self.report.status, EmergencyReport.STATUS_DISPATCHED)

		self.client.force_authenticate(user=self.police)
		res = self.client.post(
			self._respond_url(self.report.id),
			{"response_unit": "POLICE", "response_notes": "Police securing scene"},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_201_CREATED)
		self.report.refresh_from_db()
		self.assertEqual(self.report.status, EmergencyReport.STATUS_DISPATCHED)
		self.assertFalse(res.data["report_status_changed"])
		self.assertEqual(IncidentResponse.objects.filter(emergency_report=self.report).count(), 2)

	def test_drrm_accept_after_in_progress_stays_in_progress(self):
		self.report.status = EmergencyReport.STATUS_IN_PROGRESS
		self.report.save(update_fields=["status"])

		self.client.force_authenticate(user=self.drrm)
		res = self.client.post(
			self._respond_url(self.report.id),
			{"response_unit": "DRRM"},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_201_CREATED)
		self.report.refresh_from_db()
		self.assertEqual(self.report.status, EmergencyReport.STATUS_IN_PROGRESS)

	def test_resolved_report_blocks_accept(self):
		self.report.status = EmergencyReport.STATUS_RESOLVED
		self.report.save(update_fields=["status"])

		self.client.force_authenticate(user=self.bfp)
		res = self.client.post(
			self._respond_url(self.report.id),
			{"response_unit": "BFP"},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("resolved", res.data["detail"].lower())

	def test_cancelled_report_blocks_accept(self):
		self.report.status = EmergencyReport.STATUS_CANCELLED
		self.report.save(update_fields=["status"])

		self.client.force_authenticate(user=self.police)
		res = self.client.post(
			self._respond_url(self.report.id),
			{"response_unit": "POLICE"},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("cancelled", res.data["detail"].lower())

	def test_backward_status_transition_rejected(self):
		self.report.status = EmergencyReport.STATUS_DISPATCHED
		self.report.save(update_fields=["status"])

		self.client.force_authenticate(user=self.bfp)
		res = self.client.post(
			self._status_url(self.report.id),
			{"status": EmergencyReport.STATUS_ACCEPTED, "remarks": "Trying to downgrade"},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("Backward", res.data["detail"])

	def test_multi_unit_responses_recorded(self):
		self.client.force_authenticate(user=self.bfp)
		self.client.post(self._respond_url(self.report.id), {"response_unit": "BFP"}, format="json")
		self.client.force_authenticate(user=self.police)
		self.client.post(self._respond_url(self.report.id), {"response_unit": "POLICE"}, format="json")
		self.client.force_authenticate(user=self.drrm)
		self.client.post(self._respond_url(self.report.id), {"response_unit": "DRRM"}, format="json")

		units = set(
			IncidentResponse.objects.filter(emergency_report=self.report).values_list(
				"response_unit", flat=True
			)
		)
		self.assertEqual(units, {"BFP", "POLICE", "DRRM"})
		self.assertGreaterEqual(
			IncidentStatusHistory.objects.filter(emergency_report=self.report).count(), 3
		)

	def test_duplicate_unit_response_rejected(self):
		self.client.force_authenticate(user=self.bfp)
		first = self.client.post(
			self._respond_url(self.report.id),
			{"response_unit": "BFP", "response_notes": "First accept"},
			format="json",
		)
		self.assertEqual(first.status_code, status.HTTP_201_CREATED)

		second = self.client.post(
			self._respond_url(self.report.id),
			{"response_unit": "BFP", "response_notes": "Duplicate accept"},
			format="json",
		)
		self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("already responded", second.data["detail"].lower())
		self.assertEqual(
			IncidentResponse.objects.filter(
				emergency_report=self.report,
				response_unit="BFP",
			).count(),
			1,
		)
		self.report.refresh_from_db()
		self.assertEqual(self.report.status, EmergencyReport.STATUS_ACCEPTED)


class AdminApiTests(APITestCase):
	def setUp(self):
		for role in ("CITIZEN", "DRRM", "BFP", "POLICE", "ADMIN"):
			Group.objects.get_or_create(name=role)

		self.admin = User.objects.create_user(
			username="admin",
			password="admin1234",
			email="admin@test.local",
			is_staff=True,
			is_superuser=True,
		)
		self.admin.groups.add(Group.objects.get(name="ADMIN"))

		self.drrm = User.objects.create_user(
			username="drrm",
			password="drrm1234",
			email="drrm@test.local",
			is_staff=True,
		)
		self.drrm.groups.add(Group.objects.get(name="DRRM"))

		self.bfp = User.objects.create_user(
			username="bfp",
			password="bfp1234",
			email="bfp@test.local",
			is_staff=True,
		)
		self.bfp.groups.add(Group.objects.get(name="BFP"))

		self.police = User.objects.create_user(
			username="police",
			password="police1234",
			email="police@test.local",
			is_staff=True,
		)
		self.police.groups.add(Group.objects.get(name="POLICE"))

	def test_admin_can_list_users(self):
		self.client.force_authenticate(user=self.admin)
		res = self.client.get("/api/admin/users/")
		self.assertEqual(res.status_code, status.HTTP_200_OK)
		usernames = {item["username"] for item in res.data}
		self.assertIn("admin", usernames)
		self.assertIn("drrm", usernames)

	def test_admin_can_create_staff_user(self):
		self.client.force_authenticate(user=self.admin)
		res = self.client.post(
			"/api/admin/users/",
			{
				"username": "newdrrm",
				"password": "newdrrm123",
				"email": "newdrrm@test.local",
				"first_name": "New",
				"last_name": "DRRM",
				"role": "DRRM",
				"is_active": True,
			},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_201_CREATED)
		self.assertEqual(res.data["role"], "DRRM")

	def test_drrm_forbidden_from_admin_users(self):
		self.client.force_authenticate(user=self.drrm)
		res = self.client.get("/api/admin/users/")
		self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

	def test_bfp_forbidden_from_admin_users(self):
		self.client.force_authenticate(user=self.bfp)
		res = self.client.get("/api/admin/users/")
		self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

	def test_police_forbidden_from_admin_users(self):
		self.client.force_authenticate(user=self.police)
		res = self.client.get("/api/admin/users/")
		self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

	def test_admin_can_list_categories(self):
		self.client.force_authenticate(user=self.admin)
		res = self.client.get("/api/admin/categories/")
		self.assertEqual(res.status_code, status.HTTP_200_OK)
		self.assertGreaterEqual(len(res.data), 1)

	def test_admin_can_create_category(self):
		self.client.force_authenticate(user=self.admin)
		res = self.client.post(
			"/api/admin/categories/",
			{
				"name": "Gas Leak",
				"description": "Suspected gas leak",
				"suggested_units": ["BFP", "DRRM"],
				"is_active": True,
			},
			format="json",
		)
		self.assertEqual(res.status_code, status.HTTP_201_CREATED)
		self.assertEqual(res.data["suggested_units"], ["BFP", "DRRM"])

	def test_drrm_forbidden_from_admin_categories(self):
		self.client.force_authenticate(user=self.drrm)
		res = self.client.get("/api/admin/categories/")
		self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class CitizenReportResponsesTests(APITestCase):
	def setUp(self):
		for role in ("CITIZEN", "DRRM", "BFP", "POLICE", "ADMIN"):
			Group.objects.get_or_create(name=role)

		self.citizen = User.objects.create_user(
			username="citizen",
			password="citizen1234",
			email="citizen@test.local",
		)
		self.citizen.groups.add(Group.objects.get(name="CITIZEN"))

		self.other_citizen = User.objects.create_user(
			username="citizen2",
			password="citizen1234",
			email="citizen2@test.local",
		)
		self.other_citizen.groups.add(Group.objects.get(name="CITIZEN"))

		self.bfp = User.objects.create_user(
			username="bfp",
			password="bfp1234",
			email="bfp@test.local",
			is_staff=True,
		)
		self.bfp.groups.add(Group.objects.get(name="BFP"))

		self.report = EmergencyReport.objects.create(
			reporter=self.citizen,
			emergency_description="Fire near the market",
			latitude=14.5995,
			longitude=120.9842,
			contact_number="09170000001",
		)

		self.other_report = EmergencyReport.objects.create(
			reporter=self.other_citizen,
			emergency_description="Other citizen report",
			latitude=14.5995,
			longitude=120.9842,
			contact_number="09170000002",
		)

		IncidentResponse.objects.create(
			emergency_report=self.report,
			responder_user=self.bfp,
			response_unit="BFP",
			response_status="ACCEPTED",
			response_notes="Fire unit en route",
		)

	def test_citizen_report_list_includes_unit_responses(self):
		self.client.force_authenticate(user=self.citizen)
		res = self.client.get("/api/reports/")
		self.assertEqual(res.status_code, status.HTTP_200_OK)
		report = next(item for item in res.data if item["id"] == self.report.id)
		self.assertEqual(len(report["responses"]), 1)
		self.assertEqual(report["responses"][0]["unit"], "BFP")
		self.assertEqual(report["responses"][0]["status"], "ACCEPTED")
		self.assertEqual(report["responses"][0]["notes"], "Fire unit en route")
		self.assertNotIn("responder_user", report["responses"][0])

	def test_citizen_only_sees_own_report_responses(self):
		self.client.force_authenticate(user=self.citizen)
		res = self.client.get("/api/responses/")
		self.assertEqual(res.status_code, status.HTTP_200_OK)
		report_ids = {item["emergency_report"] for item in res.data}
		self.assertIn(self.report.id, report_ids)
		self.assertNotIn(self.other_report.id, report_ids)
