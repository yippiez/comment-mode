import 'package:flutter/material.dart' hide Card;
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';
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
          final crossAxisCount = orientation == Orientation.portrait ? 2 : 3;
          final loremIpsum =
              'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. ';
          final repeatedLorem = loremIpsum * 3;
          final lengths = [50, 120, 250, 400, 600, 800];
          return LayoutBuilder(
            builder: (context, constraints) {
              return Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: constraints.maxWidth),
                  child: MasonryGridView.builder(
                    padding: const EdgeInsets.all(16.0),
                    gridDelegate:
                        SliverSimpleGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: crossAxisCount,
                        ),
                    mainAxisSpacing: 16.0,
                    crossAxisSpacing: 16.0,
                    itemCount: lengths.length,
                    itemBuilder: (context, index) {
                      final length = lengths[index];
                      final text = repeatedLorem.substring(
                        0,
                        length > repeatedLorem.length
                            ? repeatedLorem.length
                            : length,
                      );
                      return Card(
                        title: 'Card ${index + 1}',
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12.0,
                            vertical: 8.0,
                          ),
                          child: Text(
                            text,
                            style: TextStyle(color: Colors.grey[400]),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
