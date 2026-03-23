import 'package:flutter/material.dart' hide Card;
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';
import 'package:provider/provider.dart';
import 'package:comment/shared/theme.dart';
import 'package:comment/shared/uuid.dart';
import 'package:comment/components/card.dart';
import 'package:comment/components/bottom_bar.dart';
import 'package:comment/components/selection_app_bar.dart';
import 'package:comment/draggable_masonry_layout.dart';
import 'package:comment/providers.dart';
import 'package:comment/providers/connection_settings_provider.dart';
import 'package:comment/providers/extensions_provider.dart';
import 'package:comment/screens/archived_cards.dart';
import 'package:comment/screens/card_renderer.dart';
import 'package:comment/screens/connections_screen.dart';
import 'package:comment/screens/extensions_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await LiquidGlassWidgets.initialize();
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(
          create: (_) => CardsProvider()..initializeCards(_buildInitialCards()),
        ),
        ChangeNotifierProvider(create: (_) => ExtensionsProvider()),
        ChangeNotifierProvider(create: (_) => ConnectionSettingsProvider()),
      ],
      child: const MyApp(),
    ),
  );
}

List<CardData> _buildInitialCards() {
  const loremIpsum =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. ';
  final repeatedLorem = loremIpsum * 3;
  final lengths = [50, 120, 250, 400, 600, 800];
  final generatedIds = <String>{};
  return List<CardData>.generate(lengths.length, (index) {
    final length = lengths[index];
    final text = repeatedLorem.substring(
      0,
      length > repeatedLorem.length ? repeatedLorem.length : length,
    );
    final id = generateUniqueUuid(
      (candidate) => generatedIds.contains(candidate),
    );
    generatedIds.add(id);
    return CardData(
      id: id,
      title: 'Card ${index + 1}',
      content: text,
      isArchived: index == 1,
    );
  });
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Comment',
      debugShowCheckedModeBanner: false,
      theme: darkNeutralTheme,
      home: const MyHomePage(),
    );
  }
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key});

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  bool _isSettingsPopupOpen = false;
  bool _isNewCardPopupOpen = false;

  void _setSettingsPopupOpen(bool isOpen) {
    if (_isSettingsPopupOpen == isOpen) {
      return;
    }
    setState(() {
      _isSettingsPopupOpen = isOpen;
    });
  }

  void _closeSettingsPopup() {
    _setSettingsPopupOpen(false);
  }

  void _toggleSettingsPopup() {
    _setSettingsPopupOpen(!_isSettingsPopupOpen);
  }

  void _setNewCardPopupOpen(bool isOpen) {
    if (_isNewCardPopupOpen == isOpen) {
      return;
    }
    setState(() {
      _isNewCardPopupOpen = isOpen;
    });
  }

  void _closeNewCardPopup() {
    _setNewCardPopupOpen(false);
  }

  void _toggleNewCardPopup() {
    _setNewCardPopupOpen(!_isNewCardPopupOpen);
  }

  void _createNewCard() {
    _closeNewCardPopup();
    final provider = context.read<CardsProvider>();
    final nextIndex = provider.allCards.length + 1;
    final id = generateUniqueUuid(
      (candidate) => provider.allCards.any((card) => card.id == candidate),
    );
    provider.addCard(
      CardData(
        id: id,
        title: 'Card $nextIndex',
        content:
            'New card content for item $nextIndex. Add your own text here to test fuzzy search quickly.',
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cardsProvider = context.watch<CardsProvider>();
    final isSelectionMode = cardsProvider.isSelectionMode;

    if (isSelectionMode && (_isSettingsPopupOpen || _isNewCardPopupOpen)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _closeSettingsPopup();
          _closeNewCardPopup();
        }
      });
    }

    void closeSearchIfOpen() {
      final provider = context.read<CardsProvider>();
      if (provider.isSearchOpen) {
        provider.closeSearch();
      }
    }

    final cards = cardsProvider.cards
        .map((cardData) {
          return DraggableMasonryItem(
            id: cardData.id,
            child: Card(
              title: cardData.title,
              color: cardData.color,
              isSelected: cardsProvider.isSelected(cardData.id),
              onTap: () {
                if (isSelectionMode) {
                  cardsProvider.toggleSelection(cardData.id);
                  return;
                }
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => CardRendererScreen(cardId: cardData.id),
                  ),
                );
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12.0,
                  vertical: 8.0,
                ),
                child: Text(cardData.content),
              ),
            ),
          );
        })
        .toList(growable: false);

    return Scaffold(
      extendBody: true,
      resizeToAvoidBottomInset: false,
      appBar: isSelectionMode ? const SelectionAppBar() : null,
      bottomNavigationBar: isSelectionMode
          ? null
          : BottomBar(
              isSettingsPopupOpen: _isSettingsPopupOpen,
              isSearchOpen: cardsProvider.isSearchOpen,
              searchQuery: cardsProvider.searchQuery,
              isNewCardPopupOpen: _isNewCardPopupOpen,
              onSettingsPopupOpen: () {
                closeSearchIfOpen();
                _closeNewCardPopup();
                _toggleSettingsPopup();
              },
              onNewCardPopupOpen: () {
                closeSearchIfOpen();
                _closeSettingsPopup();
                _toggleNewCardPopup();
              },
              onNewCardPopupClose: _closeNewCardPopup,
              onNewCard: _createNewCard,
              onSearchOpen: () {
                _closeSettingsPopup();
                _closeNewCardPopup();
                context.read<CardsProvider>().openSearch();
              },
              onSearchChanged: (query) =>
                  context.read<CardsProvider>().filterCards(query),
              onSearchClose: () => context.read<CardsProvider>().closeSearch(),
              onSearchSubmit: () =>
                  context.read<CardsProvider>().closeSearchKeepingFilters(),
              onExtensions: () {
                closeSearchIfOpen();
                _closeSettingsPopup();
                _closeNewCardPopup();
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const ExtensionsScreen()),
                );
              },
              onConnections: () {
                closeSearchIfOpen();
                _closeSettingsPopup();
                _closeNewCardPopup();
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const ConnectionsScreen()),
                );
              },
              onArchive: () {
                closeSearchIfOpen();
                _closeSettingsPopup();
                _closeNewCardPopup();
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const ArchivedCardsScreen(),
                  ),
                );
              },
            ),
      body: Stack(
        children: [
          DraggableMasonryLayout(
            padding: EdgeInsets.fromLTRB(16.0, 16.0, 16.0, 16.0),
            enableDrag: !isSelectionMode,
            onReorder: (draggedId, targetId) {
              context.read<CardsProvider>().reorderCardsById(
                draggedId: draggedId,
                targetId: targetId,
                archivedOnly: false,
              );
            },
            onSamePlaceDrop: (cardId) {
              final provider = context.read<CardsProvider>();
              provider.enterSelectionMode(cardId);
            },
            items: cards,
          ),
          if (!isSelectionMode &&
              (cardsProvider.isSearchOpen ||
                  _isSettingsPopupOpen ||
                  _isNewCardPopupOpen))
            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  if (cardsProvider.isSearchOpen) {
                    context.read<CardsProvider>().closeSearch();
                  }
                  if (_isSettingsPopupOpen) {
                    _closeSettingsPopup();
                  }
                  if (_isNewCardPopupOpen) {
                    _closeNewCardPopup();
                  }
                },
                child: ColoredBox(color: Colors.black.withValues(alpha: 0.16)),
              ),
            ),
        ],
      ),
    );
  }
}
