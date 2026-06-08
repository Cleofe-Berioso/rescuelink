const appJson = require("./app.json");

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://rescuelink-backend-biwl.onrender.com/api";

module.exports = {
  expo: {
    ...appJson.expo,

    extra: {
      ...(appJson.expo.extra || {}),

      apiBaseUrl: API_BASE_URL,

      eas: {
        projectId: "3ebdfda8-f323-4fb7-b2ad-f65744763dc2",
      },
    },

    ios: {
      ...(appJson.expo.ios || {}),
      infoPlist: {
        ...(appJson.expo.ios?.infoPlist || {}),
        NSLocationWhenInUseUsageDescription:
          "RescueLink uses your location to attach GPS coordinates to emergency reports.",
        NSCameraUsageDescription:
          "RescueLink uses the camera to attach emergency photos to your reports.",
        NSPhotoLibraryUsageDescription:
          "RescueLink uses your photo library to attach emergency photos to your reports.",
      },
    },

    android: {
      ...(appJson.expo.android || {}),
      package:
        appJson.expo.android?.package || "com.benales122703.rescuelink",
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "CAMERA",
        "READ_MEDIA_IMAGES",
      ],
      config: {
        ...(appJson.expo.android?.config || {}),
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "",
        },
      },
    },

    plugins: [
      ...(appJson.expo.plugins || []),
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
  },
};