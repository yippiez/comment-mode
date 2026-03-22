import 'package:flutter/material.dart' hide Card;
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';
import 'package:provider/provider.dart';
import 'package:comment/shared/theme.dart';
import 'package:comment/components/card.dart';
import 'package:comment/components/bottom_bar.dart';
import 'package:comment/components/selection_app_bar.dart';
import 'package:comment/draggable_masonry_layout.dart';
import 'package:comment/providers.dart';
import 'package:comment/screens/archived_cards.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await LiquidGlassWidgets.initialize();
  runApp(
    ChangeNotifierProvider(
      create: (_) => CardsProvider()..initializeCards(_buildInitialCards()),
      child: const MyApp(),
    ),
  );
}

List<CardData> _buildInitialCards() {
  const loremIpsum =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. ';
  final repeatedLorem = loremIpsum * 3;
  final lengths = [50, 120, 250, 400, 600, 800];
  return List<CardData>.generate(lengths.length, (index) {
    final length = lengths[index];
    final text = repeatedLorem.substring(
      0,
      length > repeatedLorem.length ? repeatedLorem.length : length,
    );
    return CardData(
      id: 'card-${index + 1}',
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

class MyHomePage extends StatelessWidget {
  const MyHomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final cardsProvider = context.watch<CardsProvider>();
    final isSelectionMode = cardsProvider.isSelectionMode;

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
              isSelected: cardsProvider.isSelected(cardData.id),
              onTap: isSelectionMode
                  ? () => cardsProvider.toggleSelection(cardData.id)
                  : null,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12.0,
                  vertical: 8.0,
                ),
                child: Text(
                  cardData.content,
                  style: TextStyle(color: Colors.grey[400]),
                ),
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
              isSearchOpen: cardsProvider.isSearchOpen,
              searchQuery: cardsProvider.searchQuery,
              onSearchOpen: () => context.read<CardsProvider>().openSearch(),
              onSearchChanged: (query) =>
                  context.read<CardsProvider>().filterCards(query),
              onSearchClose: () => context.read<CardsProvider>().closeSearch(),
              onSearchSubmit: () =>
                  context.read<CardsProvider>().closeSearchKeepingFilters(),
              onExtensions: closeSearchIfOpen,
              onArchive: () {
                closeSearchIfOpen();
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const ArchivedCardsScreen(),
                  ),
                );
              },
              onNew: () {
                closeSearchIfOpen();
                final provider = context.read<CardsProvider>();
                final nextIndex = provider.allCards.length + 1;
                final now = DateTime.now().millisecondsSinceEpoch;
                provider.addCard(
                  CardData(
                    id: 'card-$now',
                    title: 'Card $nextIndex',
                    content:
                        'New card content for item $nextIndex. Add your own text here to test fuzzy search quickly.',
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
          if (!isSelectionMode && cardsProvider.isSearchOpen)
            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => context.read<CardsProvider>().closeSearch(),
                child: ColoredBox(color: Colors.black.withValues(alpha: 0.16)),
              ),
            ),
        ],
      ),
    );
  }
}
