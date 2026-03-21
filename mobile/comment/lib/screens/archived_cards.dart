import 'package:comment/components/card.dart';
import 'package:comment/components/card_container.dart';
import 'package:comment/providers.dart';
import 'package:flutter/material.dart' hide Card;
import 'package:provider/provider.dart';

class ArchivedCardsScreen extends StatelessWidget {
  const ArchivedCardsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final archivedCards = context.watch<CardsProvider>().archivedCards;
    final cards = archivedCards
        .map(
          (cardData) => Card(
            title: cardData.title,
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
      appBar: AppBar(title: const Text('Archived Cards')),
      body: CardContainer(children: cards),
    );
  }
}
