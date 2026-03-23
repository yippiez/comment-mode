import 'package:comment/models/card.dart';
import 'package:flutter/material.dart';

extension CardColorPalette on CardColors {
  Color get backgroundColor {
    switch (this) {
      case CardColors.gray:
        return Colors.grey[850]!;
      case CardColors.blue:
        return const Color(0xFFB7D8FF);
      case CardColors.green:
        return const Color(0xFFBDF0B5);
      case CardColors.orange:
        return const Color(0xFFFFD3A3);
      case CardColors.red:
        return const Color(0xFFFFB9B1);
      case CardColors.yellow:
        return const Color(0xFFFFEA7A);
      case CardColors.teal:
        return const Color(0xFFAFEFE8);
      case CardColors.pink:
        return const Color(0xFFFFBFE3);
      case CardColors.indigo:
        return const Color(0xFFC7C0FF);
    }
  }

  Color get foregroundColor {
    switch (this) {
      case CardColors.gray:
        return Colors.white;
      case CardColors.blue:
      case CardColors.green:
      case CardColors.orange:
      case CardColors.red:
      case CardColors.yellow:
      case CardColors.teal:
      case CardColors.pink:
      case CardColors.indigo:
        return const Color(0xFF2A2432);
    }
  }

  String get label {
    switch (this) {
      case CardColors.gray:
        return 'Gray';
      case CardColors.blue:
        return 'Blue';
      case CardColors.green:
        return 'Green';
      case CardColors.orange:
        return 'Orange';
      case CardColors.red:
        return 'Red';
      case CardColors.yellow:
        return 'Yellow';
      case CardColors.teal:
        return 'Teal';
      case CardColors.pink:
        return 'Pink';
      case CardColors.indigo:
        return 'Indigo';
    }
  }
}
