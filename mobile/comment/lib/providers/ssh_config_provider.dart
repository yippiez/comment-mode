import 'package:flutter/foundation.dart';

/// Provider for managing SSH configuration and related settings.
/// Uses the Provider package for state management.
class SshConfigProvider extends ChangeNotifier {
  // SSH Configuration
  String _sshHost = '';
  String _sshPort = '22';
  String _sshUsername = '';
  String _sshPassword = '';

  // UI Preferences
  bool _darkMode = true;
  double _fontSize = 16.0;
  bool _notifications = true;

  // Getters
  String get sshHost => _sshHost;
  String get sshPort => _sshPort;
  String get sshUsername => _sshUsername;
  String get sshPassword => _sshPassword;
  bool get darkMode => _darkMode;
  double get fontSize => _fontSize;
  bool get notifications => _notifications;

  // Setters with notification
  set sshHost(String value) {
    if (_sshHost != value) {
      _sshHost = value;
      notifyListeners();
    }
  }

  set sshPort(String value) {
    if (_sshPort != value) {
      _sshPort = value;
      notifyListeners();
    }
  }

  set sshUsername(String value) {
    if (_sshUsername != value) {
      _sshUsername = value;
      notifyListeners();
    }
  }

  set sshPassword(String value) {
    if (_sshPassword != value) {
      _sshPassword = value;
      notifyListeners();
    }
  }

  set darkMode(bool value) {
    if (_darkMode != value) {
      _darkMode = value;
      notifyListeners();
    }
  }

  set fontSize(double value) {
    if (_fontSize != value) {
      _fontSize = value;
      notifyListeners();
    }
  }

  set notifications(bool value) {
    if (_notifications != value) {
      _notifications = value;
      notifyListeners();
    }
  }

  // Batch update SSH settings
  void updateSshSettings({
    String? host,
    String? port,
    String? username,
    String? password,
  }) {
    bool changed = false;
    if (host != null && host != _sshHost) {
      _sshHost = host;
      changed = true;
    }
    if (port != null && port != _sshPort) {
      _sshPort = port;
      changed = true;
    }
    if (username != null && username != _sshUsername) {
      _sshUsername = username;
      changed = true;
    }
    if (password != null && password != _sshPassword) {
      _sshPassword = password;
      changed = true;
    }
    if (changed) notifyListeners();
  }

  // Reset to defaults
  void resetToDefaults() {
    _sshHost = '';
    _sshPort = '22';
    _sshUsername = '';
    _sshPassword = '';
    _darkMode = true;
    _fontSize = 16.0;
    _notifications = true;
    notifyListeners();
  }
}
