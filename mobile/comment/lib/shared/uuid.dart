import 'dart:math';

final Random _random = Random.secure();

String generateUuid() {
  final parts = List<String>.generate(4, (_) {
    return _random.nextInt(0x10000).toRadixString(16).padLeft(4, '0');
  }, growable: false);
  return parts.join('-');
}

String generateUniqueUuid(bool Function(String id) exists) {
  const maxAttempts = 10000;
  for (var attempt = 0; attempt < maxAttempts; attempt++) {
    final candidate = generateUuid();
    if (!exists(candidate)) {
      return candidate;
    }
  }

  throw StateError('Unable to generate a unique UUID.');
}
