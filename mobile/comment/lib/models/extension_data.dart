import 'package:flutter/material.dart';

enum ExtensionState { defaultExt, installed, uninstalled }

enum ExtensionSource { official, community }

class ExtensionData {
  final String id;
  final String title;
  final String description;
  final Gradient gradient;
  final ExtensionSource source;
  final ExtensionState state;

  const ExtensionData({
    required this.id,
    required this.title,
    required this.description,
    required this.gradient,
    required this.source,
    required this.state,
  });

  ExtensionData copyWith({ExtensionState? state}) {
    return ExtensionData(
      id: id,
      title: title,
      description: description,
      gradient: gradient,
      source: source,
      state: state ?? this.state,
    );
  }
}
