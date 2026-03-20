import 'package:flutter/material.dart' hide Card;
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';
import 'package:comment/shared/theme.dart';
import 'package:comment/components/card.dart';
import 'package:comment/components/card_container.dart';
import 'package:comment/components/bottom_bar.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await LiquidGlassWidgets.initialize();
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
      extendBody: true,
      bottomNavigationBar: const BottomBar(),
      body: Builder(
        builder: (context) {
          final loremIpsum =
              'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. ';
          final repeatedLorem = loremIpsum * 3;
          final lengths = [50, 120, 250, 400, 600, 800];
          final cards = List<Widget>.generate(lengths.length, (index) {
            final length = lengths[index];
            final text = repeatedLorem.substring(
              0,
              length > repeatedLorem.length ? repeatedLorem.length : length,
            );
            return Card(
              title: 'Card ${index + 1}',
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12.0,
                  vertical: 8.0,
                ),
                child: Text(text, style: TextStyle(color: Colors.grey[400])),
              ),
            );
          });
          return CardContainer(children: cards);
        },
      ),
    );
  }
}
