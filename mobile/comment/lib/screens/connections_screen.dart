import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:comment/providers/connection_settings_provider.dart';

class ConnectionsScreen extends StatefulWidget {
  const ConnectionsScreen({super.key});

  @override
  State<ConnectionsScreen> createState() => _ConnectionsScreenState();
}

class _ConnectionsScreenState extends State<ConnectionsScreen> {
  late final TextEditingController _piUrlController;

  @override
  void initState() {
    super.initState();
    final initialPiUrl = context.read<ConnectionSettingsProvider>().piUrl;
    _piUrlController = TextEditingController(text: initialPiUrl);
  }

  @override
  void dispose() {
    _piUrlController.dispose();
    super.dispose();
  }

  void _saveSettings() {
    final provider = context.read<ConnectionSettingsProvider>();
    provider.savePiUrl(_piUrlController.text.trim());
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(content: Text('Connection settings saved')),
      );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Connections'),
        actions: [
          IconButton(
            icon: const Icon(Icons.save_rounded),
            onPressed: _saveSettings,
            tooltip: 'Save',
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildSectionHeader('Pi Channel Settings'),
          const SizedBox(height: 12),
          TextField(
            controller: _piUrlController,
            keyboardType: TextInputType.url,
            autocorrect: false,
            enableSuggestions: false,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _saveSettings(),
            decoration: const InputDecoration(
              labelText: 'URL',
              hintText: 'https://your-pi.local',
              border: OutlineInputBorder(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
      child: Text(
        title,
        style: const TextStyle(
          color: Color(0xFFBDBDBD),
          fontSize: 14,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}
