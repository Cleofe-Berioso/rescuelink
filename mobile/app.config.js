const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://rescuelink-backend-biwl.onrender.com/api";

module.exports = ({ config }) => ({
  ...config,

  extra: {
    ...(config.extra || {}),

    apiBaseUrl: API_BASE_URL,

    eas: {
      projectId: "3ebdfda8-f323-4fb7-b2ad-f65744763dc2",
    },
  },

  ios: {
    ...(config.ios || {}),

    // Required for EAS iOS builds
    bundleIdentifier: "com.berioso.rescuelink",

    infoPlist: {
      ...(config.ios?.infoPlist || {}),

      // Removes the iOS encryption warning
      ITSAppUsesNonExemptEncryption: false,

      NSLocationWhenInUseUsageDescription:
        "RescueLink uses your location to attach GPS coordinates to emergency reports.",
      NSCameraUsageDescription:
        "RescueLink uses the camera to attach emergency photos to your reports.",
      NSPhotoLibraryUsageDescription:
        "RescueLink uses your photo library to attach photos to emergency reports.",
    },
  },

  android: {
    ...(config.android || {}),

    // Required for Android builds
    package: config.android?.package || "com.berioso.rescuelink",

    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "CAMERA",
      "READ_MEDIA_IMAGES",
    ],
  },

  plugins: [
    ...(config.plugins || []),
    "expo-secure-store",
    [
      "expo-image-picker",
      {
        cameraPermission:
          "Allow RescueLink to take photos for emergency reports.",
        photosPermission:
          "Allow RescueLink to attach photos to emergency reports.",
      },
    ],
  ],
}); 