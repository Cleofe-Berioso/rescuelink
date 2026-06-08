const appJson = require("./app.json");

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || "https://supereffectively-mycostatic-lilla.ngrok-free.dev",
    },
    ios: {
      ...appJson.expo.ios,
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "RescueLink uses your location to attach GPS coordinates to emergency reports.",
        NSCameraUsageDescription:
          "RescueLink uses the camera to attach emergency photos to your reports.",
        NSPhotoLibraryUsageDescription:
          "RescueLink uses your photo library to attach emergency photos to your reports.",
      },
    },
    android: {
      ...appJson.expo.android,
      permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
      config: {
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
          cameraPermission: "Allow RescueLink to take photos for emergency reports.",
          photosPermission: "Allow RescueLink to attach photos to emergency reports.",
        },
      ],
    ],
  },
};
