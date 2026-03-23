import 'package:flutter/material.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

final class SettingsPopupLayout {
  static const width = 250.0;
  static const gap = 12.0;

  static const borderRadius = 24.0;
  static const sidePadding = 12.0;
  static const topPadding = 12.0;
  static const bottomPadding = 8.0;
  static const buttonHeight = 54.0;
  static const buttonBorderRadius = 18.0;
  static const buttonDividerSpacing = 6.0;
  static const dividerThickness = 1.0;

  static const height =
      topPadding +
      buttonHeight +
      buttonDividerSpacing +
      dividerThickness +
      buttonDividerSpacing +
      buttonHeight +
      bottomPadding;

  const SettingsPopupLayout._();
}

class SettingsPopupContent extends StatelessWidget {
  final VoidCallback? onExtensions;
  final VoidCallback? onConnections;

  const SettingsPopupContent({
    super.key,
    this.onExtensions,
    this.onConnections,
  });

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: AdaptiveGlass(
        shape: const LiquidRoundedSuperellipse(
          borderRadius: SettingsPopupLayout.borderRadius,
        ),
        settings: InheritedLiquidGlass.ofOrDefault(context),
        quality: GlassQuality.standard,
        useOwnLayer: true,
        clipBehavior: Clip.antiAlias,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: SettingsPopupLayout.topPadding),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: SettingsPopupLayout.sidePadding,
              ),
              child: _PopupIconActionButton(
                label: 'Extensions',
                icon: const ExtensionsGridIcon(),
                onTap: onExtensions,
              ),
            ),
            const SizedBox(height: SettingsPopupLayout.buttonDividerSpacing),
            const FractionallySizedBox(
              widthFactor: 0.8,
              child: _PopupDivider(),
            ),
            const SizedBox(height: SettingsPopupLayout.buttonDividerSpacing),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: SettingsPopupLayout.sidePadding,
              ),
              child: _PopupIconActionButton(
                label: 'Connections',
                icon: const Icon(
                  Icons.cable_rounded,
                  size: 22,
                  color: Colors.white,
                ),
                onTap: onConnections,
              ),
            ),
            const SizedBox(height: SettingsPopupLayout.bottomPadding),
          ],
        ),
      ),
    );
  }
}

class ExtensionsGridIcon extends StatelessWidget {
  const ExtensionsGridIcon({super.key});

  @override
  Widget build(BuildContext context) {
    const pieceSize = 11.0;
    const gap = 4.0;
    return const SizedBox(
      width: pieceSize * 2 + gap,
      height: pieceSize * 2 + gap,
      child: Stack(
        children: [
          Positioned(left: 0, top: 0, child: _ExtensionsPiece(size: pieceSize)),
          Positioned(
            left: 0,
            top: pieceSize + gap,
            child: _ExtensionsPiece(size: pieceSize),
          ),
          Positioned(
            left: pieceSize + gap,
            top: pieceSize + gap,
            child: _ExtensionsPiece(size: pieceSize),
          ),
        ],
      ),
    );
  }
}

class _PopupDivider extends StatelessWidget {
  const _PopupDivider();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      height: SettingsPopupLayout.dividerThickness,
      child: ColoredBox(color: Colors.white24),
    );
  }
}

class _PopupIconActionButton extends StatelessWidget {
  final String label;
  final Widget icon;
  final VoidCallback? onTap;

  const _PopupIconActionButton({
    required this.label,
    required this.icon,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: SettingsPopupLayout.buttonHeight,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(
            SettingsPopupLayout.buttonBorderRadius,
          ),
          splashColor: Colors.white24,
          highlightColor: Colors.white10,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              icon,
              const SizedBox(width: 10),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ExtensionsPiece extends StatelessWidget {
  final double size;

  const _ExtensionsPiece({required this.size});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        border: Border.all(color: Colors.white, width: 1.8),
        borderRadius: BorderRadius.circular(2),
      ),
    );
  }
}
