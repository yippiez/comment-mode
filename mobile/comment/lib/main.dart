import 'package:flutter/material.dart' hide Card;
import 'package:comment/shared/theme.dart';
import 'package:comment/components/card.dart';
import 'package:comment/components/bottom_bar.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Comment',
      debugShowCheckedModeBanner: false,
      theme: darkOrangeTheme,
      home: const MyHomePage(),
    );
  }
}

class MyHomePage extends StatelessWidget {
  const MyHomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      bottomNavigationBar: const BottomBar(),
      body: Builder(
        builder: (context) {
          final orientation = MediaQuery.of(context).orientation;
          final maxWidthPercentage = orientation == Orientation.portrait
              ? 0.4
              : 0.3;
          final cards = [
            Card(
              title: 'Card 1',
              maxWidthPercentage: maxWidthPercentage,
              child: Text('Content 1'),
            ),
            Card(
              title: 'Card 2',
              maxWidthPercentage: maxWidthPercentage,
              child: Text('Content 2'),
            ),
            Card(
              title: 'Card 3',
              maxWidthPercentage: maxWidthPercentage,
              child: Text('Content 3'),
            ),
            Card(
              title: 'Card 4',
              maxWidthPercentage: maxWidthPercentage,
              child: Text('Content 4'),
            ),
            Card(
              title: 'Card 5',
              maxWidthPercentage: maxWidthPercentage,
              child: Text('Content 5'),
            ),
            Card(
              title: 'Card 6',
              maxWidthPercentage: maxWidthPercentage,
              child: Text('Content 6'),
            ),
          ];
          return Padding(
            padding: const EdgeInsets.all(16.0),
            child: Wrap(spacing: 16.0, runSpacing: 16.0, children: cards),
          );
        },
      ),
    );
  }
}
