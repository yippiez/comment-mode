import 'package:flutter/foundation.dart';
import 'package:comment/models/card.dart';

class CardData {
  final String id;
  final String title;
  final String content;
  final bool isArchived;
  final CardColors color;
  final CardStatus status;

  const CardData({
    required this.id,
    required this.title,
    required this.content,
    this.isArchived = false,
    this.color = CardColors.gray,
    this.status = CardStatus.normal,
  });

  CardData copyWith({
    String? id,
    String? title,
    String? content,
    bool? isArchived,
    CardColors? color,
    CardStatus? status,
  }) {
    return CardData(
      id: id ?? this.id,
      title: title ?? this.title,
      content: content ?? this.content,
      isArchived: isArchived ?? this.isArchived,
      color: color ?? this.color,
      status: status ?? this.status,
    );
  }
}

class CardsProvider extends ChangeNotifier {
  final List<CardData> _allCards = [];
  final Map<String, String> _searchBlobsById = {};

  List<CardData> _cards = [];
  List<CardData> _lastResults = [];
  String _searchQuery = '';
  String _lastQuery = '';
  bool _isSearchOpen = false;

  bool _isSelectionMode = false;
  final Set<String> _selectedIds = {};

  List<CardData> get cards => List<CardData>.unmodifiable(_cards);
  List<CardData> get allCards => List<CardData>.unmodifiable(_allCards);
  List<CardData> get archivedCards =>
      List<CardData>.unmodifiable(_allCards.where((card) => card.isArchived));
  String get searchQuery => _searchQuery;
  bool get isSearchOpen => _isSearchOpen;

  bool get isSelectionMode => _isSelectionMode;
  Set<String> get selectedIds => Set<String>.unmodifiable(_selectedIds);
  int get selectedCount => _selectedIds.length;

  void initializeCards(List<CardData> initialCards) {
    _allCards
      ..clear()
      ..addAll(initialCards);
    _rebuildSearchIndex();
    _searchQuery = '';
    _lastQuery = '';
    _cards = _visibleCards();
    _lastResults = List<CardData>.from(_cards);
    notifyListeners();
  }

  void addCard(CardData card) {
    _allCards.add(card);
    _searchBlobsById[card.id] = _buildSearchBlob(card);
    if (_searchQuery.isEmpty) {
      _cards = _visibleCards();
      _lastResults = List<CardData>.from(_cards);
      notifyListeners();
      return;
    }
    filterCards(_searchQuery);
  }

  void setCardStatus(String cardId, CardStatus status) {
    setCardsStatus([cardId], status);
  }

  void setCardsStatus(Iterable<String> cardIds, CardStatus status) {
    final ids = cardIds.toSet();
    if (ids.isEmpty) {
      return;
    }

    var hasChanges = false;
    for (var i = 0; i < _allCards.length; i++) {
      final card = _allCards[i];
      if (!ids.contains(card.id) || card.status == status) {
        continue;
      }
      _allCards[i] = card.copyWith(status: status);
      hasChanges = true;
    }

    if (!hasChanges) {
      return;
    }

    _refreshCardsAfterMutation();
  }

  void setCardArchived(String cardId, bool isArchived) {
    setCardsArchived([cardId], isArchived);
  }

  void setCardsArchived(Iterable<String> cardIds, bool isArchived) {
    final ids = cardIds.toSet();
    if (ids.isEmpty) {
      return;
    }

    var hasChanges = false;
    for (var i = 0; i < _allCards.length; i++) {
      final card = _allCards[i];
      if (!ids.contains(card.id) || card.isArchived == isArchived) {
        continue;
      }
      _allCards[i] = card.copyWith(isArchived: isArchived);
      hasChanges = true;
    }

    if (!hasChanges) {
      return;
    }

    _refreshCardsAfterMutation();
  }

  void setCardColor(String cardId, CardColors color) {
    for (var i = 0; i < _allCards.length; i++) {
      final card = _allCards[i];
      if (card.id != cardId) {
        continue;
      }
      if (card.color == color) {
        return;
      }
      _allCards[i] = card.copyWith(color: color);
      _refreshCardsAfterMutation();
      return;
    }
  }

  CardData? getCardById(String cardId) {
    for (final card in _allCards) {
      if (card.id == cardId) {
        return card;
      }
    }
    return null;
  }

  void deleteCards(Iterable<String> cardIds) {
    final ids = cardIds.toSet();
    if (ids.isEmpty) {
      return;
    }

    final previousLength = _allCards.length;
    _allCards.removeWhere((card) {
      final shouldDelete = ids.contains(card.id);
      if (shouldDelete) {
        _searchBlobsById.remove(card.id);
      }
      return shouldDelete;
    });

    if (previousLength == _allCards.length) {
      return;
    }

    _refreshCardsAfterMutation();
  }

  void filterCards(String query) {
    final normalizedQuery = _normalize(query);
    _searchQuery = query;

    if (normalizedQuery.isEmpty) {
      _cards = _visibleCards();
      _lastQuery = '';
      _lastResults = List<CardData>.from(_cards);
      notifyListeners();
      return;
    }

    final List<CardData> source =
        _lastQuery.isNotEmpty && normalizedQuery.startsWith(_lastQuery)
        ? _lastResults
        : _visibleCards();

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
    final visibleCards = _visibleCards();
    if (_searchQuery.isEmpty && _cards.length == visibleCards.length) {
      return;
    }
    _searchQuery = '';
    _lastQuery = '';
    _cards = visibleCards;
    _lastResults = List<CardData>.from(_cards);
    notifyListeners();
  }

  void openSearch() {
    if (_isSearchOpen) {
      return;
    }
    if (_isSelectionMode) {
      exitSelectionMode();
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
    _cards = _visibleCards();
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

  void enterSelectionMode(String cardId) {
    _isSelectionMode = true;
    _selectedIds.clear();
    _selectedIds.add(cardId);
    notifyListeners();
  }

  void exitSelectionMode() {
    _isSelectionMode = false;
    _selectedIds.clear();
    notifyListeners();
  }

  void toggleSelection(String cardId) {
    if (!_isSelectionMode) {
      return;
    }
    if (_selectedIds.contains(cardId)) {
      _selectedIds.remove(cardId);
      if (_selectedIds.isEmpty) {
        exitSelectionMode();
        return;
      }
    } else {
      _selectedIds.add(cardId);
    }
    notifyListeners();
  }

  void toggleSelectAll() {
    if (!_isSelectionMode) {
      return;
    }

    final visibleCardIds = _cards.map((card) => card.id).toSet();
    final allSelected =
        visibleCardIds.length == _selectedIds.length &&
        visibleCardIds.every((id) => _selectedIds.contains(id));

    if (allSelected) {
      _selectedIds.clear();
    } else {
      _selectedIds.addAll(visibleCardIds);
    }
    notifyListeners();
  }

  bool isSelected(String cardId) {
    return _selectedIds.contains(cardId);
  }

  bool get isAllSelected {
    final visibleCardIds = _cards.map((card) => card.id).toSet();
    return visibleCardIds.isNotEmpty &&
        visibleCardIds.length == _selectedIds.length &&
        visibleCardIds.every((id) => _selectedIds.contains(id));
  }

  void archiveSelected() {
    if (_selectedIds.isEmpty) {
      return;
    }
    setCardsArchived(_selectedIds, true);
    exitSelectionMode();
  }

  void unarchiveSelected() {
    if (_selectedIds.isEmpty) {
      return;
    }
    setCardsArchived(_selectedIds, false);
    exitSelectionMode();
  }

  void deleteSelected() {
    if (_selectedIds.isEmpty) {
      return;
    }
    deleteCards(_selectedIds);
    exitSelectionMode();
  }

  void reorderCardsById({
    required String draggedId,
    required String targetId,
    required bool archivedOnly,
  }) {
    if (draggedId == targetId) {
      return;
    }

    bool isInScope(CardData card) {
      return archivedOnly ? card.isArchived : !card.isArchived;
    }

    final scopedCards = _allCards.where(isInScope).toList(growable: true);
    final fromIndex = scopedCards.indexWhere((card) => card.id == draggedId);
    final toIndex = scopedCards.indexWhere((card) => card.id == targetId);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    final dragged = scopedCards.removeAt(fromIndex);
    scopedCards.insert(toIndex, dragged);

    final reorderedAll = <CardData>[];
    var scopedIndex = 0;
    for (final card in _allCards) {
      if (isInScope(card)) {
        reorderedAll.add(scopedCards[scopedIndex]);
        scopedIndex++;
      } else {
        reorderedAll.add(card);
      }
    }

    _allCards
      ..clear()
      ..addAll(reorderedAll);
    _rebuildSearchIndex();
    _refreshCardsAfterMutation();
  }

  void _rebuildSearchIndex() {
    _searchBlobsById
      ..clear()
      ..addEntries(
        _allCards.map((card) => MapEntry(card.id, _buildSearchBlob(card))),
      );
  }

  List<CardData> _visibleCards() {
    return _allCards.where((card) => !card.isArchived).toList(growable: false);
  }

  void _refreshCardsAfterMutation() {
    if (_searchQuery.isEmpty) {
      _cards = _visibleCards();
      _lastQuery = '';
      _lastResults = List<CardData>.from(_cards);
      notifyListeners();
      return;
    }

    _lastQuery = '';
    _lastResults = _visibleCards();
    filterCards(_searchQuery);
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
