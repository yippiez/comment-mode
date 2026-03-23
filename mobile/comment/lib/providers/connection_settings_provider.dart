import 'package:flutter/foundation.dart';

class ConnectionSettingsProvider extends ChangeNotifier {
  String _piUrl = '';

  String get piUrl => _piUrl;

  void savePiUrl(String value) {
    if (_piUrl == value) {
      return;
    }
    _piUrl = value;
    notifyListeners();
  }
}
