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
          final loremIpsum =
              'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. ';
          final repeatedLorem = loremIpsum * 3; // about 1300 chars
          final lengths = [50, 120, 250, 400, 600, 800];
          final cards = List.generate(6, (index) {
            final length = lengths[index];
            final text = repeatedLorem.substring(
              0,
              length > repeatedLorem.length ? repeatedLorem.length : length,
            );
            return Card(
              title: 'Card ${index + 1}',
              maxWidthPercentage: maxWidthPercentage,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12.0,
                  vertical: 8.0,
                ),
                child: Text(text, style: TextStyle(color: Colors.grey[400])),
              ),
            );
          });
          return Padding(
            padding: const EdgeInsets.all(16.0),
            child: Align(
              alignment: Alignment.topCenter,
              child: IntrinsicWidth(
                child: Wrap(
                  spacing: 16.0,
                  runSpacing: 16.0,
                  alignment: WrapAlignment.center,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: cards,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
