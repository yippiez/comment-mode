import 'package:flutter/foundation.dart';

class CardData {
  final String id;
  final String title;
  final String content;

  const CardData({
    required this.id,
    required this.title,
    required this.content,
  });
}

class CardsProvider extends ChangeNotifier {
  final List<CardData> _allCards = [];
  final Map<String, String> _searchBlobsById = {};

  List<CardData> _cards = [];
  List<CardData> _lastResults = [];
  String _searchQuery = '';
  String _lastQuery = '';
  bool _isSearchOpen = false;

  List<CardData> get cards => List<CardData>.unmodifiable(_cards);
  List<CardData> get allCards => List<CardData>.unmodifiable(_allCards);
  String get searchQuery => _searchQuery;
  bool get isSearchOpen => _isSearchOpen;

  void initializeCards(List<CardData> initialCards) {
    _allCards
      ..clear()
      ..addAll(initialCards);
    _rebuildSearchIndex();
    _searchQuery = '';
    _lastQuery = '';
    _cards = List<CardData>.from(_allCards);
    _lastResults = List<CardData>.from(_cards);
    notifyListeners();
  }

  void addCard(CardData card) {
    _allCards.add(card);
    _searchBlobsById[card.id] = _buildSearchBlob(card);
    if (_searchQuery.isEmpty) {
      _cards = List<CardData>.from(_allCards);
      _lastResults = List<CardData>.from(_cards);
      notifyListeners();
      return;
    }
    filterCards(_searchQuery);
  }

  void filterCards(String query) {
    final normalizedQuery = _normalize(query);
    _searchQuery = query;

    if (normalizedQuery.isEmpty) {
      _cards = List<CardData>.from(_allCards);
      _lastQuery = '';
      _lastResults = List<CardData>.from(_cards);
      notifyListeners();
      return;
    }

    final List<CardData> source =
        _lastQuery.isNotEmpty && normalizedQuery.startsWith(_lastQuery)
        ? _lastResults
        : _allCards;

    final tokens = normalizedQuery
        .split(RegExp(r'\s+'))
        .where((token) => token.isNotEmpty)
        .toList(growable: false);

    final scored = <_ScoredCard>[];
    for (final card in source) {
      final blob = _searchBlobsById[card.id] ?? _buildSearchBlob(card);
      final score = _scoreCard(card, blob, normalizedQuery, tokens);
      if (score > 0) {
        scored.add(_ScoredCard(card: card, score: score));
      }
    }

    scored.sort((a, b) {
      final scoreCompare = b.score.compareTo(a.score);
      if (scoreCompare != 0) {
        return scoreCompare;
      }
      return a.card.title.compareTo(b.card.title);
    });

    _cards = scored.map((entry) => entry.card).toList(growable: false);
    _lastQuery = normalizedQuery;
    _lastResults = List<CardData>.from(_cards);
    notifyListeners();
  }

  void clearSearch() {
    if (_searchQuery.isEmpty && _cards.length == _allCards.length) {
      return;
    }
    _searchQuery = '';
    _lastQuery = '';
    _cards = List<CardData>.from(_allCards);
    _lastResults = List<CardData>.from(_cards);
    notifyListeners();
  }

  void openSearch() {
    if (_isSearchOpen) {
      return;
    }
    _isSearchOpen = true;
    notifyListeners();
  }

  void closeSearch() {
    if (!_isSearchOpen && _searchQuery.isEmpty) {
      return;
    }
    _isSearchOpen = false;
    _searchQuery = '';
    _lastQuery = '';
    _cards = List<CardData>.from(_allCards);
    _lastResults = List<CardData>.from(_cards);
    notifyListeners();
  }

  void closeSearchKeepingFilters() {
    if (!_isSearchOpen) {
      return;
    }
    _isSearchOpen = false;
    notifyListeners();
  }

  void _rebuildSearchIndex() {
    _searchBlobsById
      ..clear()
      ..addEntries(
        _allCards.map((card) => MapEntry(card.id, _buildSearchBlob(card))),
      );
  }

  String _buildSearchBlob(CardData card) {
    return '${_normalize(card.title)} ${_normalize(card.content)}';
  }

  int _scoreCard(
    CardData card,
    String blob,
    String query,
    List<String> tokens,
  ) {
    final normalizedTitle = _normalize(card.title);
    var score = 0;

    final titleQueryIndex = normalizedTitle.indexOf(query);
    final blobQueryIndex = blob.indexOf(query);

    if (titleQueryIndex == 0) {
      score += 200;
    } else if (titleQueryIndex > 0) {
      score += 150 - titleQueryIndex;
    }

    if (blobQueryIndex == 0) {
      score += 80;
    } else if (blobQueryIndex > 0) {
      score += 60 - (blobQueryIndex ~/ 4);
    }

    for (final token in tokens) {
      final titleTokenIndex = normalizedTitle.indexOf(token);
      final blobTokenIndex = blob.indexOf(token);
      if (titleTokenIndex == 0) {
        score += 40;
      } else if (titleTokenIndex > 0) {
        score += 24 - (titleTokenIndex ~/ 6);
      }
      if (blobTokenIndex >= 0) {
        score += 12;
      }
    }

    if (_isSubsequence(query, normalizedTitle)) {
      score += 30;
    } else if (_isSubsequence(query, blob)) {
      score += 18;
    }

    return score < 0 ? 0 : score;
  }

  bool _isSubsequence(String query, String target) {
    if (query.isEmpty) {
      return true;
    }
    var queryIndex = 0;
    for (var i = 0; i < target.length; i++) {
      if (target.codeUnitAt(i) == query.codeUnitAt(queryIndex)) {
        queryIndex++;
        if (queryIndex == query.length) {
          return true;
        }
      }
    }
    return false;
  }

  String _normalize(String value) {
    return value.toLowerCase().trim();
  }
}

class _ScoredCard {
  final CardData card;
  final int score;

  const _ScoredCard({required this.card, required this.score});
}
