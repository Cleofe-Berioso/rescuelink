import React, { useState, useEffect, useRef } from "react";
import {
  View,
  TextInput,
  Animated,
  StyleSheet,
  Platform,
  Text,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function FloatingInput({
  label,
  value = "",
  onChangeText,
  secureTextEntry = false,
  icon,
  rightIcon,
  onRightIconPress,
  keyboardType = "default",
  autoCapitalize = "none",
  errorText,
  ...rest
}) {
  const [isFocused, setIsFocused] = useState(false);
  const hasValue = value !== undefined && value !== null && String(value) !== "";
  const animatedValue = useRef(new Animated.Value(hasValue ? 1 : 0)).current;
  const inputRef = useRef(null);

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: isFocused || hasValue ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [isFocused, hasValue]);

  const labelLeft = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [icon ? 44 : 14, 4],
  });

  const labelTop = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [41, 0], // 41 is vertically centered inside 54px input with 24px paddingTop
  });

  const labelFontSize = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 13],
  });

  const labelColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["#8b9cb3", isFocused ? "#60a5fa" : "#cbd5e1"],
  });

  const borderColor = isFocused
    ? "#3b82f6"
    : errorText
    ? "#ef4444"
    : "rgba(255,255,255,0.22)";

  const borderWidth = isFocused ? 1.5 : 1;

  const handleRightIconPress = () => {
    if (onRightIconPress) {
      onRightIconPress();
    }
    // Maintain focus on the text input to prevent keyboard flickering or losing animation state
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <View style={styles.container}>
      <Animated.Text
        style={[
          styles.label,
          {
            left: labelLeft,
            top: labelTop,
            fontSize: labelFontSize,
            color: labelColor,
          },
        ]}
        pointerEvents="none"
      >
        {label}
      </Animated.Text>
      <View style={[styles.inputRow, { borderColor, borderWidth }]}>
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color="#94a3b8"
            style={styles.inputIcon}
          />
        )}
        <TextInput
          ref={inputRef}
          style={[styles.inputControl, rightIcon && styles.inputControlWithRightIcon]}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          keyboardType={keyboardType}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...rest}
        />
        {rightIcon && (
          <Pressable onPress={handleRightIconPress} hitSlop={12} style={styles.rightIconPressable}>
            <Ionicons name={rightIcon} size={20} color="#94a3b8" />
          </Pressable>
        )}
      </View>
      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 24, // 24px is perfect to fit the floating label above the inputRow
    position: "relative",
    width: "100%",
  },
  label: {
    position: "absolute",
    fontWeight: "600",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
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
  inputControlWithRightIcon: {
    paddingRight: 8,
  },
  rightIconPressable: {
    marginLeft: 8,
    padding: 4,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
});
