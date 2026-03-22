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
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: double.infinity,
          decoration: BoxDecoration(
            gradient: extension.gradient,
            borderRadius: BorderRadius.circular(16),
          ),
          padding: const EdgeInsets.all(20),
          child: Column(
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
                  right: (onInstall != null || onUninstall != null) ? 52 : 0,
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
        ),
        if (onInstall != null || onUninstall != null)
          Positioned(
            right: 8,
            bottom: 8,
            child: onInstall != null
                ? _InstallButton(onPressed: onInstall)
                : _UninstallButton(onPressed: onUninstall),
          ),
      ],
    );
  }
}

class _InstallButton extends StatelessWidget {
  final VoidCallback? onPressed;

  const _InstallButton({this.onPressed});

  @override
  Widget build(BuildContext context) {
    return _TapButton(icon: Icons.download_rounded, onPressed: onPressed);
  }
}

class _UninstallButton extends StatelessWidget {
  final VoidCallback? onPressed;

  const _UninstallButton({this.onPressed});

  @override
  Widget build(BuildContext context) {
    return _TapButton(icon: Icons.delete_outline, onPressed: onPressed);
  }
}

class _TapButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onPressed;

  const _TapButton({required this.icon, this.onPressed});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onPressed,
      icon: Icon(icon, size: 36, color: Colors.white),
      splashRadius: 30,
      padding: EdgeInsets.zero,
      constraints: const BoxConstraints.tightFor(width: 56, height: 56),
    );
  }
}
