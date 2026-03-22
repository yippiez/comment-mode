import 'package:comment/components/card.dart';
import 'package:comment/components/selection_app_bar.dart';
import 'package:comment/draggable_masonry_layout.dart';
import 'package:comment/providers.dart';
import 'package:comment/screens/card_renderer.dart';
import 'package:flutter/material.dart' hide Card;
import 'package:provider/provider.dart';

class ArchivedCardsScreen extends StatelessWidget {
  const ArchivedCardsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final cardsProvider = context.watch<CardsProvider>();
    final archivedCards = cardsProvider.archivedCards;
    final isSelectionMode = cardsProvider.isSelectionMode;

    final cards = archivedCards
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
      appBar: isSelectionMode
          ? const SelectionAppBar(isArchivedScreen: true)
          : AppBar(title: const Text('Archived Cards')),
      body: DraggableMasonryLayout(
        padding: EdgeInsets.fromLTRB(16.0, 16.0, 16.0, 16.0),
        enableDrag: !isSelectionMode,
        onReorder: (draggedId, targetId) {
          context.read<CardsProvider>().reorderCardsById(
            draggedId: draggedId,
            targetId: targetId,
            archivedOnly: true,
          );
        },
        onSamePlaceDrop: (cardId) {
          context.read<CardsProvider>().enterSelectionMode(cardId);
        },
        items: cards,
      ),
    );
  }
}
