import 'package:flutter/material.dart';

class ReadToolTheme {
  static ThemeData get darkOrangeTheme {
    return ThemeData(
      // Use dark brightness for the overall theme
      brightness: Brightness.dark,

      // Primary color swatch - provides a range of orange shades
      primarySwatch: Colors.orange,

      // Primary color for key UI elements like buttons and active states
      primaryColor: Colors.orange[700]!,

      // Dark grey background for the main app scaffold
      scaffoldBackgroundColor: Colors.grey[900]!,

      // App bar styling - darker background with orange title and icons
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.grey[850]!,
        elevation: 0, // Flat design, no shadow
        titleTextStyle: const TextStyle(
          color: Colors.orange, // Orange title text for brand consistency
          fontSize: 20,
          fontWeight: FontWeight.w500,
        ),
        iconTheme: IconThemeData(color: Colors.orange[700]!),
      ),

      // Color scheme defines the full set of colors used throughout the app
      colorScheme: ColorScheme.dark(
        primary: Colors.orange[700]!, // Main brand color
        secondary: Colors.orangeAccent[400]!, // Secondary accent color
        surface: Colors.grey[850]!, // Surface color for cards, dialogs, etc.
        error: Colors.redAccent, // Error color for validation messages
      ),

      // Card styling - slightly elevated surfaces with rounded corners
      cardTheme: CardThemeData(
        color: Colors.grey[850]!,
        elevation: 0, // Flat cards
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),

      // Elevated button styling - prominent orange buttons
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.orange[700]!,
          foregroundColor: Colors.white, // White text on orange
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        ),
      ),

      // Text button styling - subtle orange text buttons
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: Colors.orange),
      ),

      // Input field styling - dark background with orange focus state
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.grey[850]!,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: Colors.grey[700]!),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: Colors.grey[700]!),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(
            color: Colors.orange,
          ), // Orange focus border
        ),
        labelStyle: TextStyle(color: Colors.orange[700]!),
        hintStyle: TextStyle(color: Colors.grey[500]!),
      ),

      // Global icon styling - consistent orange icons
      iconTheme: IconThemeData(color: Colors.orange[700]!),

      // Text styling - white text on dark background for maximum readability
      textTheme: const TextTheme(
        headlineLarge: TextStyle(color: Colors.white),
        headlineMedium: TextStyle(color: Colors.white),
        headlineSmall: TextStyle(color: Colors.white),
        titleLarge: TextStyle(color: Colors.white),
        titleMedium: TextStyle(color: Colors.white),
        titleSmall: TextStyle(color: Colors.white),
        bodyLarge: TextStyle(color: Colors.white),
        bodyMedium: TextStyle(color: Colors.white),
        bodySmall: TextStyle(
          color: Colors.white70,
        ), // Slightly faded for secondary text
        labelLarge: TextStyle(color: Colors.white),
        labelMedium: TextStyle(color: Colors.white),
        labelSmall: TextStyle(color: Colors.white),
      ),

      // Divider styling
      dividerTheme: DividerThemeData(color: Colors.grey[800]!, thickness: 1),
    );
  }
}
