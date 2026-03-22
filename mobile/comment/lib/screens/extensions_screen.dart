import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:comment/components/confirmation_dialog.dart';
import 'package:comment/components/extension_card.dart';
import 'package:comment/models/extension_data.dart';
import 'package:comment/providers/extensions_provider.dart';

class ExtensionsScreen extends StatelessWidget {
  const ExtensionsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ExtensionsProvider>();
    final installedExts = provider.installedAndDefaultExtensions;
    final officialExts = provider.uninstalledOfficialExtensions;
    final communityExts = provider.uninstalledCommunityExtensions;

    return Scaffold(
      appBar: AppBar(title: const Text('Extensions')),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        children: [
          _buildSectionHeader('Installed Extensions'),
          const SizedBox(height: 12),
          if (installedExts.isNotEmpty)
            ...installedExts.map(
              (ext) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: ExtensionCard(
                  extension: ext,
                  onUninstall: ext.state != ExtensionState.defaultExt
                      ? () => showGlassConfirmationDialog(
                          context,
                          title: 'Remove ${ext.title}?',
                          description:
                              'This extension will be moved to the uninstalled list.',
                          confirmLabel: 'Remove',
                          confirmTextColor: Colors.red,
                          confirmGlowColor: const Color(0x4DFF0000),
                          onConfirm: () => provider.uninstallExtension(ext.id),
                        )
                      : null,
                ),
              ),
            )
          else
            _buildEmptyState('No installed extensions'),
          const SizedBox(height: 16),
          _buildSectionHeader('Official Extensions'),
          const SizedBox(height: 12),
          if (officialExts.isNotEmpty)
            ...officialExts.map(
              (ext) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: ExtensionCard(
                  extension: ext,
                  onInstall: () => showGlassConfirmationDialog(
                    context,
                    title: 'Install ${ext.title}?',
                    description:
                        'This extension will be added to your installed list.',
                    confirmLabel: 'Install',
                    confirmTextColor: Colors.red,
                    confirmGlowColor: const Color(0x4DFF0000),
                    onConfirm: () => provider.installExtension(ext.id),
                  ),
                ),
              ),
            )
          else
            _buildEmptyState('No official extensions'),
          const SizedBox(height: 16),
          _buildSectionHeader('Community Extensions'),
          const SizedBox(height: 12),
          if (communityExts.isNotEmpty)
            ...communityExts.map(
              (ext) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: ExtensionCard(
                  extension: ext,
                  onInstall: () => showGlassConfirmationDialog(
                    context,
                    title: 'Install ${ext.title}?',
                    description:
                        'This extension will be added to your installed list.',
                    confirmLabel: 'Install',
                    confirmTextColor: Colors.red,
                    confirmGlowColor: const Color(0x4DFF0000),
                    onConfirm: () => provider.installExtension(ext.id),
                  ),
                ),
              ),
            )
          else
            _buildEmptyState('No community extensions'),
          const SizedBox(height: 32),
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

  Widget _buildEmptyState(String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: const TextStyle(color: Color(0xFF757575), fontSize: 14),
      ),
    );
  }
}
