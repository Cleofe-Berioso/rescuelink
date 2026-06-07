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
      { id: "users", label: "Users", icon: "users" },
      { id: "incidents", label: "Incidents", icon: "alert" },
      { id: "reports", label: "Reports", icon: "chart" },
      { id: "activity", label: "Activity Logs", icon: "clock" },
      { id: "settings", label: "Settings", icon: "settings" },
    ],
    incomingTitle: "All Incident Records",
    priorityTitle: null,
    activeTitle: "Active Incidents",
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
      { id: "incoming", label: "Incoming Reports", icon: "inbox" },
      { id: "priority", label: "Disaster/Rescue Priority", icon: "flag" },
      { id: "map", label: "Map", icon: "map" },
      { id: "active", label: "Active Response", icon: "pulse" },
      { id: "history", label: "History", icon: "clock" },
    ],
    incomingTitle: "Incoming Emergency Reports",
    priorityTitle: "Disaster & Rescue Priority",
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
    homeView: "fire-response",
    nav: [
      { id: "fire-response", label: "Fire Response", icon: "grid" },
      { id: "incoming", label: "Incoming Reports", icon: "inbox" },
      { id: "priority", label: "Fire Priority", icon: "flag" },
      { id: "map", label: "Map", icon: "map" },
      { id: "active", label: "Active Response", icon: "pulse" },
      { id: "history", label: "History", icon: "clock" },
    ],
    incomingTitle: "Incoming Emergency Reports",
    priorityTitle: "Fire-Related Priority",
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
    homeView: "police-response",
    nav: [
      { id: "police-response", label: "Police Response", icon: "grid" },
      { id: "incoming", label: "Incoming Reports", icon: "inbox" },
      { id: "priority", label: "Public Safety Priority", icon: "flag" },
      { id: "map", label: "Map", icon: "map" },
      { id: "active", label: "Active Response", icon: "pulse" },
      { id: "history", label: "History", icon: "clock" },
    ],
    incomingTitle: "Incoming Emergency Reports",
    priorityTitle: "Public Safety Priority",
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
