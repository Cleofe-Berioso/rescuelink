export const STAFF_ROLES = ["ADMIN", "DRRM", "BFP", "POLICE"];
export const CITIZEN_ROLE = "CITIZEN";

export const CITIZEN_WEB_MESSAGE =
  "Citizen accounts are not allowed in the web command center. Please use the RescueLink mobile app.";

export const LOGIN_INFO_CARDS = {
  ADMIN: {
    title: "Admin Command Access",
    description:
      "Manage users, monitor incident records, review system activity, and oversee RescueLink operations.",
  },
  DRRM: {
    title: "DRRM Rescue Coordination",
    description:
      "Monitor incoming emergencies, coordinate disaster response, dispatch units, and update incident status.",
  },
  BFP: {
    title: "BFP Fire Response",
    description:
      "Monitor fire-related emergencies, respond to rescue situations, and update fire response progress.",
  },
  POLICE: {
    title: "Police Public Safety Response",
    description:
      "Handle crime, threat, road accident, suspicious activity, and public safety-related emergency reports.",
  },
};

export const ROLE_DASHBOARD = {
  ADMIN: {
    role: "ADMIN",
    headerSubtitle: "Admin Command Center",
    tagline: "System administration & multi-agency oversight",
    footerLabel: "RescueLink Admin Command Center",
    defaultUnit: "DRRM",
    themeClass: "dashboard--admin",
    homeView: "dashboard",
    nav: [
      { id: "dashboard", label: "Dashboard", icon: "grid" },
      { id: "incidents", label: "Emergency Reports", icon: "inbox" },
      { id: "users", label: "Users", icon: "users" },
      { id: "map", label: "Map", icon: "map" },
      { id: "activity", label: "Activity Log", icon: "clock" },
      { id: "settings", label: "Settings", icon: "settings" },
    ],
    reportsTitle: "Emergency Reports",
    canRespond: false,
    showManualEntry: false,
  },
  DRRM: {
    role: "DRRM",
    headerSubtitle: "DRRM Rescue Coordination",
    tagline: "Disaster response monitoring & manual dispatch",
    footerLabel: "RescueLink DRRM Command Center",
    defaultUnit: "DRRM",
    themeClass: "dashboard--drrm",
    homeView: "command-center",
    nav: [
      { id: "command-center", label: "Command Center", icon: "grid" },
      { id: "reports", label: "Emergency Reports", icon: "inbox" },
      { id: "map", label: "Map", icon: "map" },
      { id: "active", label: "Active Response", icon: "pulse" },
      { id: "history", label: "History", icon: "clock" },
    ],
    reportsTitle: "Emergency Reports",
    commandCenterTitle: "DRRM Command Center",
    commandCenterTagline: "Real-time overview of incidents, responses, and coordination",
    activeTitle: "Active DRRM Response",
    canRespond: true,
    showManualEntry: true,
  },
  BFP: {
    role: "BFP",
    headerSubtitle: "BFP Fire Response",
    tagline: "Fire and rescue incident monitoring",
    footerLabel: "RescueLink BFP Fire Response Dashboard",
    defaultUnit: "BFP",
    themeClass: "dashboard--bfp",
    homeView: "command-center",
    nav: [
      { id: "command-center", label: "Command Center", icon: "grid" },
      { id: "reports", label: "Emergency Reports", icon: "inbox" },
      { id: "map", label: "Map", icon: "map" },
      { id: "active", label: "Active Response", icon: "pulse" },
      { id: "history", label: "History", icon: "clock" },
    ],
    reportsTitle: "Emergency Reports",
    commandCenterTitle: "BFP Command Center",
    commandCenterTagline: "Real-time overview of incidents, responses, and coordination",
    activeTitle: "Active BFP Response",
    canRespond: true,
    showManualEntry: false,
  },
  POLICE: {
    role: "POLICE",
    headerSubtitle: "Police Public Safety Response",
    tagline: "Public safety & security incident coordination",
    footerLabel: "RescueLink Police Response Dashboard",
    defaultUnit: "POLICE",
    themeClass: "dashboard--police",
    homeView: "command-center",
    nav: [
      { id: "command-center", label: "Command Center", icon: "grid" },
      { id: "reports", label: "Emergency Reports", icon: "inbox" },
      { id: "map", label: "Map", icon: "map" },
      { id: "active", label: "Active Response", icon: "pulse" },
      { id: "history", label: "History", icon: "clock" },
    ],
    reportsTitle: "Emergency Reports",
    commandCenterTitle: "Police Command Center",
    commandCenterTagline: "Real-time overview of incidents, responses, and coordination",
    activeTitle: "Active Police Response",
    canRespond: true,
    showManualEntry: false,
  },
};

export function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

export function getDashboardConfig(role) {
  return ROLE_DASHBOARD[role] || ROLE_DASHBOARD.DRRM;
}

export function getLoginInfoCard(selectedRole) {
  return LOGIN_INFO_CARDS[selectedRole] || LOGIN_INFO_CARDS.DRRM;
}
