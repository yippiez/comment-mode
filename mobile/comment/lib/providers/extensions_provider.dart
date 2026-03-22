import 'package:flutter/material.dart';
import 'package:comment/models/extension_data.dart';

class ExtensionsProvider extends ChangeNotifier {
  List<ExtensionData> _extensions = [];

  ExtensionsProvider() {
    _initializeExtensions();
  }

  List<ExtensionData> get extensions => _extensions;

  List<ExtensionData> get defaultExtensions =>
      _extensions.where((e) => e.state == ExtensionState.defaultExt).toList();

  List<ExtensionData> get installedExtensions =>
      _extensions.where((e) => e.state == ExtensionState.installed).toList();

  List<ExtensionData> get installedAndDefaultExtensions => _extensions
      .where(
        (e) =>
            e.state == ExtensionState.installed ||
            e.state == ExtensionState.defaultExt,
      )
      .toList();

  List<ExtensionData> get uninstalledOfficialExtensions => _extensions
      .where(
        (e) =>
            e.state == ExtensionState.uninstalled &&
            e.source == ExtensionSource.official,
      )
      .toList();

  List<ExtensionData> get uninstalledCommunityExtensions => _extensions
      .where(
        (e) =>
            e.state == ExtensionState.uninstalled &&
            e.source == ExtensionSource.community,
      )
      .toList();

  void installExtension(String id) {
    final index = _extensions.indexWhere((e) => e.id == id);
    if (index != -1) {
      _extensions[index] = _extensions[index].copyWith(
        state: ExtensionState.installed,
      );
      notifyListeners();
    }
  }

  void uninstallExtension(String id) {
    final index = _extensions.indexWhere((e) => e.id == id);
    if (index != -1 && _extensions[index].state != ExtensionState.defaultExt) {
      _extensions[index] = _extensions[index].copyWith(
        state: ExtensionState.uninstalled,
      );
      notifyListeners();
    }
  }

  void _initializeExtensions() {
    _extensions = [
      const ExtensionData(
        id: 'default-chat',
        title: 'Chat',
        description:
            'Built-in chat functionality for real-time conversations and messaging within your cards.',
        gradient: LinearGradient(
          colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        source: ExtensionSource.official,
        state: ExtensionState.defaultExt,
      ),
      const ExtensionData(
        id: 'official-codemaps',
        title: 'Codemaps',
        description:
            'Visual code mapping and dependency tracking to understand project structure at a glance.',
        gradient: LinearGradient(
          colors: [Color(0xFFF59E0B), Color(0xFFEF4444)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        source: ExtensionSource.official,
        state: ExtensionState.uninstalled,
      ),
      const ExtensionData(
        id: 'official-filetree',
        title: 'Filetree',
        description:
            'Browse and manage file hierarchies with an intuitive tree view directly in your workspace.',
        gradient: LinearGradient(
          colors: [Color(0xFF10B981), Color(0xFF059669)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        source: ExtensionSource.official,
        state: ExtensionState.uninstalled,
      ),
    ];
  }
}
