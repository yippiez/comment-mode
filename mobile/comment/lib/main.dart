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
      body: Center(
        child: Builder(
          builder: (context) {
            final orientation = MediaQuery.of(context).orientation;
            final maxWidthPercentage = orientation == Orientation.portrait
                ? 0.5
                : 0.33;
            return Card(
              title: 'Example Card',
              maxWidthPercentage: maxWidthPercentage,
              child: const Text('Hello, this is a card component!'),
            );
          },
        ),
      ),
    );
  }
}
