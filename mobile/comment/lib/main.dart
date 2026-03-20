import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:comment/shared/theme.dart';
import 'package:comment/screens/code_view.dart';
import 'package:comment/screens/file_tree.dart';

import 'package:comment/screens/ssh_connection.dart';
import 'package:comment/providers/ssh_config_provider.dart';
import 'package:comment/components/bottom_bar.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (context) => SshConfigProvider(),
      child: MaterialApp(
        title: 'Comment',
        theme: ReadToolTheme.darkOrangeTheme,
        home: const MyHomePage(title: 'Comment'),
      ),
    );
  }
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key, required this.title});

  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      bottomNavigationBar: const BottomBar(),
      body: Padding(
        padding: const EdgeInsets.all(32),
        child: Center(
          child: Column(
            children: [
              Container(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => const CodeViewScreen(),
                      ),
                    );
                  },
                  child: const Text('Code View'),
                ),
              ),
              const SizedBox(height: 32),
              Container(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => const FileTreeScreen(),
                      ),
                    );
                  },
                  child: const Text('File Tree'),
                ),
              ),
              const SizedBox(height: 32),
              Container(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => const SshConnectionScreen(),
                      ),
                    );
                  },
                  child: const Text('SSH Connection'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
