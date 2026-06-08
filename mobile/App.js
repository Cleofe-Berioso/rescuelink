import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from "react-native-maps";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

// Django API base URL — set EXPO_PUBLIC_API_BASE_URL in .env or app.config.js extra.apiBaseUrl.
// For Expo Go on a physical device, use an HTTPS tunnel to Django (port 8000), not the Metro tunnel.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://supereffectively-mycostatic-lilla.ngrok-free.dev";
const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

const RATE_LIMIT_MESSAGE = "Too many requests. Please wait and try again.";
const MAX_EMERGENCY_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function validateSelectedImage(asset) {
  if (!asset) {
    return null;
  }
  const mime = (asset.mimeType || "image/jpeg").toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
    return "Only JPEG, PNG, and WebP images are allowed.";
  }
  if (asset.fileSize && asset.fileSize > MAX_EMERGENCY_PHOTO_BYTES) {
    return "Image must be 5 MB or smaller.";
  }
  return null;
}

const NGROK_HEADERS = {
  Accept: "application/json",
  "ngrok-skip-browser-warning": "true",
};

const SESSION_KEYS = {
  staySignedIn: "rl_stay_signed_in",
  access: "rl_access_token",
  refresh: "rl_refresh_token",
  username: "rl_username",
};

async function saveSession(accessToken, refreshToken, savedUsername) {
  await SecureStore.setItemAsync(SESSION_KEYS.staySignedIn, "true");
  await SecureStore.setItemAsync(SESSION_KEYS.access, accessToken);
  if (refreshToken) {
    await SecureStore.setItemAsync(SESSION_KEYS.refresh, refreshToken);
  }
  if (savedUsername) {
    await SecureStore.setItemAsync(SESSION_KEYS.username, savedUsername);
  }
}

async function clearSavedSession() {
  await Promise.all(
    Object.values(SESSION_KEYS).map((key) =>
      SecureStore.deleteItemAsync(key).catch(() => {})
    )
  );
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...NGROK_HEADERS,
    },
    body: JSON.stringify({ refresh: refreshToken }),
  });

  const text = await res.text();

  if (isHtmlResponse(text)) {
    throw new Error("Token refresh response is HTML, not JSON.");
  }

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Token refresh response is not JSON.");
  }

  if (!res.ok || !data?.access) {
    throw new Error(data.detail || "Session expired. Please sign in again.");
  }

  return data.access;
}

async function restoreSession() {
  const stay = await SecureStore.getItemAsync(SESSION_KEYS.staySignedIn);
  if (stay !== "true") {
    return null;
  }

  const refreshToken = await SecureStore.getItemAsync(SESSION_KEYS.refresh);
  const savedAccess = await SecureStore.getItemAsync(SESSION_KEYS.access);
  const savedUsername = await SecureStore.getItemAsync(SESSION_KEYS.username);

  if (!refreshToken && !savedAccess) {
    await clearSavedSession();
    return null;
  }

  let accessToken = savedAccess;
  if (refreshToken) {
    try {
      accessToken = await refreshAccessToken(refreshToken);
      await SecureStore.setItemAsync(SESSION_KEYS.access, accessToken);
    } catch {
      await clearSavedSession();
      return null;
    }
  }

  if (!accessToken) {
    await clearSavedSession();
    return null;
  }

  return {
    access: accessToken,
    refresh: refreshToken || "",
    username: savedUsername || "",
  };
}

function hasProfileValue(value) {
  const trimmed = String(value || "").trim();
  return Boolean(trimmed) && trimmed.toLowerCase() !== "not set";
}

function isHtmlResponse(text) {
  const trimmed = text.trim().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

function loginResponseError(text) {
  if (isHtmlResponse(text)) {
    if (text.includes("<title>mobile</title>") || text.includes("expo-reset")) {
      return (
        "This ngrok URL points to the Expo dev server, not Django. " +
        "Run `ngrok http 8000` in a new terminal and set API_BASE_URL to that HTTPS URL + /api."
      );
    }
    return "Login response is HTML, not JSON. Check ngrok URL or ngrok warning page.";
  }
  return "Login response is not JSON. Check ngrok URL or ngrok warning page.";
}

async function apiLogin(username, password) {
  const url = `${API_BASE_URL}/auth/token/`;

  console.log("API_BASE_URL:", API_BASE_URL);
  console.log("LOGIN URL:", url);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...NGROK_HEADERS,
    },
    body: JSON.stringify({ username, password }),
  });

  const text = await res.text();

  console.log("LOGIN STATUS:", res.status);

  if (isHtmlResponse(text)) {
    const message = loginResponseError(text);
    console.log("LOGIN HTML RESPONSE DETECTED:", message);
    throw new Error(message);
  }

  let data = {};
  try {
    data = JSON.parse(text);
  } catch (error) {
    console.log("LOGIN JSON PARSE ERROR:", error);
    throw new Error(loginResponseError(text));
  }

  console.log("LOGIN STATUS:", res.status);

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(RATE_LIMIT_MESSAGE);
    }
    throw new Error(data.detail || JSON.stringify(data) || "Login failed");
  }

  if (!data?.access) {
    throw new Error(`No access token returned. Response: ${JSON.stringify(data)}`);
  }

  return data;
}

async function fetchCitizenReports(accessToken) {
  const res = await fetch(`${API_BASE_URL}/reports/`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...NGROK_HEADERS,
    },
  });

  const text = await res.text();

  if (isHtmlResponse(text)) {
    throw new Error("Reports response is HTML, not JSON. Check API_BASE_URL or ngrok tunnel.");
  }

  let data = {};
  try {
    data = text ? JSON.parse(text) : [];
  } catch {
    throw new Error("Reports response is not JSON.");
  }

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(RATE_LIMIT_MESSAGE);
    }
    throw new Error(data.detail || JSON.stringify(data) || "Unable to load reports.");
  }

  const list = Array.isArray(data) ? data : data.results || [];

  console.log("MY REPORTS RAW LIST:", list);
  console.log("FIRST REPORT RAW:", list?.[0]);
  console.log("FIRST REPORT NORMALIZED:", list?.[0] ? normalizeReport(list[0]) : null);

  return list.map(normalizeReport);
}

function formatApiError(data, status) {
  if (status === 429) {
    return RATE_LIMIT_MESSAGE;
  }
  if (!data || typeof data !== "object") {
    return "Request failed.";
  }
  if (typeof data.detail === "string") {
    return data.detail;
  }
  if (Array.isArray(data.detail)) {
    return data.detail.join("\n");
  }
  const parts = Object.entries(data).map(([key, value]) => {
    const text = Array.isArray(value) ? value.join(", ") : String(value);
    return `${key}: ${text}`;
  });
  return parts.join("\n") || "Request failed.";
}

async function apiJsonRequest(accessToken, method, path, body) {
  const headers = {
    "Content-Type": "application/json",
    ...NGROK_HEADERS,
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();

  if (isHtmlResponse(text)) {
    throw new Error("Unexpected HTML response from API. Check API_BASE_URL or ngrok tunnel.");
  }

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Response is not JSON.");
  }

  if (!res.ok) {
    throw new Error(formatApiError(data, res.status));
  }

  return data;
}

async function fetchProfile(accessToken) {
  return apiJsonRequest(accessToken, "GET", "/profile/");
}

async function updateProfile(accessToken, payload) {
  return apiJsonRequest(accessToken, "PUT", "/profile/", payload);
}

async function changePassword(accessToken, payload) {
  return apiJsonRequest(accessToken, "POST", "/profile/change-password/", payload);
}

async function apiRegister(payload) {
  return apiJsonRequest(null, "POST", "/auth/register/", payload);
}

function displayOrNotSet(value) {
  const trimmed = String(value || "").trim();
  return trimmed || "Not set";
}

function buildAbsoluteUrl(url) {
  if (!url) return "";

  const cleanUrl = String(url).trim();
  if (!cleanUrl) return "";

  if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) {
    try {
      const apiOrigin = new URL(API_ORIGIN);
      const parsed = new URL(cleanUrl);

      if (parsed.host === apiOrigin.host) {
        return `${API_ORIGIN}${parsed.pathname}${parsed.search}`;
      }

      return cleanUrl;
    } catch {
      return cleanUrl.replace("http://", "https://");
    }
  }

  if (cleanUrl.startsWith("/api/")) {
    return `${API_ORIGIN}${cleanUrl}`;
  }

  if (cleanUrl.startsWith("api/")) {
    return `${API_ORIGIN}/${cleanUrl}`;
  }

  if (cleanUrl.startsWith("/media/")) {
    return `${API_ORIGIN}${cleanUrl}`;
  }

  if (cleanUrl.startsWith("media/")) {
    return `${API_ORIGIN}/${cleanUrl}`;
  }

  return `${API_BASE_URL}/${cleanUrl.replace(/^\/+/, "")}`;
}

function getReportPhotos(raw) {
  const possiblePhotos = [];

  if (Array.isArray(raw.photos)) {
    possiblePhotos.push(
      ...raw.photos.map((item) =>
        typeof item === "string"
          ? item
          : item?.url || item?.image || item?.image_url || item?.photo || item?.photo_url
      )
    );
  }

  if (Array.isArray(raw.attachments)) {
    possiblePhotos.push(
      ...raw.attachments.map((item) =>
        typeof item === "string"
          ? item
          : item?.url || item?.image || item?.image_url || item?.photo || item?.photo_url
      )
    );
  }

  possiblePhotos.push(
    raw.image_url,
    raw.image,
    raw.photo_url,
    raw.photo,
    raw.evidence_url,
    raw.evidence
  );

  return possiblePhotos
    .filter(Boolean)
    .map(buildAbsoluteUrl)
    .filter(Boolean);
}

function normalizeResponses(raw) {
  const list = raw?.responses;
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => ({
      id: item.id,
      unit: (item.unit || item.response_unit || "").toUpperCase(),
      status: (item.status || item.response_status || "ACCEPTED").toUpperCase(),
      notes: item.notes || item.response_notes || "",
      acceptedAt: item.accepted_at || null,
    }))
    .filter((item) => item.unit);
}

function normalizeReport(raw) {
  const photos = getReportPhotos(raw);
  return {
    id: raw.id,
    description: raw.emergency_description || raw.description || raw.title || "",
    status: (raw.status || raw.report_status || "UNKNOWN").toUpperCase(),
    createdAt: raw.created_at || raw.submitted_at || null,
    contact: raw.contact_number || raw.contact || "",
    address: raw.address_text || raw.address || "",
    latitude: raw.latitude ?? raw.lat,
    longitude: raw.longitude ?? raw.lng,
    photos,
    imageUrl: photos[0] || null,
    hasImage: photos.length > 0,
    responses: normalizeResponses(raw),
  };
}

function getReportDescription(report) {
  return report?.description || "No description provided";
}

function getReportStatus(report) {
  return report?.status || "UNKNOWN";
}

function getReportDate(report) {
  return report?.createdAt || null;
}

function getReportContact(report) {
  return report?.contact || "";
}

function getReportAddress(report) {
  return report?.address || "";
}

function getReportCoords(report) {
  const lat = formatCoordinate(report?.latitude);
  const lng = formatCoordinate(report?.longitude);
  if (!lat || !lng) return null;
  return { lat, lng, label: `${lat}, ${lng}` };
}

function getLocationTitle(report) {
  const coords = getReportCoords(report);
  if (coords) return coords.label;
  const address = getReportAddress(report);
  return address || "Location unavailable";
}

const REPORT_FILTER_OPTIONS = [
  { key: "all", label: "All", icon: null },
  { key: "pending", label: "Pending", icon: "time-outline" },
  { key: "responding", label: "Responding", icon: "flash-outline" },
  { key: "resolved", label: "Resolved", icon: "checkmark-circle-outline" },
];

const REPORT_CARD_MAP_DELTA = 0.015;

const PENDING_STATUSES = new Set(["PENDING", "VIEWED"]);
const RESPONDING_STATUSES = new Set(["ACCEPTED", "DISPATCHED", "IN_PROGRESS"]);
const RESOLVED_STATUSES = new Set(["RESOLVED"]);
const CANCELLED_STATUSES = new Set(["CANCELLED"]);

function getStatusVisual(status) {
  const normalized = (status || "").toUpperCase();
  if (PENDING_STATUSES.has(normalized)) return "pending";
  if (RESPONDING_STATUSES.has(normalized)) return "responding";
  if (RESOLVED_STATUSES.has(normalized)) return "resolved";
  if (CANCELLED_STATUSES.has(normalized)) return "cancelled";
  return "unknown";
}

function getStatusLabel(status) {
  const normalized = (status || "").toUpperCase();
  const labels = {
    PENDING: "Pending",
    VIEWED: "Pending",
    ACCEPTED: "Responding",
    DISPATCHED: "Responding",
    IN_PROGRESS: "In Progress",
    RESOLVED: "Resolved",
    CANCELLED: "Cancelled",
  };
  return labels[normalized] || normalized || "Unknown";
}

const UNIT_DISPLAY_NAMES = {
  DRRM: "DRRM",
  BFP: "BFP",
  POLICE: "Police",
};

function formatUnitName(unit) {
  return UNIT_DISPLAY_NAMES[(unit || "").toUpperCase()] || unit || "Unknown";
}

function formatResponseStatusLabel(status) {
  const normalized = (status || "").toUpperCase();
  const labels = {
    ACCEPTED: "Accepted",
    DISPATCHED: "Dispatched",
    RESPONDING: "Responding",
    IN_PROGRESS: "In Progress",
    RESOLVED: "Resolved",
    VIEWED: "Viewed",
    PENDING: "Pending",
  };
  return labels[normalized] || status || "Accepted";
}

function getCitizenReportStatusLabel(report) {
  const status = (report?.status || "").toUpperCase();
  if (RESOLVED_STATUSES.has(status)) return "Resolved";
  if (CANCELLED_STATUSES.has(status)) return "Cancelled";

  const responseCount = report?.responses?.length || 0;
  if (responseCount === 0) return "Pending";
  if (responseCount === 1) return "Responding";
  return "In Progress";
}

function getCitizenStatusVisual(report) {
  const label = getCitizenReportStatusLabel(report);
  if (label === "Pending") return "pending";
  if (label === "Resolved") return "resolved";
  if (label === "Cancelled") return "cancelled";
  return "responding";
}

function getRespondingUnitsSummary(report) {
  const responses = report?.responses || [];
  if (responses.length === 0) {
    return { mode: "none", text: "Waiting for response unit" };
  }
  if (responses.length === 1) {
    return { mode: "single", text: formatUnitName(responses[0].unit) };
  }
  return {
    mode: "multiple",
    items: responses.map((item) => ({
      id: item.id || item.unit,
      unit: formatUnitName(item.unit),
      status: formatResponseStatusLabel(item.status),
      notes: item.notes,
    })),
  };
}

function filterReports(reports, filterKey) {
  if (filterKey === "all") return reports;
  if (filterKey === "pending") {
    return reports.filter(
      (report) =>
        PENDING_STATUSES.has(report.status) && (report.responses?.length || 0) === 0
    );
  }
  if (filterKey === "responding") {
    return reports.filter(
      (report) =>
        RESPONDING_STATUSES.has(report.status) || (report.responses?.length || 0) > 0
    );
  }
  if (filterKey === "resolved") {
    return reports.filter((report) => RESOLVED_STATUSES.has(report.status));
  }
  return reports;
}

function formatReportDate(isoValue) {
  if (!isoValue) return "Unknown date";
  try {
    return new Date(isoValue).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return String(isoValue);
  }
}

function formatCoordinate(value) {
  if (value === "" || value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(5) : String(value);
}

function BackgroundDecor() {
  return (
    <View style={styles.bgDecor} pointerEvents="none">
      <View style={[styles.bgBlob, styles.bgBlobRed]} />
      <View style={[styles.bgBlob, styles.bgBlobBlue]} />
      <View style={[styles.bgBlob, styles.bgBlobOrange]} />
    </View>
  );
}

function LoginNetworkPattern() {
  const dots = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      dots.push(
        <View
          key={`${row}-${col}`}
          style={[
            loginStyles.networkDot,
            {
              top: `${8 + row * 12}%`,
              left: `${6 + col * 16}%`,
              opacity: 0.15 + ((row + col) % 3) * 0.08,
            },
          ]}
        />
      );
    }
  }
  return <View style={loginStyles.networkPattern} pointerEvents="none">{dots}</View>;
}

function LoginBrandHeader() {
  return (
    <View style={loginStyles.brandBlock}>
      <View style={loginStyles.logoShield}>
        <MaterialCommunityIcons name="shield-plus" size={34} color="#ef4444" />
        <View style={loginStyles.logoCross}>
          <MaterialCommunityIcons name="plus" size={16} color="#ffffff" />
        </View>
      </View>
      <Text style={loginStyles.brandTitle}>RescueLink</Text>
      <Text style={loginStyles.brandSubtitle}>Citizen Emergency Response Network</Text>
    </View>
  );
}

function LoginInputField({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  autoCapitalize = "none",
  keyboardType = "default",
}) {
  return (
    <View style={loginStyles.inputField}>
      <Text style={loginStyles.inputLabel}>{label}</Text>
      <View style={loginStyles.inputRow}>
        <Ionicons name={icon} size={20} color="#94a3b8" style={loginStyles.inputIcon} />
        <TextInput
          style={loginStyles.inputControl}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#8b9cb3"
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          keyboardType={keyboardType}
        />
      </View>
    </View>
  );
}

function RegisterModal({ visible, onClose, onRegistered }) {
  const [fullName, setFullName] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [email, setEmail] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function resetForm() {
    setFullName("");
    setRegUsername("");
    setEmail("");
    setContactNumber("");
    setRegPassword("");
    setConfirmPassword("");
    setErrorMessage("");
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function validateForm() {
    if (!fullName.trim()) {
      return "Full name is required.";
    }
    if (!regUsername.trim()) {
      return "Username is required.";
    }
    if (!email.trim()) {
      return "Email is required.";
    }
    if (!email.includes("@")) {
      return "Email must contain @.";
    }
    if (!contactNumber.trim()) {
      return "Contact number is required.";
    }
    if (!regPassword) {
      return "Password is required.";
    }
    if (regPassword.length < 8) {
      return "Password must be at least 8 characters.";
    }
    if (regPassword !== confirmPassword) {
      return "Password and confirmation do not match.";
    }
    return "";
  }

  async function handleSubmit() {
    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setBusy(true);
    setErrorMessage("");
    try {
      await apiRegister({
        full_name: fullName.trim(),
        username: regUsername.trim(),
        email: email.trim(),
        contact_number: contactNumber.trim(),
        password: regPassword,
        confirm_password: confirmPassword,
      });
      resetForm();
      onRegistered(regUsername.trim());
    } catch (error) {
      setErrorMessage(error.message || "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={loginStyles.modalBackdrop}>
        <KeyboardAvoidingView
          style={loginStyles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={loginStyles.modalScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={loginStyles.glassCard}>
              <Text style={loginStyles.cardTitle}>Create Account</Text>
              <Text style={loginStyles.cardHint}>Register a citizen account to report emergencies.</Text>

              {errorMessage ? <Text style={loginStyles.errorBanner}>{errorMessage}</Text> : null}

              <LoginInputField
                label="Full Name"
                icon="person-outline"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your full name"
                autoCapitalize="words"
              />
              <LoginInputField
                label="Username"
                icon="at-outline"
                value={regUsername}
                onChangeText={setRegUsername}
                placeholder="Choose a username"
                autoCapitalize="none"
              />
              <LoginInputField
                label="Email"
                icon="mail-outline"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <LoginInputField
                label="Contact Number"
                icon="call-outline"
                value={contactNumber}
                onChangeText={setContactNumber}
                placeholder="Mobile number"
                keyboardType="phone-pad"
              />
              <LoginInputField
                label="Password"
                icon="lock-closed-outline"
                value={regPassword}
                onChangeText={setRegPassword}
                placeholder="At least 8 characters"
                secureTextEntry
              />
              <LoginInputField
                label="Confirm Password"
                icon="lock-closed-outline"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter password"
                secureTextEntry
              />

              <Pressable
                style={[loginStyles.signInBtn, busy && loginStyles.btnDisabled]}
                onPress={handleSubmit}
                disabled={busy}
              >
                <Text style={loginStyles.signInBtnText}>{busy ? "Creating…" : "Create Account"}</Text>
              </Pressable>

              <Pressable style={loginStyles.cancelBtn} onPress={handleClose} disabled={busy}>
                <Text style={loginStyles.cancelBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function LoginScreen({
  username,
  password,
  onUsernameChange,
  onPasswordChange,
  onLogin,
  onFillDemo,
  onCreateAccount,
  staySignedIn,
  onStaySignedInChange,
  busy,
  errorMessage,
  successMessage,
}) {
  function handleForgotPassword() {
    Alert.alert(
      "Forgot Password",
      "Contact your local DRRM office to reset your citizen account password."
    );
  }

  return (
    <LinearGradient colors={["#071426", "#0b2a4a", "#0a2238"]} style={loginStyles.gradient}>
      <LoginNetworkPattern />

      <KeyboardAvoidingView
        style={loginStyles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={loginStyles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LoginBrandHeader />

          <View style={loginStyles.glassCard}>
            <Text style={loginStyles.cardTitle}>Sign in</Text>
            <Text style={loginStyles.cardHint}>Use your citizen account to report emergencies.</Text>

            {successMessage ? <Text style={loginStyles.successBanner}>{successMessage}</Text> : null}
            {errorMessage ? <Text style={loginStyles.errorBanner}>{errorMessage}</Text> : null}

            <LoginInputField
              label="Username"
              icon="person-outline"
              value={username}
              onChangeText={onUsernameChange}
              placeholder="Enter username"
              autoCapitalize="none"
            />

            <LoginInputField
              label="Password"
              icon="lock-closed-outline"
              value={password}
              onChangeText={onPasswordChange}
              placeholder="••••••••"
              secureTextEntry
            />

            <View style={loginStyles.formRow}>
              <View style={loginStyles.staySignedIn}>
                <Switch
                  value={staySignedIn}
                  onValueChange={onStaySignedInChange}
                  trackColor={{ false: "#334155", true: "#2563eb" }}
                  thumbColor="#ffffff"
                />
                <Text style={loginStyles.staySignedInText}>Stay signed in</Text>
              </View>
              <Pressable onPress={handleForgotPassword} hitSlop={8}>
                <Text style={loginStyles.forgotLink}>Forgot Password?</Text>
              </Pressable>
            </View>

            <Pressable
              style={[loginStyles.signInBtn, busy && loginStyles.btnDisabled]}
              onPress={onLogin}
              disabled={busy}
            >
              <Text style={loginStyles.signInBtnText}>{busy ? "Signing in…" : "Sign In"}</Text>
            </Pressable>

            <View style={loginStyles.createAccountRow}>
              <Text style={loginStyles.createAccountText}>Don&apos;t have an account? </Text>
              <Pressable onPress={onCreateAccount} hitSlop={8}>
                <Text style={loginStyles.createAccountLink}>Create Account</Text>
              </Pressable>
            </View>
          </View>

          <Pressable onPress={onFillDemo} style={loginStyles.demoWrap}>
            <Text style={loginStyles.demoLink}>Use Demo Account</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const DESCRIPTION_MAX = 500;
const SILAY_CITY_LAT = 10.7999;
const SILAY_CITY_LNG = 122.974;
const MAP_REGION_DELTA = 0.02;

function parseCoordinate(value) {
  if (value === "" || value == null || String(value).trim() === "") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildMapRegion(latitude, longitude) {
  const lat = parseCoordinate(latitude);
  const lng = parseCoordinate(longitude);
  const hasValidCoords = lat != null && lng != null;

  return {
    latitude: hasValidCoords ? lat : SILAY_CITY_LAT,
    longitude: hasValidCoords ? lng : SILAY_CITY_LNG,
    latitudeDelta: MAP_REGION_DELTA,
    longitudeDelta: MAP_REGION_DELTA,
    hasValidCoords,
    lat,
    lng,
  };
}

function ReportHeaderPattern() {
  const dots = [];
  for (let i = 0; i < 24; i += 1) {
    dots.push(
      <View
        key={i}
        style={[
          reportStyles.headerPatternDot,
          { left: `${(i % 6) * 18 + 4}%`, top: `${Math.floor(i / 6) * 22 + 8}%` },
        ]}
      />
    );
  }
  return <View style={reportStyles.headerPattern} pointerEvents="none">{dots}</View>;
}

const TAB_BAR_BASE_HEIGHT = 70;
const SCROLL_BOTTOM_BASE_PADDING = 140;

function ReportHeader({ username, onLogout, submitBusy, paddingTop }) {
  return (
    <View style={reportStyles.headerWrap}>
      <ReportHeaderPattern />
      <View style={[reportStyles.headerContent, paddingTop != null && { paddingTop }]}>
        <View style={reportStyles.headerBrandRow}>
          <View style={reportStyles.headerLogo}>
            <MaterialCommunityIcons name="shield-plus" size={22} color="#ef4444" />
          </View>
          <View style={reportStyles.headerBrandText}>
            <Text style={reportStyles.headerTitle}>RescueLink</Text>
            <Text style={reportStyles.headerSubtitle}>CITIZEN EMERGENCY REPORTING NETWORK</Text>
          </View>
        </View>
        <View style={reportStyles.headerActions}>
          <View style={reportStyles.loggedInBadge}>
            <Text style={reportStyles.loggedInText}>Logged in: {username}</Text>
          </View>
          <Pressable style={reportStyles.logoutBtn} onPress={onLogout} disabled={submitBusy}>
            <Text style={reportStyles.logoutBtnText}>Logout</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function MapPreview({ latitude, longitude, onRecenter, locBusy }) {
  const mapRef = useRef(null);
  const { latitude: regionLat, longitude: regionLng, latitudeDelta, longitudeDelta, hasValidCoords, lat, lng } =
    buildMapRegion(latitude, longitude);

  const region = {
    latitude: regionLat,
    longitude: regionLng,
    latitudeDelta,
    longitudeDelta,
  };

  useEffect(() => {
    if (!hasValidCoords || !mapRef.current) {
      return;
    }

    mapRef.current.animateToRegion(
      {
        latitude: lat,
        longitude: lng,
        latitudeDelta: MAP_REGION_DELTA,
        longitudeDelta: MAP_REGION_DELTA,
      },
      700
    );
  }, [lat, lng, hasValidCoords]);

  return (
    <View style={reportStyles.mapPreview}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        mapType="standard"
        loadingEnabled
        showsUserLocation={hasValidCoords}
        showsMyLocationButton={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {hasValidCoords ? (
          <>
            <Marker
              coordinate={{ latitude: lat, longitude: lng }}
              title="Emergency Location"
              description="Selected emergency report location"
            />
            <Circle
              center={{ latitude: lat, longitude: lng }}
              radius={100}
              strokeColor="rgba(37, 99, 235, 0.45)"
              fillColor="rgba(37, 99, 235, 0.12)"
              strokeWidth={2}
            />
          </>
        ) : null}
      </MapView>

      {!hasValidCoords ? (
        <View style={reportStyles.mapPlaceholderOverlay} pointerEvents="none">
          <Ionicons name="map-outline" size={28} color="#64748b" style={reportStyles.mapPlaceholderIcon} />
          <Text style={reportStyles.mapPlaceholderText}>
            Tap Pick on Map or Tap to re-center to get your GPS location.
          </Text>
        </View>
      ) : null}

      <Pressable
        style={reportStyles.mapRecenterBtn}
        onPress={onRecenter}
        disabled={locBusy}
      >
        <Ionicons name="locate" size={18} color="#2563eb" />
      </Pressable>

      <View style={reportStyles.mapHintBubble}>
        <Text style={reportStyles.mapHintText}>
          {locBusy
            ? "Locating…"
            : hasValidCoords
              ? "Tap to re-center"
              : "Tap to get GPS location"}
        </Text>
      </View>
    </View>
  );
}

function PhotoEvidenceGrid({ image, onTakePhoto, onPickFromGallery, submitBusy }) {
  return (
    <View style={reportStyles.photoEvidenceBlock}>
      {image?.uri ? (
        <View style={reportStyles.photoPreviewWrap}>
          <Image source={{ uri: image.uri }} style={reportStyles.photoPreviewImage} />
        </View>
      ) : (
        <View style={[reportStyles.photoSlot, reportStyles.photoSlotEmpty, reportStyles.photoPreviewPlaceholder]}>
          <Ionicons name="image-outline" size={28} color="#cbd5e1" />
          <Text style={reportStyles.photoPreviewPlaceholderText}>No photo attached</Text>
        </View>
      )}
      <View style={reportStyles.photoActionsRow}>
        <Pressable
          style={[reportStyles.photoActionBtn, submitBusy && reportStyles.btnDisabled]}
          onPress={onTakePhoto}
          disabled={submitBusy}
        >
          <Ionicons name="camera-outline" size={18} color="#2563eb" />
          <Text style={reportStyles.photoActionBtnText}>Take Photo</Text>
        </Pressable>
        <Pressable
          style={[reportStyles.photoActionBtn, submitBusy && reportStyles.btnDisabled]}
          onPress={onPickFromGallery}
          disabled={submitBusy}
        >
          <Ionicons name="images-outline" size={18} color="#2563eb" />
          <Text style={reportStyles.photoActionBtnText}>Choose from Gallery</Text>
        </Pressable>
      </View>
    </View>
  );
}

function BottomTabBar({ activeTab, onTabChange, bottomInset }) {
  const tabs = [
    { key: "report", label: "Emergency Report", icon: "alert-circle", iconActive: "alert-circle" },
    { key: "reports", label: "My Reports", icon: "document-text-outline", iconActive: "document-text" },
    { key: "profile", label: "Profile", icon: "person-outline", iconActive: "person" },
  ];

  return (
    <View
      style={[
        reportStyles.tabBar,
        {
          paddingBottom: bottomInset + 8,
          minHeight: TAB_BAR_BASE_HEIGHT + bottomInset,
        },
      ]}
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <Pressable key={tab.key} style={reportStyles.tabItem} onPress={() => onTabChange(tab.key)}>
            <Ionicons
              name={active ? tab.iconActive : tab.icon}
              size={22}
              color={active ? "#2563eb" : "#64748b"}
            />
            <Text style={[reportStyles.tabLabel, active && reportStyles.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StatusBadge({ status, report }) {
  const label = report ? getCitizenReportStatusLabel(report) : getStatusLabel(status);
  const visual = report ? getCitizenStatusVisual(report) : getStatusVisual(status);
  const badgeStyle = {
    pending: reportStyles.statusBadgePending,
    responding: reportStyles.statusBadgeResponding,
    resolved: reportStyles.statusBadgeResolved,
    cancelled: reportStyles.statusBadgeCancelled,
    unknown: reportStyles.statusBadgeUnknown,
  }[visual];

  const textStyle = {
    pending: reportStyles.statusBadgeTextPending,
    responding: reportStyles.statusBadgeTextResponding,
    resolved: reportStyles.statusBadgeTextResolved,
    cancelled: reportStyles.statusBadgeTextCancelled,
    unknown: reportStyles.statusBadgeTextUnknown,
  }[visual];

  return (
    <View style={[reportStyles.statusBadge, badgeStyle]}>
      <Text style={[reportStyles.statusBadgeText, textStyle]}>{label}</Text>
    </View>
  );
}

function ReportRespondingUnits({ report }) {
  const units = getRespondingUnitsSummary(report);

  return (
    <View style={reportStyles.reportUnitsBlock}>
      <Text style={reportStyles.reportUnitsHeading}>
        {units.mode === "multiple" ? "Responding Units:" : "Responding Unit:"}
      </Text>
      {units.mode === "none" || units.mode === "single" ? (
        <Text
          style={[
            reportStyles.reportUnitsText,
            units.mode === "none" && reportStyles.reportUnitsTextMuted,
          ]}
        >
          {units.text}
        </Text>
      ) : (
        <View style={reportStyles.reportUnitsList}>
          {units.items.map((item) => (
            <View key={item.id} style={reportStyles.reportUnitsListItem}>
              <Text style={reportStyles.reportUnitsListText}>
                {item.unit} · {item.status}
              </Text>
              {item.notes ? (
                <Text style={reportStyles.reportUnitsNote} numberOfLines={2}>
                  {item.notes}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ReportStatusSection({ report }) {
  const statusLabel = getCitizenReportStatusLabel(report);
  const visual = getCitizenStatusVisual(report);
  const badgeStyle = {
    pending: reportStyles.statusBadgePending,
    responding: reportStyles.statusBadgeResponding,
    resolved: reportStyles.statusBadgeResolved,
    cancelled: reportStyles.statusBadgeCancelled,
    unknown: reportStyles.statusBadgeUnknown,
  }[visual];
  const textStyle = {
    pending: reportStyles.statusBadgeTextPending,
    responding: reportStyles.statusBadgeTextResponding,
    resolved: reportStyles.statusBadgeTextResolved,
    cancelled: reportStyles.statusBadgeTextCancelled,
    unknown: reportStyles.statusBadgeTextUnknown,
  }[visual];

  return (
    <View style={reportStyles.reportStatusSection}>
      <View style={reportStyles.reportStatusRow}>
        <Text style={reportStyles.reportStatusLabel}>Report Status:</Text>
        <View style={[reportStyles.statusBadge, badgeStyle]}>
          <Text style={[reportStyles.statusBadgeText, textStyle]}>{statusLabel}</Text>
        </View>
      </View>
      <ReportRespondingUnits report={report} />
    </View>
  );
}

function showReportDetails(report) {
  const coords = getReportCoords(report);
  const units = getRespondingUnitsSummary(report);
  let unitsLine = "";
  if (units.mode === "none") {
    unitsLine = "\nResponding Unit: Waiting for response unit";
  } else if (units.mode === "single") {
    unitsLine = `\nResponding Unit: ${units.text}`;
  } else {
    unitsLine = `\nResponding Units:\n${units.items.map((item) => `- ${item.unit}: ${item.status}`).join("\n")}`;
  }

  const lines = [
    getReportDescription(report),
    `\nReport Status: ${getCitizenReportStatusLabel(report)}`,
    unitsLine,
    `\nSubmitted: ${formatReportDate(getReportDate(report))}`,
    getReportContact(report) ? `\nContact: ${getReportContact(report)}` : "",
    getReportAddress(report) ? `\nAddress: ${getReportAddress(report)}` : "",
    coords ? `\nCoordinates: ${coords.label}` : "",
    report.hasImage ? "\nPhoto: Attached" : "\nPhoto: None",
  ].filter(Boolean);

  Alert.alert(`Report #${report.id}`, lines.join(""), [{ text: "OK" }]);
}

function ReportCardMapPreview({ latitude, longitude, onViewDetails }) {
  const lat = parseCoordinate(latitude);
  const lng = parseCoordinate(longitude);

  if (lat == null || lng == null) {
    return (
      <View style={reportStyles.reportCardMapWrap}>
        <View style={reportStyles.reportCardMapFallback}>
          <Ionicons name="map-outline" size={28} color="#94a3b8" />
          <Text style={reportStyles.reportCardMapFallbackText}>Map preview unavailable</Text>
        </View>
        <Pressable style={reportStyles.viewDetailsBtn} onPress={onViewDetails}>
          <Text style={reportStyles.viewDetailsBtnText}>View Details</Text>
        </Pressable>
      </View>
    );
  }

  const region = {
    latitude: lat,
    longitude: lng,
    latitudeDelta: REPORT_CARD_MAP_DELTA,
    longitudeDelta: REPORT_CARD_MAP_DELTA,
  };

  return (
    <View style={reportStyles.reportCardMapWrap}>
      <MapView
        style={reportStyles.reportCardMap}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        mapType="standard"
        loadingEnabled
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        showsUserLocation={false}
        showsMyLocationButton={false}
        pointerEvents="none"
      >
        <Marker coordinate={{ latitude: lat, longitude: lng }} pinColor="#ef4444" />
      </MapView>
      <Pressable style={reportStyles.viewDetailsBtn} onPress={onViewDetails}>
        <Text style={reportStyles.viewDetailsBtnText}>View Details</Text>
      </Pressable>
    </View>
  );
}

function ProtectedMemoryImage({ uri, accessToken, style }) {
  const [dataUri, setDataUri] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadImageInMemory() {
      if (!uri || !accessToken) {
        setLoading(false);
        setFailed(true);
        return;
      }

      try {
        setLoading(true);
        setFailed(false);

        const response = await fetch(uri, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "ngrok-skip-browser-warning": "true",
          },
        });

        console.log("PROTECTED IMAGE FETCH STATUS:", response.status, uri);

        if (!response.ok) {
          throw new Error(`Image fetch failed with status ${response.status}`);
        }

        const blob = await response.blob();

        const reader = new FileReader();

        reader.onloadend = () => {
          if (cancelled) return;

          const result = String(reader.result || "");
          setDataUri(result);
          setLoading(false);
        };

        reader.onerror = () => {
          if (cancelled) return;

          setFailed(true);
          setLoading(false);
        };

        reader.readAsDataURL(blob);
      } catch (error) {
        console.log("PROTECTED IMAGE MEMORY LOAD ERROR:", uri, error);
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      }
    }

    loadImageInMemory();

    return () => {
      cancelled = true;
    };
  }, [uri, accessToken]);

  if (loading) {
    return (
      <View style={[style, reportStyles.protectedImagePlaceholder]}>
        <ActivityIndicator size="small" color="#2563eb" />
      </View>
    );
  }

  if (failed || !dataUri) {
    return (
      <View style={[style, reportStyles.protectedImagePlaceholder]}>
        <Ionicons name="image-outline" size={24} color="#cbd5e1" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: dataUri }}
      style={style}
      resizeMode="cover"
      onLoad={() => console.log("MEMORY REPORT IMAGE LOADED:", uri)}
      onError={(error) => console.log("MEMORY REPORT IMAGE ERROR:", uri, error.nativeEvent)}
    />
  );
}

function ReportPhotoThumbnails({ photos, accessToken }) {
  if (!photos?.length) {
    return <Text style={reportStyles.reportNoPhotoText}>No photo attached</Text>;
  }

  return (
    <View style={reportStyles.reportPhotoThumbRow}>
      {photos.slice(0, 3).map((uri, index) => (
        <ProtectedMemoryImage
          key={`${uri}-${index}`}
          uri={uri}
          accessToken={accessToken}
          style={reportStyles.reportPhotoThumb}
        />
      ))}
    </View>
  );
}

function ReportListCard({ report, accessToken }) {
  const coords = getReportCoords(report);
  const contact = getReportContact(report);
  const address = getReportAddress(report);

  return (
    <View style={reportStyles.myReportCard}>
      <Text style={reportStyles.reportLocationTitle}>{getLocationTitle(report)}</Text>
      {address ? (
        <Text style={reportStyles.reportAddressLine} numberOfLines={2}>
          {address}
        </Text>
      ) : null}

      <ReportCardMapPreview
        latitude={report.latitude}
        longitude={report.longitude}
        onViewDetails={() => showReportDetails(report)}
      />

      <View style={reportStyles.myReportCardHeader}>
        <Text style={reportStyles.myReportDescription} numberOfLines={3}>
          {getReportDescription(report)}
        </Text>
      </View>

      <ReportStatusSection report={report} />

      <Text style={reportStyles.myReportDate}>{formatReportDate(getReportDate(report))}</Text>

      {contact ? (
        <View style={reportStyles.myReportMetaRow}>
          <Ionicons name="call-outline" size={16} color="#64748b" />
          <Text style={reportStyles.myReportMetaText}>{contact}</Text>
        </View>
      ) : null}

      {coords ? (
        <View style={reportStyles.myReportMetaRow}>
          <Ionicons name="navigate-outline" size={16} color="#64748b" />
          <Text style={reportStyles.myReportMetaText}>{coords.label}</Text>
        </View>
      ) : null}

      <ReportPhotoThumbnails photos={report.photos} accessToken={accessToken} />
    </View>
  );
}

function MyReportsFilterBar({ reportFilter, onFilterChange }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={reportStyles.filterChipRow}
    >
      {REPORT_FILTER_OPTIONS.map((option) => {
        const active = reportFilter === option.key;
        return (
          <Pressable
            key={option.key}
            style={[reportStyles.filterChip, active && reportStyles.filterChipActive]}
            onPress={() => onFilterChange(option.key)}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={14}
                color={active ? "#2563eb" : "#64748b"}
              />
            ) : null}
            <Text style={[reportStyles.filterChipText, active && reportStyles.filterChipTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function MyReportsListEmpty({
  reportsLoading,
  reportsRefreshing,
  reportsError,
  reportsCount,
  filteredCount,
  onRetry,
  onCreateReport,
}) {
  if (reportsLoading && !reportsRefreshing) {
    return (
      <View style={reportStyles.myReportsStateBox}>
        <ActivityIndicator size="small" color="#2563eb" />
        <Text style={reportStyles.myReportsStateText}>Loading your reports...</Text>
      </View>
    );
  }

  if (reportsError) {
    return (
      <View style={reportStyles.myReportsStateBox}>
        <Ionicons name="alert-circle-outline" size={40} color="#ef4444" />
        <Text style={reportStyles.myReportsStateTitle}>Unable to load reports.</Text>
        <Text style={reportStyles.myReportsStateText}>{reportsError}</Text>
        <Pressable style={reportStyles.myReportsRetryBtn} onPress={onRetry}>
          <Text style={reportStyles.myReportsRetryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (reportsCount === 0) {
    return (
      <View style={reportStyles.myReportsStateBox}>
        <Ionicons name="document-text-outline" size={52} color="#94a3b8" />
        <Text style={reportStyles.myReportsStateTitle}>No reports yet</Text>
        <Text style={reportStyles.myReportsStateText}>
          Submit an emergency report and track its status here.
        </Text>
        <Pressable style={reportStyles.myReportsCreateBtn} onPress={onCreateReport}>
          <Text style={reportStyles.myReportsCreateBtnText}>Create Emergency Report</Text>
        </Pressable>
      </View>
    );
  }

  if (filteredCount === 0) {
    return (
      <View style={reportStyles.myReportsStateBox}>
        <Ionicons name="filter-outline" size={40} color="#94a3b8" />
        <Text style={reportStyles.myReportsStateTitle}>No matching reports</Text>
        <Text style={reportStyles.myReportsStateText}>
          Try a different filter to see your reports.
        </Text>
      </View>
    );
  }

  return null;
}

function MyReportsTab({ access, scrollBottomPadding, onCreateReport, refreshKey, isActive }) {
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState("");
  const [reportsRefreshing, setReportsRefreshing] = useState(false);
  const [reportFilter, setReportFilter] = useState("all");

  async function fetchMyReports(isRefresh = false) {
    if (!access) return;

    if (isRefresh) {
      setReportsRefreshing(true);
    } else {
      setReportsLoading(true);
    }
    setReportsError("");

    try {
      const list = await fetchCitizenReports(access);
      setReports(list);
    } catch (error) {
      setReportsError(error.message || "Unable to load reports.");
    } finally {
      setReportsLoading(false);
      setReportsRefreshing(false);
    }
  }

  useEffect(() => {
    if (isActive && access) {
      fetchMyReports();
    }
  }, [isActive, access, refreshKey]);

  const filteredReports = filterReports(reports, reportFilter);
  const listData = !reportsLoading && !reportsError ? filteredReports : [];

  const listHeader = (
    <View style={reportStyles.myReportsHeaderBlock}>
      <Text style={reportStyles.myReportsTitle}>MY REPORTS</Text>
      <Text style={reportStyles.myReportsSubtitle}>Track your submitted emergency reports</Text>
      <MyReportsFilterBar reportFilter={reportFilter} onFilterChange={setReportFilter} />
    </View>
  );

  return (
    <FlatList
      style={reportStyles.flex}
      data={listData}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <ReportListCard report={item} accessToken={access} />
      )}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        <MyReportsListEmpty
          reportsLoading={reportsLoading}
          reportsRefreshing={reportsRefreshing}
          reportsError={reportsError}
          reportsCount={reports.length}
          filteredCount={filteredReports.length}
          onRetry={() => fetchMyReports()}
          onCreateReport={onCreateReport}
        />
      }
      contentContainerStyle={[
        reportStyles.myReportsScroll,
        { paddingBottom: scrollBottomPadding },
        listData.length === 0 && reportStyles.myReportsScrollEmpty,
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={reportsRefreshing}
          onRefresh={() => fetchMyReports(true)}
          tintColor="#2563eb"
          colors={["#2563eb"]}
        />
      }
    />
  );
}

function ProfileModal({ visible, title, onClose, onSave, saving, children }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={reportStyles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={reportStyles.modalSheet}>
          <View style={reportStyles.modalHeader}>
            <Text style={reportStyles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color="#64748b" />
            </Pressable>
          </View>
          <ScrollView
            style={reportStyles.modalBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          <Pressable
            style={[reportStyles.modalSaveBtn, saving && reportStyles.btnDisabled]}
            onPress={onSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={reportStyles.modalSaveBtnText}>Save</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ProfileField({ label, value, onChangeText, placeholder, keyboardType, multiline, secureTextEntry }) {
  return (
    <View style={reportStyles.modalField}>
      <Text style={reportStyles.modalFieldLabel}>{label}</Text>
      <TextInput
        style={[reportStyles.modalInput, multiline && reportStyles.modalInputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        keyboardType={keyboardType}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}

function ProfileInfoRow({ icon, label, value, onPress, isLast }) {
  return (
    <Pressable
      style={[reportStyles.profileInfoRow, isLast && reportStyles.profileInfoRowLast]}
      onPress={onPress}
    >
      <View style={reportStyles.profileInfoIconBox}>
        <Ionicons name={icon} size={18} color="#2563eb" />
      </View>
      <View style={reportStyles.profileInfoContent}>
        <Text style={reportStyles.profileInfoLabel}>{label}</Text>
        <Text style={reportStyles.profileInfoValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
    </Pressable>
  );
}

function SettingsRow({ icon, iconColor, iconBg, title, subtitle, onPress, isLast, titleColor }) {
  return (
    <Pressable
      style={[reportStyles.settingsRow, isLast && reportStyles.settingsRowLast]}
      onPress={onPress}
    >
      <View style={[reportStyles.settingsIconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={reportStyles.settingsRowText}>
        <Text style={[reportStyles.settingsRowTitle, titleColor && { color: titleColor }]}>
          {title}
        </Text>
        <Text style={reportStyles.settingsRowSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
    </Pressable>
  );
}

function EmergencyCtaCard({ onReportNow }) {
  return (
    <View style={reportStyles.emergencyCtaCard}>
      <View style={reportStyles.emergencyCtaSos}>
        <Text style={reportStyles.emergencyCtaSosText}>SOS</Text>
      </View>
      <View style={reportStyles.emergencyCtaCopy}>
        <Text style={reportStyles.emergencyCtaTitle}>In an Emergency?</Text>
        <Text style={reportStyles.emergencyCtaSubtitle}>
          Quickly report an emergency and get help from responders.
        </Text>
      </View>
      <Pressable style={reportStyles.emergencyCtaBtn} onPress={onReportNow}>
        <Text style={reportStyles.emergencyCtaBtnText}>Report Now</Text>
        <Ionicons name="chevron-forward" size={14} color="#ffffff" />
      </Pressable>
    </View>
  );
}

function ProfileTab({
  username,
  profileFullName,
  profileEmail,
  profileContact,
  profileAddress,
  emergencyContactName,
  emergencyContactNumber,
  emergencyContactRelationship,
  profileLoading,
  profileSaving,
  onSaveProfile,
  onChangePassword,
  onLogout,
  onReportNow,
  scrollBottomPadding,
}) {
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [emergencyContactsVisible, setEmergencyContactsVisible] = useState(false);
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);

  const [draftFullName, setDraftFullName] = useState("");
  const [draftContact, setDraftContact] = useState("");
  const [draftAddress, setDraftAddress] = useState("");

  const [draftEmergencyName, setDraftEmergencyName] = useState("");
  const [draftEmergencyNumber, setDraftEmergencyNumber] = useState("");
  const [draftEmergencyRelationship, setDraftEmergencyRelationship] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const displayName = profileFullName?.trim() || username || "Citizen User";
  const email = displayOrNotSet(profileEmail);
  const contactNumber = displayOrNotSet(profileContact);
  const homeAddress = displayOrNotSet(profileAddress);
  const emergencyName = displayOrNotSet(emergencyContactName);
  const emergencyNumber = displayOrNotSet(emergencyContactNumber);

  function openEditProfile() {
    setDraftFullName(profileFullName || "");
    setDraftContact(profileContact || "");
    setDraftAddress(profileAddress || "");
    setEditProfileVisible(true);
  }

  function openEmergencyContacts() {
    setDraftEmergencyName(emergencyContactName || "");
    setDraftEmergencyNumber(emergencyContactNumber || "");
    setDraftEmergencyRelationship(emergencyContactRelationship || "");
    setEmergencyContactsVisible(true);
  }

  function openChangePassword() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setChangePasswordVisible(true);
  }

  function closeChangePassword() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setChangePasswordVisible(false);
  }

  async function handleSaveEditProfile() {
    if (!draftFullName.trim()) {
      Alert.alert("Validation", "Full name is required.");
      return;
    }
    try {
      await onSaveProfile({
        full_name: draftFullName.trim(),
        contact_number: draftContact.trim(),
        home_address: draftAddress.trim(),
      });
      setEditProfileVisible(false);
    } catch {
      // Error alert handled in parent
    }
  }

  async function handleSaveEmergencyContacts() {
    if (!draftEmergencyName.trim() || !draftEmergencyNumber.trim()) {
      Alert.alert("Validation", "Emergency contact name and number are required.");
      return;
    }
    try {
      await onSaveProfile(
        {
          emergency_contact_name: draftEmergencyName.trim(),
          emergency_contact_number: draftEmergencyNumber.trim(),
          emergency_contact_relationship: draftEmergencyRelationship.trim(),
        },
        "Emergency contact updated",
        "Your emergency contact has been saved."
      );
      setEmergencyContactsVisible(false);
    } catch {
      // Error alert handled in parent
    }
  }

  async function handleSavePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Validation", "All password fields are required.");
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert("Validation", "New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Validation", "New password and confirmation do not match.");
      return;
    }
    try {
      await onChangePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      closeChangePassword();
    } catch {
      // Error alert handled in parent
    }
  }

  return (
    <>
      <ScrollView
        style={reportStyles.flex}
        contentContainerStyle={[
          reportStyles.profileScroll,
          { paddingBottom: scrollBottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {profileLoading ? (
          <View style={reportStyles.profileLoadingBanner}>
            <ActivityIndicator size="small" color="#2563eb" />
            <Text style={reportStyles.profileLoadingText}>Loading profile...</Text>
          </View>
        ) : null}

        <Pressable style={reportStyles.profileSummaryCard} onPress={openEditProfile}>
          <View style={reportStyles.profileAvatarWrap}>
            <View style={reportStyles.profileAvatar}>
              <MaterialCommunityIcons name="shield-account" size={36} color="#2563eb" />
            </View>
            <View style={reportStyles.profileVerifiedBadge}>
              <Ionicons name="checkmark" size={10} color="#ffffff" />
            </View>
          </View>
          <View style={reportStyles.profileSummaryText}>
            <Text style={reportStyles.profileName}>{displayName}</Text>
            <Text style={reportStyles.profileUsername}>@{username}</Text>
            <View style={reportStyles.profileMetaLine}>
              <Ionicons name="mail-outline" size={14} color="#64748b" />
              <Text style={reportStyles.profileMetaText}>{email}</Text>
            </View>
            <View style={reportStyles.profileMetaLine}>
              <Ionicons name="call-outline" size={14} color="#64748b" />
              <Text style={reportStyles.profileMetaText}>{contactNumber}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
        </Pressable>

        <Text style={reportStyles.profileSectionTitle}>EMERGENCY INFORMATION</Text>
        <View style={reportStyles.profileCard}>
          <ProfileInfoRow
            icon="call-outline"
            label="Contact Number"
            value={contactNumber}
            onPress={openEditProfile}
          />
          <ProfileInfoRow
            icon="location-outline"
            label="Home Address"
            value={homeAddress}
            onPress={openEditProfile}
          />
          <ProfileInfoRow
            icon="people-outline"
            label="Emergency Contact"
            value={emergencyName}
            onPress={openEmergencyContacts}
          />
          <ProfileInfoRow
            icon="call"
            label="Emergency Contact Number"
            value={emergencyNumber}
            onPress={openEmergencyContacts}
            isLast
          />
        </View>

        <Text style={reportStyles.profileSectionTitle}>ACCOUNT & SETTINGS</Text>
        <View style={reportStyles.profileCard}>
          <SettingsRow
            icon="person-outline"
            iconColor="#2563eb"
            iconBg="#eff6ff"
            title="Edit Profile"
            subtitle="Update your personal information"
            onPress={openEditProfile}
          />
          <SettingsRow
            icon="lock-closed-outline"
            iconColor="#ea580c"
            iconBg="#fff7ed"
            title="Change Password"
            subtitle="Update your account password"
            onPress={openChangePassword}
          />
          <SettingsRow
            icon="people-outline"
            iconColor="#16a34a"
            iconBg="#f0fdf4"
            title="Emergency Contacts"
            subtitle="Manage your emergency contacts"
            onPress={openEmergencyContacts}
          />
          <SettingsRow
            icon="log-out-outline"
            iconColor="#ef4444"
            iconBg="#fef2f2"
            title="Logout"
            subtitle="Sign out from your account"
            titleColor="#ef4444"
            onPress={onLogout}
            isLast
          />
        </View>

        <EmergencyCtaCard onReportNow={onReportNow} />
      </ScrollView>

      <ProfileModal
        visible={editProfileVisible}
        title="Edit Profile"
        onClose={() => setEditProfileVisible(false)}
        onSave={handleSaveEditProfile}
        saving={profileSaving}
      >
        <ProfileField
          label="Full Name"
          value={draftFullName}
          onChangeText={setDraftFullName}
          placeholder="Citizen User"
        />
        <ProfileField
          label="Contact Number"
          value={draftContact}
          onChangeText={setDraftContact}
          placeholder="09XX XXX XXXX"
          keyboardType="phone-pad"
        />
        <ProfileField
          label="Home Address"
          value={draftAddress}
          onChangeText={setDraftAddress}
          placeholder="Street, barangay, city"
          multiline
        />
        <Text style={reportStyles.modalHint}>Email: {email} (read-only)</Text>
      </ProfileModal>

      <ProfileModal
        visible={emergencyContactsVisible}
        title="Emergency Contacts"
        onClose={() => setEmergencyContactsVisible(false)}
        onSave={handleSaveEmergencyContacts}
        saving={profileSaving}
      >
        <ProfileField
          label="Emergency Contact Name"
          value={draftEmergencyName}
          onChangeText={setDraftEmergencyName}
          placeholder="Juan Dela Cruz"
        />
        <ProfileField
          label="Emergency Contact Number"
          value={draftEmergencyNumber}
          onChangeText={setDraftEmergencyNumber}
          placeholder="09XX XXX XXXX"
          keyboardType="phone-pad"
        />
        <ProfileField
          label="Relationship"
          value={draftEmergencyRelationship}
          onChangeText={setDraftEmergencyRelationship}
          placeholder="Spouse, parent, sibling"
        />
      </ProfileModal>

      <ProfileModal
        visible={changePasswordVisible}
        title="Change Password"
        onClose={closeChangePassword}
        onSave={handleSavePassword}
        saving={profileSaving}
      >
        <ProfileField
          label="Current Password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder="Enter current password"
          secureTextEntry
        />
        <ProfileField
          label="New Password"
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="At least 8 characters"
          secureTextEntry
        />
        <ProfileField
          label="Confirm New Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Re-enter new password"
          secureTextEntry
        />
      </ProfileModal>
    </>
  );
}

function PlaceholderTab({ title, message }) {
  return (
    <View style={reportStyles.placeholderTab}>
      <Ionicons name="construct-outline" size={48} color="#94a3b8" />
      <Text style={reportStyles.placeholderTitle}>{title}</Text>
      <Text style={reportStyles.placeholderMessage}>{message}</Text>
    </View>
  );
}

function ReportScreen({
  access,
  reportRefreshKey,
  username,
  description,
  contact,
  address,
  latitude,
  longitude,
  image,
  profileFullName,
  profileEmail,
  profileContact,
  profileAddress,
  emergencyContactName,
  emergencyContactNumber,
  emergencyContactRelationship,
  profileLoading,
  profileSaving,
  onSaveProfile,
  onChangePassword,
  onDescriptionChange,
  onContactChange,
  onAddressChange,
  onLatitudeChange,
  onLongitudeChange,
  onTakePhoto,
  onPickFromGallery,
  onGetLocation,
  onSubmit,
  onLogout,
  submitBusy,
  locBusy,
  accountNotice = "",
}) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState("report");
  const hasCoords = parseCoordinate(latitude) != null && parseCoordinate(longitude) != null;
  const scrollBottomPadding = SCROLL_BOTTOM_BASE_PADDING + insets.bottom;
  const headerPaddingTop = insets.top + 10;

  function handleDescriptionChange(text) {
    if (text.length <= DESCRIPTION_MAX) {
      onDescriptionChange(text);
    }
  }

  return (
    <View style={reportStyles.flex}>
      <KeyboardAvoidingView
        style={reportStyles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <ReportHeader
          username={username}
          onLogout={onLogout}
          submitBusy={submitBusy}
          paddingTop={headerPaddingTop}
        />

        {accountNotice ? (
          <View style={reportStyles.accountNoticeBanner}>
            <Text style={reportStyles.accountNoticeText}>{accountNotice}</Text>
          </View>
        ) : null}

        {activeTab === "report" ? (
          <ScrollView
            style={reportStyles.flex}
            contentContainerStyle={[
              reportStyles.scrollContent,
              { paddingBottom: scrollBottomPadding },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <View style={reportStyles.mainCard}>
            <Text style={reportStyles.cardTitle}>INCIDENT REPORT DETAILS</Text>

            <View style={reportStyles.fieldBlock}>
              <Text style={reportStyles.fieldLabel}>
                Emergency description <Text style={reportStyles.required}>*</Text>
              </Text>
              <View style={reportStyles.descInputWrap}>
                <MaterialCommunityIcons
                  name="bullhorn-outline"
                  size={22}
                  color="#ef4444"
                  style={reportStyles.descIcon}
                />
                <TextInput
                  style={reportStyles.descInput}
                  multiline
                  placeholder="Describe what happened, who is affected, and any immediate danger..."
                  placeholderTextColor="#94a3b8"
                  value={description}
                  onChangeText={handleDescriptionChange}
                  textAlignVertical="top"
                  maxLength={DESCRIPTION_MAX}
                />
              </View>
              <Text style={reportStyles.charCounter}>
                {description.length} / {DESCRIPTION_MAX}
              </Text>
            </View>

            <View style={reportStyles.fieldBlock}>
              <Text style={reportStyles.fieldLabel}>
                Contact number <Text style={reportStyles.required}>*</Text>
              </Text>
              <View style={reportStyles.phoneRow}>
                <View style={reportStyles.phonePrefix}>
                  <Text style={reportStyles.flagEmoji}>🇵🇭</Text>
                  <Text style={reportStyles.phoneCode}>+63</Text>
                </View>
                <View style={reportStyles.phoneInputWrap}>
                  <Ionicons name="call-outline" size={18} color="#64748b" style={reportStyles.phoneIcon} />
                  <TextInput
                    style={reportStyles.phoneInput}
                    placeholder="9XX XXX XXXX"
                    placeholderTextColor="#94a3b8"
                    keyboardType="phone-pad"
                    value={contact}
                    onChangeText={onContactChange}
                  />
                </View>
              </View>
            </View>

            <View style={reportStyles.fieldBlock}>
              <View style={reportStyles.addressRow}>
                <View style={reportStyles.addressInputWrap}>
                  <Text style={reportStyles.fieldLabel}>Address (optional)</Text>
                  <TextInput
                    style={reportStyles.input}
                    placeholder="Street, barangay, landmark"
                    placeholderTextColor="#94a3b8"
                    value={address}
                    onChangeText={onAddressChange}
                  />
                </View>
                <Pressable
                  style={[reportStyles.mapPickBtn, locBusy && reportStyles.btnDisabled]}
                  onPress={onGetLocation}
                  disabled={locBusy || submitBusy}
                >
                  {/* UI placeholder: full map picker not yet implemented — uses GPS for now */}
                  <Ionicons name="map-outline" size={18} color="#ffffff" />
                  <Text style={reportStyles.mapPickBtnText}>
                    {locBusy ? "…" : "Pick on Map"}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={reportStyles.fieldBlock}>
              <Text style={reportStyles.fieldLabel}>
                Location coordinates <Text style={reportStyles.required}>*</Text>
              </Text>
              <View style={reportStyles.coordRow}>
                <View style={reportStyles.coordField}>
                  <Text style={reportStyles.coordLabel}>Latitude</Text>
                  <TextInput
                    style={reportStyles.input}
                    placeholder="10.7999"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    value={latitude}
                    onChangeText={onLatitudeChange}
                  />
                </View>
                <View style={reportStyles.coordField}>
                  <Text style={reportStyles.coordLabel}>Longitude</Text>
                  <TextInput
                    style={reportStyles.input}
                    placeholder="122.9740"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    value={longitude}
                    onChangeText={onLongitudeChange}
                  />
                </View>
              </View>
              <Text style={hasCoords ? reportStyles.helperOk : reportStyles.helperWarn}>
                {hasCoords ? "GPS coordinates captured" : "Coordinates required before submitting"}
              </Text>
            </View>

            <View style={reportStyles.fieldBlock}>
              <Text style={reportStyles.fieldLabel}>Map View</Text>
              <MapPreview
                latitude={latitude}
                longitude={longitude}
                onRecenter={onGetLocation}
                locBusy={locBusy}
              />
            </View>

            <View style={reportStyles.fieldBlock}>
              <Text style={reportStyles.fieldLabel}>Photos & Evidence</Text>
              <PhotoEvidenceGrid
                image={image}
                onTakePhoto={onTakePhoto}
                onPickFromGallery={onPickFromGallery}
                submitBusy={submitBusy}
              />
            </View>

            <Pressable
              style={[reportStyles.submitWrap, submitBusy && reportStyles.btnDisabled]}
              onPress={onSubmit}
              disabled={submitBusy}
            >
              <LinearGradient
                colors={["#ef4444", "#f97316"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={reportStyles.submitBtn}
              >
                <Text style={reportStyles.submitBtnText}>
                  {submitBusy ? "SUBMITTING…" : "SUBMIT EMERGENCY"}
                </Text>
              </LinearGradient>
            </Pressable>

            <Text style={reportStyles.termsText}>
              By submitting, you agree to the Terms and Privacy Policy for emergency instruction,
              detection, and high-stress situations.
            </Text>
          </View>
        </ScrollView>
      ) : null}

      {activeTab === "reports" ? (
        <MyReportsTab
          access={access}
          scrollBottomPadding={scrollBottomPadding}
          refreshKey={reportRefreshKey}
          isActive={activeTab === "reports"}
          onCreateReport={() => setActiveTab("report")}
        />
      ) : null}

      {activeTab === "profile" ? (
        <ProfileTab
          username={username}
          profileFullName={profileFullName}
          profileEmail={profileEmail}
          profileContact={profileContact}
          profileAddress={profileAddress}
          emergencyContactName={emergencyContactName}
          emergencyContactNumber={emergencyContactNumber}
          emergencyContactRelationship={emergencyContactRelationship}
          profileLoading={profileLoading}
          profileSaving={profileSaving}
          onSaveProfile={onSaveProfile}
          onChangePassword={onChangePassword}
          onLogout={onLogout}
          onReportNow={() => setActiveTab("report")}
          scrollBottomPadding={scrollBottomPadding}
        />
      ) : null}
      </KeyboardAvoidingView>

      <BottomTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

export default function App() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [access, setAccess] = useState("");
  const [refresh, setRefresh] = useState("");
  const [staySignedIn, setStaySignedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [registerVisible, setRegisterVisible] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [image, setImage] = useState(null);
  const [signingIn, setSigningIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [reportRefreshKey, setReportRefreshKey] = useState(0);
  const [profileFullName, setProfileFullName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileContact, setProfileContact] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactNumber, setEmergencyContactNumber] = useState("");
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [accountNotice, setAccountNotice] = useState("");

  function applyProfileData(profile) {
    if (!profile) return;
    setProfileFullName(profile.full_name || "");
    setProfileEmail(profile.email || "");
    setProfileContact(profile.contact_number || "");
    setProfileAddress(profile.home_address || "");
    setEmergencyContactName(profile.emergency_contact_name || "");
    setEmergencyContactNumber(profile.emergency_contact_number || "");
    setEmergencyContactRelationship(profile.emergency_contact_relationship || "");
    setAccountNotice(profile.account_notice || "");
  }

  function syncReportFieldsFromProfile(profile) {
    if (!profile) return;
    if (hasProfileValue(profile.home_address)) {
      setAddress(String(profile.home_address).trim());
      if (hasProfileValue(profile.contact_number)) {
        setContact(String(profile.contact_number).trim());
      }
    }
  }

  function clearProfileState() {
    setProfileFullName("");
    setProfileEmail("");
    setProfileContact("");
    setProfileAddress("");
    setEmergencyContactName("");
    setEmergencyContactNumber("");
    setEmergencyContactRelationship("");
    setAccountNotice("");
  }

  async function loadProfile(accessToken) {
    setProfileLoading(true);
    try {
      const profile = await fetchProfile(accessToken);
      applyProfileData(profile);
      syncReportFieldsFromProfile(profile);
    } catch (error) {
      Alert.alert("Profile", error.message || "Unable to load profile.");
    } finally {
      setProfileLoading(false);
    }
  }

  async function handleSaveProfile(payload, alertTitle = "Profile updated", alertMessage = "Your profile has been saved.") {
    if (!access) {
      Alert.alert("Login required", "Please login again.");
      return;
    }
    setProfileSaving(true);
    try {
      const profile = await updateProfile(access, payload);
      applyProfileData(profile);
      setContact(hasProfileValue(profile.contact_number) ? String(profile.contact_number).trim() : "");
      setAddress(hasProfileValue(profile.home_address) ? String(profile.home_address).trim() : "");
      Alert.alert(alertTitle, alertMessage);
    } catch (error) {
      Alert.alert("Save failed", error.message || "Unable to save profile.");
      throw error;
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword(payload) {
    if (!access) {
      Alert.alert("Login required", "Please login again.");
      return;
    }
    setProfileSaving(true);
    try {
      await changePassword(access, payload);
      Alert.alert("Password changed successfully", "Please login again.");
      handleLogout();
    } catch (error) {
      Alert.alert("Password change failed", error.message || "Unable to change password.");
      throw error;
    } finally {
      setProfileSaving(false);
    }
  }

  function clearReportForm() {
    setDescription("");
    setContact("");
    setAddress("");
    setLatitude("");
    setLongitude("");
    setImage(null);
  }

  useEffect(() => {
    let active = true;

    async function bootstrapSession() {
      try {
        const session = await restoreSession();
        if (!active) return;
        if (session?.access) {
          setAccess(session.access);
          setRefresh(session.refresh || "");
          setStaySignedIn(true);
          if (session.username) {
            setUsername(session.username);
          }
          await loadProfile(session.access);
        }
      } catch {
        if (active) {
          await clearSavedSession();
        }
      } finally {
        if (active) {
          setCheckingSession(false);
        }
      }
    }

    bootstrapSession();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    setAccess("");
    setRefresh("");
    setPassword("");
    setLoginSuccess("");
    setLoginError("");
    clearReportForm();
    clearProfileState();
    await clearSavedSession();
  }

  async function handleLogin() {
    setLoginError("");
    setLoginSuccess("");
    setSigningIn(true);
    try {
      const data = await apiLogin(username, password);
      setAccess(data.access);
      setRefresh(data.refresh || "");
      setPassword("");

      if (staySignedIn) {
        await saveSession(data.access, data.refresh || "", username.trim());
      } else {
        await clearSavedSession();
      }

      const notice = data.user?.account_notice || "";
      setAccountNotice(notice);
      if (notice) {
        Alert.alert("Account restricted", notice);
      }

      await loadProfile(data.access);
    } catch (error) {
      setLoginError(error.message);
      Alert.alert("Login error", error.message);
    } finally {
      setSigningIn(false);
    }
  }

  function fillDemoCredentials() {
    setUsername("citizen");
    setPassword("citizen1234");
    setLoginError("");
    setLoginSuccess("");
  }

  function handleRegistered(newUsername) {
    setRegisterVisible(false);
    setPassword("");
    setLoginError("");
    setLoginSuccess("Account created. Please sign in.");
    if (newUsername) {
      setUsername(newUsername);
    }
  }

  function handleUsernameChange(value) {
    setUsername(value);
    if (loginSuccess) {
      setLoginSuccess("");
    }
  }

  function handlePasswordChange(value) {
    setPassword(value);
    if (loginSuccess) {
      setLoginSuccess("");
    }
  }

  async function pickImageFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow photo access.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (!result.canceled && result.assets?.length) {
      const asset = result.assets[0];
      const imageError = validateSelectedImage(asset);
      if (imageError) {
        Alert.alert("Invalid image", imageError);
        return;
      }
      setImage(asset);
    }
  }

  async function takePhotoWithCamera() {
    if (Platform.OS === "web") {
      Alert.alert(
        "Camera unavailable",
        "Taking photos with the camera is not supported in the web browser. Please choose from gallery or use the RescueLink app on a phone."
      );
      return;
    }

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Camera permission is required to take emergency photos.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (!result.canceled && result.assets?.length) {
      const asset = result.assets[0];
      const imageError = validateSelectedImage(asset);
      if (imageError) {
        Alert.alert("Invalid image", imageError);
        return;
      }
      setImage(asset);
    }
  }

  async function getCurrentLocation() {
    try {
      setLocBusy(true);
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Please allow location access.");
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setLatitude(String(location.coords.latitude));
      setLongitude(String(location.coords.longitude));
    } catch (error) {
      Alert.alert("Location error", error.message || "Could not get GPS location.");
    } finally {
      setLocBusy(false);
    }
  }

  async function submitReport() {
    if (!access) {
      Alert.alert("Login required", "Please login first.");
      return;
    }

    if (!description || !contact || !latitude || !longitude) {
      Alert.alert("Missing fields", "Description, contact, and coordinates are required.");
      return;
    }

    try {
      setSubmitBusy(true);
      const form = new FormData();
      form.append("emergency_description", description);
      form.append("contact_number", contact);
      form.append("latitude", latitude);
      form.append("longitude", longitude);
      form.append("address_text", address);

      if (image?.uri) {
        const imageError = validateSelectedImage(image);
        if (imageError) {
          Alert.alert("Invalid image", imageError);
          return;
        }
        form.append("image", {
          uri: image.uri,
          name: `emergency-${Date.now()}.jpg`,
          type: image.mimeType || "image/jpeg",
        });
      }

      const res = await fetch(`${API_BASE_URL}/reports/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access}`,
          ...NGROK_HEADERS,
        },
        body: form,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error(RATE_LIMIT_MESSAGE);
        }
        throw new Error(formatApiError(data, res.status));
      }

      clearReportForm();
      setReportRefreshKey((key) => key + 1);
      const successMessage = data.citizen_notice
        ? data.citizen_notice
        : `Emergency report #${data.id} submitted.`;
      Alert.alert("Submitted", successMessage);
    } catch (error) {
      Alert.alert("Submit error", error.message);
    } finally {
      setSubmitBusy(false);
    }
  }

  return (
    <SafeAreaProvider>
      {checkingSession ? (
        <SafeAreaView style={loginStyles.safe} edges={["top", "bottom", "left", "right"]}>
          <StatusBar style="light" />
          <LinearGradient colors={["#071426", "#0b2a4a", "#0a2238"]} style={loginStyles.gradient}>
            <View style={loginStyles.sessionLoading}>
              <ActivityIndicator size="large" color="#60a5fa" />
              <Text style={loginStyles.sessionLoadingText}>Checking session...</Text>
            </View>
          </LinearGradient>
        </SafeAreaView>
      ) : !access ? (
        <SafeAreaView style={loginStyles.safe} edges={["top", "bottom", "left", "right"]}>
          <StatusBar style="light" />
          <LoginScreen
            username={username}
            password={password}
            onUsernameChange={handleUsernameChange}
            onPasswordChange={handlePasswordChange}
            onLogin={handleLogin}
            onFillDemo={fillDemoCredentials}
            onCreateAccount={() => setRegisterVisible(true)}
            staySignedIn={staySignedIn}
            onStaySignedInChange={setStaySignedIn}
            busy={signingIn}
            errorMessage={loginError}
            successMessage={loginSuccess}
          />
          <RegisterModal
            visible={registerVisible}
            onClose={() => setRegisterVisible(false)}
            onRegistered={handleRegistered}
          />
        </SafeAreaView>
      ) : (
        <View style={reportStyles.safe}>
          <StatusBar style="dark" />
          <ReportScreen
            access={access}
            reportRefreshKey={reportRefreshKey}
            username={username}
            description={description}
            contact={contact}
            address={address}
            latitude={latitude}
            longitude={longitude}
            image={image}
            profileFullName={profileFullName}
            profileEmail={profileEmail}
            profileContact={profileContact}
            profileAddress={profileAddress}
            emergencyContactName={emergencyContactName}
            emergencyContactNumber={emergencyContactNumber}
            emergencyContactRelationship={emergencyContactRelationship}
            profileLoading={profileLoading}
            profileSaving={profileSaving}
            onSaveProfile={handleSaveProfile}
            onChangePassword={handleChangePassword}
            onDescriptionChange={setDescription}
            onContactChange={setContact}
            onAddressChange={setAddress}
            onLatitudeChange={setLatitude}
            onLongitudeChange={setLongitude}
            onTakePhoto={takePhotoWithCamera}
            onPickFromGallery={pickImageFromGallery}
            onGetLocation={getCurrentLocation}
            onSubmit={submitReport}
            onLogout={handleLogout}
            submitBusy={submitBusy}
            locBusy={locBusy}
            accountNotice={accountNotice}
          />
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  bgDecor: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  bgBlob: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.35,
  },
  bgBlobRed: {
    width: 220,
    height: 220,
    top: -40,
    right: -50,
    backgroundColor: "#fecaca",
  },
  bgBlobBlue: {
    width: 180,
    height: 180,
    bottom: 80,
    left: -40,
    backgroundColor: "#dbeafe",
  },
  bgBlobOrange: {
    width: 140,
    height: 140,
    top: "40%",
    right: "10%",
    backgroundColor: "#fed7aa",
  },
  headerBlock: {
    marginBottom: 24,
    alignItems: "center",
  },
  headerBlockCompact: {
    marginBottom: 16,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    alignItems: "center",
    justifyContent: "center",
  },
  logoMarkText: {
    color: "#dc2626",
    fontSize: 18,
    fontWeight: "800",
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    marginTop: 8,
    fontSize: 15,
    color: "#64748b",
    textAlign: "center",
  },
  loginScroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 32,
  },
  reportScroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  reportTopBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  reportTopBarMain: {
    marginBottom: 10,
  },
  reportTopTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
  },
  reportTopSubtitle: {
    marginTop: 2,
    fontSize: 14,
    color: "#64748b",
    fontWeight: "500",
  },
  reportTopActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#16a34a",
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#15803d",
  },
  userBadge: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
  },
  logoutBtn: {
    marginLeft: "auto",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
  },
  logoutBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563eb",
  },
  readyBanner: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  readyBannerText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#166534",
    textAlign: "center",
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  cardHint: {
    marginTop: -6,
    fontSize: 13,
    color: "#64748b",
    lineHeight: 18,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  input: {
    borderColor: "#cbd5e1",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 12,
    backgroundColor: "#fff",
    fontSize: 16,
    color: "#0f172a",
  },
  textArea: {
    minHeight: 110,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  halfInput: {
    flex: 1,
  },
  helperOk: {
    fontSize: 12,
    fontWeight: "600",
    color: "#16a34a",
  },
  helperWarn: {
    fontSize: 12,
    fontWeight: "600",
    color: "#d97706",
  },
  helperMuted: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 17,
  },
  btnPrimary: {
    marginTop: 4,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 15,
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  btnSecondary: {
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  btnSecondaryText: {
    color: "#2563eb",
    fontWeight: "600",
    fontSize: 15,
  },
  btnEmergency: {
    marginTop: 4,
    backgroundColor: "#dc2626",
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 16,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  btnEmergencyText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 0.3,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  previewWrap: {
    gap: 8,
  },
  preview: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
  },
  previewCaption: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
  },
  footerNote: {
    marginTop: 20,
    textAlign: "center",
    fontSize: 13,
    color: "#94a3b8",
  },
});

const loginStyles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: "#071426",
  },
  gradient: {
    flex: 1,
  },
  networkPattern: {
    ...StyleSheet.absoluteFillObject,
  },
  networkDot: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#60a5fa",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 32,
  },
  brandBlock: {
    alignItems: "center",
    marginBottom: 28,
    marginTop: 8,
  },
  logoShield: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  logoCross: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    fontSize: 34,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    marginTop: 8,
    fontSize: 15,
    color: "#cbd5e1",
    textAlign: "center",
    paddingHorizontal: 12,
  },
  glassCard: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 24,
    padding: 22,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 10,
  },
  cardTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.5,
  },
  cardHint: {
    marginTop: -4,
    fontSize: 14,
    lineHeight: 20,
    color: "#cbd5e1",
  },
  errorBanner: {
    padding: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.15)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    color: "#fecaca",
    fontSize: 13,
    fontWeight: "600",
  },
  successBanner: {
    padding: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(34,197,94,0.15)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.35)",
    color: "#bbf7d0",
    fontSize: 13,
    fontWeight: "600",
  },
  inputField: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#e2e8f0",
    marginLeft: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 54,
  },
  inputIcon: {
    marginRight: 10,
  },
  inputControl: {
    flex: 1,
    color: "#ffffff",
    fontSize: 16,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
  },
  formRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  staySignedIn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  staySignedInText: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "500",
  },
  forgotLink: {
    color: "#60a5fa",
    fontSize: 14,
    fontWeight: "600",
  },
  signInBtn: {
    marginTop: 4,
    backgroundColor: "#2563eb",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 16,
    elevation: 8,
  },
  signInBtnText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  createAccountRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  createAccountText: {
    color: "#cbd5e1",
    fontSize: 14,
  },
  createAccountLink: {
    color: "#60a5fa",
    fontSize: 14,
    fontWeight: "700",
  },
  demoWrap: {
    marginTop: 18,
    alignItems: "center",
    paddingVertical: 8,
  },
  demoLink: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  sessionLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  sessionLoadingText: {
    color: "#cbd5e1",
    fontSize: 16,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(7,20,38,0.92)",
    paddingHorizontal: 22,
    paddingVertical: Platform.OS === "ios" ? 48 : 24,
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 12,
  },
  cancelBtn: {
    marginTop: 4,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  cancelBtnText: {
    color: "#94a3b8",
    fontSize: 15,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.65,
  },
});

const reportStyles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  accountNoticeBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#f59e0b",
  },
  accountNoticeText: {
    color: "#92400e",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  safe: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  headerWrap: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    overflow: "hidden",
  },
  headerPattern: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
  },
  headerPatternDot: {
    position: "absolute",
    width: 3,
    height: 3,
    borderRadius: 999,
    backgroundColor: "#cbd5e1",
  },
  headerContent: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  headerLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    alignItems: "center",
    justifyContent: "center",
  },
  headerBrandText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: 0.6,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  loggedInBadge: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  loggedInText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#15803d",
  },
  logoutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  logoutBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563eb",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  mainCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    gap: 18,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: 0.8,
  },
  fieldBlock: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  required: {
    color: "#ef4444",
  },
  descInputWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 120,
  },
  descIcon: {
    marginTop: 4,
    marginRight: 8,
  },
  descInput: {
    flex: 1,
    fontSize: 15,
    color: "#0f172a",
    lineHeight: 22,
    minHeight: 100,
  },
  charCounter: {
    alignSelf: "flex-end",
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  phoneRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
  },
  phonePrefix: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    backgroundColor: "#f8fafc",
  },
  flagEmoji: {
    fontSize: 20,
  },
  phoneCode: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  phoneInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
  },
  phoneIcon: {
    marginRight: 8,
  },
  phoneInput: {
    flex: 1,
    fontSize: 15,
    color: "#0f172a",
    paddingVertical: Platform.OS === "ios" ? 14 : 12,
  },
  addressRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-end",
  },
  addressInputWrap: {
    flex: 1,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 12,
    fontSize: 15,
    color: "#0f172a",
  },
  mapPickBtn: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  mapPickBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  coordRow: {
    flexDirection: "row",
    gap: 10,
  },
  coordField: {
    flex: 1,
    gap: 6,
  },
  coordLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  helperOk: {
    fontSize: 12,
    fontWeight: "600",
    color: "#16a34a",
  },
  helperWarn: {
    fontSize: 12,
    fontWeight: "600",
    color: "#d97706",
  },
  mapPreview: {
    height: 230,
    borderRadius: 16,
    backgroundColor: "#e2e8f0",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  mapPlaceholderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(248, 250, 252, 0.82)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    zIndex: 1,
  },
  mapPlaceholderIcon: {
    marginBottom: 8,
  },
  mapPlaceholderText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
    textAlign: "center",
    lineHeight: 20,
  },
  mapGridLineH: {
    position: "absolute",
    top: "45%",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#cbd5e1",
  },
  mapGridLineV: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "#cbd5e1",
  },
  mapRadiusCircle: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(37, 99, 235, 0.45)",
    backgroundColor: "rgba(37, 99, 235, 0.12)",
  },
  mapPin: {
    zIndex: 2,
  },
  mapRecenterBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  mapHintBubble: {
    position: "absolute",
    bottom: 12,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    zIndex: 2,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  mapHintText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  photoGrid: {
    flexDirection: "row",
    gap: 10,
  },
  photoEvidenceBlock: {
    gap: 12,
  },
  photoPreviewWrap: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  photoPreviewImage: {
    width: "100%",
    aspectRatio: 16 / 10,
    backgroundColor: "#e2e8f0",
  },
  photoPreviewPlaceholder: {
    width: "100%",
    aspectRatio: 16 / 10,
    gap: 8,
  },
  photoPreviewPlaceholderText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94a3b8",
  },
  photoActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  photoActionBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  photoActionBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563eb",
  },
  photoSlot: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  photoSlotEmpty: {
    borderStyle: "dashed",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  submitWrap: {
    marginTop: 4,
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  submitBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    borderRadius: 999,
  },
  submitBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  termsText: {
    fontSize: 11,
    lineHeight: 16,
    color: "#64748b",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    paddingTop: 8,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
    textAlign: "center",
  },
  tabLabelActive: {
    color: "#2563eb",
    fontWeight: "700",
  },
  myReportsScroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },
  myReportsScrollEmpty: {
    flexGrow: 1,
  },
  myReportsHeaderBlock: {
    gap: 10,
    marginBottom: 4,
  },
  myReportsTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: 0.8,
  },
  myReportsSubtitle: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 4,
  },
  filterChipRow: {
    gap: 8,
    paddingBottom: 4,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  filterChipActive: {
    backgroundColor: "#eff6ff",
    borderColor: "#2563eb",
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  filterChipTextActive: {
    color: "#2563eb",
  },
  myReportsStateBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 10,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  myReportsStateTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
  },
  myReportsStateText: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
  },
  myReportsRetryBtn: {
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#2563eb",
  },
  myReportsRetryBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  myReportsCreateBtn: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#ef4444",
  },
  myReportsCreateBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  myReportCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    gap: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  reportLocationTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  reportAddressLine: {
    fontSize: 13,
    color: "#64748b",
    lineHeight: 18,
    marginTop: -4,
  },
  reportCardMapWrap: {
    height: 150,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#e2e8f0",
    position: "relative",
  },
  reportCardMap: {
    ...StyleSheet.absoluteFillObject,
  },
  reportCardMapFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#f1f5f9",
  },
  reportCardMapFallbackText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
  },
  viewDetailsBtn: {
    position: "absolute",
    right: 10,
    bottom: 10,
    backgroundColor: "#2563eb",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 2,
  },
  viewDetailsBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  myReportCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  reportStatusSection: {
    gap: 10,
    paddingTop: 2,
  },
  reportStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  reportStatusLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  reportUnitsBlock: {
    gap: 4,
    paddingLeft: 2,
  },
  reportUnitsHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  reportUnitsText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  reportUnitsTextMuted: {
    color: "#64748b",
    fontWeight: "600",
  },
  reportUnitsList: {
    gap: 6,
  },
  reportUnitsListItem: {
    gap: 2,
  },
  reportUnitsListText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  reportUnitsNote: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 17,
  },
  myReportDescription: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 22,
  },
  myReportDate: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  myReportMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  myReportMetaText: {
    flex: 1,
    fontSize: 13,
    color: "#475569",
    lineHeight: 18,
  },
  myReportPhotoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  myReportPhotoText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563eb",
  },
  reportPhotoThumbRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  reportPhotoThumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  protectedImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  reportNoPhotoText: {
    fontSize: 12,
    color: "#94a3b8",
    fontStyle: "italic",
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgePending: {
    backgroundColor: "#fffbeb",
    borderColor: "#fcd34d",
  },
  statusBadgeResponding: {
    backgroundColor: "#eff6ff",
    borderColor: "#93c5fd",
  },
  statusBadgeResolved: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
  },
  statusBadgeCancelled: {
    backgroundColor: "#fef2f2",
    borderColor: "#fca5a5",
  },
  statusBadgeUnknown: {
    backgroundColor: "#f1f5f9",
    borderColor: "#cbd5e1",
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  statusBadgeTextPending: {
    color: "#b45309",
  },
  statusBadgeTextResponding: {
    color: "#1d4ed8",
  },
  statusBadgeTextResolved: {
    color: "#15803d",
  },
  statusBadgeTextCancelled: {
    color: "#b91c1c",
  },
  statusBadgeTextUnknown: {
    color: "#64748b",
  },
  profileScroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },
  profileLoadingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  profileLoadingText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563eb",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
    paddingBottom: Platform.OS === "ios" ? 24 : 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  modalField: {
    marginBottom: 14,
    gap: 6,
  },
  modalFieldLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 12,
    fontSize: 15,
    color: "#0f172a",
  },
  modalInputMultiline: {
    minHeight: 88,
    paddingTop: 12,
  },
  modalHint: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 8,
  },
  modalSaveBtn: {
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: "#2563eb",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
  },
  modalSaveBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  profileSummaryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  profileAvatarWrap: {
    position: "relative",
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: "#eff6ff",
    borderWidth: 2,
    borderColor: "#bfdbfe",
    alignItems: "center",
    justifyContent: "center",
  },
  profileVerifiedBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: "#16a34a",
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  profileSummaryText: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  profileUsername: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563eb",
    marginBottom: 2,
  },
  profileMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  profileMetaText: {
    fontSize: 13,
    color: "#64748b",
    flex: 1,
  },
  profileSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: 0.6,
    marginTop: 4,
  },
  profileCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  profileInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  profileInfoRowLast: {
    borderBottomWidth: 0,
  },
  profileInfoIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfoContent: {
    flex: 1,
    gap: 2,
  },
  profileInfoLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  profileInfoValue: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748b",
    lineHeight: 18,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  settingsRowLast: {
    borderBottomWidth: 0,
  },
  settingsIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsRowText: {
    flex: 1,
    gap: 2,
  },
  settingsRowTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  settingsRowSubtitle: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 16,
  },
  emergencyCtaCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 14,
    gap: 12,
    marginTop: 4,
  },
  emergencyCtaSos: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  emergencyCtaSosText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  emergencyCtaCopy: {
    flex: 1,
    gap: 4,
  },
  emergencyCtaTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#dc2626",
  },
  emergencyCtaSubtitle: {
    fontSize: 11,
    color: "#64748b",
    lineHeight: 15,
  },
  emergencyCtaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#ef4444",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  emergencyCtaBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  placeholderTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
  },
  placeholderMessage: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
  },
});
