import 'package:comment/components/card.dart';
import 'package:comment/components/card_container.dart';
import 'package:comment/components/selection_app_bar.dart';
import 'package:comment/providers.dart';
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
        .map(
          (cardData) => Card(
            title: cardData.title,
            isSelected: cardsProvider.isSelected(cardData.id),
            onTap: isSelectionMode
                ? () => cardsProvider.toggleSelection(cardData.id)
                : null,
            onLongPress: isSelectionMode
                ? null
                : () => cardsProvider.enterSelectionMode(cardData.id),
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
        )
        .toList(growable: false);

    return Scaffold(
      appBar: isSelectionMode
          ? const SelectionAppBar(isArchivedScreen: true)
          : AppBar(title: const Text('Archived Cards')),
      body: CardContainer(
        padding: EdgeInsets.fromLTRB(16.0, 16.0, 16.0, 16.0),
        children: cards,
      ),
    );
  }
}
