import 'package:flutter/material.dart';

final darkOrangeTheme = ThemeData(
  brightness: Brightness.dark,
  primarySwatch: Colors.orange,
  primaryColor: Color(0xFFE65100),
  scaffoldBackgroundColor: Color(0xFF212121),
  appBarTheme: AppBarTheme(
    backgroundColor: Color(0xFF303030),
    elevation: 0,
    titleTextStyle: TextStyle(
      color: Colors.orange,
      fontSize: 20,
      fontWeight: FontWeight.w500,
    ),
    iconTheme: IconThemeData(color: Color(0xFFE65100)),
  ),
  colorScheme: ColorScheme.dark(
    primary: Color(0xFFE65100),
    secondary: Color(0xFFFFAB40),
    surface: Color(0xFF303030),
    error: Colors.redAccent,
  ),
  cardTheme: CardThemeData(
    color: Color(0xFF303030),
    elevation: 0,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
  ),
  elevatedButtonTheme: ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(
      backgroundColor: Color(0xFFE65100),
      foregroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    ),
  ),
  textButtonTheme: TextButtonThemeData(
    style: TextButton.styleFrom(foregroundColor: Colors.orange),
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: Color(0xFF303030),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: BorderSide(color: Color(0xFF616161)),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: BorderSide(color: Color(0xFF616161)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: BorderSide(color: Colors.orange),
    ),
    labelStyle: TextStyle(color: Color(0xFFE65100)),
    hintStyle: TextStyle(color: Color(0xFF9E9E9E)),
  ),
  iconTheme: IconThemeData(color: Color(0xFFE65100)),
  textTheme: TextTheme(
    headlineLarge: TextStyle(color: Colors.white),
    headlineMedium: TextStyle(color: Colors.white),
    headlineSmall: TextStyle(color: Colors.white),
    titleLarge: TextStyle(color: Colors.white),
    titleMedium: TextStyle(color: Colors.white),
    titleSmall: TextStyle(color: Colors.white),
    bodyLarge: TextStyle(color: Colors.white),
    bodyMedium: TextStyle(color: Colors.white),
    bodySmall: TextStyle(color: Colors.white70),
    labelLarge: TextStyle(color: Colors.white),
    labelMedium: TextStyle(color: Colors.white),
    labelSmall: TextStyle(color: Colors.white),
  ),
  dividerTheme: DividerThemeData(color: Color(0xFF424242), thickness: 1),
);
