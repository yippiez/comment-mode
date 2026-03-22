import 'package:flutter/material.dart';
import 'package:comment/models/extension_data.dart';

class ExtensionCard extends StatelessWidget {
  final ExtensionData extension;
  final VoidCallback? onInstall;
  final VoidCallback? onUninstall;

  const ExtensionCard({
    super.key,
    required this.extension,
    this.onInstall,
    this.onUninstall,
  });

  @override
  Widget build(BuildContext context) {
    final showInstall = extension.state == ExtensionState.uninstalled;
    final showUninstall = extension.state == ExtensionState.installed;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: extension.gradient,
        borderRadius: BorderRadius.circular(16),
      ),
      padding: const EdgeInsets.all(20),
      child: Stack(
        children: [
          Positioned(
            right: 0,
            bottom: 0,
            child: showInstall
                ? _InstallButton(onPressed: onInstall)
                : showUninstall
                ? _UninstallButton(onPressed: onUninstall)
                : const SizedBox.shrink(),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      extension.title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  if (extension.state == ExtensionState.defaultExt)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text(
                        'Default',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Padding(
                padding: EdgeInsets.only(
                  right: showInstall || showUninstall ? 40 : 0,
                ),
                child: Text(
                  extension.description,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.85),
                    fontSize: 15,
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _InstallButton extends StatelessWidget {
  final VoidCallback? onPressed;

  const _InstallButton({this.onPressed});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onPressed,
      child: const Icon(Icons.download_rounded, size: 28, color: Colors.white),
    );
  }
}

class _UninstallButton extends StatelessWidget {
  final VoidCallback? onPressed;

  const _UninstallButton({this.onPressed});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onPressed,
      child: const Icon(Icons.delete_outline, size: 28, color: Colors.white),
    );
  }
}
