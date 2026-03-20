import 'package:flutter/material.dart';

class CodeViewScreen extends StatefulWidget {
  const CodeViewScreen({super.key});

  @override
  State<CodeViewScreen> createState() => _CodeViewScreenState();
}

class _CodeViewScreenState extends State<CodeViewScreen> {
  final TextEditingController _codeController = TextEditingController(
    text: '''void main() {
  print("Hello, Comment!");
}''',
  );

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Code View'),
        actions: [IconButton(icon: const Icon(Icons.copy), onPressed: () {})],
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            color: Colors.grey[200],
            child: const Row(
              children: [
                Icon(Icons.code, size: 16),
                SizedBox(width: 8),
                Text(
                  'main.dart',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
          Expanded(
            child: Container(
              color: Colors.grey[900],
              padding: const EdgeInsets.all(16),
              child: TextField(
                controller: _codeController,
                style: const TextStyle(
                  fontFamily: 'monospace',
                  color: Colors.white,
                  fontSize: 14,
                ),
                maxLines: null,
                expands: true,
                decoration: const InputDecoration(border: InputBorder.none),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
